import { DomainError } from "../errors.js";

import type { AlpnService, InstanceEndpoint, IrohConnection } from "./endpoint.js";
import { RemoteBudgets, type BudgetLevel } from "./limits.js";
import {
  MAX_BACHECA_BYTES,
  MAX_BACHECA_NAMES,
  MAX_BACHECA_POSTS,
  MAX_NAME_LENGTH,
  MAX_HANDSHAKE_BYTES,
  MAX_HANDSHAKE_PER_RISPOSTA,
  MAX_REQUEST_BYTES_CON_BUSTA,
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
  type ChiaviDiFirmaRequest,
  type ChiaviDiFirmaResponse,
  type ChiaviRequest,
  type ChiaviResponse,
  type HandshakeDaRequest,
  type HandshakeDaResponse,
  type HandshakeRequest,
  type HandshakeResponse,
  type ArchivioRequest,
  type ArchivioResponse,
  MAX_ARCHIVIO_BYTES,
  type SegnapostoDaRequest,
  type SegnapostoDaResponse,
  type SegnapostoRequest,
  type SegnapostoResponse,
  type SegnapostoSulFilo,
  leggiSegnaposto,
  type StatoRequest,
  type StatoResponse,
  type TipoStato,
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
 * Quanto si aspetta una risposta da un'altra casa, prima di dire che non è arrivata
 * ([ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §6).
 *
 * Il tetto non è prudenza: è la condizione perché «raggiungibile» sia uno stato.
 * Senza, l'attesa la decide il trasporto, e una casa spenta tiene ferma una
 * schermata per il tempo che gli pare.
 */
const TIMEOUT_DOMANDA_MS = 8_000;

/** Le fotografie sono grandi e passano spesso per un relay: hanno il loro. */
const TIMEOUT_IMMAGINE_MS = 20_000;

/** La ricerca aveva già il suo, ed era il solo posto ad averlo. */
const TIMEOUT_RICERCA_MS = 2_000;

/** Il battito chiede una cosa sola e minuscola: se non torna subito, non c'è. */
export const TIMEOUT_BATTITO_MS = 5_000;

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
  getKeyPackages(username: string, algoritmo?: string): Array<{ id: string; blob: string }>;
  /**
   * Le chiavi di firma **approvate** di un membro di questa casa
   * ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §1).
   *
   * Un nome che non esiste e uno che non ha chiavi danno lo stesso elenco
   * vuoto: distinguerli sarebbe l'enumerazione che ADR 0020 §1 vieta.
   */
  chiaviDiFirmaDi(username: string): Array<{ publicKey: string; algorithm: string }>;
  /**
   * Mette in fila una busta arrivata da un'altra casa (ADR 0042 §2).
   *
   * `undefined` per ogni rifiuto, senza dire quale: conversazione che non
   * esiste, ordinata da un'altra casa, o casa che non partecipa.
   */
  depositaHandshake?(record: {
    conversazioneId: string;
    remoteKey: string;
    id: string;
    epoch: number;
    tipo: "commit" | "welcome";
    destinatario?: string | undefined;
    busta: string;
    createdAt: string;
  }): { id: string } | "indietro" | undefined;
  /** Le voci custodite qui con questi id, per una casa che partecipa (ADR 0043 §2). */
  vociPerCasa?(
    conversazioneId: string,
    remoteKey: string,
    ids: readonly string[],
  ):
    | {
        voci: Array<{ id: string; chiaveN: number; busta: string; createdAt: string }>;
        assenti: string[];
      }
    | "rifiutato";
  /** I segnaposto custoditi qui, per una casa che partecipa (ADR 0042 §4.1). */
  segnapostiPerCasa?(
    conversazioneId: string,
    remoteKey: string,
    dopo: number,
  ): { da: number; a: number; voci: SegnapostoSulFilo[]; prossimo?: string } | "rifiutato";
  /** Una spinta, o l'annuncio di una conversazione. `false` = rifiutata. */
  riceviSegnapostiSpinti?(spinta: {
    conversazioneId: string;
    remoteKey: string;
    da: string;
    destinatari: readonly string[];
    voci: readonly SegnapostoSulFilo[];
  }): boolean;
  /**
   * `GroupInfo` o mazzo per una casa che partecipa (ADR 0042 §4).
   *
   * `"rifiutato"` per ogni rifiuto di §2; `undefined` quando la conversazione
   * non ha ancora quello stato.
   */
  stato?(
    conversazioneId: string,
    remoteKey: string,
    tipo: "group-info" | "mazzo",
  ): { blob: string; epoch: number; updatedAt: string } | "rifiutato" | undefined;
  /** Il deposito, con la regola dell'epoch che non torna indietro. */
  depositaStato?(
    conversazioneId: string,
    remoteKey: string,
    tipo: "group-info" | "mazzo",
    stato: { blob: string; epoch: number },
  ): { updatedAt: string } | "rifiutato" | "indietro";
  /** La coda ordinata per una casa che partecipa (ADR 0042 §3). */
  handshakeDa?(
    conversazioneId: string,
    remoteKey: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ):
    | {
        handshake: Array<{
          id: string;
          epoch: number;
          tipo: "commit" | "welcome";
          busta: string;
          createdAt: string;
        }>;
        prossimo?: string;
      }
    | undefined;
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
  /**
   * Il tetto di tempo per una domanda ordinaria (ADR 0041 §6).
   *
   * Iniettabile per la stessa ragione dell'orologio: un test che prova che una
   * casa muta non blocca niente non deve aspettare otto secondi per dirlo.
   */
  timeoutMs?: number;
}

/**
 * Che cosa e' successo chiedendo le chiavi a un'altra casa.
 *
 * Prima erano tutti `undefined`, e chi scriveva si sentiva rispondere «quella
 * persona non ha un dispositivo» anche quando la casa era semplicemente spenta.
 * Con il tetto di tempo di [ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §6
 * quel caso arriva in fretta ed e' distinguibile: vale la pena distinguerlo.
 */
/**
 * L'esito di una domanda al registro di un'altra casa (ADR 0042 §1).
 *
 * Le stesse tre risposte di `EsitoChiavi`, e per la stessa ragione: **una casa
 * che non risponde non è un membro senza chiavi**. Chi valida un albero deve
 * poterlo distinguere, o direbbe «questa persona non è chi dice» di qualcuno il
 * cui NAS è semplicemente spento.
 */
export type EsitoChiaviDiFirma =
  | { esito: "chiavi"; chiavi: Array<{ publicKey: string; algorithm: string }> }
  | { esito: "nessuna" }
  | { esito: "irraggiungibile" };

export type EsitoChiavi =
  | { esito: "chiavi"; packages: Array<{ id: string; blob: string }> }
  /** Ha risposto, e non ci sono chiavi da dare. */
  | { esito: "nessuna" }
  /** Non ha risposto: spenta, irraggiungibile, o troppo lenta. */
  | { esito: "irraggiungibile" };

export class FederationService implements AlpnService {
  public readonly alpn = PROTOCOL_ALPN;

  readonly #remotes: RemoteInstanceRepository;
  readonly #endpoint: InstanceEndpoint;
  readonly #instanceName: () => string;
  readonly #budgets: RemoteBudgets;
  readonly #maxPendingIncoming: number;
  readonly #now: () => Date;
  readonly #timeoutDomanda: number;
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
    this.#timeoutDomanda = options.timeoutMs ?? TIMEOUT_DOMANDA_MS;
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

    // Il tetto grande, perché il tipo si sa solo dopo aver letto e `handshake`
    // porta una busta: con quello di controllo un Welcome verrebbe troncato
    // prima di essere interpretato. Il limite di frequenza è già passato.
    const message = await readMessage(stream, MAX_REQUEST_BYTES_CON_BUSTA);
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

    // Il registro delle chiavi di firma sta **con `chiavi`**, prima del
    // controllo del rapporto. Il 2026-09-17 era stato messo dopo, per non dire
    // a un'estranea chi abita qui; ma `chiavi` consegna già a chiunque non sia
    // bloccata un KeyPackage — che **contiene la stessa chiave di firma**. Il
    // controllo non proteggeva niente, e in cambio impediva a due case non
    // collegate di validare l'albero della conversazione che `chiavi` aveva
    // appena permesso di aprire. Resta la regola di ADR 0020 §1: un nome che
    // non esiste e uno senza chiavi danno lo stesso elenco vuoto.
    if (request.tipo === "chiavi-di-firma") {
      return this.#serveChiaviDiFirma(remoteKey, request);
    }

    if (request.tipo === "messaggio") {
      return this.#serveMessaggio(remoteKey, request);
    }

    // Gli handshake stanno qui, prima del controllo del rapporto, e per la
    // stessa ragione di `messaggio`: il permesso non è il livello del rapporto,
    // è **partecipare a quella conversazione** ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §2),
    // e lo si verifica in locale sui membri. Una casa con cui non si è
    // collegati, ma che ospita qualcuno del gruppo, deve poter committare.
    if (request.tipo === "handshake") {
      return this.#serveHandshake(remoteKey, request);
    }

    if (request.tipo === "handshake-da") {
      return this.#serveHandshakeDa(remoteKey, request);
    }

    // Lo stato da cui si rientra sta con la coda, e per la stessa ragione: il
    // permesso è partecipare alla conversazione, non il livello del rapporto.
    if (request.tipo === "group-info" || request.tipo === "mazzo") {
      return this.#serveStato(remoteKey, request);
    }

    // I segnaposto, per la stessa ragione: il permesso è partecipare. E ogni
    // casa custodisce la sua parte, quindi non serve ordinare la conversazione.
    if (request.tipo === "segnaposto") {
      return this.#serveSegnaposto(remoteKey, request);
    }

    if (request.tipo === "segnaposto-da") {
      return this.#serveSegnapostoDa(remoteKey, request);
    }

    if (request.tipo === "archivio") {
      return this.#serveArchivio(remoteKey, request);
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

    const packages = this.#messaggi.getKeyPackages(request.destinatario, request.algoritmo);
    return { ok: true, packages };
  }

  /**
   * Le chiavi di firma di un membro di questa casa (ADR 0042 §1).
   *
   * Risponde **sempre allo stesso modo** per un nome che non c'è e per uno che
   * non ha chiavi: un elenco vuoto. È la regola di ADR 0020 §1, e qui conta il
   * doppio, perché una risposta diversa direbbe a un'altra casa chi abita qua.
   */
  #serveChiaviDiFirma(
    remoteKey: string,
    request: ChiaviDiFirmaRequest,
  ): ChiaviDiFirmaResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi === undefined) {
      return errorResponse("richiesta_sconosciuta", "I messaggi non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe richieste in poco tempo.");
    }

    return { ok: true, chiavi: this.#messaggi.chiaviDiFirmaDi(request.chi) };
  }

  /**
   * Mette in fila una busta di handshake (ADR 0042 §2 e §3).
   *
   * Due rifiuti diversi si dicono allo stesso modo: «questa conversazione non
   * la ordino io» e «tu non ci partecipi». Distinguerli direbbe a un'altra casa
   * quali conversazioni esistono qui, un identificativo per volta.
   */
  #serveHandshake(
    remoteKey: string,
    request: HandshakeRequest,
  ): HandshakeResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.depositaHandshake === undefined) {
      return errorResponse("richiesta_sconosciuta", "Gli handshake non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppi depositi in poco tempo.");
    }

    const esito = this.#messaggi.depositaHandshake({
      busta: request.handshake.busta,
      conversazioneId: request.conversazione,
      createdAt: request.handshake.createdAt,
      epoch: request.handshake.epoch,
      id: request.handshake.id,
      remoteKey,
      tipo: request.handshake.tipoBusta,
      ...(request.handshake.destinatario === undefined
        ? {}
        : { destinatario: request.handshake.destinatario }),
    });

    if (esito === undefined) {
      return errorResponse("non_trovato", "Nessuna conversazione da ordinare con questo nome.");
    }

    // La corsa di §3: un altro commit ha già creato quell'epoch.
    if (esito === "indietro") {
      return errorResponse(
        "epoch_superata",
        "Un altro commit ha già cambiato il gruppo. Aggiorna e riprova.",
      );
    }

    return { id: esito.id, ok: true };
  }

  /**
   * `GroupInfo` e mazzo, letti o depositati presso chi ordina (ADR 0042 §4).
   *
   * Tre rifiuti diversi — non la ordino io, non esiste, non ci partecipi — si
   * dicono allo stesso modo. «Non c'è ancora» invece si dice, perché lo sente
   * soltanto chi ha già passato §2: è una casa che partecipa, e sapere che il
   * gruppo non ha ancora un punto di rientro le serve.
   */
  #serveStato(
    remoteKey: string,
    request: StatoRequest,
  ): StatoResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.stato === undefined || this.#messaggi.depositaStato === undefined) {
      return errorResponse("richiesta_sconosciuta", "Lo stato dei gruppi non è attivo.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe richieste in poco tempo.");
    }

    if (request.azione === "leggi") {
      const esito = this.#messaggi.stato(request.conversazione, remoteKey, request.tipo);

      if (esito === "rifiutato") {
        return errorResponse("non_trovato", "Nessuna conversazione da ordinare con questo nome.");
      }

      return esito === undefined
        ? { ok: true }
        : { blob: esito.blob, epoch: esito.epoch, ok: true, updatedAt: esito.updatedAt };
    }

    const esito = this.#messaggi.depositaStato(request.conversazione, remoteKey, request.tipo, {
      blob: request.blob ?? "",
      epoch: request.epoch ?? 0,
    });

    if (esito === "rifiutato") {
      return errorResponse("non_trovato", "Nessuna conversazione da ordinare con questo nome.");
    }

    if (esito === "indietro") {
      return errorResponse(
        "epoch_superata",
        "Il gruppo è già più avanti di così. Aggiorna e riprova.",
      );
    }

    return { ok: true, updatedAt: esito.updatedAt };
  }

  /** La visita all'archivio: le voci degli autori di qui, a chi partecipa. */
  #serveArchivio(
    remoteKey: string,
    request: ArchivioRequest,
  ): ArchivioResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.vociPerCasa === undefined) {
      return errorResponse("richiesta_sconosciuta", "L'archivio non è attivo.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe visite in poco tempo.");
    }

    const esito = this.#messaggi.vociPerCasa(request.conversazione, remoteKey, request.ids);

    return esito === "rifiutato"
      ? errorResponse("non_trovato", "Nessuna conversazione con questo nome.")
      : { assenti: esito.assenti, ok: true, voci: esito.voci };
  }

  /** Una spinta di segnaposto, o l'annuncio di una conversazione (ADR 0042 §4.1). */
  #serveSegnaposto(
    remoteKey: string,
    request: SegnapostoRequest,
  ): SegnapostoResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.riceviSegnapostiSpinti === undefined) {
      return errorResponse("richiesta_sconosciuta", "I segnaposto non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe spinte in poco tempo.");
    }

    const accettata = this.#messaggi.riceviSegnapostiSpinti({
      conversazioneId: request.conversazione,
      da: request.da,
      destinatari: request.destinatari,
      remoteKey,
      voci: request.segnaposti,
    });

    return accettata
      ? { ok: true }
      : errorResponse("non_trovato", "Nessuna conversazione per questi segnaposto.");
  }

  /** I segnaposto che questa casa custodisce, con la finestra dichiarata. */
  #serveSegnapostoDa(
    remoteKey: string,
    request: SegnapostoDaRequest,
  ): SegnapostoDaResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.segnapostiPerCasa === undefined) {
      return errorResponse("richiesta_sconosciuta", "I segnaposto non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe richieste in poco tempo.");
    }

    const finestra = this.#messaggi.segnapostiPerCasa(
      request.conversazione,
      remoteKey,
      request.dopo,
    );

    if (finestra === "rifiutato") {
      return errorResponse("non_trovato", "Nessuna conversazione con questo nome.");
    }

    return {
      a: finestra.a,
      da: finestra.da,
      ok: true,
      segnaposti: finestra.voci,
      ...(finestra.prossimo === undefined ? {} : { prossimo: finestra.prossimo }),
    };
  }

  /** La coda ordinata, da un cursore in poi. Porta i Welcome dei suoi e basta. */
  #serveHandshakeDa(
    remoteKey: string,
    request: HandshakeDaRequest,
  ): HandshakeDaResponse | ReturnType<typeof errorResponse> {
    if (this.#messaggi?.handshakeDa === undefined) {
      return errorResponse("richiesta_sconosciuta", "Gli handshake non sono attivi.");
    }

    if (!this.#budgets.allowDelivery(remoteKey)) {
      return errorResponse("troppe_richieste", "Troppe richieste in poco tempo.");
    }

    const esito = this.#messaggi.handshakeDa(request.conversazione, remoteKey, {
      limit: MAX_HANDSHAKE_PER_RISPOSTA,
      ...(request.dopo === undefined ? {} : { dopo: request.dopo }),
    });

    if (esito === undefined) {
      return errorResponse("non_trovato", "Nessuna conversazione da ordinare con questo nome.");
    }

    return {
      handshake: esito.handshake.map((voce) => ({
        busta: voce.busta,
        createdAt: voce.createdAt,
        epoch: voce.epoch,
        id: voce.id,
        tipoBusta: voce.tipo,
      })),
      ok: true,
      ...(esito.prossimo === undefined ? {} : { prossimo: esito.prossimo }),
    };
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
    /** Il tetto di **tempo**, che vale allo stesso modo per tutte (ADR 0041 §6). */
    timeoutMs?: number,
  ): Promise<{
    response: unknown;
    via: ReachedVia;
    remoteKey: string;
  }> {
    const tetto = timeoutMs ?? this.#timeoutDomanda;
    const domanda = this.#chiedi(target, request, limit);

    // Chi perde la corsa non viene abbandonato: continua per conto suo fino al
    // `finally` che chiude la connessione, e il suo errore viene raccolto qui
    // perché nessuno lo aspetta più.
    domanda.catch(() => undefined);

    let timer: NodeJS.Timeout | undefined;
    const scadenza = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`L'altra istanza non ha risposto entro ${String(tetto)} ms.`)),
        tetto,
      );
      timer.unref?.();
    });

    try {
      return await Promise.race([domanda, scadenza]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #chiedi(
    target: string,
    request: ProtocolRequest,
    limit: number,
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
  public async searchConnected(
    term: string,
    timeoutMs = TIMEOUT_RICERCA_MS,
  ): Promise<RemoteSearchHit[]> {
    const connected = this.#remotes.list().filter((remote) => remote.state === "collegata");

    const answers = await Promise.all(
      connected.map(async (remote) => {
        try {
          const { response } = await this.#ask(
            remote.publicKey,
            {
              nome: this.#instanceName(),
              termine: term,
              tipo: "cerca",
            },
            MAX_RESPONSE_BYTES,
            timeoutMs,
          );

          if (!isOk(response) || !Array.isArray(response.profili)) {
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
        TIMEOUT_IMMAGINE_MS,
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
    options: { da: string; destinatario: string; algoritmo?: string },
  ): Promise<EsitoChiavi> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi: { ...chi },
        da: options.da,
        destinatario: options.destinatario,
        nome: this.#instanceName(),
        tipo: "chiavi",
        ...(options.algoritmo === undefined ? {} : { algoritmo: options.algoritmo }),
      });

      // Ha risposto no: puo' essere «quella persona non c'e'» o «non ti
      // rispondo» (ADR 0020, nega salvo rapporto). Da fuori si vedono uguali, e
      // per chi scrive la conseguenza e' la stessa: nessuna chiave. Quello che
      // NON e' uguale e' la casa che non risponde affatto, ed e' il caso sotto.
      if (!isOk(response)) {
        return { esito: "nessuna" };
      }

      return Array.isArray(response.packages) && response.packages.length > 0
        ? { esito: "chiavi", packages: response.packages as Array<{ id: string; blob: string }> }
        : { esito: "nessuna" };
    } catch {
      // Nessuna risposta: spenta, irraggiungibile, o oltre il tetto di tempo di
      // [ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §6.
      // Confonderlo con «non ha dispositivi» fa dire una bugia a chi scrive.
      return { esito: "irraggiungibile" };
    }
  }

  /**
   * Deposita una busta di handshake presso la casa che ordina (ADR 0042 §3).
   *
   * Non c'è coda locale di riserva: se quella casa non risponde, in quella
   * conversazione non si cambia chi c'è, e lo si dice. Una coda qui sarebbe la
   * seconda fila che §3 esiste per non avere.
   */
  public async depositaHandshakePresso(
    instanceKey: string,
    conversazioneId: string,
    busta: {
      id: string;
      epoch: number;
      tipo: "commit" | "welcome";
      destinatario?: string | undefined;
      busta: string;
      createdAt: string;
    },
  ): Promise<
    | { esito: "depositato" }
    | { esito: "indietro" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(instanceKey, {
        conversazione: conversazioneId,
        handshake: {
          busta: busta.busta,
          createdAt: busta.createdAt,
          epoch: busta.epoch,
          id: busta.id,
          tipoBusta: busta.tipo,
          ...(busta.destinatario === undefined ? {} : { destinatario: busta.destinatario }),
        },
        nome: this.#instanceName(),
        tipo: "handshake",
      });

      if (isOk(response)) {
        return { esito: "depositato" };
      }

      return codiceDi(response) === "epoch_superata"
        ? { esito: "indietro" }
        : { esito: "rifiutato" };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /**
   * Legge `GroupInfo` o mazzo presso la casa che ordina (ADR 0042 §4).
   *
   * Non si conserva qui: le altre case li chiedono e non li tengono, che è la
   * decisione 5 delle risposte del proprietario.
   */
  public async leggiStatoPresso(
    instanceKey: string,
    conversazioneId: string,
    tipo: TipoStato,
  ): Promise<
    | { esito: "stato"; blob: string; epoch: number; updatedAt: string }
    | { esito: "assente" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(
        instanceKey,
        { azione: "leggi", conversazione: conversazioneId, nome: this.#instanceName(), tipo },
        MAX_REQUEST_BYTES_CON_BUSTA,
      );

      if (!isOk(response)) {
        return { esito: "rifiutato" };
      }

      if (
        typeof response.blob !== "string" ||
        typeof response.epoch !== "number" ||
        typeof response.updatedAt !== "string"
      ) {
        return { esito: "assente" };
      }

      return {
        blob: response.blob,
        epoch: response.epoch,
        esito: "stato",
        updatedAt: response.updatedAt,
      };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /** Deposita `GroupInfo` o mazzo presso la casa che ordina. L'epoch non torna indietro. */
  public async depositaStatoPresso(
    instanceKey: string,
    conversazioneId: string,
    tipo: TipoStato,
    stato: { blob: string; epoch: number },
  ): Promise<
    | { esito: "depositato"; updatedAt: string }
    | { esito: "indietro" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(instanceKey, {
        azione: "deposita",
        blob: stato.blob,
        conversazione: conversazioneId,
        epoch: stato.epoch,
        nome: this.#instanceName(),
        tipo,
      });

      if (isOk(response)) {
        return {
          esito: "depositato",
          updatedAt:
            typeof response.updatedAt === "string" ? response.updatedAt : new Date().toISOString(),
        };
      }

      return codiceDi(response) === "epoch_superata"
        ? { esito: "indietro" }
        : { esito: "rifiutato" };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /**
   * Visita l'archivio di un'altra casa. Quello che torna si consegna a chi l'ha
   * chiesto e non si scrive: nessuna cache, nessun log del contenuto.
   */
  public async visitaArchivioPresso(
    instanceKey: string,
    conversazioneId: string,
    ids: string[],
  ): Promise<
    | {
        esito: "voci";
        voci: Array<{ id: string; chiaveN: number; busta: string; createdAt: string }>;
        assenti: string[];
      }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(
        instanceKey,
        { conversazione: conversazioneId, ids, nome: this.#instanceName(), tipo: "archivio" },
        MAX_ARCHIVIO_BYTES,
      );

      if (!isOk(response) || !Array.isArray(response.voci) || !Array.isArray(response.assenti)) {
        return { esito: "rifiutato" };
      }

      // Si accettano solo voci chieste: una casa che rispondesse con altro
      // starebbe infilando contenuti nella cronologia di qualcun altro.
      const chieste = new Set(ids);
      const voci = (response.voci as unknown[]).filter(
        (v): v is { id: string; chiaveN: number; busta: string; createdAt: string } =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as { id?: unknown }).id === "string" &&
          chieste.has((v as { id: string }).id) &&
          typeof (v as { chiaveN?: unknown }).chiaveN === "number" &&
          typeof (v as { busta?: unknown }).busta === "string" &&
          typeof (v as { createdAt?: unknown }).createdAt === "string",
      );
      const assenti = (response.assenti as unknown[]).filter(
        (id): id is string => typeof id === "string" && chieste.has(id),
      );

      return { assenti, esito: "voci", voci };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /** I segnaposto di una casa custode dopo un cursore (`segnaposto-da`). */
  public async segnapostiDaPresso(
    instanceKey: string,
    conversazioneId: string,
    dopo: number,
  ): Promise<
    | { esito: "finestra"; da: number; a: number; voci: SegnapostoSulFilo[]; prossimo?: string }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(
        instanceKey,
        { conversazione: conversazioneId, dopo, nome: this.#instanceName(), tipo: "segnaposto-da" },
        MAX_REQUEST_BYTES_CON_BUSTA,
      );

      if (
        !isOk(response) ||
        typeof response.da !== "number" ||
        typeof response.a !== "number" ||
        !Array.isArray(response.segnaposti)
      ) {
        return { esito: "rifiutato" };
      }

      // Si rilegge ogni voce come se arrivasse da un'estranea: lo è. Una voce
      // malformata rende malformata la finestra, che non si applica a metà.
      const voci = response.segnaposti.map(leggiSegnaposto);
      if (voci.some((v) => v === undefined)) {
        return { esito: "rifiutato" };
      }

      return {
        a: response.a,
        da: response.da,
        esito: "finestra",
        voci: voci as SegnapostoSulFilo[],
        ...(typeof response.prossimo === "string" ? { prossimo: response.prossimo } : {}),
      };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /** La spinta: best effort, e un fallimento non si dice a nessuno. */
  public async spingiSegnapostiA(
    instanceKey: string,
    spinta: {
      conversazioneId: string;
      da: string;
      destinatari: string[];
      voci: SegnapostoSulFilo[];
    },
  ): Promise<void> {
    await this.#ask(instanceKey, {
      conversazione: spinta.conversazioneId,
      da: spinta.da,
      destinatari: spinta.destinatari,
      nome: this.#instanceName(),
      segnaposti: spinta.voci,
      tipo: "segnaposto",
    }).catch(() => undefined);
  }

  /** La coda ordinata, chiesta a chi ordina (ADR 0042 §3). */
  public async fetchHandshake(
    instanceKey: string,
    conversazioneId: string,
    dopo?: string,
  ): Promise<
    | {
        esito: "coda";
        handshake: Array<{
          id: string;
          epoch: number;
          tipo: "commit" | "welcome";
          busta: string;
          createdAt: string;
        }>;
        prossimo?: string;
      }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  > {
    try {
      const { response } = await this.#ask(
        instanceKey,
        {
          conversazione: conversazioneId,
          nome: this.#instanceName(),
          tipo: "handshake-da",
          ...(dopo === undefined ? {} : { dopo }),
        },
        MAX_HANDSHAKE_BYTES,
      );

      if (!isOk(response)) {
        return { esito: "rifiutato" };
      }

      const voci = Array.isArray(response.handshake)
        ? (response.handshake as HandshakeDaResponse["handshake"])
        : [];
      const prossimo = typeof response.prossimo === "string" ? response.prossimo : undefined;

      return {
        esito: "coda",
        handshake: voci.map((voce) => ({
          busta: voce.busta,
          createdAt: voce.createdAt,
          epoch: voce.epoch,
          id: voce.id,
          tipo: voce.tipoBusta,
        })),
        ...(prossimo === undefined ? {} : { prossimo }),
      };
    } catch {
      return { esito: "irraggiungibile" };
    }
  }

  /**
   * Chiede a un'altra casa le chiavi di firma di un suo membro (ADR 0042 §1).
   *
   * **La fiducia che questa riga dichiara**: «mi fido che la casa di Bruno dica
   * la verità su Bruno». Non è nuova nella sostanza — una casa che mente sui
   * propri membri può già consegnare buste per conto loro — ma allarga il
   * limite 4 di [ADR 0036](../../../../docs/adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md),
   * e con essa il numero di sicurezza passa da consigliato a necessario.
   *
   * **Non si conserva niente qui dentro.** Chi valida un albero chiede una
   * volta per validazione e tiene il registro per la durata di quella
   * validazione: un registro memorizzato è una revoca che non arriva.
   */
  public async fetchChiaviDiFirma(instanceKey: string, chi: string): Promise<EsitoChiaviDiFirma> {
    try {
      const { response } = await this.#ask(instanceKey, {
        chi,
        nome: this.#instanceName(),
        tipo: "chiavi-di-firma",
      });

      if (!isOk(response)) {
        return { esito: "nessuna" };
      }

      const chiavi = Array.isArray(response.chiavi)
        ? (response.chiavi as Array<{ publicKey: string; algorithm: string }>)
        : [];

      return chiavi.length > 0 ? { esito: "chiavi", chiavi } : { esito: "nessuna" };
    } catch {
      // Spenta, irraggiungibile, o oltre il tetto di tempo di ADR 0041 §6. Chi
      // valida deve saperlo: un albero non si rifiuta perché un NAS dorme.
      return { esito: "irraggiungibile" };
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
  public async ping(
    publicKey: string,
    /** Il battito di [ADR 0041] chiede la stessa cosa, ma aspetta meno. */
    timeoutMs?: number,
  ): Promise<{
    reached: boolean;
    detail: string;
    declaredName?: string;
    via?: ReachedVia;
  }> {
    const key = this.#assertUsable(publicKey);

    try {
      const { response, via, remoteKey } = await this.#ask(
        key,
        {
          nome: this.#instanceName(),
          tipo: "presentazione",
        },
        MAX_RESPONSE_BYTES,
        timeoutMs,
      );

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

/** Il codice di una risposta d'errore, se ne ha uno. */
function codiceDi(response: unknown): unknown {
  return typeof response === "object" && response !== null
    ? (response as { codice?: unknown }).codice
    : undefined;
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
