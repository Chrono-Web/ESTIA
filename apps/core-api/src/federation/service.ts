import { DomainError } from "../errors.js";

import type { AlpnService, InstanceEndpoint, IrohConnection } from "./endpoint.js";
import { RemoteBudgets, type BudgetLevel } from "./limits.js";
import {
  MAX_BACHECA_BYTES,
  MAX_BACHECA_NAMES,
  MAX_BACHECA_POSTS,
  MAX_NAME_LENGTH,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_SEARCH_RESULTS,
  PROTOCOL_ALPN,
  errorResponse,
  limiteRispostaImmagine,
  parseRequest,
  readMessage,
  writeMessage,
  type BachecaRequest,
  type BachecaResponse,
  type CercaResponse,
  type ChiaviRequest,
  type ChiaviResponse,
  type CollegamentoResponse,
  type CuoreRequest,
  type CuoreResponse,
  type CommentoRequest,
  type CommentoResponse,
  type CommentoRemoto,
  type DettaglioPostRequest,
  type DettaglioPostResponse,
  type FotoRemota,
  type ImmagineRequest,
  type ImmagineResponse,
  type MessaggioRequest,
  type MessaggioResponse,
  type PostRemoto,
  type SeguiResponse,
  type SmettiResponse,
  type PresentazioneResponse,
  type ProfiloRemoto,
  type ProfiloResponse,
  type ProfiloSintetico,
  type ProtocolRequest,
  type ProtocolResponse,
  type RelationshipView,
} from "./protocol.js";
import type {
  ReachedVia,
  RemoteInstanceRecord,
  RemoteInstanceRepository,
  RemoteState,
} from "./repository.js";

/**
 * The protocol of [ADR 0021], answering only what [ADR 0020] allows.
 *
 * The shape of this file is one decision: **the level of the relationship is
 * computed from the connection's authenticated key, before anything the caller
 * wrote is looked at.** There is no path through `#handle` where a field from
 * the message can influence who the caller is taken to be. That is not a
 * stylistic preference — it is the whole of ADR 0020, which is otherwise a
 * document about a check that anybody could walk past by claiming a name.
 *
 * What this version can be asked is deliberately tiny: introduce yourself, and
 * ask to be connected. Content does not travel yet, because profiles do not
 * exist yet — and a protocol that carried posts before there was a notion of
 * who may see them would be the wrong thing built quickly.
 */

/** A pending request from a stranger costs a row; this is how many rows a stranger population may cost. */
const MAX_PENDING_INCOMING = 64;

/**
 * What this instance is willing to say about its own members.
 *
 * A port rather than the repository, so that the rules of ADR 0020 live in one
 * readable place and the protocol cannot reach past them into the database.
 */
export interface ProfileDirectory {
  /** A named profile, only if its owner is present in the network at all. */
  byUsername(username: string): ProfiloRemoto | undefined;
  /** Anyone on EstiaNet. Private vs public gates posts on the profile, not the list. */
  searchPublic(term: string, limit: number): ProfiloSintetico[];
}

/**
 * Chi segue chi, per quel poco che il protocollo deve saperne.
 *
 * `hasAcceptedWith` è ciò che distingue «sconosciuta» da «in contatto», e
 * nient'altro: un follow **non promuove a collegata** (ADR 0022 §1), altrimenti
 * qualunque istanza si darebbe da sola il diritto di elencare le persone di qua
 * dichiarando un follow che nessuno può smentire.
 */
export interface FollowDirectory {
  hasAcceptedWith(instanceKey: string): boolean;
  /** Registra un follow in arrivo. `undefined` se quella persona non è raggiungibile. */
  receiveFollow(input: {
    instance: string;
    follower: string;
    target: string;
  }): { stato: "in_attesa" | "accettato"; prova?: string } | undefined;
  receiveUnfollow(input: { instance: string; follower: string; target: string }): void;
}

/**
 * Che cosa il protocollo può chiedere alle bacheche di casa ([ADR 0023]).
 *
 * Una porta e non il servizio del feed, per la stessa ragione delle altre: le
 * regole di chi può leggere che cosa stanno in un posto solo, e il protocollo
 * non arriva a toccare la tabella dei post.
 *
 * **Il permesso non è un argomento di questa funzione, è dentro le prove.**
 * Chi implementa risolve ogni prova nella coppia che l'ha ricevuta, e i nomi
 * che non si risolvono non producono niente — mai un errore diverso, perché
 * «non ho niente per te» e «non hai il permesso» devono restare la stessa
 * risposta.
 */
export interface BoardDirectory {
  bacheca(input: {
    /** L'istanza che chiede, autenticata dall'handshake e da nient'altro. */
    instanceKey: string;
    /** Chi legge, **là**. Dichiarato: serve a riconoscere i propri cuori, non ad autorizzare. */
    da: string;
    chi: readonly { nome: string; prova: string }[];
    prima?: string;
    quanti: number;
  }): PostRemoto[];
  /**
   * Una fotografia per volta ([ADR 0023] §4). `undefined` per «non c'è» e
   * «non puoi»; `troppo_grande` solo quando la prova regge e il file passa
   * il tetto dichiarato da chi legge.
   */
  immagine(input: {
    instanceKey: string;
    chi: { nome: string; prova: string };
    id: string;
    variante: "originale" | "miniatura";
    maxBytes: number;
  }): Promise<{ bytes: Uint8Array; mediaType: string } | "troppo_grande" | undefined>;
  /**
   * Un cuore che arriva da fuori ([ADR 0025]).
   *
   * `undefined` per «non c'è» e «non puoi», come la bacheca e per la stessa
   * ragione: se le due risposte fossero distinte, la differenza fra loro
   * sarebbe una domanda a cui si può rispondere provando.
   */
  cuore(input: {
    instanceKey: string;
    da: string;
    chi: { nome: string; prova: string };
    post: string;
    stato: boolean;
  }): { cuori: number; mio: boolean } | undefined;
  /**
   * Un commento (il puntatore) che arriva da fuori (ADR 0026).
   */
  commento(input: {
    instanceKey: string;
    da: string;
    chi: { nome: string; prova: string };
    post: string;
    commentoId: string;
    stato: boolean;
  }): boolean | undefined;
  dettaglioPost(input: {
    instanceKey: string;
    da: string;
    chi: { nome: string; prova: string };
    post: string;
  }):
    | {
        post: PostRemoto;
        commenti: CommentoRemoto[];
      }
    | undefined;
}

export interface MessaggiDirectory {
  getKeyPackages(username: string): Array<{ id: string; blob: string }>;
  consegnaBusta(record: {
    conversazioneId: string;
    destinatarioUsername: string;
    senderRemoteKey: string;
    senderUsername: string;
    senderDeviceId: string;
    messaggioId: string;
    busta: string;
    createdAt: string;
  }): { consegnatoAt: string } | undefined;
}

export interface FederationServiceOptions {
  remotes: RemoteInstanceRepository;
  /** Absent until profiles exist; then the two request types start answering. */
  profiles?: ProfileDirectory;
  follows?: FollowDirectory;
  /** Assente finché i contenuti non attraversano; senza, `bacheca` dice di no. */
  boards?: BoardDirectory;
  endpoint: InstanceEndpoint;
  /** What this instance calls itself, read per call so a rename is not cached. */
  instanceName: () => string;
  budgets?: RemoteBudgets;
  maxPendingIncoming?: number;
  now?: () => Date;
}

export class FederationService implements AlpnService {
  public readonly alpn = PROTOCOL_ALPN;

  readonly #remotes: RemoteInstanceRepository;
  readonly #endpoint: InstanceEndpoint;
  readonly #instanceName: () => string;
  readonly #budgets: RemoteBudgets;
  readonly #maxPendingIncoming: number;
  readonly #now: () => Date;
  readonly #profiles: ProfileDirectory | undefined;
  #follows: FollowDirectory | undefined;
  #boards: BoardDirectory | undefined;
  #messaggi: MessaggiDirectory | undefined;

  /** Open connections by remote key, so that blocking can close them at once. */
  readonly #open = new Map<string, Set<IrohConnection>>();

  public constructor(options: FederationServiceOptions) {
    this.#remotes = options.remotes;
    this.#endpoint = options.endpoint;
    this.#instanceName = options.instanceName;
    this.#budgets = options.budgets ?? new RemoteBudgets();
    this.#maxPendingIncoming = options.maxPendingIncoming ?? MAX_PENDING_INCOMING;
    this.#now = options.now ?? (() => new Date());
    this.#profiles = options.profiles;
    this.#follows = options.follows;
    this.#boards = options.boards;
  }

  /**
   * Consegna il registro dei follow dopo la costruzione.
   *
   * I due si tengono a vicenda — il follow esce da qui, e da qui si guarda il
   * follow per sapere chi è «in contatto» — e questa è la metà che si può
   * rimandare di una riga senza inventare una fabbrica.
   */
  public useFollows(follows: FollowDirectory): void {
    this.#follows = follows;
  }

  /** Come `useFollows`, e per lo stesso motivo: il feed nasce dopo di qui. */
  public useBoards(boards: BoardDirectory): void {
    this.#boards = boards;
  }

  public useMessaggi(messaggi: MessaggiDirectory): void {
    this.#messaggi = messaggi;
  }

  // --- Chi è chi -----------------------------------------------------------

  /**
   * How this instance sees a key. The only input is the key itself, and the
   * only source of that key is the QUIC handshake (ADR 0021 §1).
   */
  #view(publicKey: string): RelationshipView | "bloccata" {
    const record = this.#remotes.findByKey(publicKey);

    if (record?.state === "bloccata") {
      return "bloccata";
    }

    if (record?.state === "collegata") {
      return "collegata";
    }

    // Un follow accettato mette in contatto, e non oltre: è il livello che si
    // ottiene da soli, quindi tutto ciò che concede deve restare innocuo anche
    // se chi lo ottiene sta mentendo su chi ospita.
    if (this.#follows?.hasAcceptedWith(publicKey) === true) {
      return "in-contatto";
    }

    if (record === undefined) {
      return "sconosciuta";
    }

    return record.state === "richiesta_inviata" ? "richiesta-inviata" : "richiesta-ricevuta";
  }

  #budgetLevel(view: RelationshipView | "bloccata"): BudgetLevel {
    return view === "collegata" || view === "in-contatto" ? "collegata" : "sconosciuta";
  }

  // --- Lato server ---------------------------------------------------------

  /** Serves one inbound connection until the other side goes away. */
  public async serve(connection: IrohConnection): Promise<void> {
    const remoteKey = connection.remoteId().toString();

    // ADR 0020 §4: a blocked instance is refused **before** any request is
    // read. There is no point at which a question from it exists to answer.
    if (this.#view(remoteKey) === "bloccata") {
      connection.close(0n, []);
      return;
    }

    this.#track(remoteKey, connection);

    try {
      for (;;) {
        const stream = await connection.acceptBi();

        // Streams are cheap and independent (ADR 0021 §3): a slow request must
        // not hold up the next one on the same connection.
        void this.#handle(remoteKey, stream);
      }
    } catch {
      // The connection ended. That is how a connection is supposed to end.
    } finally {
      this.#untrack(remoteKey, connection);
    }
  }

  async #handle(remoteKey: string, stream: Parameters<typeof writeMessage>[0]): Promise<void> {
    try {
      const response = await this.#respondTo(remoteKey, stream);

      await writeMessage(stream, response);
    } catch {
      // A single failed exchange is not a reason to drop the connection.
    }
  }

  async #respondTo(
    remoteKey: string,
    stream: Parameters<typeof readMessage>[0],
  ): Promise<ProtocolResponse> {
    const view = this.#view(remoteKey);

    if (view === "bloccata") {
      return errorResponse("non_collegata", "Questa istanza non risponde alle tue richieste.");
    }

    if (!this.#budgets.allow(remoteKey, this.#budgetLevel(view))) {
      return errorResponse(
        "troppe_richieste",
        "Troppe richieste in poco tempo. Riprova più tardi.",
      );
    }

    const message = await readMessage(stream, MAX_REQUEST_BYTES);
    const { request, error } = parseRequest(message);

    if (error !== undefined) {
      return error;
    }

    if (request === undefined) {
      return errorResponse("interna", "Richiesta non interpretabile.");
    }

    return await this.#dispatch(remoteKey, view, request);
  }

  #dispatch(
    remoteKey: string,
    view: RelationshipView,
    request: ProtocolRequest,
  ):
    | PresentazioneResponse
    | CollegamentoResponse
    | ProfiloResponse
    | CercaResponse
    | SeguiResponse
    | SmettiResponse
    | BachecaResponse
    | ImmagineResponse
    | CuoreResponse
    | CommentoResponse
    | DettaglioPostResponse
    | ReturnType<typeof errorResponse>
    | Promise<
        | PresentazioneResponse
        | CollegamentoResponse
        | ProfiloResponse
        | CercaResponse
        | SeguiResponse
        | SmettiResponse
        | BachecaResponse
        | ImmagineResponse
        | CuoreResponse
        | CommentoResponse
        | DettaglioPostResponse
        | ReturnType<typeof errorResponse>
      > {
    const at = this.#now().toISOString();

    if (request.tipo === "presentazione") {
      // Introducing is the one thing a stranger may do, so nothing is written
      // for one: a name is only recorded where a relationship already exists.
      if (view !== "sconosciuta") {
        this.#remotes.markSeen({ at, declaredName: request.nome, publicKey: remoteKey });
      }

      return { nome: this.#instanceName(), ok: true, stato: view };
    }

    if (request.tipo === "collegamento") {
      return this.#receiveConnectionRequest(remoteKey, view, request.nome, at);
    }

    // Chiedere di seguire è permesso anche a una sconosciuta, per la stessa
    // ragione del collegamento: un rapporto deve poter cominciare, e il primo
    // messaggio arriva sempre da chi non è ancora nessuno (ADR 0022 §1).
    if (request.tipo === "segui" || request.tipo === "smetti") {
      if (this.#follows === undefined) {
        return errorResponse(
          "richiesta_sconosciuta",
          "Questa istanza non gestisce ancora i follow.",
        );
      }

      if (request.tipo === "smetti") {
        this.#follows.receiveUnfollow({
          follower: request.da,
          instance: remoteKey,
          target: request.chi,
        });

        return { ok: true };
      }

      const esito = this.#follows.receiveFollow({
        follower: request.da,
        instance: remoteKey,
        target: request.chi,
      });

      // Stessa risposta per «non esiste» e «non è raggiungibile»: vale qui come
      // per i profili, altrimenti il follow diventa un modo di indovinare i nomi.
      return esito === undefined
        ? errorResponse("non_trovato", "Nessun profilo con questo nome su questa istanza.")
        : {
            ok: true,
            stato: esito.stato,
            ...(esito.prova === undefined ? {} : { prova: esito.prova }),
          };
    }

    /*
     * La bacheca e l'immagine non passano dal livello del rapporto, e non è
     * una svista.
     *
     * Gli altri messaggi si autorizzano guardando che cosa **questa istanza**
     * ha deciso sull'altra; qui il permesso è più stretto e sta altrove: una
     * prova esiste solo se una **persona** di qua ha accettato quel follow. Un
     * livello in più davanti non aggiungerebbe niente — chi ha una prova è per
     * definizione almeno «in contatto» — e toglierebbe qualcosa: un
     * amministratore che rimuove un collegamento amministrativo non ha con ciò
     * deciso di togliere i propri lettori a chi li aveva accettati.
     */
    if (request.tipo === "bacheca") {
      return this.#serveBacheca(remoteKey, request);
    }

    if (request.tipo === "immagine") {
      return this.#serveImmagine(remoteKey, request);
    }

    // Il cuore sta qui per la stessa ragione della bacheca: il permesso è la
    // prova, non il livello del rapporto. Chi può leggere un post può
    // mettergli un cuore ([ADR 0025] §2), e un livello davanti toglierebbe
    // qualcosa senza aggiungere niente.
    if (request.tipo === "cuore") {
      return this.#serveCuore(remoteKey, request);
    }

    if (request.tipo === "commento") {
      return this.#serveCommento(remoteKey, request);
    }

    if (request.tipo === "dettaglio-post") {
      return this.#serveDettaglioPost(remoteKey, request);
    }

    if (request.tipo === "chiavi") {
      return this.#serveChiavi(remoteKey, request);
    }

    if (request.tipo === "messaggio") {
      return this.#serveMessaggio(remoteKey, request);
    }

    // Da qui in giù serve almeno un contatto. Il livello viene dalla chiave
    // della connessione: nessun campo del messaggio può spostarlo.
    if (view !== "collegata" && view !== "in-contatto") {
      return errorResponse(
        "non_collegata",
        "Questa istanza risponde solo a chi è collegato o ha già qualcuno in comune.",
      );
    }

    this.#remotes.markSeen({ at, declaredName: request.nome, publicKey: remoteKey });

    if (this.#profiles === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i profili in rete.",
      );
    }

    // Elencare è l'unica cosa che «in contatto» non compra: si ottiene da soli,
    // e un elenco delle persone di qua non è innocuo se chi lo ottiene mente.
    if (request.tipo === "cerca" && view !== "collegata") {
      return errorResponse(
        "non_collegata",
        "Questa istanza risponde alle ricerche solo delle istanze con cui è collegata.",
      );
    }

    if (request.tipo === "profilo") {
      const profilo = this.#profiles.byUsername(request.chi);

      // Un'unica risposta per «non c'è» e «c'è ma non è in rete»: distinguerle
      // ricostruirebbe l'enumerazione una domanda per volta (ADR 0020 §1).
      return profilo === undefined
        ? errorResponse("non_trovato", "Nessun profilo con questo nome su questa istanza.")
        : { ok: true, profilo };
    }

    return {
      ok: true,
      profili: this.#profiles.searchPublic(request.termine, MAX_SEARCH_RESULTS),
    };
  }

  /**
   * A connection request, which is also how an acceptance travels.
   *
   * Both sides asking is what «connected» means, so an administrator accepting
   * on one side simply sends their own request back, and the far side finds it
   * already had one outstanding. One message, no separate acceptance verb, and
   * no state that only one of the two knows about.
   */
  #receiveConnectionRequest(
    remoteKey: string,
    view: RelationshipView,
    declaredName: string,
    at: string,
  ): CollegamentoResponse | ReturnType<typeof errorResponse> {
    if (view === "collegata") {
      this.#remotes.markSeen({ at, declaredName, publicKey: remoteKey });

      return { ok: true, stato: "collegata" };
    }

    // We had already asked them: their asking back completes it.
    if (view === "richiesta-inviata") {
      this.#remotes.upsertState({ declaredName, publicKey: remoteKey, state: "collegata", at });

      return { ok: true, stato: "collegata" };
    }

    if (view === "richiesta-ricevuta") {
      this.#remotes.upsertState({
        declaredName,
        publicKey: remoteKey,
        state: "richiesta_ricevuta",
        at,
      });

      return { ok: true, stato: "in-attesa" };
    }

    // A stranger's request costs a row, so the number of rows strangers can
    // cost is bounded. Without this the one thing an unknown instance is
    // allowed to do would also be a way to fill somebody's disk.
    if (this.#pendingIncoming() >= this.#maxPendingIncoming) {
      return errorResponse(
        "troppe_richieste",
        "Questa istanza ha troppe richieste di collegamento in attesa. Riprova più tardi.",
      );
    }

    this.#remotes.upsertState({
      declaredName,
      publicKey: remoteKey,
      state: "richiesta_ricevuta",
      at,
    });

    return { ok: true, stato: "in-attesa" };
  }

  /**
   * Una pagina di bacheca, o il perché non c'è.
   *
   * Tre no, e sono tre no diversi solo qui dentro: chi legge non li distingue,
   * perché tutti e tre dicono la stessa cosa — non c'è niente per te.
   */
  #serveBacheca(
    remoteKey: string,
    request: BachecaRequest,
  ): BachecaResponse | ReturnType<typeof errorResponse> {
    if (this.#boards === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i post in rete.",
      );
    }

    // Il tetto delle richieste che portano contenuti, che è più stretto degli
    // altri e conta a parte ([ADR 0023] §3).
    if (!this.#budgets.allowContent(remoteKey)) {
      return errorResponse(
        "troppe_richieste",
        "Troppe letture in poco tempo. Riprova fra un minuto.",
      );
    }

    const post = this.#boards.bacheca({
      chi: request.chi.slice(0, MAX_BACHECA_NAMES),
      da: request.da,
      instanceKey: remoteKey,
      quanti: request.quanti ?? MAX_BACHECA_POSTS,
      ...(request.prima === undefined ? {} : { prima: request.prima }),
    });

    // Una pagina vuota è una risposta valida, e deve esserlo: se «non ho
    // niente» fosse un errore e «non hai il permesso» un altro, la differenza
    // fra i due sarebbe una domanda a cui si può rispondere provando.
    return { ok: true, post };
  }

  /**
   * Una fotografia, o il perché non c'è.
   *
   * Come la bacheca: budget dei contenuti, prova della coppia, e la stessa
   * risposta per «non trovato» e «non hai il permesso». `troppo_grande` è
   * l'unica eccezione, e vale solo dopo che la prova ha retto — altrimenti
   * diventerebbe un oracolo sulla dimensione di file che non si possono
   * vedere ([ADR 0023] §4).
   */
  async #serveImmagine(
    remoteKey: string,
    request: ImmagineRequest,
  ): Promise<ImmagineResponse | ReturnType<typeof errorResponse>> {
    if (this.#boards === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i post in rete.",
      );
    }

    if (!this.#budgets.allowContent(remoteKey)) {
      return errorResponse(
        "troppe_richieste",
        "Troppe letture in poco tempo. Riprova fra un minuto.",
      );
    }

    const esito = await this.#boards.immagine({
      chi: request.chi,
      id: request.id,
      instanceKey: remoteKey,
      maxBytes: request.maxBytes,
      variante: request.variante,
    });

    if (esito === undefined) {
      return errorResponse("non_trovato", "Nessuna immagine con questo identificativo.");
    }

    if (esito === "troppo_grande") {
      return errorResponse("troppo_grande", "L'immagine supera il tetto dichiarato da chi legge.");
    }

    return {
      contenuto: Buffer.from(esito.bytes).toString("base64"),
      mediaType: esito.mediaType,
      ok: true,
    };
  }

  /**
   * Un cuore che arriva, o il perché non è arrivato.
   *
   * **Non passa dal budget dei contenuti**, e non è una dimenticanza: quel
   * budget più stretto esiste perché una pagina di bacheca vale 256 kB
   * ([ADR 0023] §3), mentre un cuore è una riga. Vale il tetto normale
   * dell'istanza, contato per chiave come tutto il resto — ed è quello, non il
   * permesso, la difesa contro una casa che ne sparasse a raffica
   * ([ADR 0025] §2).
   */
  #serveCuore(
    remoteKey: string,
    request: CuoreRequest,
  ): CuoreResponse | ReturnType<typeof errorResponse> {
    if (this.#boards === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i post in rete.",
      );
    }

    const esito = this.#boards.cuore({
      chi: request.chi,
      da: request.da,
      instanceKey: remoteKey,
      post: request.post,
      stato: request.stato,
    });

    // Stessa risposta per «questo post non esiste» e «non puoi vederlo»:
    // altrimenti il cuore diventerebbe un modo di indovinare gli id dei post.
    return esito === undefined
      ? errorResponse("non_trovato", "Nessun post con questo identificativo.")
      : { cuori: esito.cuori, mio: esito.mio, ok: true };
  }

  #serveCommento(
    remoteKey: string,
    request: CommentoRequest,
  ): CommentoResponse | ReturnType<typeof errorResponse> {
    if (this.#boards === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i post in rete.",
      );
    }

    const esito = this.#boards.commento({
      chi: request.chi,
      commentoId: request.commentoId,
      da: request.da,
      instanceKey: remoteKey,
      post: request.post,
      stato: request.stato,
    });

    return esito === undefined
      ? errorResponse("non_trovato", "Nessun post con questo identificativo.")
      : { ok: true };
  }

  #serveDettaglioPost(
    remoteKey: string,
    request: DettaglioPostRequest,
  ): DettaglioPostResponse | ReturnType<typeof errorResponse> {
    if (this.#boards === undefined) {
      return errorResponse(
        "richiesta_sconosciuta",
        "Questa istanza non serve ancora i post in rete.",
      );
    }

    const esito = this.#boards.dettaglioPost({
      chi: request.chi,
      da: request.da,
      instanceKey: remoteKey,
      post: request.post,
    });

    return esito === undefined
      ? errorResponse("non_trovato", "Nessun post con questo identificativo.")
      : { ok: true, post: esito.post, commenti: esito.commenti };
  }

  #serveChiavi(
    remoteKey: string,
    request: ChiaviRequest,
  ): ChiaviResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi === undefined) {
      return errorResponse("richiesta_sconosciuta", "I messaggi non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe richieste in poco tempo.");
    }

    const packages = this.#messaggi.getKeyPackages(request.destinatario);
    return { ok: true, packages };
  }

  #serveMessaggio(
    remoteKey: string,
    request: MessaggioRequest,
  ): MessaggioResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi === undefined) {
      return errorResponse("richiesta_sconosciuta", "I messaggi non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe consegne in poco tempo.");
    }

    const esito = this.#messaggi.consegnaBusta({
      conversazioneId: request.conversazioneId,
      destinatarioUsername: request.destinatario,
      senderRemoteKey: remoteKey,
      senderUsername: request.da,
      senderDeviceId: request.senderDeviceId,
      messaggioId: request.messaggioId,
      busta: request.busta,
      createdAt: request.createdAt,
    });

    if (!esito) {
      return errorResponse("non_trovato", "Destinatario non trovato.");
    }

    return { ok: true, consegnatoAt: esito.consegnatoAt };
  }

  #pendingIncoming(): number {
    return this.#remotes.list().filter((remote) => remote.state === "richiesta_ricevuta").length;
  }

  #track(remoteKey: string, connection: IrohConnection): void {
    const set = this.#open.get(remoteKey) ?? new Set<IrohConnection>();

    set.add(connection);
    this.#open.set(remoteKey, set);
  }

  #untrack(remoteKey: string, connection: IrohConnection): void {
    const set = this.#open.get(remoteKey);

    if (set === undefined) {
      return;
    }

    set.delete(connection);

    if (set.size === 0) {
      this.#open.delete(remoteKey);
    }
  }

  // --- Lato client ---------------------------------------------------------

  /** One request, one stream, one response — and the stream ends there. */
  async #ask(
    target: string,
    request: ProtocolRequest,
    /** Il tetto di **questa** risposta: i contenuti ne hanno uno loro (ADR 0023 §3). */
    limit: number = MAX_RESPONSE_BYTES,
  ): Promise<{
    response: unknown;
    via: ReachedVia;
    remoteKey: string;
  }> {
    const connection = await this.#endpoint.connect(target, PROTOCOL_ALPN);

    try {
      const stream = await connection.openBi();

      await writeMessage(stream, request);

      const response = await readMessage(stream, limit);
      const selected = connection.paths().find((path) => path.isSelected);

      return {
        remoteKey: connection.remoteId().toString(),
        response,
        via: selected?.isRelay === true ? "relay" : "diretto",
      };
    } finally {
      connection.close(0n, []);
    }
  }

  // --- Domande alle altre istanze -----------------------------------------

  /** A named profile on a connected instance, or nothing — never a reason. */
  public async remoteProfile(publicKey: string, chi: string): Promise<ProfiloRemoto | undefined> {
    if (this.#remotes.findByKey(publicKey)?.state !== "collegata") {
      return undefined;
    }

    try {
      const { response } = await this.#ask(publicKey, {
        chi,
        nome: this.#instanceName(),
        tipo: "profilo",
      });

      if (!isOk(response)) {
        return undefined;
      }

      const profilo = response.profilo;

      return isProfile(profilo) ? profilo : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Asks every connected instance at once, and keeps nothing.
   *
   * This is what replaced the stored index in ADR 0018 on 2026-08-20. It reaches
   * exactly as far — one hop — and costs the wait instead of a copy of somebody
   * else's members sitting in this database. Each result carries **which
   * instance answered**, because a name without a house is not an identity, and
   * because ADR 0018 asks that a find say through whom it was found.
   *
   * An instance that is switched off contributes nothing and delays nobody: a
   * search is not a transaction, and a partial answer is the right answer.
   */
  public async searchConnected(term: string, timeoutMs = 2000): Promise<RemoteSearchHit[]> {
    const connected = this.#remotes.list().filter((remote) => remote.state === "collegata");

    const answers = await Promise.all(
      connected.map(async (remote) => {
        try {
          const askPromise = this.#ask(remote.publicKey, {
            nome: this.#instanceName(),
            termine: term,
            tipo: "cerca",
          });

          let timer: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<{ response: null }>((resolve) => {
            timer = setTimeout(() => resolve({ response: null }), timeoutMs);
          });

          const result = await Promise.race([askPromise, timeoutPromise]);
          if (timer) clearTimeout(timer);

          const response = result.response;
          if (!response || !isOk(response) || !Array.isArray(response.profili)) {
            return [];
          }

          return response.profili.filter(isSummary).map((profilo) => ({
            istanza: remote.publicKey,
            nome: profilo.nome,
            tramite: remote.declaredName,
            utente: profilo.utente,
          }));
        } catch {
          return [];
        }
      }),
    );

    return answers.flat();
  }

  /**
   * Chiede di seguire. Torna lo stato dichiarato dall'altra, o `undefined`.
   *
   * Con un sì torna anche la **prova della coppia**, che è l'unica occasione in
   * cui quel segreto esiste in chiaro: di là se ne conserva solo l'impronta
   * ([ADR 0023] §2). Un'istanza più vecchia non la manda, e allora il follow
   * vale lo stesso e la lettura non parte — che è meglio di un follow rifiutato.
   */
  public async sendFollow(
    instanceKey: string,
    target: string,
    follower: string,
  ): Promise<{ stato: "in_attesa" | "accettato"; prova?: string } | undefined> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: target,
        da: follower,
        nome: this.#instanceName(),
        tipo: "segui",
      });

      if (!isOk(response)) {
        return undefined;
      }

      if (response.stato !== "accettato") {
        return { stato: "in_attesa" };
      }

      const prova = typeof response.prova === "string" ? response.prova : undefined;

      return { stato: "accettato", ...(prova === undefined ? {} : { prova }) };
    } catch {
      return undefined;
    }
  }

  /**
   * Va a prendere i post di alcune persone su un'altra istanza.
   *
   * `undefined` distingue **una casa che non ha risposto** da una che ha
   * risposto niente, e la differenza non è un dettaglio: la prima rende il feed
   * incompleto e va detta a chi legge, la seconda vuol dire solo che non c'è
   * ancora niente da leggere ([ADR 0023] §5, vincolo 3).
   */
  public async fetchBacheca(
    instanceKey: string,
    chi: readonly { nome: string; prova: string }[],
    /** `da` è chi legge, di qua: dichiarato come in `segui`, e non autorizza niente. */
    options: { da: string; prima?: string; quanti?: number },
  ): Promise<PostRemoto[] | undefined> {
    if (chi.length === 0) {
      return [];
    }

    try {
      const { response } = await this.#ask(
        instanceKey,
        {
          chi: chi.slice(0, MAX_BACHECA_NAMES).map((voce) => ({ ...voce })),
          da: options.da,
          nome: this.#instanceName(),
          tipo: "bacheca",
          ...(options.prima === undefined ? {} : { prima: options.prima }),
          quanti: Math.min(options.quanti ?? MAX_BACHECA_POSTS, MAX_BACHECA_POSTS),
        },
        MAX_BACHECA_BYTES,
      );

      if (!isOk(response) || !Array.isArray(response.post)) {
        return undefined;
      }

      // Quello che arriva è di un'altra macchina: si tiene ciò che ha la forma
      // giusta e si butta il resto, invece di fidarsi del fatto che il campo
      // esista perché il protocollo dice che dovrebbe.
      return response.post.filter(isPostRemoto);
    } catch {
      return undefined;
    }
  }

  /**
   * Mette o toglie un cuore su un post di un'altra casa ([ADR 0025] §1).
   *
   * `undefined` quando il cuore **non è arrivato** — casa spenta, prova che non
   * regge, o una versione del protocollo che non conosce questo messaggio — e
   * chi chiama deve dirlo invece di disegnare il cuore pieno lo stesso. È la
   * lezione di M5 applicata a un gesto: un limite taciuto è indistinguibile da
   * un guasto.
   */
  public async mettiCuore(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: { da: string; post: string; stato: boolean },
  ): Promise<{ cuori: number; mio: boolean } | undefined> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: { ...chi },
        da: options.da,
        nome: this.#instanceName(),
        post: options.post,
        stato: options.stato,
        tipo: "cuore",
      });

      if (!isOk(response)) {
        return undefined;
      }

      const cuori = response.cuori;
      const mio = response.mio;

      return typeof cuori === "number" && Number.isInteger(cuori) && cuori >= 0
        ? { cuori, mio: mio === true }
        : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Invia un commento a un'altra casa.
   */
  public async inviaCommento(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: { da: string; post: string; commentoId: string; stato: boolean },
  ): Promise<boolean> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: { ...chi },
        da: options.da,
        nome: this.#instanceName(),
        post: options.post,
        commentoId: options.commentoId,
        stato: options.stato,
        tipo: "commento",
      });

      return isOk(response);
    } catch {
      return false;
    }
  }

  /**
   * Va a prendere il dettaglio di un post e i suoi commenti su un'altra istanza.
   */
  public async fetchDettaglioPost(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: { da: string; post: string },
  ): Promise<{ post: PostRemoto; commenti: CommentoRemoto[] } | undefined> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: { ...chi },
        da: options.da,
        nome: this.#instanceName(),
        post: options.post,
        tipo: "dettaglio-post",
      });

      if (!isOk(response)) {
        return undefined;
      }

      const post = response.post;
      const commenti = response.commenti;

      // Quello che arriva è di un'altra macchina: si tiene ciò che ha la forma
      // giusta e si butta il resto.
      if (isPostRemoto(post) && Array.isArray(commenti)) {
        return { post, commenti };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Va a prendere **una** fotografia su un'altra istanza.
   *
   * Torna i byte, `troppo_grande` se l'altra ha rifiutato per il tetto, o
   * `undefined` per ogni altra assenza — casa spenta, prova sbagliata,
   * immagine cancellata. Chi chiama fa da proxy e non scrive su disco
   * ([ADR 0023] §4).
   */
  public async fetchImmagine(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: {
      da: string;
      id: string;
      variante: "originale" | "miniatura";
      maxBytes: number;
    },
  ): Promise<{ bytes: Uint8Array; mediaType: string } | "troppo_grande" | undefined> {
    try {
      const { response } = await this.#ask(
        instanceKey,
        {
          chi: { ...chi },
          da: options.da,
          id: options.id,
          maxBytes: options.maxBytes,
          nome: this.#instanceName(),
          tipo: "immagine",
          variante: options.variante,
        },
        limiteRispostaImmagine(options.maxBytes),
      );

      if (!isOk(response)) {
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { codice?: unknown }).codice === "troppo_grande"
        ) {
          return "troppo_grande";
        }

        return undefined;
      }

      const mediaType = response.mediaType;
      const contenuto = response.contenuto;

      if (typeof mediaType !== "string" || typeof contenuto !== "string") {
        return undefined;
      }

      const bytes = Buffer.from(contenuto, "base64");

      if (bytes.byteLength === 0) {
        return undefined;
      }

      // Il tetto di chi legge vale sull'originale. Una miniatura è già ridotta
      // da chi l'ha scritta; rifiutarla qui per lo stesso numero sarebbe un
      // falso «troppo grande» su un file che il browser può mostrare.
      if (options.variante === "originale" && bytes.byteLength > options.maxBytes) {
        return "troppo_grande";
      }

      return { bytes: new Uint8Array(bytes), mediaType };
    } catch {
      return undefined;
    }
  }

  /** Avvisa che qualcuno ha smesso. Un fallimento qui non è un errore di prodotto. */
  public async sendUnfollow(instanceKey: string, target: string, follower: string): Promise<void> {
    try {
      await this.#ask(instanceKey, {
        chi: target,
        da: follower,
        nome: this.#instanceName(),
        tipo: "smetti",
      });
    } catch {
      // Resta un follower che non legge più: scomodo, non pericoloso, e si
      // ripulisce alla prima occasione utile (ADR 0022 §2).
    }
  }

  /**
   * Richiede i KeyPackage monouso per un destinatario remoto.
   */
  public async fetchChiavi(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: { da: string; destinatario: string },
  ): Promise<Array<{ id: string; blob: string }> | undefined> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: { ...chi },
        da: options.da,
        destinatario: options.destinatario,
        nome: this.#instanceName(),
        tipo: "chiavi",
      });

      if (!isOk(response)) {
        return undefined;
      }

      return Array.isArray(response.packages)
        ? (response.packages as Array<{ id: string; blob: string }>)
        : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Consegna una busta crittografica all'istanza del destinatario.
   */
  public async inviaBusta(
    instanceKey: string,
    chi: { nome: string; prova: string },
    options: {
      da: string;
      destinatario: string;
      messaggioId: string;
      conversazioneId: string;
      senderDeviceId: string;
      busta: string;
      createdAt: string;
    },
  ): Promise<{ ok: boolean; consegnatoAt?: string }> {
    try {
      const { response } = await this.#ask(instanceKey, {
        busta: options.busta,
        chi: { ...chi },
        conversazioneId: options.conversazioneId,
        createdAt: options.createdAt,
        da: options.da,
        destinatario: options.destinatario,
        messaggioId: options.messaggioId,
        nome: this.#instanceName(),
        senderDeviceId: options.senderDeviceId,
        tipo: "messaggio",
      });

      if (isOk(response)) {
        const consegnatoAt =
          typeof response.consegnatoAt === "string" ? response.consegnatoAt : undefined;
        return consegnatoAt !== undefined ? { ok: true, consegnatoAt } : { ok: true };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  // --- Operazioni di chi amministra ---------------------------------------

  public list(): RemoteInstanceRecord[] {
    return this.#remotes.list();
  }

  /**
   * Come si chiama la casa dietro una chiave, per quello che vale.
   *
   * Vuoto quando non lo ha mai dichiarato, e chi lo mostra deve saperlo: una
   * firma prova chi parla, non che dica il vero (ADR 0020 §5). L'unica cosa
   * verificata di un'istanza resta la sua chiave.
   */
  public nomeDi(publicKey: string): string {
    return this.#remotes.findByKey(publicKey)?.declaredName ?? "";
  }

  #assertUsable(publicKey: string): string {
    const key = publicKey.trim();

    if (key.length === 0) {
      throw new DomainError("chiave_mancante", "Serve la chiave pubblica dell'altra istanza.", 400);
    }

    if (!this.#endpoint.isOpen) {
      throw new DomainError(
        "rete_spenta",
        "La rete fra istanze è spenta su questa istanza: si accende dal pannello o con ESTIA_NETWORK_PROBE.",
        409,
      );
    }

    // Answered before dialling, and for a ticket too: a ticket carries its key,
    // so «this is you» is knowable without opening a connection — and iroh's
    // own refusal, in English and from three layers down, never reaches whoever
    // pasted it.
    if (this.#endpoint.keyOf(key) === this.#endpoint.endpointId) {
      throw new DomainError(
        "chiave_di_questa_istanza",
        "Questa è la chiave di questa istanza: un'istanza non si collega a sé stessa.",
        400,
      );
    }

    return key;
  }

  /**
   * Asks another instance to be connected.
   *
   * **A row is always keyed by the authenticated key**, never by what somebody
   * pasted. It is ADR 0021 §1 again, one layer up: the identity of a remote
   * instance comes from the QUIC handshake, and a string typed into a form is
   * at best a way to find it.
   *
   * Hence the two paths, which differ in when the row can exist:
   *
   * - **a key** is already the identity, so the row is written first and stays
   *   even if the call fails. An instance that is switched off right now is not
   *   a request that never happened, and an administrator who typed a key must
   *   find it in the list afterwards.
   * - **a ticket** only claims to contain a key, so nothing is written until the
   *   connection has proved which key answered. A code that does not work is not
   *   a relationship worth recording.
   */
  public async requestConnection(target: string): Promise<RemoteInstanceRecord> {
    const value = this.#assertUsable(target);
    const named = this.#endpoint.keyOf(value);

    // Refused before dialling: opening a connection to an instance we have
    // blocked would be doing it a courtesy we already decided against.
    if (named !== undefined) {
      this.#refuseIfBlocked(named);
    }

    if (!this.#endpoint.looksLikeKey(value)) {
      return this.#requestByTicket(value);
    }

    const at = this.#now().toISOString();

    this.#remotes.upsertState({ publicKey: value, state: this.#stateForOutgoing(value), at });

    await this.#send(value);

    const saved = this.#remotes.findByKey(value);

    if (saved === undefined) {
      throw new DomainError("interna", "La connessione non è stata salvata.", 500);
    }

    return saved;
  }

  async #requestByTicket(ticket: string): Promise<RemoteInstanceRecord> {
    const { response, via, remoteKey } = await this.#ask(ticket, {
      nome: this.#instanceName(),
      tipo: "collegamento",
    });

    this.#refuseIfBlocked(remoteKey);

    const at = this.#now().toISOString();
    const state: RemoteState = isConnected(response)
      ? "collegata"
      : this.#stateForOutgoing(remoteKey);

    const saved = this.#remotes.upsertState({ publicKey: remoteKey, state, at });

    this.#remotes.markSeen({ at, publicKey: remoteKey, via });

    return this.#remotes.findByKey(remoteKey) ?? saved;
  }

  #refuseIfBlocked(publicKey: string): void {
    if (this.#remotes.findByKey(publicKey)?.state === "bloccata") {
      throw new DomainError(
        "istanza_bloccata",
        "Questa istanza è bloccata. Toglile il blocco prima di collegarti.",
        409,
      );
    }
  }

  /** Their request may already be waiting, in which case ours completes it. */
  #stateForOutgoing(publicKey: string): RemoteState {
    const existing = this.#remotes.findByKey(publicKey);

    return existing?.state === "richiesta_ricevuta" || existing?.state === "collegata"
      ? "collegata"
      : "richiesta_inviata";
  }

  /** Accepting is sending our own request back — see `#receiveConnectionRequest`. */
  public async accept(publicKey: string): Promise<RemoteInstanceRecord> {
    const key = this.#assertUsable(publicKey);
    const existing = this.#remotes.findByKey(key);

    if (existing === undefined || existing.state !== "richiesta_ricevuta") {
      throw new DomainError(
        "nessuna_richiesta",
        "Non c'è nessuna richiesta di collegamento da questa istanza.",
        409,
      );
    }

    this.#remotes.upsertState({
      publicKey: key,
      state: "collegata",
      at: this.#now().toISOString(),
    });

    await this.#send(key);

    return this.#remotes.findByKey(key) ?? existing;
  }

  async #send(key: string): Promise<void> {
    try {
      const { response, via } = await this.#ask(key, {
        nome: this.#instanceName(),
        tipo: "collegamento",
      });

      const at = this.#now().toISOString();

      if (isConnected(response)) {
        this.#remotes.upsertState({ publicKey: key, state: "collegata", at });
      }

      this.#remotes.markSeen({ at, publicKey: key, via });
    } catch {
      // Unreachable right now is a state, not a failure: the row stays, the
      // panel shows it has never been seen, and the next attempt costs a click.
    }
  }

  /**
   * Says hello, which doubles as the only honest way to ask «are you there».
   *
   * Returns the declared name, which the panel must present as something the
   * other instance says about itself and never as a verified fact (ADR 0020 §5).
   */
  public async ping(publicKey: string): Promise<{
    reached: boolean;
    detail: string;
    declaredName?: string;
    via?: ReachedVia;
  }> {
    const key = this.#assertUsable(publicKey);

    try {
      const { response, via, remoteKey } = await this.#ask(key, {
        nome: this.#instanceName(),
        tipo: "presentazione",
      });

      if (!isOk(response)) {
        return { detail: refusalOf(response), reached: false };
      }

      const declaredName = typeof response.nome === "string" ? response.nome : undefined;
      const at = this.#now().toISOString();

      // Keyed by who answered, not by what was typed.
      if (this.#remotes.findByKey(remoteKey) !== undefined) {
        this.#remotes.markSeen({
          at,
          publicKey: remoteKey,
          via,
          ...(declaredName === undefined ? {} : { declaredName }),
        });
      }

      return {
        detail:
          via === "relay"
            ? "Raggiunta attraverso un relay: il collegamento diretto non è passato."
            : "Raggiunta per collegamento diretto, senza intermediari.",
        reached: true,
        via,
        ...(declaredName === undefined ? {} : { declaredName }),
      };
    } catch (error) {
      return {
        detail: `Non raggiunta: ${error instanceof Error ? error.message : String(error)}`,
        reached: false,
      };
    }
  }

  /**
   * Blocks an instance, and makes the block true now rather than at the next
   * restart: SECURITY_BASELINE §3 decision 4, applied to this boundary.
   */
  public block(publicKey: string): RemoteInstanceRecord {
    const key = publicKey.trim();
    const record = this.#remotes.upsertState({
      publicKey: key,
      state: "bloccata",
      at: this.#now().toISOString(),
    });

    this.#budgets.forget(key);

    for (const connection of this.#open.get(key) ?? []) {
      connection.close(0n, []);
    }

    this.#open.delete(key);

    return record;
  }

  public unblock(publicKey: string): void {
    const key = publicKey.trim();

    if (this.#remotes.findByKey(key)?.state !== "bloccata") {
      throw new DomainError("non_bloccata", "Questa istanza non è bloccata.", 409);
    }

    this.#remotes.remove(key);
  }

  public forget(publicKey: string): boolean {
    const key = publicKey.trim();

    for (const connection of this.#open.get(key) ?? []) {
      connection.close(0n, []);
    }

    this.#open.delete(key);
    this.#budgets.forget(key);

    return this.#remotes.remove(key);
  }
}

export interface RemoteSearchHit {
  utente: string;
  nome: string;
  /** The key of the instance that hosts them. */
  istanza: string;
  /** What that instance calls itself — declared, never verified. */
  tramite: string;
}

function isProfile(value: unknown): value is ProfiloRemoto {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProfiloRemoto).utente === "string" &&
    typeof (value as ProfiloRemoto).nome === "string" &&
    typeof (value as ProfiloRemoto).bio === "string" &&
    typeof (value as ProfiloRemoto).pubblico === "boolean"
  );
}

function isSummary(value: unknown): value is ProfiloSintetico {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProfiloSintetico).utente === "string" &&
    typeof (value as ProfiloSintetico).nome === "string"
  );
}

/**
 * Un post che ha la forma di un post.
 *
 * Il testo può essere vuoto — un post di sole fotografie lo è — mentre id,
 * autore e istante non possono: senza di essi non c'è niente da mostrare né da
 * ordinare, e un elemento a metà nel mezzo di una pagina è peggio di uno in meno.
 * Le immagini, se ci sono, devono avere la forma di una fotografia: un numero
 * al posto dell'elenco (forma breve di una versione precedente) diventa un
 * elenco vuoto, così la pagina resta leggibile e le foto mancano invece di
 * far cadere l'intero post.
 */
function isPostRemoto(value: unknown): value is PostRemoto {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const post = value as PostRemoto;

  if (
    typeof post.id !== "string" ||
    post.id.length === 0 ||
    typeof post.utente !== "string" ||
    typeof post.nome !== "string" ||
    typeof post.testo !== "string" ||
    typeof post.quando !== "string" ||
    Number.isNaN(Date.parse(post.quando))
  ) {
    return false;
  }

  if (Array.isArray(post.immagini)) {
    (value as PostRemoto).immagini = post.immagini.filter(isFotoRemota);
  } else {
    (value as PostRemoto).immagini = [];
  }

  // I due campi di [ADR 0025] §3 sono opzionali, e ciò che arriva storto si
  // butta invece di correggerlo: un conteggio negativo o non intero verrebbe
  // da una macchina che non parla questa versione, e mostrare il cuore come
  // «non disponibile» è la cosa vera da fare.
  if (typeof post.cuori !== "number" || !Number.isInteger(post.cuori) || post.cuori < 0) {
    delete (value as PostRemoto).cuori;
  }

  if (typeof post.mioCuore !== "boolean") {
    delete (value as PostRemoto).mioCuore;
  }

  return true;
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
    typeof foto.byte === "number" &&
    foto.byte >= 0
  );
}

function isOk(response: unknown): response is Record<string, unknown> & { ok: true } {
  return (
    typeof response === "object" && response !== null && (response as { ok?: unknown }).ok === true
  );
}

function isConnected(response: unknown): boolean {
  return isOk(response) && response.stato === "collegata";
}

function refusalOf(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const message = (response as { messaggio?: unknown }).messaggio;

    if (typeof message === "string" && message.length <= MAX_NAME_LENGTH * 4) {
      return message;
    }
  }

  return "L'altra istanza ha rifiutato la richiesta.";
}
