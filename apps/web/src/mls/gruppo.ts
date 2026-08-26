/**
 * Il trasporto MLS del client web ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 4).
 *
 * Qui c'è la crittografia e non il suo contorno: creare un gruppo, farci entrare
 * qualcuno, cifrare e decifrare, e la chiave con cui si avvolge il mazzo
 * dell'archivio. Chi lo usa gli passa una `Porta` — le poche cose che questo
 * modulo deve poter chiedere all'istanza — così che la crittografia si possa
 * provare senza rete e senza browser, che è quello che i test qui accanto fanno.
 *
 * Tre regole vengono dagli spike, e nessuna è facoltativa:
 *
 * 1. **L'`AuthenticationService` si monta sempre.** Quello predefinito di
 *    `ts-mls` risponde sempre `true`, quindi senza il nostro chiunque ottenga un
 *    `GroupInfo` entra come chi vuole ([S4](../../../../docs/spike/S4-autenticare-chi-entra.md) §1-2).
 * 2. **Mai `resync: true` senza sapere che la propria chiave di firma è già
 *    nell'albero**: in `ts-mls` 1.6.2 quel caso non solleva un errore, cicla
 *    all'infinito e pianta il client ([S4](../../../../docs/spike/S4-autenticare-chi-entra.md)).
 * 3. **La chiave d'archivio non è `mlsExporter`**: `mlsExporter` è la serratura
 *    del mazzo, non la chiave dell'archivio, perché il segreto che produce è
 *    legato all'epoch e chi entra dopo non può derivare quello di prima
 *    ([S2](../../../../docs/spike/S2-la-chiave-d-archivio.md)).
 */
import {
  acceptAll,
  createApplicationMessage,
  createCommit,
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  defaultCapabilities,
  emptyPskIndex,
  generateKeyPackage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  joinGroupExternal,
  makePskIndex,
  mlsExporter,
  processMessage,
  type CiphersuiteImpl,
  type ClientState,
  type Credential,
  type GroupInfo,
  type KeyPackage,
  type PrivateKeyPackage,
} from "ts-mls";
import { defaultClientConfig, type ClientConfig } from "ts-mls/clientConfig.js";
import { ratchetTreeFromExtension } from "ts-mls/groupInfo.js";
import { makeKeyPackageRef } from "ts-mls/keyPackage.js";
import { getGroupMembers } from "ts-mls/clientState.js";
import { defaultLifetime } from "ts-mls/lifetime.js";
import {
  decodeMlsMessage,
  encodeMlsMessage,
  type MLSMessage,
  type MlsMessageContent,
  type MlsPrivateMessage,
  type MlsPublicMessage,
} from "ts-mls/message.js";
import type { PrivateMessage } from "ts-mls/privateMessage.js";
import type { PublicMessage } from "ts-mls/publicMessage.js";
import type { Welcome } from "ts-mls/welcome.js";

/**
 * La ciphersuite di [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) §5:
 * P-256 e AES-GCM sono già le primitive di ESTIA e sono native in WebCrypto.
 */
export const CIPHERSUITE = "MLS_128_DHKEMP256_AES128GCM_SHA256_P256";

/** L'etichetta con cui si deriva la serratura del mazzo d'archivio (S2). */
const ETICHETTA_ARCHIVIO = "estia archive wrap v1";

const te = new TextEncoder();
const td = new TextDecoder();

/**
 * Ciò che questo modulo deve poter chiedere all'istanza. Niente di più: è il
 * confine che rende la crittografia provabile senza rete.
 */
export interface Porta {
  /**
   * Le chiavi di firma che l'istanza riconosce per un membro.
   *
   * È il registro su cui poggia l'`AuthenticationService`, e va detto che cosa
   * copre: ferma **l'estraneo**, non chi ospita, perché il registro è
   * dell'istanza. Il limite 4 di ADR 0036 si chiude fuori banda, con il numero
   * di sicurezza, non qui ([S4](../../../../docs/spike/S4-autenticare-chi-entra.md) §3-4).
   */
  chiaviDiFirmaDi: (username: string) => Promise<readonly Uint8Array[]>;
}

export interface IdentitaDispositivo {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}

/**
 * Le identità MLS che questo dispositivo possiede.
 *
 * Non è una sola, e la ragione è del protocollo: **un `KeyPackage` è monouso**.
 * L'istanza lo consuma quando qualcuno lo preleva per aprire una conversazione
 * ([`claimKeyPackageForUser`](../../../core-api/src/dispositivi/repository.ts)),
 * quindi un dispositivo ne tiene una scorta pubblicata e conserva le metà
 * private finché non servono. Quando arriva un Welcome, la chiave giusta è
 * **una** fra quelle: il Welcome la nomina per riferimento, e
 * [`sceltaPerWelcome`](#sceltaPerWelcome) la trova.
 *
 * Chi lo implementa vive nel browser; qui c'è solo il confine, perché è ciò che
 * rende la sessione provabile senza IndexedDB.
 */
export interface Portachiavi {
  /**
   * Un'identità nuova, per una foglia nuova: creare un gruppo, o rientrare.
   *
   * Non viene dalla scorta e non si pubblica: quella chiave finisce
   * nell'albero, e una che sia anche prelevabile da fuori verrebbe usata due
   * volte.
   */
  perNuovaFoglia: () => Promise<IdentitaDispositivo>;
  /** L'identità che questo Welcome chiama, se è una nostra. */
  perWelcome: (welcome: Uint8Array) => Promise<IdentitaDispositivo | undefined>;
}

let ciphersuite: CiphersuiteImpl | undefined;

export async function suite(): Promise<CiphersuiteImpl> {
  ciphersuite ??= await getCiphersuiteImpl(getCiphersuiteFromName(CIPHERSUITE));
  return ciphersuite;
}

const credenziale = (username: string): Credential => ({
  credentialType: "basic",
  identity: te.encode(username),
});

const uguali = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * La configurazione con cui si tocca un gruppo. **Sempre questa**: il default di
 * `ts-mls` non autentica niente.
 */
export function configurazione(porta: Porta): ClientConfig {
  return {
    ...defaultClientConfig,
    authService: {
      async validateCredential(cred: Credential, chiaveDiFirma: Uint8Array): Promise<boolean> {
        if (cred.credentialType !== "basic") {
          return false;
        }

        const ammesse = await porta.chiaviDiFirmaDi(td.decode(cred.identity));
        return ammesse.some((ammessa) => uguali(ammessa, chiaveDiFirma));
      },
    },
  };
}

/** Un'identità nuova per questo dispositivo. */
export async function nuovaIdentita(username: string): Promise<IdentitaDispositivo> {
  const cs = await suite();
  return generateKeyPackage(credenziale(username), defaultCapabilities(), defaultLifetime, [], cs);
}

/**
 * Un `KeyPackage` nuovo che riusa la chiave di firma già registrata.
 *
 * È ciò che serve a rientrare: il rientro autonomo funziona **solo** con la
 * stessa chiave di firma ([S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md)),
 * ed è anche la condizione che tiene lontano il ciclo infinito della regola 2.
 */
export async function identitaDaChiave(
  username: string,
  chiavi: { publicKey: Uint8Array; signKey: Uint8Array },
): Promise<IdentitaDispositivo> {
  const cs = await suite();
  return generateKeyPackageWithKey(
    credenziale(username),
    defaultCapabilities(),
    defaultLifetime,
    [],
    chiavi,
    cs,
  );
}

export async function creaConversazione(
  idConversazione: string,
  io: IdentitaDispositivo,
  porta: Porta,
): Promise<ClientState> {
  const cs = await suite();
  return createGroup(
    te.encode(idConversazione),
    io.publicPackage,
    io.privatePackage,
    [],
    cs,
    configurazione(porta),
  );
}

export interface EsitoAggiunta {
  stato: ClientState;
  /** Va a tutti i membri. */
  commit: Uint8Array;
  /** Va soltanto a chi entra: non è ancora nel gruppo, e non decifra il commit. */
  welcome: Uint8Array;
  epoch: number;
}

/** Fa entrare qualcuno. Produce le due buste che il canale di handshake porta. */
export async function aggiungi(
  stato: ClientState,
  chiEntra: KeyPackage,
  porta: Porta,
): Promise<EsitoAggiunta> {
  const cs = await suite();
  // La configurazione viaggia nello stato, non nelle opzioni del commit.
  const esito = await createCommit(
    { cipherSuite: cs, state: { ...stato, clientConfig: configurazione(porta) } },
    {
      extraProposals: [{ add: { keyPackage: chiEntra }, proposalType: "add" }],
      // Il Welcome porta l'albero con sé. Senza, chi entra dovrebbe procurarselo
      // da qualche altra parte — e chi entra è precisamente chi non ha ancora
      // niente di questo gruppo.
      ratchetTreeExtension: true,
    },
  );

  if (esito.welcome === undefined) {
    throw new Error("Un ingresso senza Welcome non è un ingresso.");
  }

  return {
    commit: encodeMlsMessage(esito.commit),
    epoch: Number(esito.newState.groupContext.epoch),
    stato: esito.newState,
    welcome: serializzaWelcome(esito.welcome),
  };
}

/** Entra in un gruppo dal proprio Welcome. */
export async function entraDaWelcome(
  welcome: Uint8Array,
  io: IdentitaDispositivo,
  porta: Porta,
  /** Solo se il Welcome non lo portasse: normalmente non serve. */
  albero?: ClientState["ratchetTree"],
): Promise<ClientState> {
  const cs = await suite();
  return joinGroup(
    deserializzaWelcome(welcome),
    io.publicPackage,
    io.privatePackage,
    emptyPskIndex,
    cs,
    albero,
    undefined,
    configurazione(porta),
  );
}

/**
 * Rientra da solo, con l'ingresso esterno, dal punto pubblicato dall'istanza.
 *
 * `resync` è vero **solo** quando la chiave di firma è già nell'albero, ed è la
 * regola 2: con una chiave che non c'è, `ts-mls` 1.6.2 cicla all'infinito
 * invece di sollevare un errore, e pianta la scheda del browser.
 *
 * Le due strade che ne derivano sono le due vie di
 * [S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md). Con la stessa
 * chiave di firma — quella che torna dal backup con passphrase — il `resync`
 * **sostituisce** la foglia vecchia, e il telefono perduto smette di essere
 * membro. Con una chiave nuova si viene **affiancati**, e quella vecchia resta
 * lì finché qualcuno non la toglie.
 *
 * Il commit che ne esce va depositato sul canale di handshake: finché nessuno lo
 * applica, si è nel gruppo da soli.
 */
export async function rientra(
  puntoDiRientro: Uint8Array,
  io: IdentitaDispositivo,
  porta: Porta,
): Promise<{ stato: ClientState; commit: Uint8Array; epoch: number }> {
  const cs = await suite();
  const groupInfo = deserializzaGroupInfo(puntoDiRientro);
  // L'albero viaggia dentro il punto di rientro: chi rientra non ce l'ha, ed è
  // il motivo per cui si pubblica con l'estensione.
  const albero = ratchetTreeFromExtension(groupInfo);
  const miaChiave = io.publicPackage.leafNode.signaturePublicKey;
  const giaNellAlbero =
    albero !== undefined && chiaviNellAlbero(albero).some((k) => uguali(k, miaChiave));

  const esito = await joinGroupExternal(
    groupInfo,
    io.publicPackage,
    io.privatePackage,
    giaNellAlbero,
    cs,
    albero,
    configurazione(porta),
  );

  return {
    commit: serializzaPublicMessage(esito.publicMessage),
    epoch: Number(esito.newState.groupContext.epoch),
    stato: esito.newState,
  };
}

/** Applica un handshake ricevuto dal canale. */
export async function applicaHandshake(
  stato: ClientState,
  busta: Uint8Array,
  porta: Porta,
): Promise<ClientState> {
  const cs = await suite();
  const esito = await processMessage(
    deserializzaMessaggio(busta),
    { ...stato, clientConfig: configurazione(porta) },
    makePskIndex(stato, {}),
    acceptAll,
    cs,
  );

  return esito.newState;
}

export async function cifra(
  stato: ClientState,
  testo: string,
): Promise<{ stato: ClientState; busta: Uint8Array }> {
  const cs = await suite();
  const esito = await createApplicationMessage(stato, te.encode(testo), cs);
  return { busta: serializzaPrivateMessage(esito.privateMessage), stato: esito.newState };
}

export type EsitoDecifratura =
  | { kind: "messaggio"; stato: ClientState; testo: string }
  | { kind: "handshake"; stato: ClientState }
  | { kind: "illeggibile"; stato: ClientState };

/**
 * Decifra. **Non inventa mai un testo**: un messaggio che non si apre torna
 * `illeggibile`, e sta a chi disegna l'interfaccia dirlo — è il rilievo che la
 * revisione aveva mosso al client mobile, che scriveva
 * `[Errore di decifrazione]` dentro la nuvoletta come se fosse il messaggio.
 */
export async function decifra(
  stato: ClientState,
  busta: Uint8Array,
  porta: Porta,
): Promise<EsitoDecifratura> {
  const cs = await suite();

  try {
    const esito = await processMessage(
      deserializzaMessaggio(busta),
      { ...stato, clientConfig: configurazione(porta) },
      makePskIndex(stato, {}),
      acceptAll,
      cs,
    );

    return esito.kind === "applicationMessage"
      ? { kind: "messaggio", stato: esito.newState, testo: td.decode(esito.message) }
      : { kind: "handshake", stato: esito.newState };
  } catch {
    return { kind: "illeggibile", stato };
  }
}

/**
 * Il punto da cui si rientra: il `GroupInfo` dell'epoch corrente.
 *
 * Va depositato sull'istanza a ogni cambio di epoch, ed è la condizione della
 * via A di [S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md) — chi
 * ha perso il telefono rientra da solo, senza che nessun altro sia online, e
 * senza questo l'ingresso esterno non ha da dove cominciare.
 *
 * **Porta l'albero con sé**, come il Welcome e per la stessa ragione: chi
 * rientra è precisamente chi non ha più niente di questo gruppo.
 */
export async function puntoDiRientro(stato: ClientState): Promise<Uint8Array> {
  const cs = await suite();
  return sulFilo({
    groupInfo: await createGroupInfoWithExternalPubAndRatchetTree(stato, [], cs),
    wireformat: "mls_group_info",
  });
}

/**
 * La serratura del mazzo d'archivio ([S2](../../../../docs/spike/S2-la-chiave-d-archivio.md)).
 *
 * **Non è** la chiave dell'archivio: quella è casuale, nasce con la
 * conversazione e non deriva da MLS, perché un segreto legato all'epoch morirebbe
 * a ogni commit. Questa apre il mazzo, e tutti i membri della stessa epoch la
 * derivano identica.
 */
export async function serraturaArchivio(stato: ClientState): Promise<Uint8Array> {
  const cs = await suite();
  return mlsExporter(
    stato.keySchedule.exporterSecret,
    ETICHETTA_ARCHIVIO,
    new Uint8Array(),
    32,
    cs,
  );
}

/**
 * Il riferimento con cui un Welcome nomina un `KeyPackage`.
 *
 * È l'hash che RFC 9420 mette in `EncryptedGroupSecrets.new_member`: serve a
 * sapere **a quale** delle proprie chiavi un Welcome sta parlando, che è la
 * domanda che si pone chi tiene una scorta.
 */
export async function riferimentoDi(pacchetto: KeyPackage): Promise<Uint8Array> {
  const cs = await suite();
  return makeKeyPackageRef(pacchetto, cs.hash);
}

/**
 * Quale fra queste identità questo Welcome sta chiamando, se ce n'è una.
 *
 * `undefined` non è un guasto: vuol dire che il Welcome è per qualcun altro, o
 * per una chiave che questo dispositivo non ha più. Chi lo riceve decide che
 * cosa farne — provare la via del rientro, o lasciar perdere — e in nessun caso
 * si tira a indovinare una chiave.
 */
export async function sceltaPerWelcome(
  welcome: Uint8Array,
  candidati: readonly IdentitaDispositivo[],
): Promise<IdentitaDispositivo | undefined> {
  let chiamati: readonly Uint8Array[];
  try {
    chiamati = deserializzaWelcome(welcome).secrets.map((s) => s.newMember);
  } catch {
    return undefined;
  }

  for (const candidato of candidati) {
    const riferimento = await riferimentoDi(candidato.publicPackage);
    if (chiamati.some((chiamato) => uguali(chiamato, riferimento))) {
      return candidato;
    }
  }

  return undefined;
}

export function membri(stato: ClientState): string[] {
  const nomi: string[] = [];
  for (const foglia of getGroupMembers(stato)) {
    // Solo `basic` ha un'identita' leggibile: ESTIA non usa x509.
    if (foglia?.credential.credentialType === "basic") {
      nomi.push(td.decode(foglia.credential.identity));
    }
  }
  return nomi;
}

export const epochDi = (stato: ClientState): number => Number(stato.groupContext.epoch);

/* ---------- serializzazione, che qui è solo trasporto ---------- */

/** Il formato sul filo di RFC 9420, versione compresa. */
const sulFilo = (contenuto: MlsMessageContent): Uint8Array =>
  encodeMlsMessage({ version: "mls10", ...contenuto } as MLSMessage);

const serializzaPrivateMessage = (privateMessage: PrivateMessage): Uint8Array =>
  sulFilo({ privateMessage, wireformat: "mls_private_message" });

const serializzaPublicMessage = (publicMessage: PublicMessage): Uint8Array =>
  sulFilo({ publicMessage, wireformat: "mls_public_message" });

const serializzaWelcome = (welcome: Welcome): Uint8Array =>
  sulFilo({ welcome, wireformat: "mls_welcome" });

function dalFilo(bytes: Uint8Array): MLSMessage {
  const letto = decodeMlsMessage(bytes, 0);
  if (letto === undefined) {
    throw new Error("Questa busta non è un messaggio MLS.");
  }
  return letto[0];
}

function deserializzaWelcome(bytes: Uint8Array): Welcome {
  const messaggio = dalFilo(bytes);
  if (messaggio.wireformat !== "mls_welcome") {
    throw new Error("Atteso un Welcome, arrivato altro.");
  }
  return messaggio.welcome;
}

function deserializzaGroupInfo(bytes: Uint8Array): GroupInfo {
  const messaggio = dalFilo(bytes);
  if (messaggio.wireformat !== "mls_group_info") {
    throw new Error("Atteso un GroupInfo, arrivato altro.");
  }
  return messaggio.groupInfo;
}

/**
 * Quello che `processMessage` accetta: privato o pubblico, non il resto.
 * Un Welcome non si «applica»: ci si entra, ed è un'altra funzione.
 */
function deserializzaMessaggio(bytes: Uint8Array): MlsPrivateMessage | MlsPublicMessage {
  const messaggio = dalFilo(bytes);
  if (messaggio.wireformat === "mls_private_message") {
    return { privateMessage: messaggio.privateMessage, wireformat: "mls_private_message" };
  }
  if (messaggio.wireformat === "mls_public_message") {
    return { publicMessage: messaggio.publicMessage, wireformat: "mls_public_message" };
  }
  throw new Error("Questa busta non si applica a un gruppo.");
}

function chiaviNellAlbero(albero: ClientState["ratchetTree"]): Uint8Array[] {
  const chiavi: Uint8Array[] = [];
  for (const nodo of albero) {
    if (nodo !== undefined && nodo.nodeType === "leaf") {
      chiavi.push(nodo.leaf.signaturePublicKey);
    }
  }
  return chiavi;
}
