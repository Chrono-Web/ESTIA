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
import type { MessaggiRepository } from "./repository.js";

export interface MessaggiServiceOptions {
  repository: MessaggiRepository;
  deviceKeys: DeviceKeysRepository;
  users: UserRepository;
  now?: (() => Date) | (() => string);
}

export class MessaggiService {
  private readonly repo: MessaggiRepository;
  private readonly deviceKeys: DeviceKeysRepository;
  private readonly users: UserRepository;
  private readonly now: () => string;

  constructor(options: MessaggiServiceOptions) {
    this.repo = options.repository;
    this.deviceKeys = options.deviceKeys;
    this.users = options.users;
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
   * Deposita voci d'archivio. Ripetibile: depositare due volte la stessa voce
   * non e' un errore e non duplica, perche' due dispositivi archiviano la stessa
   * conversazione senza doversi coordinare.
   */
  depositaArchivio(
    callerId: string,
    conversazioneId: string,
    voci: readonly VoceArchivioInput[],
  ): { scritte: number } {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }

    return { scritte: this.repo.insertVociArchivio(conversazioneId, voci) };
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
  depositaHandshake(
    callerId: string,
    conversazioneId: string,
    input: DepositaHandshakeRequest,
  ): { id: string } {
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
    this.repo.insertHandshake({
      busta: input.busta,
      conversazioneId,
      createdAt: this.now(),
      epoch: input.epoch,
      id,
      tipo: input.tipo,
      ...(input.destinatario !== undefined ? { destinatario: input.destinatario } : {}),
    });

    return { id };
  }

  /** Gli handshake che spettano a chi chiede, dal piu' vecchio. */
  listHandshake(
    callerId: string,
    conversazioneId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): HandshakePage {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
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
