import type { MissingSource, PostImageView, PostView, TimelinePage } from "@estia/contracts";
import type { AuthenticatedUser } from "@estia/contracts";

import type { FotoRemota, PostRemoto, ProfiloRemoto } from "../federation/protocol.js";
import {
  MAX_BACHECA_BYTES,
  MAX_BACHECA_NAMES,
  PROVA_PROFILO_PUBBLICO,
} from "../federation/protocol.js";
import type { FollowRepository } from "../profile/follows.js";
import { improntaProva } from "../profile/follows.js";
import type { ProfileRepository } from "../profile/repository.js";

import type { FeedMediaPort } from "./service.js";
import type { PostRepository, RemoteLikeRepository } from "./repository.js";

/**
 * I contenuti che attraversano, nelle due metà che [ADR 0023] separa.
 *
 * Sono due mestieri opposti nello stesso file perché sono due lati della stessa
 * conversazione, e leggerli lontani nasconderebbe l'unica cosa che conta
 * capire: **la prova che una metà verifica è la stessa che l'altra presenta.**
 *
 * - `BachecheServite` risponde a chi chiede: risolve una prova nella coppia che
 *   l'ha ricevuta, e serve soltanto ciò che quella coppia autorizza.
 * - `TimelineDiRete` compone il feed di chi legge: la metà di casa, autorizzata
 *   dalla lista `followers`, e quella di fuori, presa da `following` — che è la
 *   lista giusta per il verso giusto (ADR 0022).
 *
 * Niente qui conserva un post di un'altra istanza. Non è una dimenticanza né
 * un'ottimizzazione mancata: è la decisione 2 di [ADR 0018] — i contenuti si
 * visitano, non si replicano — ed è ciò che rende vera la promessa che una
 * cancellazione cancella davvero.
 */

/** Che cosa serve per andare a prendere una bacheca, e nient'altro. */
export interface BachecaClient {
  fetchBacheca(
    instanceKey: string,
    chi: readonly { nome: string; prova: string }[],
    options: { da: string; prima?: string; quanti?: number },
  ): Promise<PostRemoto[] | undefined>;
  /** Serve a sapere se un profilo remoto è pubblico prima di chiedere i post. */
  remoteProfile(instanceKey: string, username: string): Promise<ProfiloRemoto | undefined>;
  /** Mette o toglie un cuore là ([ADR 0025]). `undefined` = non è arrivato. */
  mettiCuore(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: { da: string; post: string; stato: boolean },
  ): Promise<{ cuori: number; mio: boolean } | undefined>;
}

/** Come si chiama la casa da cui arriva un post. Dichiarato da lei, mai verificato. */
export interface NomiDelleIstanze {
  nomeDi(instanceKey: string): string;
}

export interface BachecheServiteOptions {
  posts: PostRepository;
  follows: FollowRepository;
  profiles: ProfileRepository;
  media: FeedMediaPort;
  /** I cuori arrivati da fuori ([ADR 0025] §3), che questa casa custodisce. */
  cuori: RemoteLikeRepository;
}

export class BachecheServite {
  readonly #posts: PostRepository;
  readonly #follows: FollowRepository;
  readonly #profiles: ProfileRepository;
  readonly #media: FeedMediaPort;
  readonly #cuori: RemoteLikeRepository;

  public constructor(options: BachecheServiteOptions) {
    this.#posts = options.posts;
    this.#follows = options.follows;
    this.#profiles = options.profiles;
    this.#media = options.media;
    this.#cuori = options.cuori;
  }

  /**
   * I post che queste prove autorizzano a leggere.
   *
   * **Il nome non è il permesso**: la prova lo è. Il nome viaggia lo stesso e
   * viene confrontato con quello della coppia che la prova identifica — se non
   * combaciano, quella voce semplicemente non produce niente. Serve a smontare
   * un uso storto del messaggio, non a concedere: una prova vale per la persona
   * per cui è stata coniata, e nessuna combinazione di nomi la sposta altrove.
   *
   * Una voce che non si risolve non è distinguibile da una che si risolve e non
   * ha post: la risposta è la stessa pagina, più corta. È la regola di ADR 0020
   * §1 — «non trovato» e «non esiste» rispondono uguale — applicata alla cosa
   * che avrebbe potuto violarla più facilmente, perché qui si chiede in gruppo.
   */
  public bacheca(input: {
    instanceKey: string;
    /** Chi legge, **là**: serve a sapere quali cuori sono suoi ([ADR 0025] §3). */
    da: string;
    chi: readonly { nome: string; prova: string }[];
    prima?: string;
    quanti: number;
  }): PostRemoto[] {
    const autori = this.#autorizzati(input.instanceKey, input.chi, input.da);

    const righe = this.#posts.board({
      authorIds: [...autori.keys()],
      limit: input.quanti,
      ...(input.prima === undefined ? {} : { atOrBefore: input.prima }),
    });
    const immagini = this.#media.imagesForWire(righe.map((post) => post.id));

    return dentroIlTetto(
      righe.map((post) => ({
        // `likeCount` somma i cuori di casa e quelli arrivati da fuori: è il
        // numero vero, ed è la ragione per cui i cuori remoti si conservano
        // qui invece che a casa di chi li ha messi ([ADR 0025] §3).
        cuori: post.likeCount,
        id: post.id,
        immagini: (immagini.get(post.id) ?? []).map(fotoSulFilo),
        mioCuore: this.#cuori.has({
          instanceKey: input.instanceKey,
          postId: post.id,
          username: autori.get(post.authorId) ?? input.da,
        }),
        nome: post.authorDisplayName,
        quando: post.createdAt,
        testo: post.body,
        utente: post.authorUsername,
        ...(post.editedAt === null ? {} : { modificato: post.editedAt }),
      })),
    );
  }

  /**
   * Un cuore che arriva da fuori, e il conteggio che ne risulta ([ADR 0025]).
   *
   * Le tre condizioni sono le stesse della bacheca, e nello stesso ordine: la
   * prova deve reggere, il post deve esistere ed essere servibile in rete, e
   * deve essere **di quella persona**. Se una qualsiasi cade la risposta è
   * `undefined`, indistinguibile dalle altre due: altrimenti il cuore
   * diventerebbe un modo di indovinare gli id dei post di qualcuno.
   */
  public cuore(input: {
    instanceKey: string;
    da: string;
    chi: { nome: string; prova: string };
    post: string;
    stato: boolean;
  }): { cuori: number; mio: boolean } | undefined {
    // Con una prova per coppia il nome di chi mette il cuore lo dice la prova,
    // e `da` viene ignorato. Con la sentinella di un profilo pubblico non c'è
    // nessuna prova che nomini una persona, e resta `da`: garantito fino alla
    // casa e non fino a chi la abita ([ADR 0025] §2).
    const autori = this.#autorizzati(input.instanceKey, [input.chi], input.da);
    const post = this.#posts.boardPost(input.post);

    if (post === undefined || !autori.has(post.authorId)) {
      return undefined;
    }

    const username = autori.get(post.authorId)!;

    this.#cuori.set({
      at: new Date().toISOString(),
      instanceKey: input.instanceKey,
      postId: post.id,
      stato: input.stato,
      username,
    });

    // Si rilegge invece di calcolare: il numero giusto è quello che c'è dopo la
    // scrittura, e sommarlo a mano vorrebbe dire ripetere qui la regola che sta
    // nella query.
    const dopo = this.#posts.boardPost(post.id);

    return { cuori: dopo?.likeCount ?? 0, mio: input.stato };
  }

  /**
   * Una fotografia, se la prova la autorizza.
   *
   * Stessa indistinguibilità della bacheca per «non c'è» e «non puoi»:
   * `undefined`. `troppo_grande` è invece una risposta distinta, e può esserlo
   * perché chi chiede ha già dichiarato il proprio tetto — non si rivela niente
   * su un'immagine a chi non poteva vederla ([ADR 0023] §4).
   */
  public async immagine(input: {
    instanceKey: string;
    chi: { nome: string; prova: string };
    id: string;
    variante: "originale" | "miniatura";
    maxBytes: number;
  }): Promise<{ bytes: Uint8Array; mediaType: string } | "troppo_grande" | undefined> {
    const autori = this.#autorizzati(input.instanceKey, [input.chi], input.chi.nome);

    if (autori.size === 0) {
      return undefined;
    }

    const ownerId = [...autori.keys()][0]!;
    const variant = input.variante === "miniatura" ? "thumbnail" : "original";
    const letto = await this.#media.readOwnedBy(input.id, ownerId, variant);

    if (letto === undefined) {
      return undefined;
    }

    // Il tetto vale sull'originale: una miniatura è già un prodotto nostro e
    // sta sotto ogni limite ragionevole. Controllare anche lei farebbe
    // rifiutare per un numero che chi legge non ha scelto.
    if (variant === "original" && letto.byteSize > input.maxBytes) {
      return "troppo_grande";
    }

    return { bytes: letto.bytes, mediaType: letto.mediaType };
  }

  /**
   * Dalle prove alle persone di casa che autorizzano, **e a chi sta leggendo**.
   *
   * Stessa regola del nome confrontato: una prova inventata o un nome storto
   * semplicemente non entrano. La mappa dice, per ogni persona di qua, con
   * quale nome di là la si sta leggendo — che serve a sapere di chi sono i
   * cuori ([ADR 0025] §3), e che non è sempre lo stesso nome:
   *
   * - con una **prova per coppia** è quello della riga `followers`, cioè un
   *   nome per cui qualcuno di qua ha detto di sì. Non è il nome dichiarato
   *   nel messaggio, ed è la differenza che conta;
   * - con la **prova sentinella** di un profilo pubblico non c'è nessuna riga,
   *   quindi resta il nome dichiarato — garantito fino all'istanza e non fino
   *   alla persona, come ADR 0025 §2 scrive per esteso.
   */
  #autorizzati(
    instanceKey: string,
    chi: readonly { nome: string; prova: string }[],
    da: string,
  ): Map<string, string> {
    const autori = new Map<string, string>();

    for (const voce of chi) {
      if (voce.prova === PROVA_PROFILO_PUBBLICO) {
        const persona = this.#profiles.findByUsername(voce.nome);

        if (persona !== undefined && persona.presence === "presente_pubblico") {
          autori.set(persona.userId, da);
        }

        continue;
      }

      const riga = this.#follows.findFollowerByGrant(instanceKey, improntaProva(voce.prova));

      if (riga === undefined || riga.state !== "accettato") {
        continue;
      }

      const persona = this.#profiles.find(riga.userId);

      if (persona === undefined || persona.username !== voce.nome) {
        continue;
      }

      autori.set(riga.userId, riga.followerUsername);
    }

    return autori;
  }
}

function fotoSulFilo(image: {
  id: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  altText: string;
  byteSize: number;
}): FotoRemota {
  return {
    altezza: image.height,
    byte: image.byteSize,
    descrizione: image.altText,
    id: image.id,
    larghezza: image.width,
    miniaturaAltezza: image.thumbHeight,
    miniaturaLarghezza: image.thumbWidth,
  };
}

/**
 * Il tetto, applicato **prima** di spedire e non sperato dopo.
 *
 * ADR 0021 dice che il tetto viene prima della lettura, e vale specularmente in
 * scrittura: chi risponde non deve poter costruire una risposta che chi legge è
 * obbligato a rifiutare. Dieci post da cinquemila caratteri ci stanno; dieci
 * post da cinquemila ideogrammi no, e la differenza la fa UTF-8 e non il
 * conteggio dei caratteri. Si taglia in fondo: la pagina è più corta e il resto
 * si chiede con la finestra successiva.
 */
function dentroIlTetto(post: PostRemoto[]): PostRemoto[] {
  const tenuti: PostRemoto[] = [];
  let byte = 2;

  for (const uno of post) {
    const costo = Buffer.byteLength(JSON.stringify(uno), "utf8") + 1;

    if (byte + costo > MAX_BACHECA_BYTES) {
      // Mai una pagina vuota per colpa del tetto: un post solo più lungo del
      // tetto non è servibile, ma nemmeno può fermare quelli dopo di lui.
      if (tenuti.length === 0) {
        continue;
      }

      break;
    }

    byte += costo;
    tenuti.push(uno);
  }

  return tenuti;
}

/**
 * Il cursore del feed composto: un istante, e chi è già passato.
 *
 * Non è un cursore per sorgente, ed è la scelta di [ADR 0023] §3: uno composito
 * crescerebbe con il numero di case e si romperebbe ogni volta che una entra o
 * esce dall'elenco. Un istante invece vuol dire la stessa cosa ovunque.
 *
 * `visti` è ciò che rende il confine inclusivo senza far tornare indietro nulla
 * due volte: i post scritti **esattamente** in quell'istante — sullo stesso
 * millisecondo, cosa che capita — vengono richiesti di nuovo e scartati qui.
 * L'alternativa, un confine esclusivo, perderebbe in silenzio i loro gemelli.
 */
interface Finestra {
  t: string;
  visti: string[];
}

function leggiCursore(cursore: string | undefined): Finestra | undefined {
  if (cursore === undefined) {
    return undefined;
  }

  try {
    const letto = JSON.parse(Buffer.from(cursore, "base64url").toString("utf8")) as Finestra;

    return typeof letto.t === "string" && Array.isArray(letto.visti) ? letto : undefined;
  } catch {
    return undefined;
  }
}

function scriviCursore(finestra: Finestra): string {
  return Buffer.from(JSON.stringify(finestra), "utf8").toString("base64url");
}

export interface TimelineDiReteOptions {
  /** La metà di casa, con le sue regole: è il servizio del feed che la conosce. */
  locale: (input: { caller: AuthenticatedUser; limit: number; atOrBefore?: string }) => PostView[];
  follows: FollowRepository;
  rete: BachecaClient;
  nomi: NomiDelleIstanze;
}

export class TimelineDiRete {
  readonly #locale: TimelineDiReteOptions["locale"];
  readonly #follows: FollowRepository;
  readonly #rete: BachecaClient;
  readonly #nomi: NomiDelleIstanze;

  public constructor(options: TimelineDiReteOptions) {
    this.#locale = options.locale;
    this.#follows = options.follows;
    this.#rete = options.rete;
    this.#nomi = options.nomi;
  }

  /**
   * Il feed della rete, da tutte le sorgenti che lo compongono.
   *
   * Nessuna è privilegiata ([ADR 0023] §5, vincolo 1): i post di casa e quelli
   * di fuori si ordinano insieme per data, in un elenco solo. Due sezioni
   * separate sarebbero una gerarchia che nessuno ha deciso.
   *
   * Le case si interrogano **in parallelo**, quindi l'attesa è quella della più
   * lenta e non la somma; e una che non risponde non fa fallire niente, esce
   * dall'elenco e si dice il suo nome. È lo stesso comportamento della ricerca
   * fra istanze, dove «una risposta parziale è la risposta giusta».
   */
  public async pagina(
    caller: AuthenticatedUser,
    options: { limit: number; cursor?: string },
  ): Promise<TimelinePage> {
    const finestra = leggiCursore(options.cursor);
    const limite = options.limit;
    // Uno in più per sapere se esiste una pagina dopo, e tanti quanti sono i
    // post già mostrati sul confine, che torneranno indietro e vanno scartati.
    const quanti = limite + 1 + (finestra?.visti.length ?? 0);

    const locali = this.#locale({
      caller,
      limit: quanti,
      ...(finestra === undefined ? {} : { atOrBefore: finestra.t }),
    });

    const case_ = this.#daDoveLeggere(caller.id);
    const risposte = await Promise.all(
      case_.map(async (casa) => ({
        casa,
        post: await this.#rete.fetchBacheca(casa.instanceKey, casa.chi, {
          da: caller.username,
          quanti,
          ...(finestra === undefined ? {} : { prima: finestra.t }),
        }),
      })),
    );

    const mancanti: MissingSource[] = [];
    const remoti: PostView[] = [];

    for (const risposta of risposte) {
      if (risposta.post === undefined) {
        mancanti.push({
          instanceKey: risposta.casa.instanceKey,
          istanza: this.#nomi.nomeDi(risposta.casa.instanceKey),
        });
        continue;
      }

      for (const post of risposta.post) {
        remoti.push(
          vistaDiUnPostRemoto(
            post,
            risposta.casa.instanceKey,
            this.#nomi.nomeDi(risposta.casa.instanceKey),
          ),
        );
      }
    }

    const visti = new Set(finestra?.visti ?? []);
    const tutti = [...locali, ...remoti]
      .filter((post) => !visti.has(post.id))
      .sort((uno, altro) =>
        uno.createdAt < altro.createdAt ? 1 : uno.createdAt > altro.createdAt ? -1 : 0,
      );

    const pagina = tutti.slice(0, limite);
    const ultimo = pagina.at(-1);

    return {
      posts: pagina,
      ...(mancanti.length === 0 ? {} : { mancanti }),
      ...(tutti.length > limite && ultimo !== undefined
        ? {
            nextCursor: scriviCursore({
              t: ultimo.createdAt,
              // Solo i gemelli dell'ultimo istante: il resto è già escluso
              // dalla finestra, e un elenco che cresce sarebbe un cursore che
              // porta con sé tutta la propria storia.
              visti: pagina
                .filter((post) => post.createdAt === ultimo.createdAt)
                .map((post) => post.id),
            }),
          }
        : {}),
    };
  }

  /**
   * La bacheca di **una** persona su un'altra istanza.
   *
   * È la stessa visita del feed di rete, ristretta a un nome. Senza follow: se
   * il profilo è pubblico si legge comunque; se è privato la pagina è vuota
   * (non un errore), e resta la richiesta di seguirlo.
   */
  public async persona(
    caller: AuthenticatedUser,
    instanceKey: string,
    username: string,
    options: { limit: number; cursor?: string },
  ): Promise<TimelinePage> {
    const finestra = leggiCursore(options.cursor);
    const limite = options.limit;
    const quanti = limite + 1 + (finestra?.visti.length ?? 0);

    const riga = this.#follows
      .listFollowing(caller.id)
      .find(
        (row) =>
          row.targetInstance === instanceKey &&
          row.targetUsername === username &&
          row.state === "accettato" &&
          row.grant !== null,
      );

    let prova = riga?.grant ?? null;

    if (prova === null) {
      const profilo = await this.#rete.remoteProfile(instanceKey, username);

      if (profilo?.pubblico !== true) {
        return { posts: [] };
      }

      prova = PROVA_PROFILO_PUBBLICO;
    }

    const post = await this.#rete.fetchBacheca(instanceKey, [{ nome: username, prova }], {
      da: caller.username,
      quanti,
      ...(finestra === undefined ? {} : { prima: finestra.t }),
    });

    if (post === undefined) {
      return {
        mancanti: [{ instanceKey, istanza: this.#nomi.nomeDi(instanceKey) }],
        posts: [],
      };
    }

    const istanza = this.#nomi.nomeDi(instanceKey);
    const visti = new Set(finestra?.visti ?? []);
    const tutti = post
      .map((uno) => vistaDiUnPostRemoto(uno, instanceKey, istanza))
      .filter((uno) => !visti.has(uno.id))
      .sort((uno, altro) =>
        uno.createdAt < altro.createdAt ? 1 : uno.createdAt > altro.createdAt ? -1 : 0,
      );

    const pagina = tutti.slice(0, limite);
    const ultimo = pagina.at(-1);

    return {
      posts: pagina,
      ...(tutti.length > limite && ultimo !== undefined
        ? {
            nextCursor: scriviCursore({
              t: ultimo.createdAt,
              visti: pagina
                .filter((uno) => uno.createdAt === ultimo.createdAt)
                .map((uno) => uno.id),
            }),
          }
        : {}),
    };
  }

  /**
   * Mette o toglie un cuore su un post di un'altra casa ([ADR 0025]).
   *
   * La prova si sceglie con la stessa regola con cui si legge quella persona:
   * quella della coppia se c'è, la sentinella se il profilo è pubblico. Non è
   * una scorciatoia — è la decisione 2 di ADR 0025, «chi può leggere un post
   * può mettergli un cuore» — e senza nessuna delle due non si bussa: chiedere
   * per sentirsi dire di no è lavoro per due macchine e per nessuno.
   *
   * `undefined` vuol dire **non è arrivato**, e chi chiama deve dirlo invece di
   * disegnare il cuore pieno lo stesso.
   */
  public async cuore(
    caller: AuthenticatedUser,
    instanceKey: string,
    username: string,
    options: { post: string; stato: boolean },
  ): Promise<{ cuori: number; mio: boolean } | undefined> {
    const riga = this.#follows
      .listFollowing(caller.id)
      .find(
        (row) =>
          row.targetInstance === instanceKey &&
          row.targetUsername === username &&
          row.state === "accettato" &&
          row.grant !== null,
      );

    let prova = riga?.grant ?? null;

    if (prova === null) {
      const profilo = await this.#rete.remoteProfile(instanceKey, username);

      if (profilo?.pubblico !== true) {
        return undefined;
      }

      prova = PROVA_PROFILO_PUBBLICO;
    }

    return await this.#rete.mettiCuore(
      instanceKey,
      { nome: username, prova },
      { da: caller.username, post: options.post, stato: options.stato },
    );
  }

  /**
   * Le case da interrogare, e chi chiedere a ciascuna.
   *
   * Si parte da `following` — la lista di chi legge, che è quella che dice
   * **dove andare** — e si tengono solo i follow accettati che hanno una prova
   * in mano: senza prova non c'è niente da chiedere, e chiederlo lo stesso
   * sarebbe bussare per sentirsi dire di no.
   *
   * Raggruppate per istanza, che è l'affinamento di ADR 0023 §1: chi segue
   * cinque persone nella stessa casa apre una connessione, non cinque.
   */
  #daDoveLeggere(
    userId: string,
  ): { instanceKey: string; chi: { nome: string; prova: string }[] }[] {
    const perIstanza = new Map<string, { nome: string; prova: string }[]>();

    for (const riga of this.#follows.listFollowing(userId)) {
      if (riga.state !== "accettato" || riga.targetInstance === "locale" || riga.grant === null) {
        continue;
      }

      const elenco = perIstanza.get(riga.targetInstance) ?? [];

      if (elenco.length >= MAX_BACHECA_NAMES) {
        continue;
      }

      elenco.push({ nome: riga.targetUsername, prova: riga.grant });
      perIstanza.set(riga.targetInstance, elenco);
    }

    return [...perIstanza].map(([instanceKey, chi]) => ({ chi, instanceKey }));
  }
}

/**
 * Un post di un'altra casa, nella forma che l'interfaccia conosce già.
 *
 * **I cuori arrivano; le risposte no**, e dal 2026-08-21 le due assenze non
 * sono più la stessa cosa ([ADR 0025] §5). Il conteggio e il proprio cuore
 * vengono da chi li custodisce — che è chi ha scritto il post — e in loro
 * assenza restano zero e falso, con `cuoriDisponibili` a dire perché: quella
 * casa parla una versione che non conosce il messaggio. Un numero inventato
 * qui sarebbe una bugia piccola su un dato che nessuno può verificare.
 *
 * `commentCount` resta zero e non è una svista: i commenti vivono là, e questa
 * versione non ha un modo di portarli qui — né di ospitarne di nuovi.
 *
 * Le immagini arrivano come metadati dalla bacheca e si scaricano a parte,
 * sotto la sessione di chi legge e senza copia su disco ([ADR 0023] §4).
 */
function vistaDiUnPostRemoto(post: PostRemoto, instanceKey: string, istanza: string): PostView {
  const immagini = post.immagini.filter(isFotoRemota);
  const cuoriDisponibili = post.cuori !== undefined;

  return {
    author: { displayName: post.nome, id: "", username: post.utente },
    body: post.testo,
    canDelete: false,
    canModerate: false,
    commentCount: 0,
    createdAt: post.quando,
    editedAt: post.modificato ?? null,
    hidden: false,
    id: post.id,
    images: immagini.map(fotoInVista),
    likeCount: post.cuori ?? 0,
    liked: post.mioCuore ?? false,
    remoto: { cuoriDisponibili, immagini: immagini.length, instanceKey, istanza },
    scope: "followers",
  };
}

function fotoInVista(foto: FotoRemota): PostImageView {
  return {
    altText: foto.descrizione,
    height: foto.altezza,
    id: foto.id,
    thumbHeight: foto.miniaturaAltezza,
    thumbWidth: foto.miniaturaLarghezza,
    width: foto.larghezza,
  };
}

function isFotoRemota(value: unknown): value is FotoRemota {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const foto = value as FotoRemota;

  return (
    typeof foto.id === "string" &&
    foto.id.length > 0 &&
    typeof foto.larghezza === "number" &&
    typeof foto.altezza === "number" &&
    typeof foto.miniaturaLarghezza === "number" &&
    typeof foto.miniaturaAltezza === "number" &&
    typeof foto.descrizione === "string" &&
    typeof foto.byte === "number"
  );
}
