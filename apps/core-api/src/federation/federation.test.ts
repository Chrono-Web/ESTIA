import { randomBytes } from "node:crypto";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

import { InstanceEndpoint } from "./endpoint.js";
import { RemoteBudgets } from "./limits.js";
import { MAX_NAME_LENGTH, parseRequest } from "./protocol.js";
import { SqliteRemoteInstanceRepository } from "./repository.js";
import { FederationService } from "./service.js";

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

async function casa(dataDir: string, nome: string): Promise<Casa> {
  const database = openDatabase(dataDir);
  const endpoint = new InstanceEndpoint(new Uint8Array(randomBytes(32)));
  const remotes = new SqliteRemoteInstanceRepository(database);
  const federation = new FederationService({
    endpoint,
    instanceName: () => nome,
    remotes,
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

async function dueCase(
  use: (a: Casa, b: Casa) => Promise<void>,
  names: [string, string] = ["Via Roma", "Via Milano"],
): Promise<void> {
  await withTempDataDir(async (primo) => {
    await withTempDataDir(async (secondo) => {
      const a = await casa(primo, names[0]);
      const b = await casa(secondo, names[1]);

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
});

describe("i budget per istanza", () => {
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
