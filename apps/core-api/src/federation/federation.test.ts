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
import { FederationService, type BoardDirectory, type MessaggiDirectory } from "./service.js";
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
    commento: (): undefined => undefined,
    cuore: (): undefined => undefined,
    dettaglioPost: (): undefined => undefined,
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
      commento: () => undefined,
      cuore: () => undefined,
      dettaglioPost: () => undefined,
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
      commento: () => undefined,
      cuore: () => undefined,
      dettaglioPost: () => undefined,
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
      commento: () => undefined,
      cuore: (input) => {
        visto = {
          da: input.da,
          post: input.post,
          prova: input.chi.prova,
          stato: input.stato,
        };

        return { cuori: 3, mio: input.stato };
      },
      dettaglioPost: () => undefined,
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

describe("un messaggio che attraversa davvero (M6)", () => {
  it("consegna una busta crittografica da una casa all'altra", async () => {
    let bustaRicevuta: unknown = undefined;
    const fintiMessaggi: MessaggiDirectory = {
      chiaviDiFirmaDi: () => [],
      getKeyPackages: () => [{ id: "dev-1", blob: "pkg-blob-1" }],
      consegnaBusta: (rec) => {
        bustaRicevuta = rec;
        return { consegnatoAt: new Date().toISOString() };
      },
    };

    await dueCase(
      async (a, b) => {
        b.federation.useMessaggi(fintiMessaggi);

        const result = await a.federation.inviaBusta(
          b.endpoint.ticket ?? "",
          { nome: "marco", prova: "una-prova" },
          {
            busta: "BUSTA_E2E_CIFRATA_LUCIA_A_MARCO",
            conversazioneId: "conv-123",
            createdAt: new Date().toISOString(),
            da: "lucia",
            destinatario: "marco",
            messaggioId: "msg-123",
            senderDeviceId: "device-lucia",
          },
        );

        expect(result.ok).toBe(true);
        expect(typeof result.consegnatoAt).toBe("string");
        expect(bustaRicevuta).toMatchObject({
          busta: "BUSTA_E2E_CIFRATA_LUCIA_A_MARCO",
          conversazioneId: "conv-123",
          destinatarioUsername: "marco",
          messaggioId: "msg-123",
          senderUsername: "lucia",
        });
      },
      ["Via Roma", "Via Milano"],
    );
  });
});

/**
 * Il registro delle chiavi di firma che attraversa ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §1).
 *
 * È la prima delle otto operazioni, e quella su cui poggia l'autenticazione
 * quando un albero MLS contiene membri di più case: «mi fido che la casa di
 * Bruno dica la verità su Bruno», e per fidarsene bisogna prima poterglielo
 * chiedere.
 */
describe("chiavi-di-firma, fra due case", () => {
  function registroFinto(
    chiavi: Record<string, Array<{ publicKey: string; algorithm: string }>>,
  ): MessaggiDirectory & { chiesto: string[] } {
    const finto = {
      chiaviDiFirmaDi(username: string) {
        finto.chiesto.push(username);

        return chiavi[username] ?? [];
      },
      chiesto: [] as string[],
      consegnaBusta: () => undefined,
      getKeyPackages: () => [],
    };

    return finto;
  }

  const chiaviDiBruno = [{ algorithm: "MLS-P256-v1", publicKey: "CHIAVE_DI_BRUNO" }];

  it("chi è collegato le ottiene, e sono quelle che la casa di Bruno riconosce", async () => {
    await dueCase(async (a, b) => {
      const registro = registroFinto({ bruno: chiaviDiBruno });
      b.federation.useMessaggi(registro);

      await a.federation.requestConnection(b.endpoint.ticket ?? "");
      await b.federation.accept(a.endpoint.endpointId ?? "");
      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      const esito = await a.federation.fetchChiaviDiFirma(b.endpoint.ticket ?? "", "bruno");

      expect(esito).toEqual({ chiavi: chiaviDiBruno, esito: "chiavi" });
      expect(registro.chiesto).toEqual(["bruno"]);
    });
  }, 30_000);

  it("un nome che non esiste dà la stessa risposta di uno senza chiavi", async () => {
    // ADR 0020 §1: distinguerli sarebbe dire a un'altra casa chi abita qua, un
    // nome per volta.
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(registroFinto({ bruno: chiaviDiBruno }));

      await a.federation.requestConnection(b.endpoint.ticket ?? "");
      await b.federation.accept(a.endpoint.endpointId ?? "");
      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      expect(await a.federation.fetchChiaviDiFirma(b.endpoint.ticket ?? "", "nessuno")).toEqual({
        esito: "nessuna",
      });
    });
  }, 30_000);

  it("a una sconosciuta risponde come `chiavi`: il KeyPackage porta già la stessa chiave", async () => {
    // Il 2026-09-17 il registro rispondeva solo a chi era collegato. Ma `chiavi`
    // consegna un KeyPackage a chiunque non sia bloccata, e un KeyPackage
    // contiene la chiave di firma: il controllo non nascondeva niente, e
    // impediva a due case non collegate di validare l'albero della
    // conversazione che `chiavi` aveva appena aperto.
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(registroFinto({ bruno: chiaviDiBruno }));

      await a.federation.ping(b.endpoint.ticket ?? "");
      const esito = await a.federation.fetchChiaviDiFirma(b.endpoint.ticket ?? "", "bruno");

      expect(esito).toEqual({ chiavi: chiaviDiBruno, esito: "chiavi" });
    });
  }, 30_000);

  it("a una casa bloccata non si risponde, e il registro non viene nemmeno interrogato", async () => {
    await dueCase(async (a, b) => {
      const registro = registroFinto({ bruno: chiaviDiBruno });
      b.federation.useMessaggi(registro);

      // Il blocco vale sulla chiave: non serve essere stati collegati.
      b.federation.block(a.endpoint.endpointId ?? "");

      const esito = await a.federation.fetchChiaviDiFirma(b.endpoint.ticket ?? "", "bruno");

      // Quello che conta è che nessuna chiave esca e che il registro non sia
      // interrogato. Se il rifiuto arriva come «nessuna» o, sotto carico, come
      // una domanda scaduta, per chi chiede non cambia niente: non impara nulla.
      expect(esito.esito).not.toBe("chiavi");
      expect(registro.chiesto).toEqual([]);
    });
  }, 30_000);

  it("una casa spenta non è un membro senza chiavi", async () => {
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(registroFinto({ bruno: chiaviDiBruno }));

      await a.federation.requestConnection(b.endpoint.ticket ?? "");
      await b.federation.accept(a.endpoint.endpointId ?? "");
      await a.federation.requestConnection(b.endpoint.ticket ?? "");

      await b.endpoint.close();

      // La differenza che conta: chi valida un albero non deve rifiutare
      // qualcuno perché il suo NAS dorme.
      expect(await a.federation.fetchChiaviDiFirma(b.endpoint.ticket ?? "", "bruno")).toEqual({
        esito: "irraggiungibile",
      });
    });
  }, 30_000);
});

/**
 * La casa che mette in fila ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §3),
 * e chi può depositare nella sua coda (§2).
 *
 * MLS applica i commit in sequenza: con due code indipendenti due commit alla
 * stessa epoch sono una corsa, e le due case finiscono con due alberi diversi
 * che si credono lo stesso. Qui la fila è una, e si prova che ci si arriva da
 * fuori — e che chi non partecipa non ci arriva.
 */
describe("handshake e handshake-da, fra due case", () => {
  interface Coda {
    depositati: Array<{ conversazioneId: string; remoteKey: string; id: string; tipo: string }>;
    rifiuta: boolean;
  }

  function codaFinta(coda: Coda): MessaggiDirectory {
    return {
      chiaviDiFirmaDi: () => [],
      consegnaBusta: () => undefined,
      depositaHandshake(record) {
        if (coda.rifiuta) {
          return undefined;
        }

        coda.depositati.push({
          conversazioneId: record.conversazioneId,
          id: record.id,
          remoteKey: record.remoteKey,
          tipo: record.tipo,
        });

        return { id: record.id };
      },
      getKeyPackages: () => [],
      handshakeDa(conversazioneId, remoteKey) {
        if (coda.rifiuta) {
          return undefined;
        }

        return {
          handshake: coda.depositati
            .filter((voce) => voce.conversazioneId === conversazioneId)
            .map((voce) => ({
              busta: `BUSTA_${voce.id}_PER_${remoteKey.slice(0, 4)}`,
              createdAt: "2026-09-17T10:00:00.000Z",
              epoch: 3,
              id: voce.id,
              tipo: "commit" as const,
            })),
          prossimo: "7",
        };
      },
    };
  }

  it("un commit attraversa, e chi ordina lo mette in fila", async () => {
    await dueCase(async (a, b) => {
      const coda: Coda = { depositati: [], rifiuta: false };
      b.federation.useMessaggi(codaFinta(coda));

      const esito = await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
        busta: "COMMIT_OPACO",
        createdAt: "2026-09-17T10:00:00.000Z",
        epoch: 3,
        id: "hs-1",
        tipo: "commit",
      });

      expect(esito).toEqual({ esito: "depositato" });
      // La casa che ha depositato è la **chiave della connessione**, non un
      // campo del messaggio (ADR 0021 §1): è ciò che rende verificabile §2.
      expect(coda.depositati).toEqual([
        {
          conversazioneId: "conv-1",
          id: "hs-1",
          remoteKey: a.endpoint.endpointId,
          tipo: "commit",
        },
      ]);
    });
  }, 30_000);

  it("chi non partecipa alla conversazione si sente dire di no", async () => {
    await dueCase(async (a, b) => {
      // `rifiuta` è ciò che il servizio vero risponde quando la conversazione
      // non c'è, quando la ordina un'altra casa, o quando chi chiede non ha
      // membri dentro: una risposta sola per tre rifiuti, perché distinguerli
      // direbbe quali conversazioni esistono qui.
      b.federation.useMessaggi(codaFinta({ depositati: [], rifiuta: true }));

      const esito = await a.federation.depositaHandshakePresso(
        b.endpoint.ticket ?? "",
        "conv-di-altri",
        {
          busta: "COMMIT_OPACO",
          createdAt: "2026-09-17T10:00:00.000Z",
          epoch: 3,
          id: "hs-2",
          tipo: "commit",
        },
      );

      expect(esito).toEqual({ esito: "rifiutato" });
    });
  }, 30_000);

  it("la coda si legge da chi ordina, con il cursore", async () => {
    await dueCase(async (a, b) => {
      const coda: Coda = { depositati: [], rifiuta: false };
      b.federation.useMessaggi(codaFinta(coda));

      await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
        busta: "COMMIT_OPACO",
        createdAt: "2026-09-17T10:00:00.000Z",
        epoch: 3,
        id: "hs-1",
        tipo: "commit",
      });

      const letta = await a.federation.fetchHandshake(b.endpoint.ticket ?? "", "conv-1");

      expect(letta.esito).toBe("coda");
      if (letta.esito === "coda") {
        expect(letta.handshake).toHaveLength(1);
        expect(letta.handshake[0]?.id).toBe("hs-1");
        expect(letta.handshake[0]?.epoch).toBe(3);
        expect(letta.prossimo).toBe("7");
      }
    });
  }, 30_000);

  it("un Welcome di diciottomila caratteri passa: il tetto di controllo non lo tronca", async () => {
    // Con il tetto dei messaggi di controllo (4 kB) un Welcome a cinquanta
    // foglie — 17 932 caratteri misurati da S5 — verrebbe tagliato prima di
    // essere interpretato, e il guasto si vedrebbe come «richiesta malformata».
    await dueCase(async (a, b) => {
      const coda: Coda = { depositati: [], rifiuta: false };
      b.federation.useMessaggi(codaFinta(coda));

      const esito = await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
        busta: "W".repeat(17_932),
        createdAt: "2026-09-17T10:00:00.000Z",
        destinatario: "remote:xyz:anna",
        epoch: 4,
        id: "hs-welcome",
        tipo: "welcome",
      });

      expect(esito).toEqual({ esito: "depositato" });
      expect(coda.depositati.map((v) => v.tipo)).toEqual(["welcome"]);
    });
  }, 30_000);

  it("una casa spenta non accetta depositi, e lo si sa", async () => {
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(codaFinta({ depositati: [], rifiuta: false }));
      await b.endpoint.close();

      const esito = await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
        busta: "COMMIT_OPACO",
        createdAt: "2026-09-17T10:00:00.000Z",
        epoch: 3,
        id: "hs-3",
        tipo: "commit",
      });

      // È il costo dichiarato di §3: con la casa che ordina spenta, in quella
      // conversazione non si cambia chi c'è. Detto, non nascosto.
      expect(esito).toEqual({ esito: "irraggiungibile" });
    });
  }, 30_000);
});

/**
 * Lo stato da cui si rientra, presso chi ordina ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §4,
 * decisione 5 delle risposte del proprietario): `GroupInfo` e mazzo stanno
 * **solo** sulla casa che ordina, per la sola epoch corrente.
 */
describe("group-info e mazzo, fra due case", () => {
  function statoFinto(): MessaggiDirectory & {
    stati: Map<string, { blob: string; epoch: number; remoteKey: string }>;
    rifiuta: boolean;
  } {
    const finto = {
      chiaviDiFirmaDi: () => [],
      consegnaBusta: () => undefined,
      depositaStato(
        conversazioneId: string,
        remoteKey: string,
        tipo: "group-info" | "mazzo",
        stato: { blob: string; epoch: number },
      ) {
        if (finto.rifiuta) {
          return "rifiutato" as const;
        }

        const chiave = `${conversazioneId}/${tipo}`;
        const presente = finto.stati.get(chiave);
        // La regola dell'epoch che non torna indietro, come nel repository vero.
        if (presente !== undefined && presente.epoch > stato.epoch) {
          return "indietro" as const;
        }

        finto.stati.set(chiave, { ...stato, remoteKey });

        return { updatedAt: "2026-09-23T10:00:00.000Z" };
      },
      getKeyPackages: () => [],
      rifiuta: false,
      stati: new Map<string, { blob: string; epoch: number; remoteKey: string }>(),
      stato(conversazioneId: string, _remoteKey: string, tipo: "group-info" | "mazzo") {
        if (finto.rifiuta) {
          return "rifiutato" as const;
        }

        const presente = finto.stati.get(`${conversazioneId}/${tipo}`);

        return presente === undefined
          ? undefined
          : { blob: presente.blob, epoch: presente.epoch, updatedAt: "2026-09-23T10:00:00.000Z" };
      },
    };

    return finto;
  }

  it("il punto di rientro si deposita presso chi ordina e si rilegge da là", async () => {
    await dueCase(async (a, b) => {
      const finto = statoFinto();
      b.federation.useMessaggi(finto);

      expect(
        await a.federation.depositaStatoPresso(b.endpoint.ticket ?? "", "conv-1", "group-info", {
          blob: "GROUP_INFO_EPOCH_4",
          epoch: 4,
        }),
      ).toEqual({ esito: "depositato", updatedAt: "2026-09-23T10:00:00.000Z" });

      // Chi ha depositato è la casa della connessione, non un campo.
      expect(finto.stati.get("conv-1/group-info")?.remoteKey).toBe(a.endpoint.endpointId);

      expect(
        await a.federation.leggiStatoPresso(b.endpoint.ticket ?? "", "conv-1", "group-info"),
      ).toEqual({
        blob: "GROUP_INFO_EPOCH_4",
        epoch: 4,
        esito: "stato",
        updatedAt: "2026-09-23T10:00:00.000Z",
      });
    });
  }, 30_000);

  it("un'epoch vecchia non sovrascrive quella nuova, e chi è indietro lo sa", async () => {
    // Un GroupInfo vecchio manderebbe chi rientra verso un'epoch morta.
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(statoFinto());
      const presso = b.endpoint.ticket ?? "";

      await a.federation.depositaStatoPresso(presso, "conv-1", "mazzo", { blob: "M5", epoch: 5 });

      expect(
        await a.federation.depositaStatoPresso(presso, "conv-1", "mazzo", {
          blob: "M3",
          epoch: 3,
        }),
      ).toEqual({ esito: "indietro" });
    });
  }, 30_000);

  it("«non c'è ancora» si distingue da «non ti rispondo»", async () => {
    await dueCase(async (a, b) => {
      const finto = statoFinto();
      b.federation.useMessaggi(finto);
      const presso = b.endpoint.ticket ?? "";

      // Una casa che partecipa ha diritto di sapere che il gruppo non ha ancora
      // un punto di rientro: le serve per decidere che cosa fare.
      expect(await a.federation.leggiStatoPresso(presso, "conv-1", "group-info")).toEqual({
        esito: "assente",
      });

      // Chi non partecipa sente un rifiuto solo, che non dice se la
      // conversazione esiste.
      finto.rifiuta = true;
      expect(await a.federation.leggiStatoPresso(presso, "conv-1", "group-info")).toEqual({
        esito: "rifiutato",
      });
    });
  }, 30_000);

  it("un GroupInfo a cinquanta foglie attraversa in tutte e due le direzioni", async () => {
    // Stessa misura del Welcome di S5: il tetto di controllo lo avrebbe troncato
    // all'andata, e quello di risposta al ritorno.
    await dueCase(async (a, b) => {
      b.federation.useMessaggi(statoFinto());
      const presso = b.endpoint.ticket ?? "";
      const grande = "G".repeat(17_932);

      await a.federation.depositaStatoPresso(presso, "conv-1", "group-info", {
        blob: grande,
        epoch: 7,
      });
      const letto = await a.federation.leggiStatoPresso(presso, "conv-1", "group-info");

      expect(letto.esito === "stato" ? letto.blob.length : 0).toBe(17_932);
    });
  }, 30_000);
});

describe("la corsa fra due commit, sul filo", () => {
  it("chi arriva secondo riceve epoch_superata, non un rifiuto generico", async () => {
    // La differenza conta a chi ha scritto il commit: «rifatti sull'epoch
    // nuova» è un'istruzione, «non ti rispondo» è un muro.
    await dueCase(async (a, b) => {
      let primo = true;
      b.federation.useMessaggi({
        chiaviDiFirmaDi: () => [],
        consegnaBusta: () => undefined,
        depositaHandshake: (record) => {
          if (primo) {
            primo = false;
            return { id: record.id };
          }

          return "indietro";
        },
        getKeyPackages: () => [],
      });

      const busta = {
        busta: "COMMIT",
        createdAt: "2026-09-23T10:00:00.000Z",
        epoch: 5,
        tipo: "commit" as const,
      };

      expect(
        await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
          ...busta,
          id: "hs-a",
        }),
      ).toEqual({ esito: "depositato" });
      expect(
        await a.federation.depositaHandshakePresso(b.endpoint.ticket ?? "", "conv-1", {
          ...busta,
          id: "hs-b",
        }),
      ).toEqual({ esito: "indietro" });
    });
  }, 30_000);
});

describe("segnaposto e segnaposto-da, sul filo", () => {
  it("una finestra attraversa intera, e una spinta arriva con la chiave di chi spinge", async () => {
    await dueCase(async (a, b) => {
      const spinte: Array<{ remoteKey: string; destinatari: readonly string[] }> = [];
      b.federation.useMessaggi({
        chiaviDiFirmaDi: () => [],
        consegnaBusta: () => undefined,
        getKeyPackages: () => [],
        riceviSegnapostiSpinti: (spinta) => {
          spinte.push({ destinatari: spinta.destinatari, remoteKey: spinta.remoteKey });
          return true;
        },
        segnapostiPerCasa: (_conv, _casa, dopo) => ({
          a: dopo + 2,
          da: dopo + 1,
          voci: [
            {
              id: "m-1",
              inviatoIl: "2026-09-23T10:00:00.000Z",
              mittente: "matteo@b",
              seq: dopo + 1,
            },
          ],
        }),
      });

      const finestra = await a.federation.segnapostiDaPresso(b.endpoint.ticket ?? "", "conv-1", 0);
      expect(finestra).toEqual({
        a: 2,
        da: 1,
        esito: "finestra",
        voci: [{ id: "m-1", inviatoIl: "2026-09-23T10:00:00.000Z", mittente: "matteo@b", seq: 1 }],
      });

      await a.federation.spingiSegnapostiA(b.endpoint.ticket ?? "", {
        conversazioneId: "conv-1",
        da: "anna",
        destinatari: ["bruno"],
        voci: [],
      });
      expect(spinte).toEqual([{ destinatari: ["bruno"], remoteKey: a.endpoint.endpointId }]);
    });
  }, 30_000);

  it("una voce malformata rende la finestra rifiutata: non si applica a metà", async () => {
    await dueCase(async (a, b) => {
      b.federation.useMessaggi({
        chiaviDiFirmaDi: () => [],
        consegnaBusta: () => undefined,
        getKeyPackages: () => [],
        segnapostiPerCasa: () => ({
          a: 1,
          da: 1,
          voci: [{ id: "m-1", inviatoIl: "x", mittente: "matteo@b", seq: 0 }],
        }),
      });

      expect(await a.federation.segnapostiDaPresso(b.endpoint.ticket ?? "", "conv-1", 0)).toEqual({
        esito: "rifiutato",
      });
    });
  }, 30_000);
});

describe("archivio, sul filo", () => {
  it("la visita porta le voci chieste e dice quali mancano", async () => {
    await dueCase(async (a, b) => {
      b.federation.useMessaggi({
        chiaviDiFirmaDi: () => [],
        consegnaBusta: () => undefined,
        getKeyPackages: () => [],
        vociPerCasa: (_conv, _casa, ids) => ({
          assenti: ids.filter((id) => id !== "m-1"),
          voci: [{ busta: "VOCE", chiaveN: 1, createdAt: "2026-09-23T10:00:00.000Z", id: "m-1" }],
        }),
      });

      expect(
        await a.federation.visitaArchivioPresso(b.endpoint.ticket ?? "", "conv-1", ["m-1", "m-2"]),
      ).toEqual({
        assenti: ["m-2"],
        esito: "voci",
        voci: [{ busta: "VOCE", chiaveN: 1, createdAt: "2026-09-23T10:00:00.000Z", id: "m-1" }],
      });
    });
  }, 30_000);

  it("una voce non chiesta si scarta: nessuno infila contenuti nella cronologia d'altri", async () => {
    await dueCase(async (a, b) => {
      b.federation.useMessaggi({
        chiaviDiFirmaDi: () => [],
        consegnaBusta: () => undefined,
        getKeyPackages: () => [],
        vociPerCasa: () => ({
          assenti: ["intrusa"],
          voci: [{ busta: "X", chiaveN: 1, createdAt: "2026-09-23T10:00:00.000Z", id: "intrusa" }],
        }),
      });

      expect(
        await a.federation.visitaArchivioPresso(b.endpoint.ticket ?? "", "conv-1", ["m-1"]),
      ).toEqual({ assenti: [], esito: "voci", voci: [] });
    });
  }, 30_000);
});
