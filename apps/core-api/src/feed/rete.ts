import type { MissingSource, PostView, TimelinePage } from "@estia/contracts";
import type { AuthenticatedUser } from "@estia/contracts";

import type { PostRemoto } from "../federation/protocol.js";
import { MAX_BACHECA_BYTES, MAX_BACHECA_NAMES } from "../federation/protocol.js";
import type { FollowRepository } from "../profile/follows.js";
import { improntaProva } from "../profile/follows.js";
import type { ProfileRepository } from "../profile/repository.js";

import type { FeedMediaPort } from "./service.js";
import type { PostRepository } from "./repository.js";

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
}

export class BachecheServite {
  readonly #posts: PostRepository;
  readonly #follows: FollowRepository;
  readonly #profiles: ProfileRepository;
  readonly #media: FeedMediaPort;

  public constructor(options: BachecheServiteOptions) {
    this.#posts = options.posts;
    this.#follows = options.follows;
    this.#profiles = options.profiles;
    this.#media = options.media;
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
    chi: readonly { nome: string; prova: string }[];
    prima?: string;
    quanti: number;
  }): PostRemoto[] {
    const autori = new Set<string>();

    for (const voce of input.chi) {
      const riga = this.#follows.findFollowerByGrant(input.instanceKey, improntaProva(voce.prova));

      if (riga === undefined || riga.state !== "accettato") {
        continue;
      }

      const persona = this.#profiles.find(riga.userId);

      if (persona === undefined || persona.username !== voce.nome) {
        continue;
      }

      autori.add(riga.userId);
    }

    const righe = this.#posts.board({
      authorIds: [...autori],
      limit: input.quanti,
      ...(input.prima === undefined ? {} : { atOrBefore: input.prima }),
    });
    const immagini = this.#media.imagesFor(righe.map((post) => post.id));

    return dentroIlTetto(
      righe.map((post) => ({
        id: post.id,
        immagini: (immagini.get(post.id) ?? []).length,
        nome: post.authorDisplayName,
        quando: post.createdAt,
        testo: post.body,
        utente: post.authorUsername,
        ...(post.editedAt === null ? {} : { modificato: post.editedAt }),
      })),
    );
  }
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
   * È la stessa visita del feed di rete, ristretta a un nome: senza prova non
   * si chiede niente (pagina vuota, non errore), e una casa spenta torna
   * `mancanti` invece di inventare un fallimento.
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

    if (riga === undefined || riga.grant === null) {
      return { posts: [] };
    }

    const post = await this.#rete.fetchBacheca(
      instanceKey,
      [{ nome: username, prova: riga.grant }],
      {
        da: caller.username,
        quanti,
        ...(finestra === undefined ? {} : { prima: finestra.t }),
      },
    );

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
 * Tutto ciò che riguarda **questa** istanza è zero e falso, e non per pigrizia:
 * i cuori e le risposte vivono sulla macchina di chi ha scritto, e un conteggio
 * inventato qui sarebbe una bugia piccola su un dato che nessuno può
 * verificare. `remoto` è ciò che permette all'interfaccia di non offrire un
 * pulsante che non farebbe niente.
 */
function vistaDiUnPostRemoto(post: PostRemoto, instanceKey: string, istanza: string): PostView {
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
    images: [],
    likeCount: 0,
    liked: false,
    remoto: { immagini: post.immagini, instanceKey, istanza },
    scope: "followers",
  };
}
