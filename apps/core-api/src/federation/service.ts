import { DomainError } from "../errors.js";

import type { AlpnService, InstanceEndpoint, IrohConnection } from "./endpoint.js";
import { RemoteBudgets, type BudgetLevel } from "./limits.js";
import {
  MAX_NAME_LENGTH,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_SEARCH_RESULTS,
  PROTOCOL_ALPN,
  errorResponse,
  parseRequest,
  readMessage,
  writeMessage,
  type CercaResponse,
  type CollegamentoResponse,
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
  /** Only people who chose «presente e pubblico». Never anybody else. */
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
  }): "in_attesa" | "accettato" | undefined;
  receiveUnfollow(input: { instance: string; follower: string; target: string }): void;
}

export interface FederationServiceOptions {
  remotes: RemoteInstanceRepository;
  /** Absent until profiles exist; then the two request types start answering. */
  profiles?: ProfileDirectory;
  follows?: FollowDirectory;
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

    return this.#dispatch(remoteKey, view, request);
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
    | ReturnType<typeof errorResponse> {
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

      const stato = this.#follows.receiveFollow({
        follower: request.da,
        instance: remoteKey,
        target: request.chi,
      });

      // Stessa risposta per «non esiste» e «non è raggiungibile»: vale qui come
      // per i profili, altrimenti il follow diventa un modo di indovinare i nomi.
      return stato === undefined
        ? errorResponse("non_trovato", "Nessun profilo con questo nome su questa istanza.")
        : { ok: true, stato };
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
  ): Promise<{
    response: unknown;
    via: ReachedVia;
    remoteKey: string;
  }> {
    const connection = await this.#endpoint.connect(target, PROTOCOL_ALPN);

    try {
      const stream = await connection.openBi();

      await writeMessage(stream, request);

      const response = await readMessage(stream, MAX_RESPONSE_BYTES);
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
  public async searchConnected(term: string): Promise<RemoteSearchHit[]> {
    const connected = this.#remotes.list().filter((remote) => remote.state === "collegata");

    const answers = await Promise.all(
      connected.map(async (remote) => {
        try {
          const { response } = await this.#ask(remote.publicKey, {
            nome: this.#instanceName(),
            termine: term,
            tipo: "cerca",
          });

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

  /** Chiede di seguire. Torna lo stato dichiarato dall'altra, o `undefined`. */
  public async sendFollow(
    instanceKey: string,
    target: string,
    follower: string,
  ): Promise<"in_attesa" | "accettato" | undefined> {
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

      return response.stato === "accettato" ? "accettato" : "in_attesa";
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

  // --- Operazioni di chi amministra ---------------------------------------

  public list(): RemoteInstanceRecord[] {
    return this.#remotes.list();
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
