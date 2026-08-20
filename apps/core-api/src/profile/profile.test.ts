import { randomBytes } from "node:crypto";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";
import { InstanceEndpoint } from "../federation/endpoint.js";
import type { IrohConnection, IrohStream } from "../federation/endpoint.js";
import { SqliteRemoteInstanceRepository } from "../federation/repository.js";
import { FederationService } from "../federation/service.js";
import { SqliteUserRepository } from "../identity/repository.js";

import { SqliteProfileRepository } from "./repository.js";
import { ProfileService } from "./service.js";

/**
 * La presenza è una scelta della persona, e le regole che la fanno valere.
 *
 * Le prove sulla rete usano una connessione finta invece del socket vero, e non
 * per comodità: qui si verificano le regole di [ADR 0020] — chi può chiedere
 * cosa, che cosa è elencabile, e che «non trovato» non riveli l'esistenza — e
 * quelle devono valere in modo deterministico, non a seconda di come è andato
 * l'handshake. Il trasporto ha già i suoi test, con due istanze vere.
 */

const NOW = "2026-08-20T12:00:00.000Z";

interface Casa {
  profiles: ProfileService;
  federation: FederationService;
  remotes: SqliteRemoteInstanceRepository;
  aggiungi: (username: string, displayName: string) => string;
  collega: (publicKey: string) => void;
}

async function casa(dataDir: string): Promise<Casa> {
  const database = openDatabase(dataDir);
  const users = new SqliteUserRepository(database);
  const profiles = new ProfileService({
    now: () => new Date(NOW),
    profiles: new SqliteProfileRepository(database),
  });
  const endpoint = new InstanceEndpoint(new Uint8Array(randomBytes(32)));
  const remotes = new SqliteRemoteInstanceRepository(database);
  const federation = new FederationService({
    endpoint,
    instanceName: () => "Via Roma",
    profiles,
    remotes,
  });

  return {
    aggiungi: (username, displayName) => {
      const id = randomBytes(8).toString("hex");

      users.create({
        createdAt: NOW,
        deletedAt: null,
        displayName,
        id,
        // Un hash finto: qui non si autentica nessuno, e generarne uno vero
        // costerebbe ad Argon2id il tempo che serve a costare.
        passwordHash: "$argon2id$finto",
        role: "member",
        username,
      });

      return id;
    },
    // Ciò che un collegamento accettato lascia dietro di sé, scritto a mano:
    // il rapporto è l'unica cosa che decide il livello.
    collega: (publicKey) => {
      remotes.upsertState({ at: NOW, publicKey, state: "collegata" });
    },
    federation,
    profiles,
    remotes,
  };
}

/** Una richiesta come arriverebbe dalla rete, senza rete. */
async function chiedi(
  federation: FederationService,
  remoteKey: string,
  request: unknown,
): Promise<Record<string, unknown>> {
  let scritto: ((bytes: number[]) => void) | undefined;
  const risposta = new Promise<number[]>((resolve) => {
    scritto = resolve;
  });

  const stream: IrohStream = {
    recv: { readToEnd: async () => Array.from(Buffer.from(JSON.stringify(request))) },
    send: {
      finish: async () => undefined,
      writeAll: async (bytes) => {
        scritto?.(bytes);
      },
    },
  };

  let servito = false;
  const connection: IrohConnection = {
    acceptBi: async () => {
      if (servito) {
        throw new Error("la connessione è finita");
      }

      servito = true;

      return stream;
    },
    close: () => undefined,
    openBi: async () => stream,
    paths: () => [],
    remoteId: () => ({ toString: () => remoteKey }),
  };

  await federation.serve(connection);

  return JSON.parse(Buffer.from(await risposta).toString("utf8")) as Record<string, unknown>;
}

describe("il profilo e la sua presenza", () => {
  it("nasce «non presente», perché niente diventa visibile per omissione", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      // Nessuno ha aperto nessuna schermata: l'aggiornamento che ha introdotto
      // i profili non deve aver pubblicato nessuno.
      expect(via.profiles.read(id).presence).toBe("non_presente");
      expect(via.profiles.byUsername("marco")).toBeUndefined();
    });
  });

  it("un profilo privato si raggiunge per nome ma non compare in nessuna ricerca", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      via.profiles.update(id, { bio: "Abito qui", presence: "presente_privato" });

      // È tutto ciò che «presente e privato» promette, e sono due permessi
      // diversi: raggiungibile non vuol dire elencabile.
      expect(via.profiles.byUsername("marco")?.pubblico).toBe(false);
      expect(via.profiles.searchPublic("marco", 20)).toEqual([]);
    });
  });

  it("elenca solo chi ha chiesto di essere trovabile", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "",
        presence: "presente_pubblico",
      });
      via.profiles.update(via.aggiungi("lucia", "Lucia"), {
        bio: "",
        presence: "presente_privato",
      });
      via.aggiungi("anna", "Anna");

      expect(via.profiles.searchPublic("", 20).map((p) => p.utente)).toEqual(["marco"]);
    });
  });

  it("in casa i vicini si trovano comunque, perché la presenza riguarda il fuori", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.aggiungi("anna", "Anna");

      expect(via.profiles.searchLocal("anna").map((p) => p.username)).toEqual(["anna"]);
    });
  });

  it("rifiuta una descrizione più lunga del limite invece di tagliarla", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      expect(() =>
        via.profiles.update(id, { bio: "x".repeat(501), presence: "presente_pubblico" }),
      ).toThrow(/500/);
    });
  });
});

describe("i profili visti dalla rete", () => {
  it("non risponde a un'istanza con cui non è collegata", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "",
        presence: "presente_pubblico",
      });

      const risposta = await chiedi(via.federation, "una-sconosciuta", {
        chi: "marco",
        nome: "Altrove",
        tipo: "profilo",
      });

      expect(risposta.ok).toBe(false);
      expect(risposta.codice).toBe("non_collegata");
    });
  });

  it("a un'istanza collegata dà il profilo nominato, e in elenco solo i pubblici", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "Abito in Via Roma",
        presence: "presente_pubblico",
      });
      via.profiles.update(via.aggiungi("lucia", "Lucia"), {
        bio: "Non mi cercate",
        presence: "presente_privato",
      });

      via.collega("amica");

      const profilo = await chiedi(via.federation, "amica", {
        chi: "lucia",
        nome: "Altrove",
        tipo: "profilo",
      });

      // Privata: raggiungibile per nome, e lo dichiara.
      expect(profilo.ok).toBe(true);
      expect((profilo.profilo as { pubblico: boolean }).pubblico).toBe(false);

      const ricerca = await chiedi(via.federation, "amica", {
        nome: "Altrove",
        termine: "a",
        tipo: "cerca",
      });

      // In elenco, solo chi ha chiesto di esserci.
      expect((ricerca.profili as { utente: string }[]).map((p) => p.utente)).toEqual(["marco"]);
    });
  });

  it("dice «non trovato» allo stesso modo per chi non c'è e per chi non esiste", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.aggiungi("anna", "Anna");
      via.collega("amica");

      // Anna esiste ma non è in rete; Giulio non esiste affatto. Distinguerli
      // ricostruirebbe l'enumerazione una domanda per volta (ADR 0020 §1).
      const esiste = await chiedi(via.federation, "amica", {
        chi: "anna",
        nome: "Altrove",
        tipo: "profilo",
      });
      const inventato = await chiedi(via.federation, "amica", {
        chi: "giulio",
        nome: "Altrove",
        tipo: "profilo",
      });

      expect(esiste).toEqual(inventato);
      expect(esiste.codice).toBe("non_trovato");
    });
  });
});
