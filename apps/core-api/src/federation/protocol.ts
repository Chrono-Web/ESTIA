/**
 * The wire between two ESTIA instances, as decided in [ADR 0021].
 *
 * Four properties, and each one is a decision that was written down before this
 * file existed:
 *
 * - **the version is in the ALPN** (`estia/1`). An instance advertises every
 *   major it speaks, and QUIC negotiates. Incompatibility therefore fails at
 *   the handshake, cleanly, instead of failing later as data that parses and
 *   means something else.
 * - **one request and one response per bidirectional stream.** No correlation
 *   ids, no multiplexer, no queue of requests in flight — QUIC gives streams
 *   away, so concurrency costs nothing and a slow request delays nothing else.
 * - **the cap comes before the parse.** Never allocate in proportion to what
 *   the other side decided to send. Same rule ADR 0011 applies to images.
 * - **who is asking is never in the message.** It is the authenticated remote
 *   key of the connection, and nothing else — a field would be written by the
 *   caller, which is the mistake SECURITY_BASELINE §2 forbids for headers.
 */

import type { IrohStream } from "./endpoint.js";

/** The major version, on the wire. Advertise every major still spoken. */
export const PROTOCOL_ALPN = "estia/1";

export const SUPPORTED_ALPNS: readonly string[] = [PROTOCOL_ALPN];

/**
 * Control messages are small; these ceilings are deliberately far above what
 * this version sends and far below what would hurt. They are the reason an
 * unknown instance cannot make this one allocate.
 */
export const MAX_REQUEST_BYTES = 4096;
export const MAX_RESPONSE_BYTES = 16_384;

/**
 * Il tetto di `bacheca`, derivato e non scelto ([ADR 0023] §3).
 *
 * Dieci post per pagina; un corpo arriva a `POST_MAX_LENGTH` = 5000 caratteri,
 * cioè fino a 20 kB in UTF-8 nel caso peggiore, più le descrizioni delle
 * immagini e i campi brevi: dieci per ventiquattro fa 240 kB, e questo è il
 * gradino sopra. Resta separato da `MAX_RESPONSE_BYTES`, che continua a valere
 * **16 kB per i messaggi di controllo**: un tetto solo, alzato per tutti,
 * avrebbe regalato a ogni `presentazione` il diritto di far allocare un quarto
 * di megabyte.
 */
export const MAX_BACHECA_BYTES = 256 * 1024;

/**
 * Prova sentinella: un'istanza collegata legge la bacheca di un profilo
 * **pubblico** senza un follow accettato. Non è un segreto — è un permesso
 * dichiarato dal profilo — e il lato che verifica accetta solo se la persona
 * è `presente_pubblico`.
 */
export const PROVA_PROFILO_PUBBLICO = "estia-profilo-pubblico";

/** Quanti post in una pagina, e il valore predefinito se non lo si dice. */
export const MAX_BACHECA_POSTS = 10;

/**
 * Quante persone si possono chiedere in una richiesta sola.
 *
 * Non è una soglia di prodotto: chi ne segue di più fa due richieste. È ciò che
 * tiene la richiesta dentro `MAX_REQUEST_BYTES` — sedici nomi con la loro prova
 * stanno in poco più di un chilobyte.
 */
export const MAX_BACHECA_NAMES = 16;

/** Una prova è base64url di 32 byte: 43 caratteri. Il tetto lascia margine e nient'altro. */
export const MAX_PROOF_LENGTH = 128;

/** How long a declared name may be before it is refused rather than truncated. */
export const MAX_NAME_LENGTH = 120;

/** A bio is a paragraph, not an essay, and the ceiling is what keeps it so on the wire. */
export const MAX_BIO_LENGTH = 500;

/**
 * How many profiles a search may answer with.
 *
 * Low on purpose. A search is not a way to walk somebody's membership: ADR 0020
 * allows listing only the profiles of people who asked to be findable, and a
 * generous page size would turn that permission back into the enumeration the
 * same section forbids.
 */
export const MAX_SEARCH_RESULTS = 20;

export type RequestType =
  | "presentazione"
  | "collegamento"
  | "profilo"
  | "cerca"
  | "segui"
  | "smetti"
  | "bacheca"
  | "immagine"
  | "cuore"
  | "commento";

export interface PresentazioneRequest {
  tipo: "presentazione";
  /** What the calling instance calls itself. Declared, never verified — ADR 0020 §5. */
  nome: string;
}

export interface CollegamentoRequest {
  tipo: "collegamento";
  nome: string;
}

/** Asks for one profile **by name**, which is the only way to ask for one. */
export interface ProfiloRequest {
  tipo: "profilo";
  nome: string;
  /** The username on the far instance. Nothing here enumerates. */
  chi: string;
}

export interface CercaRequest {
  tipo: "cerca";
  nome: string;
  termine: string;
}

/**
 * «Una persona di qua vuole seguirne una di là.»
 *
 * `da` è il nome di chi segue **dentro l'istanza che chiede**, ed è dichiarato
 * da lei: l'handshake prova quale istanza parla, non quale persona (ADR 0022
 * §4). Rimandarlo per un follow già accettato è lecito e non cambia niente —
 * è così che chi ha chiesto scopre di essere stato accettato, senza che serva
 * una casella d'ingresso.
 */
export interface SeguiRequest {
  tipo: "segui";
  nome: string;
  /** Chi si vuole seguire, qui. */
  chi: string;
  /** Chi segue, là. */
  da: string;
}

export interface SmettiRequest {
  tipo: "smetti";
  nome: string;
  chi: string;
  da: string;
}

export interface SeguiResponse {
  ok: true;
  /** `in_attesa` per un profilo chiuso, `accettato` per uno aperto. */
  stato: "in_attesa" | "accettato";
  /**
   * La prova della coppia ([ADR 0023] §2), presente solo con `accettato`.
   *
   * Coniata mentre si risponde e conservata di qua solo come hash, quindi
   * questo è l'unico momento in cui il segreto esiste in chiaro sul filo.
   * Un'istanza più vecchia che non lo legge ignora un campo in più e resta
   * compatibile (ADR 0021 §6): perde la lettura, non il follow.
   */
  prova?: string;
}

/**
 * «Fammi leggere queste persone di casa tua.»
 *
 * Per **istanza e non per persona**, che è l'affinamento di [ADR 0023] §1: chi
 * ne segue cinque nella stessa casa fa una connessione e non cinque, e il
 * lavoro diventa proporzionale alle case che si raggiungono.
 *
 * Non enumera e non può diventarlo: si chiede **per nome**, come `profilo`, e
 * un nome che non si conosce non si può chiedere. Il permesso non viene dal
 * nome ma dalla `prova`, che si usa e non si asserisce.
 */
export interface BachecaRequest {
  tipo: "bacheca";
  nome: string;
  /** Chi legge, **là**. Dichiarato, come `da` in `segui`: non autorizza niente. */
  da: string;
  chi: { nome: string; prova: string }[];
  /** L'istante prima del quale si vogliono i post. Assente vuol dire «i più recenti». */
  prima?: string;
  quanti?: number;
}

/**
 * I metadati di una fotografia sul filo, **senza i byte**.
 *
 * I byte viaggiano in `immagine` ([ADR 0023] §4), una per volta e solo se
 * qualcuno le guarda. Mettere qui id, misure e dimensione serve a due cose:
 * disegnare il posto giusto nel feed prima che i byte arrivino, e lasciare a
 * chi legge il modo di rifiutare un originale troppo grande **prima** di
 * chiederlo — il tetto è il suo `media.maxBytes`, non quello di chi ha scritto.
 */
export interface FotoRemota {
  id: string;
  larghezza: number;
  altezza: number;
  miniaturaLarghezza: number;
  miniaturaAltezza: number;
  descrizione: string;
  /** Dimensione dell'originale in byte. */
  byte: number;
}

/**
 * Un post che attraversa.
 *
 * Porta i **metadati** delle immagini e non i byte: quelli viaggiano in un
 * messaggio loro ([ADR 0023] §4), una per volta e solo se qualcuno le guarda.
 * Dirne l'esistenza non è un dettaglio — un post che si presenta senza le
 * proprie fotografie e senza dire che ne ha sarebbe un post diverso da quello
 * scritto.
 */
export interface PostRemoto {
  id: string;
  /** Chi l'ha scritto, in casa propria. */
  utente: string;
  nome: string;
  testo: string;
  quando: string;
  modificato?: string;
  immagini: FotoRemota[];
  /**
   * Quanti cuori ha, e se c'è il tuo ([ADR 0025] §3).
   *
   * **Opzionali, e non per pigrizia**: sono i due campi che un'istanza che
   * parla una versione più vecchia non manda. In loro assenza il cuore non
   * si disegna e non si finge disegnabile — è ADR 0021 §6, un campo nuovo che
   * chi non lo conosce ignora senza rompersi.
   *
   * `mioCuore` è calcolato **contro la prova con cui si sta chiedendo**, che
   * identifica già la coppia: da cui il fatto che chi mette il cuore non deve
   * conservare niente in casa propria, e non può quindi ritrovarsi a dire una
   * cosa diversa da chi il cuore lo custodisce.
   */
  cuori?: number;
  mioCuore?: boolean;
}

export interface BachecaResponse {
  ok: true;
  post: PostRemoto[];
}

/**
 * «Dammi questa fotografia, una sola.»
 *
 * Stessa prova della bacheca ([ADR 0023] §2 e §4): si usa e non si asserisce.
 * `maxBytes` lo mette **chi legge**, col proprio limite: un'immagine più grande
 * non si scarica, e lo si dice, invece di troncarla o di fidarsi del limite
 * dell'altra casa.
 */
export interface ImmagineRequest {
  tipo: "immagine";
  nome: string;
  da: string;
  chi: { nome: string; prova: string };
  id: string;
  variante: "originale" | "miniatura";
  maxBytes: number;
}

export interface ImmagineResponse {
  ok: true;
  mediaType: string;
  /** I byte, in base64: il protocollo resta un messaggio JSON per stream. */
  contenuto: string;
}

export interface SmettiResponse {
  ok: true;
}

/**
 * «Questo post mi piace.» Oppure: «non più.»
 *
 * Il settimo messaggio ([ADR 0025] §1), e la cosa da capire per prima è che
 * **non è una notifica spinta.** È una richiesta che parte da chi ha appena
 * premuto un pulsante: una domanda, una risposta, uno stream, come tutto il
 * resto di ADR 0021. L'avviso vuoto che quel documento rimanda a una decisione
 * sua servirebbe a **svegliare** un'istanza che non sta chiedendo niente; qui
 * nessuno dorme.
 *
 * `stato` invece di due messaggi — uno per mettere e uno per togliere —
 * perché togliere è la stessa decisione al contrario, e due messaggi
 * vorrebbero due percorsi di autorizzazione da tenere allineati per sempre.
 *
 * Il permesso è la stessa `prova` della bacheca, sentinella dei profili
 * pubblici compresa ([ADR 0025] §2): chi può leggere un post può mettergli un
 * cuore, e non serve inventare un secondo permesso per la stessa relazione.
 */
export interface CuoreRequest {
  tipo: "cuore";
  nome: string;
  /** Chi mette il cuore, **là**. Dichiarato, come `da` in `segui`. */
  da: string;
  chi: { nome: string; prova: string };
  /** Il post, in casa di chi l'ha scritto. */
  post: string;
  stato: boolean;
}

/**
 * Il conteggio torna indietro, e non è cortesia: chi ha appena premuto deve
 * poter disegnare il numero giusto senza richiedere tutta la bacheca, e il
 * numero giusto lo conosce solo chi lo custodisce.
 */
export interface CuoreResponse {
  ok: true;
  cuori: number;
  mio: boolean;
}

export interface CommentoRequest {
  tipo: "commento";
  nome: string;
  da: string;
  chi: { nome: string; prova: string };
  post: string;
  commentoId: string;
  stato: boolean;
}

export interface CommentoResponse {
  ok: true;
}

export interface CommentoRemoto {
  id: string;
  utente: string;
  nome: string;
  testo: string;
  quando: string;
  parentId: string | null;
  remoteInstanceKey?: string;
  remoteCommentId?: string;
  remoteUsername?: string;
}

export interface DettaglioPostRequest {
  tipo: "dettaglio-post";
  nome: string;
  da: string;
  chi: { nome: string; prova: string };
  post: string;
}

export interface DettaglioPostResponse {
  ok: true;
  post: PostRemoto;
  commenti: CommentoRemoto[];
}

export type ProtocolRequest =
  | PresentazioneRequest
  | CollegamentoRequest
  | ProfiloRequest
  | CercaRequest
  | SeguiRequest
  | SmettiRequest
  | BachecaRequest
  | ImmagineRequest
  | CuoreRequest
  | CommentoRequest
  | DettaglioPostRequest;

/**
 * A profile as it crosses the wire.
 *
 * `pubblico` is the person's own choice about showing posts on the profile
 * page (not about appearing in search — anyone on EstiaNet is searchable).
 * The far side needs it to decide whether a visit without a follow should
 * still load the board.
 */
export interface ProfiloRemoto {
  utente: string;
  nome: string;
  bio: string;
  pubblico: boolean;
}

/**
 * A search answers with names and nothing else.
 *
 * Not a size optimisation: a result list is a place where the whole membership
 * of an instance could leak a page at a time, so it carries the minimum needed
 * to click through — and the profile itself is fetched by name afterwards.
 */
export interface ProfiloSintetico {
  utente: string;
  nome: string;
}

export interface ProfiloResponse {
  ok: true;
  profilo: ProfiloRemoto;
}

export interface CercaResponse {
  ok: true;
  profili: ProfiloSintetico[];
}

/**
 * How this instance sees the other one. Sent back so the far side can show a
 * relationship instead of guessing at it.
 *
 * `bloccata` is absent on purpose: a blocked instance is refused before any
 * request is read, so there is nobody to tell.
 */
export type RelationshipView =
  "sconosciuta" | "richiesta-inviata" | "richiesta-ricevuta" | "in-contatto" | "collegata";

export interface PresentazioneResponse {
  ok: true;
  nome: string;
  stato: RelationshipView;
}

export interface CollegamentoResponse {
  ok: true;
  stato: "in-attesa" | "collegata";
}

export interface ErrorResponse {
  ok: false;
  /** Stable, meant for the program. */
  codice: ErrorCode;
  /** A sentence, meant for a person. */
  messaggio: string;
}

/**
 * `richiesta_sconosciuta` is what makes ADR 0021 §6 work: a version that
 * gained a request type gets an orderly no from one that has not, rather than a
 * transport error.
 */
/**
 * `non_trovato` answers both «there is nobody by that name» and «there is, and
 * they are not in the network». One code for the two, deliberately: telling them
 * apart would rebuild enumeration one question at a time, which is how a rule
 * like ADR 0020 §1 actually gets walked around.
 */
export type ErrorCode =
  | "richiesta_sconosciuta"
  | "non_collegata"
  | "non_trovato"
  | "troppe_richieste"
  | "troppo_grande"
  | "malformata"
  | "interna";

export type ProtocolResponse =
  | PresentazioneResponse
  | CollegamentoResponse
  | ProfiloResponse
  | CercaResponse
  | SeguiResponse
  | SmettiResponse
  | BachecaResponse
  | ImmagineResponse
  | CuoreResponse
  | DettaglioPostResponse
  | ErrorResponse;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function errorResponse(codice: ErrorCode, messaggio: string): ErrorResponse {
  return { codice, messaggio, ok: false };
}

/** Writes one message and closes the writing half, which is what ends a request. */
export async function writeMessage(stream: IrohStream, message: unknown): Promise<void> {
  await stream.send.writeAll(Array.from(encoder.encode(JSON.stringify(message))));
  await stream.send.finish();
}

/**
 * Reads at most `limit` bytes and only then tries to make sense of them.
 *
 * Returns `undefined` rather than throwing on anything malformed: a caller
 * deciding what to do about a bad message should not also be handling
 * exceptions from three different layers.
 */
export async function readMessage(stream: IrohStream, limit: number): Promise<unknown | undefined> {
  try {
    const bytes = await stream.recv.readToEnd(limit);

    return JSON.parse(decoder.decode(Uint8Array.from(bytes)));
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Bounded text, or nothing. Never throws, never truncates silently. */
function readShortText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  return text.length === 0 || text.length > limit ? undefined : text;
}

/** A declared name, or nothing. Never throws, never truncates silently. */
function readName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const name = value.trim();

  return name.length === 0 || name.length > MAX_NAME_LENGTH ? undefined : name;
}

/**
 * Turns bytes that arrived from somebody unknown into one of the shapes this
 * version understands, or into the reason it could not.
 *
 * Unknown fields are ignored rather than refused (ADR 0021 §6): that is what
 * lets a later version add one without every house in Italy updating on the
 * same weekend.
 */
/**
 * Una richiesta di bacheca, o la ragione per cui non lo è.
 *
 * Ogni tetto viene applicato **prima** di allocare qualcosa in proporzione a
 * ciò che l'altra parte ha deciso di mandare: il numero di nomi, la lunghezza
 * di ciascuno, la dimensione della prova. È la stessa regola che ADR 0021
 * applica al messaggio intero, un piano più in basso.
 */
function parseBacheca(
  value: Record<string, unknown>,
  nome: string,
): { request?: BachecaRequest; error?: ErrorResponse } {
  const da = readShortText(value.da, MAX_NAME_LENGTH);

  if (da === undefined) {
    return { error: errorResponse("malformata", "Manca il nome di chi legge.") };
  }

  if (!Array.isArray(value.chi) || value.chi.length === 0) {
    return { error: errorResponse("malformata", "Manca l'elenco di chi si vuole leggere.") };
  }

  if (value.chi.length > MAX_BACHECA_NAMES) {
    return {
      error: errorResponse(
        "malformata",
        `Una richiesta sola non può chiedere più di ${String(MAX_BACHECA_NAMES)} persone.`,
      ),
    };
  }

  const chi: { nome: string; prova: string }[] = [];

  for (const voce of value.chi) {
    if (!isRecord(voce)) {
      return { error: errorResponse("malformata", "Un elemento dell'elenco non è un oggetto.") };
    }

    const chiNome = readShortText(voce.nome, MAX_NAME_LENGTH);
    const prova = readShortText(voce.prova, MAX_PROOF_LENGTH);

    if (chiNome === undefined || prova === undefined) {
      return { error: errorResponse("malformata", "Un elemento dell'elenco è incompleto.") };
    }

    chi.push({ nome: chiNome, prova });
  }

  const prima = readShortText(value.prima, MAX_NAME_LENGTH);
  // Un numero fuori scala non è un errore da restituire: è una preferenza che
  // non si può soddisfare, e il tetto la riporta dentro senza dire di no.
  const quanti =
    typeof value.quanti === "number" && Number.isInteger(value.quanti) && value.quanti > 0
      ? Math.min(value.quanti, MAX_BACHECA_POSTS)
      : MAX_BACHECA_POSTS;

  return {
    request: {
      chi,
      da,
      nome,
      quanti,
      tipo: "bacheca",
      ...(prima === undefined ? {} : { prima }),
    },
  };
}

/**
 * Una richiesta di immagine, o la ragione per cui non lo è.
 *
 * `maxBytes` deve essere un intero positivo: senza di esso chi risponde non
 * saprebbe dove tagliare, e mandare i byte «e basta» sarebbe fidarsi del
 * limite di un'altra macchina ([ADR 0023] §4).
 */
function parseImmagine(
  value: Record<string, unknown>,
  nome: string,
): { request?: ImmagineRequest; error?: ErrorResponse } {
  const da = readShortText(value.da, MAX_NAME_LENGTH);

  if (da === undefined) {
    return { error: errorResponse("malformata", "Manca il nome di chi legge.") };
  }

  if (!isRecord(value.chi)) {
    return { error: errorResponse("malformata", "Manca chi autorizza la lettura.") };
  }

  const chiNome = readShortText(value.chi.nome, MAX_NAME_LENGTH);
  const prova = readShortText(value.chi.prova, MAX_PROOF_LENGTH);

  if (chiNome === undefined || prova === undefined) {
    return { error: errorResponse("malformata", "La prova della lettura è incompleta.") };
  }

  const id = readShortText(value.id, MAX_NAME_LENGTH);

  if (id === undefined) {
    return { error: errorResponse("malformata", "Manca l'identificativo dell'immagine.") };
  }

  if (value.variante !== "originale" && value.variante !== "miniatura") {
    return { error: errorResponse("malformata", "La variante deve essere originale o miniatura.") };
  }

  if (
    typeof value.maxBytes !== "number" ||
    !Number.isInteger(value.maxBytes) ||
    value.maxBytes <= 0
  ) {
    return { error: errorResponse("malformata", "Manca il tetto di chi legge.") };
  }

  return {
    request: {
      chi: { nome: chiNome, prova },
      da,
      id,
      maxBytes: value.maxBytes,
      nome,
      tipo: "immagine",
      variante: value.variante,
    },
  };
}

/**
 * Un cuore, o la ragione per cui non lo è ([ADR 0025] §1).
 *
 * `stato` deve essere un booleano vero e non un valore che ci somiglia: senza
 * di lui non si saprebbe se si sta mettendo o togliendo, e indovinarlo
 * significherebbe togliere un cuore a chi voleva metterlo.
 */
function parseCuore(
  value: Record<string, unknown>,
  nome: string,
): { request?: CuoreRequest; error?: ErrorResponse } {
  const da = readShortText(value.da, MAX_NAME_LENGTH);

  if (da === undefined) {
    return { error: errorResponse("malformata", "Manca il nome di chi mette il cuore.") };
  }

  if (!isRecord(value.chi)) {
    return { error: errorResponse("malformata", "Manca chi autorizza il cuore.") };
  }

  const chiNome = readShortText(value.chi.nome, MAX_NAME_LENGTH);
  const prova = readShortText(value.chi.prova, MAX_PROOF_LENGTH);

  if (chiNome === undefined || prova === undefined) {
    return { error: errorResponse("malformata", "La prova del cuore è incompleta.") };
  }

  const post = readShortText(value.post, MAX_NAME_LENGTH);

  if (post === undefined) {
    return { error: errorResponse("malformata", "Manca l'identificativo del post.") };
  }

  if (typeof value.stato !== "boolean") {
    return { error: errorResponse("malformata", "Manca se il cuore si mette o si toglie.") };
  }

  return {
    request: { chi: { nome: chiNome, prova }, da, nome, post, stato: value.stato, tipo: "cuore" },
  };
}

function parseCommento(
  value: Record<string, unknown>,
  nome: string,
): { request?: CommentoRequest; error?: ErrorResponse } {
  const da = readShortText(value.da, MAX_NAME_LENGTH);

  if (da === undefined) {
    return { error: errorResponse("malformata", "Manca il nome di chi scrive il commento.") };
  }

  if (!isRecord(value.chi)) {
    return { error: errorResponse("malformata", "Manca chi autorizza il commento.") };
  }

  const chiNome = readShortText(value.chi.nome, MAX_NAME_LENGTH);
  const prova = readShortText(value.chi.prova, MAX_PROOF_LENGTH);

  if (chiNome === undefined || prova === undefined) {
    return { error: errorResponse("malformata", "La prova del commento è incompleta.") };
  }

  const post = readShortText(value.post, MAX_NAME_LENGTH);

  if (post === undefined) {
    return { error: errorResponse("malformata", "Manca l'identificativo del post.") };
  }

  const commentoId = readShortText(value.commentoId, MAX_NAME_LENGTH);

  if (commentoId === undefined) {
    return { error: errorResponse("malformata", "Manca l'identificativo del commento remoto.") };
  }

  if (typeof value.stato !== "boolean") {
    return {
      error: errorResponse("malformata", "Manca lo stato del commento (attivo o rimosso)."),
    };
  }

  return {
    request: {
      chi: { nome: chiNome, prova },
      da,
      nome,
      post,
      commentoId,
      stato: value.stato,
      tipo: "commento",
    },
  };
}

function parseDettaglioPost(
  value: Record<string, unknown>,
  nome: string,
): { request?: DettaglioPostRequest; error?: ErrorResponse } {
  const da = readShortText(value.da, MAX_NAME_LENGTH);

  if (da === undefined) {
    return { error: errorResponse("malformata", "Manca il nome di chi legge.") };
  }

  if (!isRecord(value.chi)) {
    return { error: errorResponse("malformata", "Manca chi autorizza la lettura.") };
  }

  const chiNome = readShortText(value.chi.nome, MAX_NAME_LENGTH);
  const prova = readShortText(value.chi.prova, MAX_PROOF_LENGTH);

  if (chiNome === undefined || prova === undefined) {
    return { error: errorResponse("malformata", "La prova della lettura è incompleta.") };
  }

  const post = readShortText(value.post, MAX_NAME_LENGTH);

  if (post === undefined) {
    return { error: errorResponse("malformata", "Manca l'identificativo del post.") };
  }

  return {
    request: {
      chi: { nome: chiNome, prova },
      da,
      nome,
      post,
      tipo: "dettaglio-post",
    },
  };
}

export function parseRequest(value: unknown): { request?: ProtocolRequest; error?: ErrorResponse } {
  if (!isRecord(value)) {
    return { error: errorResponse("malformata", "Il messaggio non è un oggetto JSON.") };
  }

  const nome = readName(value.nome);

  if (nome === undefined) {
    return {
      error: errorResponse(
        "malformata",
        `Manca il nome dell'istanza, oppure supera ${String(MAX_NAME_LENGTH)} caratteri.`,
      ),
    };
  }

  if (value.tipo === "presentazione" || value.tipo === "collegamento") {
    return { request: { nome, tipo: value.tipo } };
  }

  if (value.tipo === "profilo") {
    const chi = readShortText(value.chi, MAX_NAME_LENGTH);

    return chi === undefined
      ? { error: errorResponse("malformata", "Manca il nome della persona cercata.") }
      : { request: { chi, nome, tipo: "profilo" } };
  }

  if (value.tipo === "segui" || value.tipo === "smetti") {
    const chi = readShortText(value.chi, MAX_NAME_LENGTH);
    const da = readShortText(value.da, MAX_NAME_LENGTH);

    return chi === undefined || da === undefined
      ? { error: errorResponse("malformata", "Mancano i nomi di chi segue o di chi è seguito.") }
      : { request: { chi, da, nome, tipo: value.tipo } };
  }

  if (value.tipo === "bacheca") {
    return parseBacheca(value, nome);
  }

  if (value.tipo === "immagine") {
    return parseImmagine(value, nome);
  }

  if (value.tipo === "cuore") {
    return parseCuore(value, nome);
  }

  if (value.tipo === "commento") {
    return parseCommento(value, nome);
  }

  if (value.tipo === "dettaglio-post") {
    return parseDettaglioPost(value, nome);
  }

  if (value.tipo === "cerca") {
    const termine = readShortText(value.termine, MAX_NAME_LENGTH);

    return termine === undefined
      ? { error: errorResponse("malformata", "Manca il testo da cercare.") }
      : { request: { nome, termine, tipo: "cerca" } };
  }

  return {
    error: errorResponse(
      "richiesta_sconosciuta",
      "Questa istanza non conosce questo tipo di richiesta. Probabilmente parla una versione più vecchia del protocollo.",
    ),
  };
}

/**
 * Quanto spazio lasciare alla risposta di `immagine`, dato il tetto di chi
 * legge: i byte in base64 più il resto del JSON.
 */
export function limiteRispostaImmagine(maxBytes: number): number {
  return Math.ceil(maxBytes * (4 / 3)) + 4096;
}
