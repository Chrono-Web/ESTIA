import { randomUUID } from "node:crypto";
import type {
  ArchivioPage,
  DepositaHandshakeRequest,
  HandshakePage,
  ConversazioneMessaggiPage,
  ConversazioneView,
  GroupInfoView,
  MazzoArchivioView,
  MessaggioBustaView,
  VoceArchivioInput,
} from "@estia/contracts";

import { DomainError } from "../errors.js";
import { codificaCursore } from "./repository.js";
import type { DeviceKeysRepository } from "../dispositivi/repository.js";
import type { UserRepository } from "../identity/repository.js";
import type { HandshakeRecord, MessaggiRepository } from "./repository.js";

/**
 * La rete, come la vede questo servizio: due domande e una chiave.
 *
 * È il confine che tiene la federazione fuori da qui ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §3):
 * quando la casa che ordina non è questa, la coda **non si duplica** — si
 * chiede a lei. Assente finché la rete non è attiva, e allora una conversazione
 * ordinata altrove dice di no invece di far finta.
 */
export interface ReteDegliHandshake {
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
  ) => Promise<{ esito: "depositato" } | { esito: "rifiutato" } | { esito: "irraggiungibile" }>;
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
}

export interface MessaggiServiceOptions {
  repository: MessaggiRepository;
  deviceKeys: DeviceKeysRepository;
  users: UserRepository;
  now?: (() => Date) | (() => string);
  /** Assente finché la rete non c'è: allora ordina soltanto questa casa. */
  rete?: ReteDegliHandshake;
}

/**
 * Il costo dichiarato di ADR 0042 §3, detto con le parole che l'interfaccia
 * userà: se la casa che ordina non risponde, in quella conversazione non si
 * cambia chi c'è. Grazie ad [ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md)
 * l'istanza lo sa prima di provarci, e può dirlo invece di far aspettare.
 */
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
  private rete: ReteDegliHandshake | undefined;

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
  getGroupInfo(callerId: string, conversazioneId: string): GroupInfoView {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
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
  saveGroupInfo(
    callerId: string,
    conversazioneId: string,
    input: { groupInfo: string; epoch: number },
  ): GroupInfoView {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
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
  getMazzoArchivio(callerId: string, conversazioneId: string): MazzoArchivioView {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    const record = this.repo.getMazzoArchivio(conversazioneId);
    if (!record) {
      throw new DomainError("not_found", "Questa conversazione non ha ancora un archivio.", 404);
    }

    return { epoch: record.epoch, mazzo: record.mazzo, updatedAt: record.updatedAt };
  }

  /** Riavvolge il mazzo sotto l'epoch corrente. L'epoch non torna indietro. */
  saveMazzoArchivio(
    callerId: string,
    conversazioneId: string,
    input: { mazzo: string; epoch: number },
  ): MazzoArchivioView {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
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
    return { scritte };
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

      if (esito.esito === "rifiutato") {
        throw new DomainError(
          "forbidden",
          "La casa che gestisce questa conversazione non accetta questo deposito.",
          403,
        );
      }

      return { id };
    }

    this.repo.insertHandshake({
      busta: input.busta,
      conversazioneId,
      createdAt,
      epoch: input.epoch,
      id,
      tipo: input.tipo,
      ...(input.destinatario !== undefined ? { destinatario: input.destinatario } : {}),
    });

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

  #rete(): ReteDegliHandshake {
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
  useRete(rete: ReteDegliHandshake): void {
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
  }): { id: string } | undefined {
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

    this.repo.insertHandshake({
      busta: record.busta,
      conversazioneId: record.conversazioneId,
      createdAt: record.createdAt,
      epoch: record.epoch,
      id: record.id,
      tipo: record.tipo,
      ...(record.destinatario !== undefined ? { destinatario: record.destinatario } : {}),
    });

    return { id: record.id };
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
