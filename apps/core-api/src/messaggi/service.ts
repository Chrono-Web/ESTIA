import { randomUUID } from "node:crypto";
import type {
  ConversazioneMessaggiPage,
  ConversazioneView,
  MessaggioBustaView,
} from "@estia/contracts";

import { DomainError } from "../errors.js";
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
      initialBusta?: string | undefined;
    },
  ): { conversazione: ConversazioneView; initialMessaggio?: MessaggioBustaView } {
    let recipient: ReturnType<typeof this.users.findById> | undefined;

    if (request.recipientUserId) {
      recipient = this.users.findById(request.recipientUserId);
    } else if (request.recipientUsername) {
      recipient = this.users.findByUsername(request.recipientUsername);
    } else {
      throw new DomainError("bad_request", "Specificare recipientUserId o recipientUsername.", 400);
    }

    if (!recipient) {
      throw new DomainError("user_not_found", "Il destinatario non esiste.", 404);
    }

    const recipientUserId = recipient.id;

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

  markRead(callerId: string, conversazioneId: string, finoA: string): void {
    if (!this.repo.isMember(conversazioneId, callerId)) {
      throw new DomainError("forbidden", "Non sei membro di questa conversazione.", 403);
    }
    this.repo.markRead(conversazioneId, callerId, finoA);
  }
}
