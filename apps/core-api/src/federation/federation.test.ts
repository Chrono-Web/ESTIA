import { randomBytes } from "node:crypto";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

import { InstanceEndpoint } from "./endpoint.js";
import { RemoteBudgets } from "./limits.js";
import {
  MAX_BACHECA_NAMES,
  MAX_BACHECA_POSTS,
  MAX_NAME_LENGTH,
  MAX_PROOF_LENGTH,
  parseRequest,
} from "./protocol.js";
import { SqliteRemoteInstanceRepository } from "./repository.js";
import { FederationService } from "./service.js";
import type { BoardDirectory } from "./service.js";
import type { PostRemoto } from "./protocol.js";

/**
 * Two instances, on the wire, doing what [ADR 0020] says they may.
 *
 * These run on `local`, which has no discovery, so one side reaches the other
 * with a ticket. That is not the product flow — people exchange keys — but it
 * is the only way to exercise the real transport without depending on somebody
 * else's servers in a test suite. What it costs is one asymmetry: the side that
 * was reached cannot call back, because it holds a key and no addresses. The
 * tests below make that visible rather than working around it.
 */

interface Casa {
  endpoint: InstanceEndpoint;
  federation: FederationService;
  remotes: SqliteRemoteInstanceRepository;
  close: () => Promise<void>;
}

async function casa(dataDir: string, nome: string, boards?: BoardDirectory): Promise<Casa> {
  const database = openDatabase(dataDir);
  const endpoint = new InstanceEndpoint(new Uint8Array(randomBytes(32)));
  const remotes = new SqliteRemoteInstanceRepository(database);
  const federation = new FederationService({
    endpoint,
    instanceName: () => nome,
    remotes,
    ...(boards === undefined ? {} : { boards }),
  });

  endpoint.register(federation);
  await endpoint.open("local");

  return {
    close: async () => {
      await endpoint.close();
      database.close();
    },
    endpoint,
    federation,
    remotes,
  };
}

/**
 * Una bacheca finta, per provare **il filo** e non le regole.
 *
 * Le regole di chi può leggere che cosa stanno in `feed/rete.test.ts`, con due
 * database veri; qui interessa che il messaggio attraversi: che la richiesta
 * che il client costruisce sia una che il server accetta, e che una pagina
 * torni indietro intera. È la prova che nessuna delle due metà può darsi da
 * sola — e la prima volta che è stata scritta ha trovato un difetto vero, un
 * campo obbligatorio che il client mandava vuoto.
 */
function bachecaFinta(post: PostRemoto[]): BoardDirectory & { chiesto: number } {
  const finta = {
    bacheca: (): PostRemoto[] => {
      finta.chiesto += 1;

      return post;
    },
    chiesto: 0,
    cuore: (): undefined => undefined,
    immagine: async (): Promise<undefined> => undefined,
  };

  return finta;
}

async function dueCase(
  use: (a: Casa, b: Casa) => Promise<void>,
  names: [string, string] = ["Via Roma", "Via Milano"],
  /** La bacheca che **la seconda** casa serve, quando il test ne ha una. */
  boards?: BoardDirectory,
): Promise<void> {
  await withTempDataDir(async (primo) => {
    await withTempDataDir(async (secondo) => {
      const a = await casa(primo, names[0]);
      const b = await casa(secondo, names[1], boards);

      try {
        await use(a, b);
      } finally {
        await a.close();
        await b.close();
      }
    });
  });
}

describe("il protocollo fra istanze", () => {
  it("collega due istanze, e ci vogliono tutte e due", async () => {
    await dueCase(async (a, b) => {
      // Via Roma chiede. Da sola non basta: è una richiesta, non un collegamento.
      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      expect(a.federation.list()[0]?.state).toBe("richiesta_inviata");
      expect(b.federation.list()[0]?.state).toBe("richiesta_ricevuta");

      // Via Milano accetta, il che vuol dire mandare la propria richiesta. Qui
      // la chiamata di ritorno non passa — `local` non risolve le chiavi — e il
      // risultato è precisamente quello onesto: lei è collegata, lui non lo sa
      // ancora.
      await b.federation.accept(a.endpoint.endpointId ?? "");

      expect(b.federation.list()[0]?.state).toBe("collegata");
      expect(a.federation.list()[0]?.state).toBe("richiesta_inviata");

      // Alla richiesta successiva le due si incontrano.
      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      expect(a.federation.list()[0]?.state).toBe("collegata");
      expect(b.federation.list()[0]?.state).toBe("collegata");
    });
  }, 30_000);

  it("salva la chiave autenticata, non quello che è stato incollato", async () => {
    await dueCase(async (a, b) => {
      // Incollato un ticket, che è lungo e contiene indirizzi. Ciò che finisce
      // nel database è la chiave che ha risposto all'handshake (ADR 0021 §1).
      const ticket = b.endpoint.ticket ?? "";

      await a.federation.requestConnection(ticket);

      const saved = a.federation.list()[0];

      expect(saved?.publicKey).toBe(b.endpoint.endpointId);
      expect(saved?.publicKey).not.toBe(ticket);
    });
  }, 30_000);

  it("di una sconosciuta non scrive niente su disco", async () => {
    await dueCase(async (a, b) => {
      // Presentarsi è l'unica cosa che una sconosciuta può fare, e non lascia
      // traccia: un elenco di chi ha bussato sarebbe il grafo sociale di
      // persone che non sono tue (ADR 0020 §3).
      const result = await a.federation.ping(b.endpoint.ticket ?? "");

      expect(result.reached).toBe(true);
      expect(result.declaredName).toBe("Via Milano");
      expect(b.federation.list()).toEqual([]);
      expect(a.federation.list()).toEqual([]);
    });
  }, 30_000);

  it("il nome è quello che l'altra dichiara di sé, e viaggia con la richiesta", async () => {
    await dueCase(
      async (a, b) => {
        await a.federation.requestConnection(b.endpoint.ticket ?? "");

        expect(b.federation.list()[0]?.declaredName).toBe("Casa di mia madre");
      },
      ["Casa di mia madre", "Casa di mio padre"],
    );
  }, 30_000);

  it("un'istanza bloccata non arriva al punto in cui esiste una domanda", async () => {
    await dueCase(async (a, b) => {
      b.federation.block(a.endpoint.endpointId ?? "");

      const result = await a.federation.ping(b.endpoint.ticket ?? "");

      expect(result.reached).toBe(false);

      // E il blocco non si è trasformato in una riga nuova per il tentativo.
      expect(b.federation.list()).toHaveLength(1);
      expect(b.federation.list()[0]?.state).toBe("bloccata");
    });
  }, 30_000);

  it("rifiuta le richieste di sconosciute quando ne ha già troppe in attesa", async () => {
    await dueCase(async (a, b) => {
      // Il tetto esiste perché l'unica cosa che una sconosciuta può fare non
      // diventi anche il modo di riempire il disco di qualcuno.
      const now = new Date().toISOString();

      for (let index = 0; index < 64; index += 1) {
        b.remotes.upsertState({
          at: now,
          publicKey: `chiave-finta-${String(index)}`,
          state: "richiesta_ricevuta",
        });
      }

      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      // Via Roma ha registrato di aver chiesto; Via Milano non ha aggiunto nulla.
      expect(a.federation.list()[0]?.state).toBe("richiesta_inviata");
      expect(b.federation.list()).toHaveLength(64);
    });
  }, 30_000);

  it("non si collega a sé stessa", async () => {
    await dueCase(async (a) => {
      await expect(a.federation.requestConnection(a.endpoint.ticket ?? "")).rejects.toThrow(
        /sé stessa/,
      );
    });
  }, 30_000);
});

describe("una bacheca che attraversa davvero", () => {
  it("va e torna sul filo, con il tetto suo e senza il livello di rapporto", async () => {
    const finta = bachecaFinta([
      {
        id: "uno",
        immagini: [
          {
            altezza: 100,
            byte: 1200,
            descrizione: "",
            id: "foto-1",
            larghezza: 100,
            miniaturaAltezza: 50,
            miniaturaLarghezza: 50,
          },
        ],
        nome: "Marco",
        quando: "2026-08-21T10:00:00.000Z",
        testo: "Ciao",
        utente: "marco",
      },
    ]);

    await dueCase(
      async (a, b) => {
        // Nessun collegamento fra le due, e non serve: il permesso non viene
        // dal rapporto fra istanze ma dalla prova della coppia (ADR 0023 §2).
        const pagina = await a.federation.fetchBacheca(
          b.endpoint.ticket ?? "",
          [{ nome: "marco", prova: "una-prova" }],
          { da: "lucia" },
        );

        expect(finta.chiesto).toBe(1);
        expect(pagina).toEqual([
          {
            id: "uno",
            immagini: [
              {
                altezza: 100,
                byte: 1200,
                descrizione: "",
                id: "foto-1",
                larghezza: 100,
                miniaturaAltezza: 50,
                miniaturaLarghezza: 50,
              },
            ],
            nome: "Marco",
            quando: "2026-08-21T10:00:00.000Z",
            testo: "Ciao",
            utente: "marco",
          },
        ]);
      },
      ["Via Roma", "Via Milano"],
      finta,
    );
  });

  it("a un'istanza che non serve bacheche risponde di no, non con il silenzio", async () => {
    await dueCase(async (a, b) => {
      const pagina = await a.federation.fetchBacheca(
        b.endpoint.ticket ?? "",
        [{ nome: "marco", prova: "una-prova" }],
        { da: "lucia" },
      );

      // `undefined` è «quella casa non ti ha dato una pagina», che è ciò che
      // il feed dichiara come incompleto invece di far finta di niente.
      expect(pagina).toBeUndefined();
    });
  });
});

describe("i messaggi del protocollo", () => {
  it("ignora i campi che non conosce, invece di rifiutare", () => {
    // È ciò che rende possibile aggiungere un campo senza aggiornare tutte le
    // case d'Italia nello stesso weekend (ADR 0021 §6).
    const { request, error } = parseRequest({
      nome: "Via Roma",
      qualcosaDelFuturo: 42,
      tipo: "presentazione",
    });

    expect(error).toBeUndefined();
    expect(request).toEqual({ nome: "Via Roma", tipo: "presentazione" });
  });

  it("dice di no in modo ordinato a un tipo di richiesta che non conosce", () => {
    const { error } = parseRequest({ nome: "Via Roma", tipo: "cose-di-domani" });

    expect(error?.codice).toBe("richiesta_sconosciuta");
    expect(error?.messaggio).toMatch(/versione/);
  });

  it("rifiuta un nome assente o troppo lungo, invece di tagliarlo in silenzio", () => {
    expect(parseRequest({ tipo: "presentazione" }).error?.codice).toBe("malformata");
    expect(
      parseRequest({ nome: "x".repeat(MAX_NAME_LENGTH + 1), tipo: "presentazione" }).error?.codice,
    ).toBe("malformata");
    expect(parseRequest("non un oggetto").error?.codice).toBe("malformata");
  });

  it("mette il tetto a una bacheca prima di leggerla, non dopo", () => {
    const troppi = {
      chi: Array.from({ length: MAX_BACHECA_NAMES + 1 }, (_, indice) => ({
        nome: `persona-${String(indice)}`,
        prova: "x",
      })),
      da: "lucia",
      nome: "Via Roma",
      tipo: "bacheca",
    };

    expect(parseRequest(troppi).error?.codice).toBe("malformata");

    // Una preferenza fuori scala non è un errore: è una richiesta che il tetto
    // riporta dentro senza dire di no.
    const esagerata = parseRequest({
      chi: [{ nome: "marco", prova: "una-prova" }],
      da: "lucia",
      nome: "Via Roma",
      quanti: 5000,
      tipo: "bacheca",
    });

    expect(esagerata.error).toBeUndefined();
    expect(esagerata.request).toMatchObject({ quanti: MAX_BACHECA_POSTS });
  });

  it("rifiuta una bacheca senza elenco, o con una voce a metà", () => {
    expect(
      parseRequest({ chi: [], da: "lucia", nome: "Via Roma", tipo: "bacheca" }).error?.codice,
    ).toBe("malformata");
    expect(
      parseRequest({
        chi: [{ nome: "marco" }],
        da: "lucia",
        nome: "Via Roma",
        tipo: "bacheca",
      }).error?.codice,
    ).toBe("malformata");
    expect(
      parseRequest({
        chi: [{ nome: "marco", prova: "x".repeat(MAX_PROOF_LENGTH + 1) }],
        da: "lucia",
        nome: "Via Roma",
        tipo: "bacheca",
      }).error?.codice,
    ).toBe("malformata");
  });

  it("accetta un'immagine solo con prova, variante e tetto di chi legge", () => {
    const ok = parseRequest({
      chi: { nome: "marco", prova: "una-prova" },
      da: "lucia",
      id: "foto-1",
      maxBytes: 1024,
      nome: "Via Roma",
      tipo: "immagine",
      variante: "miniatura",
    });

    expect(ok.error).toBeUndefined();
    expect(ok.request).toMatchObject({
      id: "foto-1",
      maxBytes: 1024,
      tipo: "immagine",
      variante: "miniatura",
    });

    expect(
      parseRequest({
        chi: { nome: "marco", prova: "una-prova" },
        da: "lucia",
        id: "foto-1",
        nome: "Via Roma",
        tipo: "immagine",
        variante: "miniatura",
      }).error?.codice,
    ).toBe("malformata");
  });
});

describe("un'immagine che attraversa davvero", () => {
  it("va e torna sul filo, senza scrivere niente da nessuna parte", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    let chiesto = 0;
    const finta: BoardDirectory = {
      bacheca: () => [],
      cuore: () => undefined,
      immagine: async (input) => {
        chiesto += 1;
        expect(input.chi.nome).toBe("marco");
        expect(input.id).toBe("foto-1");
        expect(input.variante).toBe("miniatura");
        expect(input.maxBytes).toBe(1024);

        return { bytes, mediaType: "image/webp" };
      },
    };

    await dueCase(
      async (a, b) => {
        const esito = await a.federation.fetchImmagine(
          b.endpoint.ticket ?? "",
          { nome: "marco", prova: "una-prova" },
          { da: "lucia", id: "foto-1", maxBytes: 1024, variante: "miniatura" },
        );

        expect(chiesto).toBe(1);
        expect(esito).toEqual({ bytes, mediaType: "image/webp" });
      },
      ["Via Roma", "Via Milano"],
      finta,
    );
  });

  it("dice troppo_grande quando l'originale passa il tetto di chi legge", async () => {
    const finta: BoardDirectory = {
      bacheca: () => [],
      cuore: () => undefined,
      immagine: async () => "troppo_grande",
    };

    await dueCase(
      async (a, b) => {
        const esito = await a.federation.fetchImmagine(
          b.endpoint.ticket ?? "",
          { nome: "marco", prova: "una-prova" },
          { da: "lucia", id: "foto-1", maxBytes: 10, variante: "originale" },
        );

        expect(esito).toBe("troppo_grande");
      },
      ["Via Roma", "Via Milano"],
      finta,
    );
  });
});

describe("i budget per istanza", () => {
  it("conta a parte le richieste che portano contenuti, e più stretto", () => {
    const budgets = new RemoteBudgets({
      connected: { requests: 10, windowMs: 1000 },
      content: { requests: 2, windowMs: 1000 },
    });

    expect(budgets.allowContent("vicina")).toBe(true);
    expect(budgets.allowContent("vicina")).toBe(true);
    expect(budgets.allowContent("vicina")).toBe(false);

    // Il tetto dei contenuti non ha consumato quello generale: sono due conti,
    // altrimenti nessuno dei due direbbe la verità.
    expect(budgets.allow("vicina", "collegata")).toBe(true);
    // E resta per chiave: una casa rumorosa non è un problema delle altre.
    expect(budgets.allowContent("un'altra")).toBe(true);
  });

  it("dà a una sconosciuta molto meno che a una collegata", () => {
    const budgets = new RemoteBudgets({
      connected: { requests: 3, windowMs: 1000 },
      unknown: { requests: 1, windowMs: 1000 },
    });

    expect(budgets.allow("estranea", "sconosciuta")).toBe(true);
    expect(budgets.allow("estranea", "sconosciuta")).toBe(false);

    expect(budgets.allow("amica", "collegata")).toBe(true);
    expect(budgets.allow("amica", "collegata")).toBe(true);
    expect(budgets.allow("amica", "collegata")).toBe(true);
    expect(budgets.allow("amica", "collegata")).toBe(false);
  });

  it("non lascia che una rumorosa esaurisca il budget di un'altra", () => {
    // È la ragione aritmetica per cui il tetto è per chiave e non globale.
    const budgets = new RemoteBudgets({ unknown: { requests: 1, windowMs: 1000 } });

    expect(budgets.allow("rumorosa", "sconosciuta")).toBe(true);
    expect(budgets.allow("rumorosa", "sconosciuta")).toBe(false);
    expect(budgets.allow("tranquilla", "sconosciuta")).toBe(true);
  });

  it("non si lascia riempire la memoria dalle sconosciute", () => {
    const budgets = new RemoteBudgets({
      maxTrackedUnknown: 2,
      unknown: { requests: 5, windowMs: 60_000 },
    });

    expect(budgets.allow("una", "sconosciuta")).toBe(true);
    expect(budgets.allow("due", "sconosciuta")).toBe(true);

    // Piena: si rifiuta la terza invece di buttare fuori chi è nel suo budget.
    expect(budgets.allow("tre", "sconosciuta")).toBe(false);

    // Un'istanza collegata non è soggetta a quel tetto: le sue righe sono
    // tante quante ne ha volute chi amministra.
    expect(budgets.allow("amica", "collegata")).toBe(true);
  });

  it("riapre la finestra quando è passata", () => {
    let adesso = 0;
    const budgets = new RemoteBudgets({
      now: () => adesso,
      unknown: { requests: 1, windowMs: 1000 },
    });

    expect(budgets.allow("estranea", "sconosciuta")).toBe(true);
    expect(budgets.allow("estranea", "sconosciuta")).toBe(false);

    adesso = 1001;

    expect(budgets.allow("estranea", "sconosciuta")).toBe(true);
  });
});

/**
 * Il cuore sul filo vero ([ADR 0025] §1).
 *
 * In processo si prova che il permesso è quello giusto; qui si prova l'altra
 * metà, quella che nessuna prova in processo può vedere: che il messaggio si
 * scriva e si legga davvero fra due `iroh`, e che una casa che non lo conosce
 * risponda di no in modo ordinato invece di far finta.
 */
describe("un cuore che attraversa davvero", () => {
  it("va e torna sul filo, con il conteggio di chi custodisce il post", async () => {
    let visto: { post: string; stato: boolean; da: string; prova: string } | undefined;
    const finta: BoardDirectory = {
      bacheca: () => [],
      cuore: (input) => {
        visto = {
          da: input.da,
          post: input.post,
          prova: input.chi.prova,
          stato: input.stato,
        };

        return { cuori: 3, mio: input.stato };
      },
      immagine: async () => undefined,
    };

    await dueCase(
      async (a, b) => {
        const esito = await a.federation.mettiCuore(
          b.endpoint.ticket ?? "",
          { nome: "marco", prova: "una-prova" },
          { da: "lucia", post: "post-1", stato: true },
        );

        expect(esito).toEqual({ cuori: 3, mio: true });
        expect(visto).toEqual({
          da: "lucia",
          post: "post-1",
          prova: "una-prova",
          stato: true,
        });
      },
      ["Via Roma", "Via Milano"],
      finta,
    );
  });

  it("una casa che non conosce il messaggio dice di no, e il cuore non si disegna", async () => {
    // Senza `boards` l'istanza risponde `richiesta_sconosciuta`, che è la
    // stessa risposta che darebbe una versione più vecchia del protocollo
    // (ADR 0021 §6). Chi ha premuto deve vedere `undefined`, non un cuore.
    await dueCase(async (a, b) => {
      const esito = await a.federation.mettiCuore(
        b.endpoint.ticket ?? "",
        { nome: "marco", prova: "una-prova" },
        { da: "lucia", post: "post-1", stato: true },
      );

      expect(esito).toBeUndefined();
    });
  });
});
