import type { DatabaseSync } from "node:sqlite";
import type { AuthorView, ConversazioneTipo } from "@estia/contracts";

export interface ConversazioneRecord {
  id: string;
  tipo: ConversazioneTipo;
  createdAt: string;
}

export interface MessaggioRecord {
  id: string;
  conversazioneId: string;
  senderUserId: string;
  senderDeviceId: string;
  busta: string;
  createdAt: string;
  consegnatoAt: string | null;
}

export interface ConversazioneSummary {
  conversazione: ConversazioneRecord;
  membri: AuthorView[];
  ultimoMessaggio?:
    | {
        id: string;
        senderUserId: string;
        createdAt: string;
      }
    | undefined;
  nonLetti: number;
}

export interface MessaggiRepository {
  createConversazione(record: {
    id: string;
    tipo: ConversazioneTipo;
    createdAt: string;
    membri: string[];
  }): ConversazioneRecord;
  findDirectConversazione(userA: string, userB: string): ConversazioneRecord | undefined;
  getConversazioneById(id: string): ConversazioneRecord | undefined;
  listConversazioniForUser(userId: string): ConversazioneSummary[];
  isMember(conversazioneId: string, userId: string): boolean;
  getMembers(conversazioneId: string): AuthorView[];
  insertMessaggio(record: {
    id: string;
    conversazioneId: string;
    senderUserId: string;
    senderDeviceId: string;
    busta: string;
    createdAt: string;
  }): MessaggioRecord;
  listMessaggi(
    conversazioneId: string,
    options?: { limit?: number | undefined; before?: string | undefined },
  ): MessaggioRecord[];
  markRead(conversazioneId: string, userId: string, finoA: string): void;
  deleteConversazione(conversazioneId: string): void;
  clearMessaggi(conversazioneId: string): void;
}

export class SqliteMessaggiRepository implements MessaggiRepository {
  constructor(private readonly db: DatabaseSync) {}

  createConversazione(record: {
    id: string;
    tipo: ConversazioneTipo;
    createdAt: string;
    membri: string[];
  }): ConversazioneRecord {
    this.db
      .prepare(
        `INSERT INTO conversazioni (id, tipo, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(record.id, record.tipo, record.createdAt);

    const stmtMembro = this.db.prepare(
      `INSERT INTO conversazione_membri (conversazione_id, user_id, joined_at)
       VALUES (?, ?, ?)`,
    );

    for (const userId of record.membri) {
      stmtMembro.run(record.id, userId, record.createdAt);
    }

    return {
      id: record.id,
      tipo: record.tipo,
      createdAt: record.createdAt,
    };
  }

  findDirectConversazione(userA: string, userB: string): ConversazioneRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id, c.tipo, c.created_at
         FROM conversazioni c
         JOIN conversazione_membri m1 ON m1.conversazione_id = c.id AND m1.user_id = ?
         JOIN conversazione_membri m2 ON m2.conversazione_id = c.id AND m2.user_id = ?
         WHERE c.tipo = 'diretta'
         LIMIT 1`,
      )
      .get(userA, userB) as
      | {
          id: string;
          tipo: ConversazioneTipo;
          created_at: string;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      tipo: row.tipo,
      createdAt: row.created_at,
    };
  }

  getConversazioneById(id: string): ConversazioneRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, tipo, created_at
         FROM conversazioni
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          tipo: ConversazioneTipo;
          created_at: string;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      tipo: row.tipo,
      createdAt: row.created_at,
    };
  }

  isMember(conversazioneId: string, userId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM conversazione_membri
         WHERE conversazione_id = ? AND user_id = ?`,
      )
      .get(conversazioneId, userId);
    return row !== undefined;
  }

  getMembers(conversazioneId: string): AuthorView[] {
    const rows = this.db
      .prepare(
        `SELECT u.id, u.username, u.display_name
         FROM conversazione_membri cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.conversazione_id = ?
         ORDER BY cm.joined_at ASC`,
      )
      .all(conversazioneId) as Array<{
      id: string;
      username: string;
      display_name: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
    }));
  }

  listConversazioniForUser(userId: string): ConversazioneSummary[] {
    const convRows = this.db
      .prepare(
        `SELECT c.id, c.tipo, c.created_at
         FROM conversazioni c
         JOIN conversazione_membri cm ON cm.conversazione_id = c.id
         WHERE cm.user_id = ?
         ORDER BY (
           SELECT COALESCE(MAX(m.created_at), c.created_at)
           FROM messaggi m
           WHERE m.conversazione_id = c.id
         ) DESC`,
      )
      .all(userId) as Array<{
      id: string;
      tipo: ConversazioneTipo;
      created_at: string;
    }>;

    const result: ConversazioneSummary[] = [];

    for (const conv of convRows) {
      const membri = this.getMembers(conv.id);

      const ultimoMsg = this.db
        .prepare(
          `SELECT id, sender_user_id, created_at
           FROM messaggi
           WHERE conversazione_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(conv.id) as { id: string; sender_user_id: string; created_at: string } | undefined;

      const vistoRow = this.db
        .prepare(
          `SELECT visto_fino_a
           FROM conversazione_viste
           WHERE conversazione_id = ? AND user_id = ?`,
        )
        .get(conv.id, userId) as { visto_fino_a: string } | undefined;

      const vistoFinoA = vistoRow ? vistoRow.visto_fino_a : "";

      const nonLettiRow = this.db
        .prepare(
          `SELECT COUNT(*) as count
           FROM messaggi
           WHERE conversazione_id = ?
             AND sender_user_id != ?
             AND created_at > ?`,
        )
        .get(conv.id, userId, vistoFinoA) as { count: number };

      result.push({
        conversazione: {
          id: conv.id,
          tipo: conv.tipo,
          createdAt: conv.created_at,
        },
        membri,
        ultimoMessaggio: ultimoMsg
          ? {
              id: ultimoMsg.id,
              senderUserId: ultimoMsg.sender_user_id,
              createdAt: ultimoMsg.created_at,
            }
          : undefined,
        nonLetti: nonLettiRow.count,
      });
    }

    return result;
  }

  insertMessaggio(record: {
    id: string;
    conversazioneId: string;
    senderUserId: string;
    senderDeviceId: string;
    busta: string;
    createdAt: string;
  }): MessaggioRecord {
    this.db
      .prepare(
        `INSERT INTO messaggi (id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        record.id,
        record.conversazioneId,
        record.senderUserId,
        record.senderDeviceId,
        record.busta,
        record.createdAt,
      );

    return {
      ...record,
      consegnatoAt: null,
    };
  }

  listMessaggi(
    conversazioneId: string,
    options: { limit?: number; before?: string } = {},
  ): MessaggioRecord[] {
    const limit = options.limit ?? 50;

    let rows: Array<{
      id: string;
      conversazione_id: string;
      sender_user_id: string;
      sender_device_id: string;
      busta: string;
      created_at: string;
      consegnato_at: string | null;
    }>;

    if (options.before) {
      rows = this.db
        .prepare(
          `SELECT id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at
           FROM messaggi
           WHERE conversazione_id = ? AND created_at < ?
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .all(conversazioneId, options.before, limit) as typeof rows;
    } else {
      rows = this.db
        .prepare(
          `SELECT id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at
           FROM messaggi
           WHERE conversazione_id = ?
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .all(conversazioneId, limit) as typeof rows;
    }

    return rows.map((r) => ({
      id: r.id,
      conversazioneId: r.conversazione_id,
      senderUserId: r.sender_user_id,
      senderDeviceId: r.sender_device_id,
      busta: r.busta,
      createdAt: r.created_at,
      consegnatoAt: r.consegnato_at,
    }));
  }

  markRead(conversazioneId: string, userId: string, finoA: string): void {
    this.db
      .prepare(
        `INSERT INTO conversazione_viste (conversazione_id, user_id, visto_fino_a)
         VALUES (?, ?, ?)
         ON CONFLICT (conversazione_id, user_id) DO UPDATE SET
           visto_fino_a = MAX(conversazione_viste.visto_fino_a, excluded.visto_fino_a)`,
      )
      .run(conversazioneId, userId, finoA);
  }

  deleteConversazione(conversazioneId: string): void {
    this.db.prepare(`DELETE FROM conversazioni WHERE id = ?`).run(conversazioneId);
  }

  clearMessaggi(conversazioneId: string): void {
    this.db.prepare(`DELETE FROM messaggi WHERE conversazione_id = ?`).run(conversazioneId);
  }
}
