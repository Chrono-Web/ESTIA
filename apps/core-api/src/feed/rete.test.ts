import { randomBytes } from "node:crypto";

import type { AuthenticatedUser, PostView } from "@estia/contracts";
import { DEFAULT_UI_PREFERENCES } from "@estia/contracts";
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";
import type { PostRemoto } from "../federation/protocol.js";
import { SqliteUserRepository } from "../identity/repository.js";
import { FollowService } from "../profile/follow-service.js";
import type { FollowNetwork } from "../profile/follow-service.js";
import { SqliteFollowRepository } from "../profile/follows.js";
import { SqliteProfileRepository } from "../profile/repository.js";
import { ProfileService } from "../profile/service.js";

import { BachecheServite, TimelineDiRete } from "./rete.js";
import { SqlitePostRepository } from "./repository.js";
import type { FeedMediaPort } from "./service.js";

/**
 * Due case, due database, e in mezzo le regole invece del filo.
 *
 * Il trasporto ha i suoi test con due istanze vere; quello che si verifica qui
 * è **chi può leggere che cosa**, e quello deve valere in modo deterministico e
 * non a seconda di come è andato l'handshake. Le due metà si parlano in
 * processo: la stessa prova che una conia, l'altra la presenta.
 */

const IERI = "2026-08-20T10:00:00.000Z";
const OGGI = "2026-08-21T10:00:00.000Z";

/** I byte delle foto si verificano a parte; qui basta sapere che ce ne sono. */
const senzaMedia: FeedMediaPort = {
  attachToPost: () => undefined,
  imagesFor: () => new Map(),
  imagesForWire: () => new Map(),
  readOwnedBy: async () => undefined,
  releasePost: async () => undefined,
};

interface Casa {
  chiave: string;
  posts: SqlitePostRepository;
  follows: SqliteFollowRepository;
  profiles: SqliteProfileRepository;
  bacheche: BachecheServite;
  seguire: FollowService;
  /** Da chiamare quando l'altra casa esiste: le due si tengono a vicenda. */
  collega: (altra: Casa) => void;
  abita: (username: string, apertura?: boolean) => AuthenticatedUser;
  scrive: (autore: AuthenticatedUser, testo: string, quando: string, dove?: "local") => string;
}

function casa(dataDir: string, chiave: string): Casa {
  const database = openDatabase(dataDir);
  const users = new SqliteUserRepository(database);
  const profiles = new SqliteProfileRepository(database);
  const posts = new SqlitePostRepository(database);
  const follows = new SqliteFollowRepository(database);
  const profileService = new ProfileService({ profiles });

  /*
   * La rete si consegna dopo, come fa `useFollows` in produzione: la prima
   * casa non può conoscere la seconda mentre la si costruisce, e inventare una
   * fabbrica per un test sarebbe più codice di quanto ne provi.
   */
  let rete: FollowNetwork | undefined;

  return {
    collega: (altra) => {
      rete = ponte(altra, chiave);
    },
    abita: (username, apertura = true) => {
      const id = randomBytes(8).toString("hex");

      users.create({
        createdAt: IERI,
        deletedAt: null,
        displayName: username,
        id,
        passwordHash: "$argon2id$finto",
        role: "member",
        username,
      });
      profileService.update(id, {
        bio: "",
        openFollows: apertura,
        presence: "presente_pubblico",
      });

      return {
        appearance: DEFAULT_UI_PREFERENCES,
        displayName: username,
        id,
        role: "member",
        username,
      };
    },
    bacheche: new BachecheServite({ follows, media: senzaMedia, posts, profiles }),
    chiave,
    follows,
    posts,
    profiles,
    scrive: (autore, testo, quando, dove) => {
      const id = randomBytes(8).toString("hex");

      posts.create({
        authorId: autore.id,
        body: testo,
        createdAt: quando,
        deletedAt: null,
        editedAt: null,
        hiddenAt: null,
        id,
        scope: dove ?? "followers",
      });

      return id;
    },
    seguire: new FollowService({
      federation: {
        sendFollow: async (chiave, target, follower) => rete?.sendFollow(chiave, target, follower),
        sendUnfollow: async (chiave, target, follower) => {
          await rete?.sendUnfollow(chiave, target, follower);
        },
      },
      follows,
      profiles,
    }),
  };
}

/**
 * Il ponte fra le due case, che sostituisce il filo e non le regole.
 *
 * `segui` arriva davvero a `receiveFollow` dell'altra, quindi la prova che
 * torna indietro è quella vera, coniata da chi verifica.
 *
 * `io` è la chiave di **chi chiama**, ed è la cosa che sul filo non si può
 * scrivere: là la mette l'handshake. Passarla qui è l'unico modo di riprodurre
 * la stessa asimmetria — di là si registra chi ha chiamato, non chi è stato
 * chiamato.
 */
function ponte(verso: Casa, io: string): FollowNetwork {
  return {
    sendFollow: async (_chiave, target, follower) =>
      verso.seguire.receiveFollow({ follower, instance: io, target }),
    sendUnfollow: async (_chiave, target, follower) => {
      verso.seguire.receiveUnfollow({ follower, instance: io, target });
    },
  };
}

/** Un client di bacheca che chiama l'altra casa senza passare da QUIC. */
function client(
  case_: Record<string, Casa>,
  spente: Set<string> = new Set(),
): {
  fetchBacheca: (
    chiave: string,
    chi: readonly { nome: string; prova: string }[],
    options: { da: string; prima?: string; quanti?: number },
  ) => Promise<PostRemoto[] | undefined>;
  remoteProfile: (
    chiave: string,
    username: string,
  ) => Promise<{ utente: string; nome: string; bio: string; pubblico: boolean } | undefined>;
} {
  return {
    fetchBacheca: async (chiave, chi, options) => {
      // Chi legge viaggia dichiarato e non autorizza niente, ma deve esserci:
      // un campo vuoto è una richiesta malformata, e il filo la rifiuta.
      expect(options.da).not.toBe("");

      if (spente.has(chiave)) {
        return undefined;
      }

      return case_[chiave]?.bacheche.bacheca({
        chi,
        instanceKey: "chiave-di-qua",
        quanti: options.quanti ?? 10,
        ...(options.prima === undefined ? {} : { prima: options.prima }),
      });
    },
    remoteProfile: async (chiave, username) => {
      if (spente.has(chiave)) {
        return undefined;
      }

      const record = case_[chiave]?.profiles.findByUsername(username);

      if (record === undefined) {
        return undefined;
      }

      return {
        bio: record.bio,
        nome: record.displayName,
        pubblico: record.presence === "presente_pubblico",
        utente: record.username,
      };
    },
  };
}

async function dueCase(use: (qua: Casa, la: Casa) => Promise<void>): Promise<void> {
  await withTempDataDir(async (primo) => {
    await withTempDataDir(async (secondo) => {
      await use(casa(primo, "chiave-di-qua"), casa(secondo, "chiave-di-la"));
    });
  });
}

describe("la bacheca servita a un'altra istanza", () => {
  it("serve i post di chi ha accettato, e solo con la prova che ha coniato", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      la.scrive(marco, "Ciao a chi mi segue", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const riga = qua.follows.listFollowing(lucia.id)[0];

      expect(riga?.state).toBe("accettato");
      expect(riga?.grant).toBeTypeOf("string");

      const pagina = la.bacheche.bacheca({
        chi: [{ nome: "marco", prova: riga?.grant ?? "" }],
        instanceKey: "chiave-di-qua",
        quanti: 10,
      });

      expect(pagina.map((post) => post.testo)).toEqual(["Ciao a chi mi segue"]);
      expect(pagina[0]?.utente).toBe("marco");
    });
  });

  it("serve una fotografia con la stessa prova, e niente con una inventata", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");
      const bytes = new Uint8Array([9, 8, 7]);
      let letture = 0;

      // Stessa casa, ma con i byte: è l'unica cosa che questo test aggiunge.
      const conFoto = new BachecheServite({
        follows: la.follows,
        media: {
          attachToPost: () => undefined,
          imagesFor: () => new Map(),
          imagesForWire: () => new Map(),
          readOwnedBy: async (id, ownerId) => {
            letture += 1;

            if (id !== "foto-1" || ownerId !== marco.id) {
              return undefined;
            }

            return { byteSize: bytes.byteLength, bytes, mediaType: "image/webp" };
          },
          releasePost: async () => undefined,
        },
        posts: la.posts,
        profiles: la.profiles,
      });

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const prova = qua.follows.listFollowing(lucia.id)[0]?.grant ?? "";

      const ok = await conFoto.immagine({
        chi: { nome: "marco", prova },
        id: "foto-1",
        instanceKey: "chiave-di-qua",
        maxBytes: 1024,
        variante: "miniatura",
      });
      const inventata = await conFoto.immagine({
        chi: { nome: "marco", prova: "prova-inventata" },
        id: "foto-1",
        instanceKey: "chiave-di-qua",
        maxBytes: 1024,
        variante: "miniatura",
      });

      expect(ok).toEqual({ bytes, mediaType: "image/webp" });
      expect(inventata).toBeUndefined();
      // La prova inventata non arriva a toccare i byte: altrimenti «non puoi»
      // e «non c'è» smetterebbero di essere la stessa risposta.
      expect(letture).toBe(1);
    });
  });

  it("non fa uscire di casa un post dell'istanza, mai e con nessuna prova", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      la.scrive(marco, "Questo resta in Via Roma", OGGI, "local");
      la.scrive(marco, "Questo esce", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const pagina = la.bacheche.bacheca({
        chi: [{ nome: "marco", prova: qua.follows.listFollowing(lucia.id)[0]?.grant ?? "" }],
        instanceKey: "chiave-di-qua",
        quanti: 10,
      });

      expect(pagina.map((post) => post.testo)).toEqual(["Questo esce"]);
    });
  });

  it("una prova inventata e un nome che non esiste danno la stessa risposta", async () => {
    await dueCase(async (qua, la) => {
      const marco = la.abita("marco");

      la.scrive(marco, "Ciao", OGGI);

      const inventata = la.bacheche.bacheca({
        chi: [{ nome: "marco", prova: "una-prova-che-nessuno-ha-coniato" }],
        instanceKey: "chiave-di-qua",
        quanti: 10,
      });
      const inesistente = la.bacheche.bacheca({
        chi: [{ nome: "nessuno", prova: "una-prova-che-nessuno-ha-coniato" }],
        instanceKey: "chiave-di-qua",
        quanti: 10,
      });

      // Una pagina vuota, e la stessa: distinguerle direbbe chi esiste.
      expect(inventata).toEqual([]);
      expect(inesistente).toEqual([]);
      expect(qua.chiave).toBe("chiave-di-qua");
    });
  });

  it("una prova vera con il nome di un'altra persona non apre la bacheca di nessuno", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");
      const giulia = la.abita("giulia");

      la.scrive(marco, "Di marco", OGGI);
      la.scrive(giulia, "Di giulia", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const prova = qua.follows.listFollowing(lucia.id)[0]?.grant ?? "";

      expect(
        la.bacheche.bacheca({
          chi: [{ nome: "giulia", prova }],
          instanceKey: "chiave-di-qua",
          quanti: 10,
        }),
      ).toEqual([]);
    });
  });

  it("togliere il follower spegne la lettura alla richiesta successiva", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      la.scrive(marco, "Finché mi segui", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const prova = qua.follows.listFollowing(lucia.id)[0]?.grant ?? "";
      const chi = [{ nome: "marco", prova }];

      expect(la.bacheche.bacheca({ chi, instanceKey: "chiave-di-qua", quanti: 10 })).toHaveLength(
        1,
      );

      // La lista che autorizza è di là, e non c'è niente da spedire a nessuno.
      la.seguire.removeFollower(marco.id, la.follows.listFollowers(marco.id)[0]?.id ?? "");

      expect(la.bacheche.bacheca({ chi, instanceKey: "chiave-di-qua", quanti: 10 })).toEqual([]);
    });
  });

  it("un post cancellato non è più leggibile da fuori, perché nessuno ne ha una copia", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");
      const id = la.scrive(marco, "Poi lo cancello", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const chi = [{ nome: "marco", prova: qua.follows.listFollowing(lucia.id)[0]?.grant ?? "" }];

      la.posts.softDelete(id, OGGI);

      expect(la.bacheche.bacheca({ chi, instanceKey: "chiave-di-qua", quanti: 10 })).toEqual([]);
    });
  });

  it("un profilo chiuso non consegna nessuna prova finché non accetta", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco", false);

      la.scrive(marco, "Segreto", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      expect(qua.follows.listFollowing(lucia.id)[0]?.state).toBe("in_attesa");
      expect(qua.follows.listFollowing(lucia.id)[0]?.grant).toBeNull();

      // Di là si accetta, e di qua non arriva niente: si scopre richiedendo.
      la.seguire.accept(marco.id, la.follows.listFollowers(marco.id)[0]?.id ?? "");

      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const riga = qua.follows.listFollowing(lucia.id)[0];

      expect(riga?.state).toBe("accettato");
      expect(riga?.grant).toBeTypeOf("string");
      expect(
        la.bacheche.bacheca({
          chi: [{ nome: "marco", prova: riga?.grant ?? "" }],
          instanceKey: "chiave-di-qua",
          quanti: 10,
        }),
      ).toHaveLength(1);
    });
  });
});

describe("il feed della rete, composto", () => {
  /** La metà di casa, già coperta altrove: qui conta solo che si mescoli. */
  function diCasa(...post: { id: string; quando: string }[]): PostView[] {
    return post.map((uno) => ({
      author: { displayName: "Anna", id: "anna", username: "anna" },
      body: `di casa ${uno.id}`,
      canDelete: false,
      canModerate: false,
      commentCount: 0,
      createdAt: uno.quando,
      editedAt: null,
      hidden: false,
      id: uno.id,
      images: [],
      likeCount: 0,
      liked: false,
      scope: "followers" as const,
    }));
  }

  it("ordina per data e non per provenienza, e marca ciò che arriva da fuori", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      la.scrive(marco, "Da un'altra casa", "2026-08-21T12:00:00.000Z");

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const rete = new TimelineDiRete({
        follows: qua.follows,
        locale: () =>
          diCasa(
            { id: "casa-1", quando: "2026-08-21T13:00:00.000Z" },
            { id: "casa-2", quando: "2026-08-21T11:00:00.000Z" },
          ),
        nomi: { nomeDi: () => "Via Milano" },
        rete: client({ "chiave-di-la": la }),
      });

      const pagina = await rete.pagina(
        {
          appearance: DEFAULT_UI_PREFERENCES,
          displayName: "Lucia",
          id: lucia.id,
          role: "member",
          username: "lucia",
        },
        { limit: 20 },
      );

      expect(pagina.posts.map((post) => (post.id.startsWith("casa") ? "casa" : "fuori"))).toEqual([
        "casa",
        "fuori",
        "casa",
      ]);
      expect(pagina.posts[1]?.remoto).toEqual({
        immagini: 0,
        instanceKey: "chiave-di-la",
        istanza: "Via Milano",
      });
      expect(pagina.mancanti).toBeUndefined();
    });
  });

  it("una casa spenta lascia il feed incompleto e lo dice, invece di romperlo", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      la.scrive(marco, "Non arriverà", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const rete = new TimelineDiRete({
        follows: qua.follows,
        locale: () => diCasa({ id: "casa-1", quando: OGGI }),
        nomi: { nomeDi: () => "Via Milano" },
        rete: client({ "chiave-di-la": la }, new Set(["chiave-di-la"])),
      });

      const pagina = await rete.pagina(
        {
          appearance: DEFAULT_UI_PREFERENCES,
          displayName: "Lucia",
          id: lucia.id,
          role: "member",
          username: "lucia",
        },
        { limit: 20 },
      );

      expect(pagina.posts).toHaveLength(1);
      expect(pagina.mancanti).toEqual([{ instanceKey: "chiave-di-la", istanza: "Via Milano" }]);
    });
  });

  it("impagina senza perdere né ripetere i post scritti nello stesso istante", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");
      const marco = la.abita("marco");

      // Due post remoti sullo stesso millisecondo di uno di casa: è il caso in
      // cui un confine esclusivo perderebbe qualcosa in silenzio.
      la.scrive(marco, "gemello uno", OGGI);
      la.scrive(marco, "gemello due", OGGI);

      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      const rete = new TimelineDiRete({
        follows: qua.follows,
        locale: (input) =>
          diCasa({ id: "casa-1", quando: OGGI }).filter(
            (post) => input.atOrBefore === undefined || post.createdAt <= input.atOrBefore,
          ),
        nomi: { nomeDi: () => "Via Milano" },
        rete: client({ "chiave-di-la": la }),
      });
      const chiLegge = {
        appearance: DEFAULT_UI_PREFERENCES,
        displayName: "Lucia",
        id: lucia.id,
        role: "member" as const,
        username: "lucia",
      };

      const prima = await rete.pagina(chiLegge, { limit: 2 });

      expect(prima.posts).toHaveLength(2);
      expect(prima.nextCursor).toBeTypeOf("string");

      const seconda = await rete.pagina(chiLegge, {
        cursor: prima.nextCursor ?? "",
        limit: 2,
      });

      const visti = [...prima.posts, ...seconda.posts].map((post) => post.id);

      expect(new Set(visti).size).toBe(3);
      expect(seconda.nextCursor).toBeUndefined();
    });
  });

  it("non chiede niente a chi non ha ancora consegnato una prova", async () => {
    await dueCase(async (qua, la) => {
      const lucia = qua.abita("lucia");

      la.abita("marco", false);
      qua.collega(la);
      await qua.seguire.follow(lucia.id, "lucia", {
        instanceKey: "chiave-di-la",
        username: "marco",
      });

      let chiesto = 0;
      const rete = new TimelineDiRete({
        follows: qua.follows,
        locale: () => [],
        nomi: { nomeDi: () => "Via Milano" },
        rete: {
          fetchBacheca: async () => {
            chiesto += 1;

            return [];
          },
          remoteProfile: async () => ({
            bio: "",
            nome: "Marco",
            pubblico: false,
            utente: "marco",
          }),
        },
      });

      await rete.pagina(
        {
          appearance: DEFAULT_UI_PREFERENCES,
          displayName: "Lucia",
          id: lucia.id,
          role: "member",
          username: "lucia",
        },
        { limit: 20 },
      );

      // Bussare per sentirsi dire di no è lavoro per due macchine e per niente.
      expect(chiesto).toBe(0);
    });
  });
});
