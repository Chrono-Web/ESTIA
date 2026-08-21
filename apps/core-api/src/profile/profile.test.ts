import { randomBytes } from "node:crypto";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";
import { InstanceEndpoint } from "../federation/endpoint.js";
import type { IrohConnection, IrohStream } from "../federation/endpoint.js";
import { SqliteRemoteInstanceRepository } from "../federation/repository.js";
import { FederationService } from "../federation/service.js";
import { SqliteUserRepository } from "../identity/repository.js";

import { FollowService } from "./follow-service.js";
import type { EsitoFollow, FollowNetwork } from "./follow-service.js";
import { SqliteFollowRepository } from "./follows.js";
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
  follows: FollowService;
  federation: FederationService;
  remotes: SqliteRemoteInstanceRepository;
  aggiungi: (username: string, displayName: string) => string;
  collega: (publicKey: string) => void;
}

/**
 * La rete, sostituita da ciò che risponderebbe.
 *
 * Serve per la metà di chi **chiede**, che il socket vero non permette di
 * provare qui: su `local` non esiste scoperta, quindi una chiave pubblica non
 * è raggiungibile, e usare `internet` legherebbe la suite ai server di
 * qualcun altro. Quello che si prova è la regola, non il trasporto — che ha i
 * suoi test, con due istanze vere.
 */
function reteChe(risposte: EsitoFollow[]): FollowNetwork & { chiamate: number } {
  const rete = {
    chiamate: 0,
    sendFollow: async (): Promise<EsitoFollow> => {
      const risposta = risposte[Math.min(rete.chiamate, risposte.length - 1)];

      rete.chiamate += 1;

      return risposta;
    },
    sendUnfollow: async (): Promise<void> => undefined,
  };

  return rete;
}

async function casa(dataDir: string, rete?: FollowNetwork): Promise<Casa> {
  const database = openDatabase(dataDir);
  const users = new SqliteUserRepository(database);
  const profileRepository = new SqliteProfileRepository(database);
  const profiles = new ProfileService({
    now: () => new Date(NOW),
    profiles: profileRepository,
  });
  const endpoint = new InstanceEndpoint(new Uint8Array(randomBytes(32)));
  const remotes = new SqliteRemoteInstanceRepository(database);
  const federation = new FederationService({
    endpoint,
    instanceName: () => "Via Roma",
    profiles,
    remotes,
  });
  const follows = new FollowService({
    federation: rete ?? federation,
    follows: new SqliteFollowRepository(database),
    now: () => new Date(NOW),
    profiles: profileRepository,
  });

  federation.useFollows(follows);

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
    follows,
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

  it("un profilo privato è cercabile, ma i post restano dietro al follow", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      via.profiles.update(id, {
        bio: "Abito qui",
        openFollows: false,
        presence: "presente_privato",
      });

      expect(via.profiles.byUsername("marco")?.pubblico).toBe(false);
      expect(via.profiles.searchPublic("marco", 20).map((p) => p.utente)).toEqual(["marco"]);
    });
  });

  it("elenca chiunque sia in EstiaNet, privato o pubblico", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "",
        openFollows: false,
        presence: "presente_pubblico",
      });
      via.profiles.update(via.aggiungi("lucia", "Lucia"), {
        bio: "",
        openFollows: false,
        presence: "presente_privato",
      });
      via.aggiungi("anna", "Anna");

      expect(via.profiles.searchPublic("", 20).map((p) => p.utente)).toEqual(["lucia", "marco"]);
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
        via.profiles.update(id, {
          bio: "x".repeat(501),
          openFollows: false,
          presence: "presente_pubblico",
        }),
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
        openFollows: false,
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

  it("a un'istanza collegata dà il profilo nominato, e in elenco chi è in EstiaNet", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "Abito in Via Roma",
        openFollows: false,
        presence: "presente_pubblico",
      });
      via.profiles.update(via.aggiungi("lucia", "Lucia"), {
        bio: "Profilo privato",
        openFollows: false,
        presence: "presente_privato",
      });

      via.collega("amica");

      const profilo = await chiedi(via.federation, "amica", {
        chi: "lucia",
        nome: "Altrove",
        tipo: "profilo",
      });

      // Privata: raggiungibile per nome, e lo dichiara (pubblico = false = post dietro follow).
      expect(profilo.ok).toBe(true);
      expect((profilo.profilo as { pubblico: boolean }).pubblico).toBe(false);

      const ricerca = await chiedi(via.federation, "amica", {
        nome: "Altrove",
        termine: "a",
        tipo: "cerca",
      });

      // In elenco, chiunque sia in EstiaNet — privato o pubblico.
      expect((ricerca.profili as { utente: string }[]).map((p) => p.utente)).toEqual([
        "lucia",
        "marco",
      ]);
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

describe("il follow fra istanze", () => {
  /**
   * La presenza governa chi esiste **fuori**, non chi esiste dentro.
   *
   * Le due metà di questa coppia vanno lette insieme: da un'altra istanza un
   * profilo `non_presente` non si trova e non si segue, mentre da dentro sì —
   * la stessa regola che la ricerca applica già ai vicini di casa. Fonderle
   * renderebbe il feed di rete inutilizzabile per chiunque non abbia cambiato
   * un'impostazione che riguarda un'altra cosa.
   */
  it("da fuori, un profilo non presente nella rete non si segue", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.aggiungi("marco", "Marco");

      const risposta = await chiedi(via.federation, "altrove", {
        chi: "marco",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      expect(risposta.ok).toBe(false);
      expect(via.follows.listFollowers("chiunque")).toHaveLength(0);
    });
  });

  it("da dentro invece sì: un vicino non si è nascosto ai propri vicini", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const marco = via.aggiungi("marco", "Marco");
      const anna = via.aggiungi("anna", "Anna");

      await via.follows.follow(anna, "anna", { instanceKey: "locale", username: "marco" });

      expect(via.follows.listFollowers(marco)).toMatchObject([
        { followerUsername: "anna", state: "in_attesa" },
      ]);
    });
  });

  it("un profilo chiuso mette in attesa, uno aperto accetta subito", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("marco", "Marco"), {
        bio: "",
        openFollows: false,
        presence: "presente_pubblico",
      });
      via.profiles.update(via.aggiungi("anna", "Anna"), {
        bio: "",
        openFollows: true,
        presence: "presente_pubblico",
      });

      const chiuso = await chiedi(via.federation, "altrove", {
        chi: "marco",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });
      const aperto = await chiedi(via.federation, "altrove", {
        chi: "anna",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      expect(chiuso.stato).toBe("in_attesa");
      expect(aperto.stato).toBe("accettato");
    });
  });

  it("un follow accettato mette in contatto, e NON promuove a collegata", async () => {
    // È la ragione per cui ADR 0022 esiste. Se bastasse un follow, qualunque
    // istanza si darebbe da sola il diritto di elencare le persone di qua
    // dichiarando un follow che nessuno può smentire.
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.profiles.update(via.aggiungi("anna", "Anna"), {
        bio: "",
        openFollows: true,
        presence: "presente_pubblico",
      });

      await chiedi(via.federation, "altrove", {
        chi: "anna",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      // Adesso può chiedere un profilo per nome…
      const profilo = await chiedi(via.federation, "altrove", {
        chi: "anna",
        nome: "Altrove",
        tipo: "profilo",
      });

      expect(profilo.ok).toBe(true);

      // …e non può elencare nessuno.
      const ricerca = await chiedi(via.federation, "altrove", {
        nome: "Altrove",
        termine: "a",
        tipo: "cerca",
      });

      expect(ricerca.ok).toBe(false);
      expect(ricerca.codice).toBe("non_collegata");
    });
  });

  it("seguire qualcuno che non è in rete risponde come se non esistesse", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);

      via.aggiungi("anna", "Anna");

      const esiste = await chiedi(via.federation, "altrove", {
        chi: "anna",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });
      const inventato = await chiedi(via.federation, "altrove", {
        chi: "giulio",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      expect(esiste).toEqual(inventato);
      expect(esiste.codice).toBe("non_trovato");
    });
  });

  it("togliere un follower ha effetto subito, senza avvisare nessuno", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("anna", "Anna");

      via.profiles.update(id, { bio: "", openFollows: true, presence: "presente_pubblico" });

      await chiedi(via.federation, "altrove", {
        chi: "anna",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      const follower = via.follows.listFollowers(id)[0];
      expect(follower?.state).toBe("accettato");

      via.follows.removeFollower(id, follower?.id ?? "");

      // La lista che autorizza è questa: tolta la riga, il contatto non c'è più.
      expect(via.follows.listFollowers(id)).toEqual([]);

      const dopo = await chiedi(via.federation, "altrove", {
        chi: "anna",
        nome: "Altrove",
        tipo: "profilo",
      });

      expect(dopo.codice).toBe("non_collegata");
    });
  });

  it("non lascia seguire sé stessi", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      via.profiles.update(id, { bio: "", openFollows: true, presence: "presente_pubblico" });

      await expect(
        via.follows.follow(id, "marco", { instanceKey: "locale", username: "marco" }),
      ).rejects.toThrow(/te stesso/);
    });
  });

  it("rimandare un follow già accettato è come si scopre di essere stati accettati", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir);
      const id = via.aggiungi("marco", "Marco");

      via.profiles.update(id, { bio: "", openFollows: false, presence: "presente_pubblico" });

      const prima = await chiedi(via.federation, "altrove", {
        chi: "marco",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      expect(prima.stato).toBe("in_attesa");

      via.follows.accept(id, via.follows.listFollowers(id)[0]?.id ?? "");

      const dopo = await chiedi(via.federation, "altrove", {
        chi: "marco",
        da: "lucia",
        nome: "Altrove",
        tipo: "segui",
      });

      // Nessuna casella d'ingresso: si richiede, e si scopre.
      expect(dopo.stato).toBe("accettato");
    });
  });

  /**
   * L'altra metà della prova qui sopra, dal lato di chi chiede — che fino al
   * 2026-08-21 non era coperta, ed è dove il difetto stava: la risposta
   * arrivava, ma nessuno la richiedeva mai, quindi «in attesa» era per sempre
   * e il conteggio dei seguiti restava a zero anche dopo un sì.
   */
  it("richiedendo, chi ha chiesto aggiorna la propria metà e non ne apre una seconda", async () => {
    await withTempDataDir(async (dataDir) => {
      const rete = reteChe([{ stato: "in_attesa" }, { prova: "una-prova", stato: "accettato" }]);
      const via = await casa(dataDir, rete);
      const id = via.aggiungi("lucia", "Lucia");
      const altrove = { instanceKey: "chiave-di-altrove", username: "marco" };

      await via.follows.follow(id, "lucia", altrove);

      // Di là hanno detto «in attesa», e lì la riga resta: accettare non
      // spedisce niente a nessuno, ed è la proprietà di ADR 0022.
      expect(via.follows.listFollowing(id)[0]?.state).toBe("in_attesa");

      await via.follows.follow(id, "lucia", altrove);

      expect(rete.chiamate).toBe(2);
      expect(via.follows.listFollowing(id)).toHaveLength(1);
      expect(via.follows.listFollowing(id)[0]?.state).toBe("accettato");
    });
  });

  it("se l'altra istanza non risponde, la richiesta resta e non si perde", async () => {
    await withTempDataDir(async (dataDir) => {
      const via = await casa(dataDir, reteChe([undefined]));
      const id = via.aggiungi("lucia", "Lucia");

      await via.follows.follow(id, "lucia", {
        instanceKey: "chiave-di-altrove",
        username: "marco",
      });

      // Un'istanza spenta adesso non è un follow che non è stato chiesto.
      expect(via.follows.listFollowing(id)[0]?.state).toBe("in_attesa");
    });
  });
});
