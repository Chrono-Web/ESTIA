import { randomUUID } from "node:crypto";
import type {
  ArchivioPage,
  DepositaHandshakeRequest,
  HandshakePage,
  ConversazioneMessaggiPage,
  ConversazioneView,
  CronologiaPage,
  GroupInfoView,
  MazzoArchivioView,
  MessaggioBustaView,
  RigaCronologiaView,
  VoceArchivioInput,
} from "@estia/contracts";

import { DomainError } from "../errors.js";
import { codificaCursore, decodificaCursore } from "./repository.js";
import type { DeviceKeysRepository } from "../dispositivi/repository.js";
import type { UserRepository } from "../identity/repository.js";
import type {
  HandshakeRecord,
  MessaggiRepository,
  SegnapostoInput,
  SegnapostoRecord,
} from "./repository.js";

/** Una finestra di segnaposto come la dichiara la casa custode (ADR 0042 §4.1). */
export interface FinestraSegnaposti {
  da: number;
  a: number;
  voci: SegnapostoInput[];
  prossimo?: string;
}

/**
 * La rete, come la vede questo servizio: la coda, lo stato, i segnaposto, e
 * una chiave.
 *
 * È il confine che tiene la federazione fuori da qui ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §3):
 * quando la casa che ordina non è questa, la coda **non si duplica** — si
 * chiede a lei. Assente finché la rete non è attiva, e allora una conversazione
 * ordinata altrove dice di no invece di far finta.
 */
export interface ReteFraCase {
  /** La chiave di questa casa (ADR 0042 §0). */
  casa: string;
  deposita: (
    casa: string,
    conversazioneId: string,
    busta: {
      id: string;
      epoch: number;
      tipo: "commit" | "welcome";
      destinatario?: string | undefined;
      busta: string;
      createdAt: string;
    },
  ) => Promise<
    | { esito: "depositato" }
    /** Un altro commit ha già creato quell'epoch: si rifà sull'epoch nuova (§3). */
    | { esito: "indietro" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  coda: (
    casa: string,
    conversazioneId: string,
    dopo?: string,
  ) => Promise<
    // Senza `seq`: quello è il progressivo di chi ordina, e chi legge avanza
    // con `prossimo`. Un numero di riga di un altro database non vuol dire
    // niente qui.
    | { esito: "coda"; handshake: Omit<HandshakeRecord, "seq">[]; prossimo?: string }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  /** `GroupInfo` o mazzo, letti presso chi ordina e **non conservati qui**. */
  leggiStato: (
    casa: string,
    conversazioneId: string,
    tipo: "group-info" | "mazzo",
  ) => Promise<
    | { esito: "stato"; blob: string; epoch: number; updatedAt: string }
    | { esito: "assente" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  depositaStato: (
    casa: string,
    conversazioneId: string,
    tipo: "group-info" | "mazzo",
    stato: { blob: string; epoch: number },
  ) => Promise<
    | { esito: "depositato"; updatedAt: string }
    | { esito: "indietro" }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  /**
   * La visita (`archivio`): le voci con questi id, chieste alla casa che le
   * custodisce. **Si inoltrano e non si scrivono**: tornano per questa risposta
   * e basta (ADR 0043 §0). `assenti` sono quelle che la casa custode non ha —
   * ritirate, o mai esistite — e i loro segnaposto si cancellano.
   */
  visitaArchivio: (
    casa: string,
    conversazioneId: string,
    ids: string[],
  ) => Promise<
    | {
        esito: "voci";
        voci: { id: string; chiaveN: number; busta: string; createdAt: string }[];
        assenti: string[];
      }
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  /** I segnaposto dopo un cursore, chiesti alla casa custode (`segnaposto-da`). */
  segnapostiDa: (
    casa: string,
    conversazioneId: string,
    dopo: number,
  ) => Promise<
    | ({ esito: "finestra" } & FinestraSegnaposti)
    | { esito: "rifiutato" }
    | { esito: "irraggiungibile" }
  >;
  /**
   * La spinta (`segnaposto`): i segnaposto nuovi, o nessuno per annunciare
   * che la conversazione esiste. Best effort: se non arriva, la prossima
   * richiesta recupera.
   */
  spingiSegnaposti: (
    casa: string,
    spinta: {
      conversazioneId: string;
      /** Chi scrive, o chi ha creato la conversazione, su questa casa. */
      da: string;
      /** I membri della conversazione che abitano **là**. */
      destinatari: string[];
      voci: SegnapostoInput[];
    },
  ) => Promise<void>;
}

export interface MessaggiServiceOptions {
  repository: MessaggiRepository;
  deviceKeys: DeviceKeysRepository;
  users: UserRepository;
  now?: (() => Date) | (() => string);
  /** Assente finché la rete non c'è: allora ordina soltanto questa casa. */
  rete?: ReteFraCase;
}

/**
 * Il costo dichiarato di ADR 0042 §3, detto con le parole che l'interfaccia
 * userà: se la casa che ordina non risponde, in quella conversazione non si
 * cambia chi c'è. Grazie ad [ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md)
 * l'istanza lo sa prima di provarci, e può dirlo invece di far aspettare.
 */
/** Quante voci si chiedono in una visita: una pagina di chat, e la risposta sta nel tetto. */
const VOCI_PER_VISITA = 32;

/** Quanti segnaposto in una risposta: piccoli, quindi tanti. */
const SEGNAPOSTI_PER_PAGINA = 100;

/**
 * Ogni quanto si riconcilia da zero: il tetto di cinque minuti per il ritiro
 * (decisione 8 delle risposte del proprietario, ADR 0042).
 */
const RICONCILIAZIONE_MS = 5 * 60 * 1000;

/** Il mittente di un segnaposto è di quella casa? Nessuno parla per un'altra. */
function mittenteDiCasa(mittente: string, casa: string): boolean {
  const taglio = mittente.lastIndexOf("@");
  return taglio > 0 && mittente.slice(taglio + 1) === casa;
}

/**
 * Una finestra che si può applicare: parte dove si è chiesto, non va
 * all'indietro, ogni voce ci sta dentro e ogni mittente è della casa custode.
 * Una finestra incoerente non si applica a metà: si scarta.
 */
function finestraCoerente(finestra: FinestraSegnaposti, casa: string, dopo: number): boolean {
  if (finestra.da !== dopo + 1 || finestra.a < dopo) {
    return false;
  }

  return finestra.voci.every(
    (v) => v.seq >= finestra.da && v.seq <= finestra.a && mittenteDiCasa(v.mittente, casa),
  );
}

/**
 * La corsa di ADR 0042 §3, risolta come quell'ADR dice: il secondo commit alla
 * stessa epoch si rifiuta, e chi l'ha scritto lo rifà. È un fallimento
 * **visibile e ripetibile**, che è la differenza fra una fila e due alberi.
 */
function commitSuperato(): DomainError {
  return new DomainError(
    "conflict",
    "Qualcun altro ha cambiato il gruppo nello stesso momento. Aggiorna e riprova.",
    409,
  );
}

function casaCheOrdinaSpenta(): DomainError {
  return new DomainError(
    "casa_che_ordina_non_raggiungibile",
    "La casa che gestisce il gruppo non risponde: non puoi aggiungere o togliere membri.",
    503,
  );
}

export class MessaggiService {
  private readonly repo: MessaggiRepository;
  private readonly deviceKeys: DeviceKeysRepository;
  private readonly users: UserRepository;
  private readonly now: () => string;
  private rete: ReteFraCase | undefined;

  constructor(options: MessaggiServiceOptions) {
    this.repo = options.repository;
    this.deviceKeys = options.deviceKeys;
    this.users = options.users;
    this.rete = options.rete;
    if (options.now) {
      const fn = options.now;
      this.now = () => {
        const val = fn();
        return typeof val === "string" ? val : val.toISOString();
      };
    } else {
      this.now = () => new Date().toISOString();
    }
  }

  getOrCreateDirect(
    callerId: string,
    callerSessionId: string,
    request: {
      recipientUserId?: string | undefined;
      recipientUsername?: string | undefined;
      remoteInstanceKey?: string | undefined;
      initialBusta?: string | undefined;
    },
  ): { conversazione: ConversazioneView; initialMessaggio?: MessaggioBustaView } {
    let recipientUserId: string;

    if (request.recipientUserId && request.recipientUserId.startsWith("remote:")) {
      recipientUserId = request.recipientUserId;
    } else if (request.remoteInstanceKey && request.recipientUsername) {
      recipientUserId = `remote:${request.remoteInstanceKey}:${request.recipientUsername}`;
    } else {
      let recipient: ReturnType<typeof this.users.findById> | undefined;

      if (request.recipientUserId) {
        recipient = this.users.findById(request.recipientUserId);
      } else if (request.recipientUsername) {
        recipient = this.users.findByUsername(request.recipientUsername);
      } else {
        throw new DomainError(
          "bad_request",
          "Specificare recipientUserId o recipientUsername.",
          400,
        );
      }

      if (!recipient) {
        throw new DomainError("user_not_found", "Il destinatario non esiste.", 404);
      }

      recipientUserId = recipient.id;
    }

    if (callerId === recipientUserId) {
      throw new DomainError(
        "cannot_message_self",
        "Non puoi aprire una conversazione con te stesso.",
        400,
      );
    }

    let conv = this.repo.findDirectConversazione(callerId, recipientUserId);
    const createdAt = this.now();

    if (!conv) {
      conv = this.repo.createConversazione({
        id: randomUUID(),
        tipo: "diretta",
        createdAt,
        membri: [callerId, recipientUserId],
      });
    }

    let initialMsg: MessaggioBustaView | undefined;

    if (request.initialBusta) {
      const device = this.deviceKeys.getDeviceKeyBySessionId(callerSessionId);
      if (!device) {
        throw new DomainError(
          "device_not_registered",
          "Il dispositivo mittente non ha una chiave registrata.",
          400,
        );
      }

      const msgRec = this.repo.insertMessaggio({
        id: randomUUID(),
        conversazioneId: conv.id,
        senderUserId: callerId,
        senderDeviceId: device.id,
        busta: request.initialBusta,
        createdAt: this.now(),
      });

      if (recipientUserId.startsWith("remote:")) {
        const parts = recipientUserId.split(":");
        const remoteInstanceKey = parts[1];
        if (remoteInstanceKey) {
          this.repo.insertMessaggioInUscita({
            id: randomUUID(),
            messaggioId: msgRec.id,
            destinatarioChiave: remoteInstanceKey,
            busta: request.initialBusta,
            prossimoInvio: createdAt,
            createdAt,
          });
        }
      }

      initialMsg = {
        id: msgRec.id,
        conversazioneId: msgRec.conversazioneId,
        senderUserId: msgRec.senderUserId,
        senderDeviceId: msgRec.senderDeviceId,
        busta: msgRec.busta,
        createdAt: msgRec.createdAt,
        consegnatoAt: msgRec.consegnatoAt,
      };
    }

    const membri = this.repo.getMembers(conv.id);

    return {
      conversazione: {
        id: conv.id,
        tipo: conv.tipo,
        membri,
        ...(initialMsg
          ? {
              ultimoMessaggio: {
                id: initialMsg.id,
                senderUserId: initialMsg.senderUserId,
                createdAt: initialMsg.createdAt,
              },
            }
          : {}),
        nonLetti: 0,
        createdAt: conv.createdAt,
      },
      ...(initialMsg ? { initialMessaggio: initialMsg } : {}),
    };
  }

  listConversazioni(callerId: string): ConversazioneView[] {
    const list = this.repo.listConversazioniForUser(callerId);
    return list.map((item) => ({
      id: item.conversazione.id,
      tipo: item.conversazione.tipo,
      membri: item.membri,
      ...(item.ultimoMessaggio ? { ultimoMessaggio: item.ultimoMessaggio } : {}),
      nonLetti: item.nonLetti,
      createdAt: item.conversazione.createdAt,
    }));
  }

  getConversazione(callerId: string, id: string): ConversazioneView {
    if (!this.repo.isMember(id, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const conv = this.repo.getConversazioneById(id);
    if (!conv) {
      throw new DomainError("not_found", "Conversazione non trovata.", 404);
    }

    const membri = this.repo.getMembers(id);
    return {
      id: conv.id,
      tipo: conv.tipo,
      membri,
      nonLetti: 0,
      createdAt: conv.createdAt,
    };
  }

  listMessaggi(
    callerId: string,
    conversazioneId: string,
    options: { limit?: number | undefined; before?: string | undefined } = {},
  ): ConversazioneMessaggiPage {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    // Conferma di consegna implicita: se il destinatario sta scaricando i
    // messaggi, quei messaggi sono stati consegnati al suo client.
    this.repo.markDelivered(conversazioneId, callerId, this.now());

    const limit = Math.min(options.limit ?? 50, 100);
    const msgs = this.repo.listMessaggi(conversazioneId, {
      limit,
      ...(options.before !== undefined ? { before: options.before } : {}),
    });

    return {
      messaggi: msgs.map((m) => ({
        id: m.id,
        conversazioneId: m.conversazioneId,
        senderUserId: m.senderUserId,
        senderDeviceId: m.senderDeviceId,
        busta: m.busta,
        createdAt: m.createdAt,
        consegnatoAt: m.consegnatoAt,
      })),
    };
  }

  /**
   * Ritorna il `visto_fino_a` dell'altro membro della conversazione diretta.
   * Il mittente lo usa per sapere fino a dove il destinatario ha letto.
   */
  /**
   * Il `GroupInfo` da cui si rientra ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)).
   *
   * Chi lo chiede **non e' ancora nel gruppo MLS** — e' esattamente il punto:
   * ha perso il telefono e sta rientrando. Il diritto di leggerlo viene quindi
   * dall'essere membro della conversazione ESTIA, non dall'essere una foglia
   * dell'albero, che e' cio' che si sta ricostruendo.
   */
  async getGroupInfo(callerId: string, conversazioneId: string): Promise<GroupInfoView> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const altrove = await this.#statoAltrove(conversazioneId, "group-info");
    if (altrove !== undefined) {
      if (altrove === "assente") {
        throw new DomainError(
          "not_found",
          "Questa conversazione non ha ancora un punto da cui rientrare.",
          404,
        );
      }

      return { epoch: altrove.epoch, groupInfo: altrove.blob, updatedAt: altrove.updatedAt };
    }

    const record = this.repo.getGroupInfo(conversazioneId);
    if (!record) {
      throw new DomainError(
        "not_found",
        "Questa conversazione non ha ancora un punto da cui rientrare.",
        404,
      );
    }

    return { epoch: record.epoch, groupInfo: record.groupInfo, updatedAt: record.updatedAt };
  }

  /**
   * Deposita il `GroupInfo` dell'epoch corrente. Lo fa un membro dopo un commit,
   * e l'istanza non guarda dentro al blob: controlla solo che non faccia
   * **tornare indietro** l'epoch, perche' un `GroupInfo` vecchio manderebbe chi
   * rientra verso un'epoch morta.
   */
  async saveGroupInfo(
    callerId: string,
    conversazioneId: string,
    input: { groupInfo: string; epoch: number },
  ): Promise<GroupInfoView> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const depositato = await this.#depositaStatoAltrove(conversazioneId, "group-info", {
      blob: input.groupInfo,
      epoch: input.epoch,
    });
    if (depositato !== undefined) {
      return { epoch: input.epoch, groupInfo: input.groupInfo, updatedAt: depositato };
    }

    const updatedAt = this.now();
    const accettato = this.repo.putGroupInfo({
      conversazioneId,
      epoch: input.epoch,
      groupInfo: input.groupInfo,
      updatedAt,
      updatedBy: callerId,
    });

    if (!accettato) {
      throw new DomainError(
        "conflict",
        "Il gruppo e' gia' piu' avanti di cosi'. Aggiorna e riprova.",
        409,
      );
    }

    return { epoch: input.epoch, groupInfo: input.groupInfo, updatedAt };
  }

  /**
   * Il mazzo delle chiavi d'archivio ([ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)).
   *
   * L'istanza lo conserva avvolto e non sa aprirlo: la chiave che lo apre si
   * deriva dall'epoch del gruppo, e quella l'istanza non ce l'ha.
   */
  async getMazzoArchivio(callerId: string, conversazioneId: string): Promise<MazzoArchivioView> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const altrove = await this.#statoAltrove(conversazioneId, "mazzo");
    if (altrove !== undefined) {
      if (altrove === "assente") {
        throw new DomainError("not_found", "Questa conversazione non ha ancora un archivio.", 404);
      }

      return { epoch: altrove.epoch, mazzo: altrove.blob, updatedAt: altrove.updatedAt };
    }

    const record = this.repo.getMazzoArchivio(conversazioneId);
    if (!record) {
      throw new DomainError("not_found", "Questa conversazione non ha ancora un archivio.", 404);
    }

    return { epoch: record.epoch, mazzo: record.mazzo, updatedAt: record.updatedAt };
  }

  /** Riavvolge il mazzo sotto l'epoch corrente. L'epoch non torna indietro. */
  async saveMazzoArchivio(
    callerId: string,
    conversazioneId: string,
    input: { mazzo: string; epoch: number },
  ): Promise<MazzoArchivioView> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const depositato = await this.#depositaStatoAltrove(conversazioneId, "mazzo", {
      blob: input.mazzo,
      epoch: input.epoch,
    });
    if (depositato !== undefined) {
      return { epoch: input.epoch, mazzo: input.mazzo, updatedAt: depositato };
    }

    const updatedAt = this.now();
    const accettato = this.repo.putMazzoArchivio({
      conversazioneId,
      epoch: input.epoch,
      mazzo: input.mazzo,
      updatedAt,
      updatedBy: callerId,
    });

    if (!accettato) {
      throw new DomainError(
        "conflict",
        "Il gruppo e' gia' piu' avanti di cosi'. Aggiorna e riprova.",
        409,
      );
    }

    return { epoch: input.epoch, mazzo: input.mazzo, updatedAt };
  }

  /**
   * ADR 0043: deposita per l'account locale autenticato, mai per un autore
   * scelto dal client. Un retry identico dello stesso autore non duplica;
   * id contesi o payload diversi sono un conflitto sull'intero deposito.
   */
  depositaArchivio(
    callerId: string,
    conversazioneId: string,
    voci: readonly VoceArchivioInput[],
  ): { scritte: number } {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    if (!this.users.findById(callerId)) {
      throw new DomainError(
        "forbidden",
        "L'archivio custodisce solo gli autori di questa casa.",
        403,
      );
    }

    const scritte = this.repo.insertVociArchivio(conversazioneId, callerId, voci);
    if (scritte === undefined) {
      throw new DomainError(
        "conflict",
        "Una voce d'archivio esiste già con un altro deposito.",
        409,
      );
    }

    // La voce resta qui, e alle altre case va solo il segno che esiste
    // (ADR 0043 §3). Senza attendere: la spinta serve a non aspettare, e se
    // non arriva la recupera la prossima richiesta (ADR 0042 §4.1).
    if (scritte > 0) {
      void this.#spingi(
        conversazioneId,
        voci.map((v) => v.id),
      ).catch(() => undefined);
    }

    return { scritte };
  }

  /** Spinge alle altre case i segnaposto delle voci appena depositate. */
  async #spingi(conversazioneId: string, ids: readonly string[]): Promise<void> {
    const rete = this.rete;
    if (rete === undefined) {
      return;
    }

    const custoditi = this.repo.segnapostiCustoditiPerId(conversazioneId, ids);
    if (custoditi.length === 0) {
      return;
    }

    await this.#spingiA(
      conversazioneId,
      custoditi[0]!.autore,
      custoditi.map((v) => ({
        id: v.id,
        inviatoIl: v.createdAt,
        mittente: `${v.autore}@${rete.casa}`,
        seq: v.seq,
      })),
    );
  }

  async #spingiA(conversazioneId: string, da: string, voci: SegnapostoInput[]): Promise<void> {
    const rete = this.rete;
    if (rete === undefined) {
      return;
    }

    const membri = this.repo.getMembers(conversazioneId);
    for (const casa of this.repo.caseDellaConversazione(conversazioneId)) {
      const destinatari = membri
        .map((m) => m.id)
        .filter((id) => id.startsWith(`remote:${casa}:`))
        .map((id) => id.slice(`remote:${casa}:`.length));

      await rete
        .spingiSegnaposti(casa, { conversazioneId, da, destinatari, voci })
        .catch(() => undefined);
    }
  }

  /**
   * Annuncia alle altre case una conversazione nata qui (ADR 0042 §4.1).
   *
   * È una spinta senza segnaposto: dice «questa conversazione esiste, la
   * ordino io, e dentro ci sono dei tuoi». Senza, la casa di chi viene invitato
   * non saprebbe che c'è una coda da cui prendere il proprio Welcome.
   */
  async annunciaConversazione(callerId: string, conversazioneId: string): Promise<void> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const autore = this.users.findById(callerId);
    if (autore === undefined) {
      return;
    }

    await this.#spingiA(conversazioneId, autore.username, []);
  }

  /**
   * I segnaposto che questa casa custodisce, per una casa che partecipa
   * (`segnaposto-da`, ADR 0042 §4.1).
   *
   * La risposta **dichiara la finestra** che copre: `da` è il primo progressivo
   * dopo il cursore, `a` l'ultimo che la risposta vale a confermare. Dentro,
   * ciò che non è elencato non esiste — ed è la regola per cui un ritirato non
   * torna.
   *
   * Non serve ordinare la conversazione: ogni casa custodisce la sua parte.
   * Serve partecipare (§2).
   */
  segnapostiPerCasa(
    conversazioneId: string,
    remoteKey: string,
    dopo: number,
  ): FinestraSegnaposti | "rifiutato" {
    const rete = this.rete;
    if (rete === undefined || !this.repo.haMembroDiCasa(conversazioneId, remoteKey)) {
      return "rifiutato";
    }

    const limite = SEGNAPOSTI_PER_PAGINA;
    const pagina = this.repo.listSegnapostiCustoditi(conversazioneId, dopo, limite);
    const ultima = pagina.voci.at(-1);
    const piena = pagina.voci.length === limite && ultima !== undefined;

    return {
      a: piena ? ultima.seq : Math.max(pagina.ultimoSeq, dopo),
      da: dopo + 1,
      voci: pagina.voci.map((v) => ({
        id: v.id,
        inviatoIl: v.createdAt,
        mittente: `${v.autore}@${rete.casa}`,
        seq: v.seq,
      })),
      ...(piena ? { prossimo: String(ultima.seq) } : {}),
    };
  }

  /**
   * La spinta di un'altra casa (`segnaposto`).
   *
   * Se la conversazione qui non esiste **e chi spinge è chi l'ha creata**, si
   * crea, con la casa che ordina scritta: è l'annuncio. Una casa può dire di
   * ordinare solo una conversazione che ha fatto nascere lei, quindi una
   * menzogna qui tocca soltanto le sue conversazioni.
   */
  riceviSegnapostiSpinti(spinta: {
    conversazioneId: string;
    remoteKey: string;
    da: string;
    destinatari: readonly string[];
    voci: readonly SegnapostoInput[];
  }): boolean {
    if (!spinta.voci.every((v) => mittenteDiCasa(v.mittente, spinta.remoteKey))) {
      return false;
    }

    if (this.repo.casaCheOrdina(spinta.conversazioneId) === undefined) {
      if (!this.#creaDaAnnuncio(spinta)) {
        return false;
      }
    } else if (!this.repo.haMembroDiCasa(spinta.conversazioneId, spinta.remoteKey)) {
      return false;
    }

    return this.repo.inserisciSegnapostiSpinti(
      spinta.conversazioneId,
      spinta.remoteKey,
      spinta.voci,
      this.now(),
    );
  }

  #creaDaAnnuncio(spinta: {
    conversazioneId: string;
    remoteKey: string;
    da: string;
    destinatari: readonly string[];
  }): boolean {
    const locali = spinta.destinatari.map((nome) => this.users.findByUsername(nome));
    if (locali.length === 0 || locali.some((u) => u === undefined)) {
      return false;
    }

    const membri = [...locali.map((u) => u!.id), `remote:${spinta.remoteKey}:${spinta.da}`];

    this.repo.createConversazione({
      casaCheOrdina: spinta.remoteKey,
      createdAt: this.now(),
      id: spinta.conversazioneId,
      membri,
      tipo: membri.length > 2 ? "gruppo" : "diretta",
    });

    return true;
  }

  /**
   * Chiede i segnaposto a ogni altra casa della conversazione, e applica le
   * finestre (ADR 0042 §4.1).
   *
   * Dal cursore, di norma. **Da zero** quando l'ultima riconciliazione è più
   * vecchia di cinque minuti, o non c'è mai stata: è ciò che fa sparire un
   * ritirato che sta sotto il cursore — il tetto di cinque minuti della
   * decisione 8 — e che riporta alla verità una casa ripristinata da un backup.
   *
   * Ritorna le case che non hanno risposto: i loro segnaposto restano, e il
   * contenuto tornerà quando torneranno loro.
   */
  async sincronizzaSegnaposti(conversazioneId: string): Promise<{ irraggiungibili: string[] }> {
    const rete = this.rete;
    const irraggiungibili: string[] = [];
    if (rete === undefined) {
      return { irraggiungibili };
    }

    const adesso = Date.parse(this.now());

    for (const casa of this.repo.caseDellaConversazione(conversazioneId)) {
      const cursore = this.repo.cursoreSegnaposti(conversazioneId, casa);
      const daZero =
        cursore?.riconciliatoIl == null ||
        adesso - Date.parse(cursore.riconciliatoIl) > RICONCILIAZIONE_MS;
      let dopo = daZero ? 0 : cursore.cursore;

      for (;;) {
        const esito = await rete.segnapostiDa(casa, conversazioneId, dopo);

        if (esito.esito === "irraggiungibile") {
          irraggiungibili.push(casa);
          break;
        }

        if (esito.esito === "rifiutato" || !finestraCoerente(esito, casa, dopo)) {
          break;
        }

        if (
          !this.repo.applicaFinestraSegnaposti(
            conversazioneId,
            casa,
            { a: esito.a, da: esito.da, voci: esito.voci },
            this.now(),
          )
        ) {
          break;
        }

        if (esito.prossimo === undefined) {
          break;
        }
        dopo = Number(esito.prossimo);
      }
    }

    return { irraggiungibili };
  }

  /**
   * Le voci custodite qui, per una casa che partecipa (`archivio`, ADR 0043 §2).
   *
   * **Ogni visita verifica l'autorizzazione di adesso**: un id noto non è un
   * permesso. Si servono solo le voci degli autori di questa casa — il
   * pregresso senza autore attestato non esce di qui — e quelle che non ci sono
   * si dicono, perché chi riceve cancelli il segnaposto.
   */
  vociPerCasa(
    conversazioneId: string,
    remoteKey: string,
    ids: readonly string[],
  ):
    | {
        voci: { id: string; chiaveN: number; busta: string; createdAt: string }[];
        assenti: string[];
      }
    | "rifiutato" {
    if (!this.repo.haMembroDiCasa(conversazioneId, remoteKey)) {
      return "rifiutato";
    }

    const trovate = this.repo.vociArchivioPerId(conversazioneId, ids, true);
    const presenti = new Set(trovate.map((v) => v.id));

    return {
      assenti: ids.filter((id) => !presenti.has(id)),
      voci: trovate.map((v) => ({
        busta: v.busta,
        chiaveN: v.chiaveN,
        createdAt: v.createdAt,
        id: v.id,
      })),
    };
  }

  /**
   * Il ritiro (ADR 0043 §2): l'autore toglie la propria voce dalla propria
   * casa, e **non ne esiste un'altra copia su nessun server**. Le altre case
   * cancellano il segnaposto alla prossima visita o riconciliazione, entro i
   * cinque minuti della decisione 8.
   */
  ritiraVoce(callerId: string, conversazioneId: string, voceId: string): void {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    if (!this.repo.ritiraVoce(conversazioneId, callerId, voceId)) {
      throw new DomainError("not_found", "Non c'è un tuo messaggio con questo nome.", 404);
    }
  }

  /**
   * La cronologia di una conversazione, ricomposta dalle custodie (ADR 0043
   * §2): le voci di chi abita qui, e i segnaposto di chi abita altrove con il
   * contenuto visitato alla casa dell'autore.
   *
   * A pagine dalla più recente, perché la visita costa una domanda per casa: si
   * chiede solo il contenuto delle righe che la pagina mostra. Una casa che non
   * risponde non ferma la pagina — le sue righe restano, con mittente e orario,
   * e `non-disponibile`.
   */
  async cronologia(
    callerId: string,
    conversazioneId: string,
    options: { prima?: string | undefined; limite?: number | undefined } = {},
  ): Promise<CronologiaPage> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const { irraggiungibili } = await this.sincronizzaSegnaposti(conversazioneId);
    const casaMia = this.rete?.casa ?? "";

    type Riga = { id: string; createdAt: string; mittente: string | null; casa: string };
    const tutte: Riga[] = [
      ...this.repo.indiceVociArchivio(conversazioneId).map((v) => ({
        casa: casaMia,
        createdAt: v.createdAt,
        id: v.id,
        mittente: v.autore === null ? null : `${v.autore}@${casaMia}`,
      })),
      ...this.repo.listSegnaposti(conversazioneId).map((s) => ({
        casa: s.casaCustode,
        createdAt: s.inviatoIl,
        id: s.id,
        mittente: s.mittente,
      })),
    ].sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    );

    const limite = Math.min(options.limite ?? 50, 200);
    const prima = options.prima === undefined ? undefined : decodificaCursore(options.prima);
    const precedenti =
      prima === undefined
        ? tutte
        : tutte.filter(
            (r) =>
              r.createdAt < prima.createdAt || (r.createdAt === prima.createdAt && r.id < prima.id),
          );
    const pagina = precedenti.slice(-limite);
    const altre = precedenti.length > pagina.length;

    // Il contenuto: le voci di qui dal database, quelle di fuori dalla visita.
    const contenuti = new Map<string, { chiaveN: number; busta: string }>();
    const nonDisponibili = new Set<string>();
    const nonRispondono = new Set(irraggiungibili);

    const qui = pagina.filter((r) => r.casa === casaMia).map((r) => r.id);
    for (const v of this.repo.vociArchivioPerId(conversazioneId, qui, false)) {
      contenuti.set(`${casaMia}/${v.id}`, { busta: v.busta, chiaveN: v.chiaveN });
    }

    const perCasa = new Map<string, string[]>();
    for (const r of pagina) {
      if (r.casa !== casaMia) {
        perCasa.set(r.casa, [...(perCasa.get(r.casa) ?? []), r.id]);
      }
    }

    const ritirate = new Set<string>();
    for (const [casa, ids] of perCasa) {
      if (nonRispondono.has(casa) || this.rete === undefined) {
        ids.forEach((id) => nonDisponibili.add(`${casa}/${id}`));
        continue;
      }

      for (let i = 0; i < ids.length; i += VOCI_PER_VISITA) {
        const lotto = ids.slice(i, i + VOCI_PER_VISITA);
        const esito = await this.rete.visitaArchivio(casa, conversazioneId, lotto);

        if (esito.esito !== "voci") {
          if (esito.esito === "irraggiungibile") {
            nonRispondono.add(casa);
          }
          lotto.forEach((id) => nonDisponibili.add(`${casa}/${id}`));
          continue;
        }

        for (const v of esito.voci) {
          contenuti.set(`${casa}/${v.id}`, { busta: v.busta, chiaveN: v.chiaveN });
        }

        // Quello che la casa custode non ha più, qui non resta: è il ritiro
        // che arriva alla prima lettura, senza aspettare la riconciliazione.
        for (const id of esito.assenti) {
          this.repo.cancellaSegnaposto(conversazioneId, casa, id);
          ritirate.add(`${casa}/${id}`);
        }
      }
    }

    const righe: RigaCronologiaView[] = [];
    for (const r of pagina) {
      const chiave = `${r.casa}/${r.id}`;
      if (ritirate.has(chiave)) {
        continue;
      }

      const voce = contenuti.get(chiave);
      righe.push({
        casa: r.casa,
        createdAt: r.createdAt,
        id: r.id,
        mittente: r.mittente,
        stato: voce === undefined || nonDisponibili.has(chiave) ? "non-disponibile" : "disponibile",
        ...(voce === undefined ? {} : { voce }),
      });
    }

    const piuVecchia = pagina[0];
    return {
      nonRispondono: [...nonRispondono],
      righe,
      ...(altre && piuVecchia !== undefined
        ? { prima: codificaCursore(piuVecchia.createdAt, piuVecchia.id) }
        : {}),
    };
  }

  /** I segnaposto di una conversazione, per un membro di questa casa. */
  segnaposti(callerId: string, conversazioneId: string): SegnapostoRecord[] {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    return this.repo.listSegnaposti(conversazioneId);
  }

  /**
   * L'archivio, dalla voce piu' vecchia. E' cosi' che un dispositivo nuovo
   * ricostruisce la cronologia dopo essere rientrato: il trasporto non gliela
   * puo' dare, perche' quelle chiavi non esistono piu'.
   */
  listArchivio(
    callerId: string,
    conversazioneId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): ArchivioPage {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const limit = Math.min(options.limit ?? 100, 200);
    const voci = this.repo.listVociArchivio(conversazioneId, {
      limit: limit + 1,
      ...(options.dopo !== undefined ? { dopo: options.dopo } : {}),
    });

    const pagina = voci.slice(0, limit);
    const ultima = pagina.at(-1);

    return {
      voci: pagina,
      ...(voci.length > limit && ultima !== undefined
        ? { prossimo: codificaCursore(ultima.createdAt, ultima.id) }
        : {}),
    };
  }

  /**
   * Deposita un handshake MLS ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)).
   *
   * Un **commit** va a tutti i membri; un **Welcome** solo a chi viene aggiunto,
   * che non e' ancora nel gruppo crittografico e quindi non potrebbe decifrare
   * niente che passi dal canale dei membri.
   */
  async depositaHandshake(
    callerId: string,
    conversazioneId: string,
    input: DepositaHandshakeRequest,
  ): Promise<{ id: string }> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    if (input.tipo === "welcome" && input.destinatario === undefined) {
      throw new DomainError("invalid_request", "Un Welcome ha un destinatario.", 400);
    }

    // Un commit e' per tutti: un destinatario lo renderebbe invisibile agli altri,
    // che e' il modo silenzioso di spaccare un gruppo.
    if (input.tipo === "commit" && input.destinatario !== undefined) {
      throw new DomainError("invalid_request", "Un commit va a tutti i membri.", 400);
    }

    const id = randomUUID();
    const createdAt = this.now();
    const altrove = this.#casaCheOrdinaAltrove(conversazioneId);

    // La coda sta dove la conversazione è nata (ADR 0042 §3). Se è un'altra
    // casa, il commit si deposita **là**: una copia qui sarebbe la seconda coda
    // che quell'ADR esiste per non avere.
    if (altrove !== undefined) {
      const esito = await this.#rete().deposita(altrove, conversazioneId, {
        busta: input.busta,
        createdAt,
        epoch: input.epoch,
        id,
        tipo: input.tipo,
        ...(input.destinatario !== undefined ? { destinatario: input.destinatario } : {}),
      });

      if (esito.esito === "irraggiungibile") {
        throw casaCheOrdinaSpenta();
      }

      if (esito.esito === "indietro") {
        throw commitSuperato();
      }

      if (esito.esito === "rifiutato") {
        throw new DomainError(
          "forbidden",
          "La casa che gestisce questa conversazione non accetta questo deposito.",
          403,
        );
      }

      return { id };
    }

    const accettato = this.repo.insertHandshake({
      busta: input.busta,
      conversazioneId,
      createdAt,
      epoch: input.epoch,
      id,
      tipo: input.tipo,
      ...(input.destinatario !== undefined ? { destinatario: input.destinatario } : {}),
    });

    if (!accettato) {
      throw commitSuperato();
    }

    return { id };
  }

  /** Gli handshake che spettano a chi chiede, dal piu' vecchio. */
  async listHandshake(
    callerId: string,
    conversazioneId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): Promise<HandshakePage> {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const altrove = this.#casaCheOrdinaAltrove(conversazioneId);

    // Tutti leggono la coda **da chi ordina**: è l'unico modo perché l'ordine
    // sia lo stesso per tutti, che è la ragione di ADR 0042 §3.
    if (altrove !== undefined) {
      const esito = await this.#rete().coda(
        altrove,
        conversazioneId,
        ...(options.dopo === undefined ? [] : [options.dopo]),
      );

      if (esito.esito === "irraggiungibile") {
        throw casaCheOrdinaSpenta();
      }

      if (esito.esito === "rifiutato") {
        throw new DomainError(
          "forbidden",
          "La casa che gestisce questa conversazione non risponde a questa richiesta.",
          403,
        );
      }

      return {
        handshake: esito.handshake,
        ...(esito.prossimo === undefined ? {} : { prossimo: esito.prossimo }),
      };
    }

    const limit = Math.min(options.limit ?? 100, 200);
    const righe = this.repo.listHandshakePer(conversazioneId, callerId, {
      limit: limit + 1,
      ...(options.dopo !== undefined ? { dopo: options.dopo } : {}),
    });

    const pagina = righe.slice(0, limit);
    const ultima = pagina.at(-1);

    return {
      handshake: pagina.map(({ seq: _seq, ...vista }) => vista),
      ...(righe.length > limit && ultima !== undefined ? { prossimo: String(ultima.seq) } : {}),
    };
  }

  /**
   * La casa che ordina, quando non è questa. `undefined` vuol dire «sono io».
   */
  #casaCheOrdinaAltrove(conversazioneId: string): string | undefined {
    const casa = this.repo.casaCheOrdina(conversazioneId);
    if (casa === null || casa === undefined) {
      return undefined;
    }

    return this.rete !== undefined && casa === this.rete.casa ? undefined : casa;
  }

  /**
   * Lo stato presso chi ordina, quando non è questa casa.
   *
   * `undefined` vuol dire «ordino io, guarda qui»; `"assente"` che chi ordina
   * ha risposto e non ce l'ha ancora. Niente di quello che torna si scrive:
   * le altre case li chiedono e non li conservano (decisione 5).
   */
  async #statoAltrove(
    conversazioneId: string,
    tipo: "group-info" | "mazzo",
  ): Promise<{ blob: string; epoch: number; updatedAt: string } | "assente" | undefined> {
    const altrove = this.#casaCheOrdinaAltrove(conversazioneId);
    if (altrove === undefined) {
      return undefined;
    }

    const esito = await this.#rete().leggiStato(altrove, conversazioneId, tipo);

    if (esito.esito === "irraggiungibile") {
      throw casaCheOrdinaSpenta();
    }

    if (esito.esito === "rifiutato") {
      throw new DomainError(
        "forbidden",
        "La casa che gestisce questa conversazione non risponde a questa richiesta.",
        403,
      );
    }

    return esito.esito === "assente"
      ? "assente"
      : { blob: esito.blob, epoch: esito.epoch, updatedAt: esito.updatedAt };
  }

  /** Il deposito presso chi ordina. Ritorna l'orario, o `undefined` se ordino io. */
  async #depositaStatoAltrove(
    conversazioneId: string,
    tipo: "group-info" | "mazzo",
    stato: { blob: string; epoch: number },
  ): Promise<string | undefined> {
    const altrove = this.#casaCheOrdinaAltrove(conversazioneId);
    if (altrove === undefined) {
      return undefined;
    }

    const esito = await this.#rete().depositaStato(altrove, conversazioneId, tipo, stato);

    if (esito.esito === "irraggiungibile") {
      throw casaCheOrdinaSpenta();
    }

    if (esito.esito === "indietro") {
      throw new DomainError(
        "conflict",
        "Il gruppo e' gia' piu' avanti di cosi'. Aggiorna e riprova.",
        409,
      );
    }

    if (esito.esito === "rifiutato") {
      throw new DomainError(
        "forbidden",
        "La casa che gestisce questa conversazione non accetta questo deposito.",
        403,
      );
    }

    return esito.updatedAt;
  }

  /**
   * `GroupInfo` o mazzo per una casa che partecipa (ADR 0042 §2 e §4).
   *
   * Le stesse due porte della coda: questa casa deve ordinare la conversazione,
   * e chi chiede deve avere dentro un membro.
   */
  statoRemoto(
    conversazioneId: string,
    remoteKey: string,
    tipo: "group-info" | "mazzo",
  ): { blob: string; epoch: number; updatedAt: string } | "rifiutato" | undefined {
    if (
      !this.#ordinaQui(conversazioneId) ||
      !this.repo.haMembroDiCasa(conversazioneId, remoteKey)
    ) {
      return "rifiutato";
    }

    if (tipo === "group-info") {
      const record = this.repo.getGroupInfo(conversazioneId);
      return record === undefined
        ? undefined
        : { blob: record.groupInfo, epoch: record.epoch, updatedAt: record.updatedAt };
    }

    const record = this.repo.getMazzoArchivio(conversazioneId);
    return record === undefined
      ? undefined
      : { blob: record.mazzo, epoch: record.epoch, updatedAt: record.updatedAt };
  }

  /**
   * Il deposito da un'altra casa. `updatedBy` è la **casa**, non una persona:
   * è l'unica cosa che la connessione autentica, e scrivere un nome di membro
   * vorrebbe dire credere a un campo del messaggio (ADR 0021 §1).
   */
  depositaStatoRemoto(
    conversazioneId: string,
    remoteKey: string,
    tipo: "group-info" | "mazzo",
    stato: { blob: string; epoch: number },
  ): { updatedAt: string } | "rifiutato" | "indietro" {
    if (
      !this.#ordinaQui(conversazioneId) ||
      !this.repo.haMembroDiCasa(conversazioneId, remoteKey)
    ) {
      return "rifiutato";
    }

    const updatedAt = this.now();
    const record = {
      conversazioneId,
      epoch: stato.epoch,
      updatedAt,
      updatedBy: `remote:${remoteKey}`,
    };

    const accettato =
      tipo === "group-info"
        ? this.repo.putGroupInfo({ ...record, groupInfo: stato.blob })
        : this.repo.putMazzoArchivio({ ...record, mazzo: stato.blob });

    return accettato ? { updatedAt } : "indietro";
  }

  #rete(): ReteFraCase {
    if (this.rete === undefined) {
      throw new DomainError(
        "rete_non_attiva",
        "Questa conversazione è gestita da un'altra casa, e questa istanza non è in rete.",
        503,
      );
    }

    return this.rete;
  }

  /** Si collega dopo, come il resto della rete. */
  useRete(rete: ReteFraCase): void {
    this.rete = rete;
  }

  /**
   * Il deposito che arriva da un'altra casa (ADR 0042 §2).
   *
   * `K` è la chiave della connessione, **mai** un campo del messaggio: chi
   * chiama non può dichiarare di essere un'altra casa. E può depositare solo
   * se in questa conversazione c'è un membro suo.
   */
  depositaHandshakeRemoto(record: {
    conversazioneId: string;
    remoteKey: string;
    id: string;
    epoch: number;
    tipo: "commit" | "welcome";
    destinatario?: string | undefined;
    busta: string;
    createdAt: string;
  }): { id: string } | "indietro" | undefined {
    if (!this.#ordinaQui(record.conversazioneId)) {
      return undefined;
    }

    if (!this.repo.haMembroDiCasa(record.conversazioneId, record.remoteKey)) {
      return undefined;
    }

    // Un commit è per tutti, un Welcome per chi entra: la stessa regola del
    // deposito locale, perché una casa remota non è più fidata di un membro.
    if (record.tipo === "commit" && record.destinatario !== undefined) {
      return undefined;
    }

    if (record.tipo === "welcome" && record.destinatario === undefined) {
      return undefined;
    }

    const accettato = this.repo.insertHandshake({
      busta: record.busta,
      conversazioneId: record.conversazioneId,
      createdAt: record.createdAt,
      epoch: record.epoch,
      id: record.id,
      tipo: record.tipo,
      ...(record.destinatario !== undefined ? { destinatario: record.destinatario } : {}),
    });

    return accettato ? { id: record.id } : "indietro";
  }

  /**
   * La coda ordinata, per una casa che partecipa (ADR 0042 §2 e §3).
   *
   * Porta i commit e **soltanto i Welcome dei suoi membri**: una casa non è una
   * persona, e il Welcome di qualcun altro non la riguarda.
   */
  handshakeRemoti(
    conversazioneId: string,
    remoteKey: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): { handshake: HandshakeRecord[]; prossimo?: string } | undefined {
    if (!this.#ordinaQui(conversazioneId)) {
      return undefined;
    }

    if (!this.repo.haMembroDiCasa(conversazioneId, remoteKey)) {
      return undefined;
    }

    const limit = Math.min(options.limit ?? 100, 200);
    const righe = this.repo.listHandshakePerCasa(conversazioneId, remoteKey, {
      limit: limit + 1,
      ...(options.dopo !== undefined ? { dopo: options.dopo } : {}),
    });

    const pagina = righe.slice(0, limit);
    const ultima = pagina.at(-1);

    return {
      handshake: pagina,
      ...(righe.length > limit && ultima !== undefined ? { prossimo: String(ultima.seq) } : {}),
    };
  }

  /**
   * Questa conversazione la ordino io?
   *
   * `false` anche quando la conversazione non esiste, e la risposta che ne
   * esce è la stessa: chi chiede non impara da qui se una conversazione c'è.
   */
  #ordinaQui(conversazioneId: string): boolean {
    const casa = this.repo.casaCheOrdina(conversazioneId);
    if (casa === undefined) {
      return false;
    }

    return casa === null || (this.rete !== undefined && casa === this.rete.casa);
  }

  getVistoFinoA(callerId: string, conversazioneId: string): string | null {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }
    const membri = this.repo.getMembers(conversazioneId);
    const altro = membri.find((m) => m.id !== callerId);
    if (!altro) return null;
    return this.repo.getVistoFinoA(conversazioneId, altro.id);
  }

  inviaMessaggio(
    callerId: string,
    callerSessionId: string,
    conversazioneId: string,
    busta: string,
  ): MessaggioBustaView {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const device = this.deviceKeys.getDeviceKeyBySessionId(callerSessionId);
    if (!device) {
      throw new DomainError(
        "device_not_registered",
        "Il dispositivo mittente non ha una chiave registrata.",
        400,
      );
    }

    const createdAt = this.now();
    const rec = this.repo.insertMessaggio({
      id: randomUUID(),
      conversazioneId,
      senderUserId: callerId,
      senderDeviceId: device.id,
      busta,
      createdAt,
    });

    const membri = this.repo.getMembers(conversazioneId);
    for (const membro of membri) {
      if (membro.id.startsWith("remote:")) {
        const parts = membro.id.split(":");
        const remoteInstanceKey = parts[1];
        if (remoteInstanceKey) {
          this.repo.insertMessaggioInUscita({
            id: randomUUID(),
            messaggioId: rec.id,
            destinatarioChiave: remoteInstanceKey,
            busta,
            prossimoInvio: createdAt,
            createdAt,
          });
        }
      }
    }

    return {
      id: rec.id,
      conversazioneId: rec.conversazioneId,
      senderUserId: rec.senderUserId,
      senderDeviceId: rec.senderDeviceId,
      busta: rec.busta,
      createdAt: rec.createdAt,
      consegnatoAt: rec.consegnatoAt,
    };
  }

  consegnaBustaRemota(record: {
    conversazioneId: string;
    destinatarioUsername: string;
    senderRemoteKey: string;
    senderUsername: string;
    senderDeviceId: string;
    messaggioId: string;
    busta: string;
    createdAt: string;
  }): { consegnatoAt: string } | undefined {
    const recipient = this.users.findByUsername(record.destinatarioUsername);
    if (!recipient) {
      return undefined;
    }

    const senderId = `remote:${record.senderRemoteKey}:${record.senderUsername}`;
    let conv = this.repo.findDirectConversazione(recipient.id, senderId);
    const at = this.now();

    if (!conv) {
      conv = this.repo.createConversazione({
        id: record.conversazioneId || randomUUID(),
        tipo: "diretta",
        createdAt: at,
        membri: [recipient.id, senderId],
        // Questa conversazione è nata **altrove**, e la casa che ordina è
        // quella dove è nata (ADR 0042 §3): la coda dei commit sta là, e qui
        // non se ne tiene una seconda.
        casaCheOrdina: record.senderRemoteKey,
      });
    }

    this.repo.insertMessaggio({
      id: record.messaggioId || randomUUID(),
      conversazioneId: conv.id,
      senderUserId: senderId,
      senderDeviceId: record.senderDeviceId,
      busta: record.busta,
      createdAt: record.createdAt || at,
    });

    return { consegnatoAt: at };
  }

  listMessaggiInUscita(limit = 20) {
    return this.repo.listMessaggiInUscitaPending(this.now(), limit);
  }

  rimuoviMessaggioInUscita(id: string): void {
    this.repo.deleteMessaggioInUscita(id);
  }

  getMessaggioById(id: string): MessaggioBustaView | undefined {
    const m = this.repo.getMessaggioById(id);
    if (!m) return undefined;
    return {
      id: m.id,
      conversazioneId: m.conversazioneId,
      senderUserId: m.senderUserId,
      senderDeviceId: m.senderDeviceId,
      busta: m.busta,
      createdAt: m.createdAt,
      consegnatoAt: m.consegnatoAt,
    };
  }

  markDeliveredById(messaggioId: string, consegnatoAt: string): void {
    this.repo.markDeliveredById(messaggioId, consegnatoAt);
  }

  /**
   * La coda verso una casa tornata raggiungibile riparte da adesso (ADR 0041 §4).
   *
   * È la metà mancante dell'arretramento qui sotto: senza, un messaggio scritto
   * mentre l'altra casa era spenta poteva restare fermo **un'ora** dopo che era
   * tornata, perché la data del prossimo tentativo sopravviveva al motivo che
   * l'aveva prodotta.
   */
  risvegliaCodaPer(destinatarioChiave: string): number {
    return this.repo.risvegliaMessaggiInUscitaPer(destinatarioChiave, this.now());
  }

  fallisciTentativoMessaggioInUscita(id: string, tentativiAttuali: number): void {
    // Exponential backoff: 30s, 1m, 2m, 4m, 8m, max 1h
    const delaySeconds = Math.min(30 * Math.pow(2, tentativiAttuali), 3600);
    const nextDate = new Date(Date.now() + delaySeconds * 1000).toISOString();
    this.repo.incrementaTentativiMessaggioInUscita(id, nextDate);
  }

  markRead(callerId: string, conversazioneId: string, finoA: string): void {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }
    this.repo.markRead(conversazioneId, callerId, finoA);
  }

  deleteConversazione(callerId: string, conversazioneId: string): void {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }
    this.repo.deleteConversazione(conversazioneId);
  }

  clearMessaggi(callerId: string, conversazioneId: string): void {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }
    this.repo.clearMessaggi(conversazioneId);
  }
}
