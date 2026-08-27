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

export interface MessaggioInUscitaRecord {
  id: string;
  messaggioId: string;
  conversazioneId: string;
  senderUserId: string;
  senderUsername: string;
  senderDeviceId: string;
  destinatarioChiave: string;
  destinatarioUsername: string;
  busta: string;
  tentativi: number;
  prossimoInvio: string;
  createdAt: string;
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
  insertMessaggioInUscita(record: {
    id: string;
    messaggioId: string;
    destinatarioChiave: string;
    busta: string;
    prossimoInvio: string;
    createdAt: string;
  }): void;
  listMessaggiInUscitaPending(now: string, limit?: number): MessaggioInUscitaRecord[];
  incrementaTentativiMessaggioInUscita(id: string, prossimoInvio: string): void;
  deleteMessaggioInUscita(id: string): void;
  /**
   * Rimette in partenza la coda verso una casa che è appena tornata
   * ([ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §4).
   *
   * Tocca **solo** i messaggi che aspettano nel futuro: quelli già scaduti sono
   * di competenza del drenaggio, e riscriverli sarebbe un modo di rimetterli in
   * fondo alla fila. I tentativi tornano a zero perché il motivo per cui erano
   * falliti non c'è più: un arretramento ereditato punirebbe il messaggio per
   * un guasto finito. Ritorna quante righe si sono mosse.
   */
  risvegliaMessaggiInUscitaPer(destinatarioChiave: string, now: string): number;

  /** Marca come consegnati tutti i messaggi non miei che non lo sono ancora. */
  markDelivered(conversazioneId: string, excludeUserId: string, now: string): void;
  /** Marca un singolo messaggio come consegnato (usato dall'OutboxDrainer). */
  markDeliveredById(messaggioId: string, consegnatoAt: string): void;
  /** Recupera un singolo messaggio per ID. */
  getMessaggioById(id: string): MessaggioRecord | undefined;
  /** Ritorna il timestamp `visto_fino_a` di un utente per una conversazione. */
  getVistoFinoA(conversazioneId: string, userId: string): string | null;

  /** Il `GroupInfo` conservato per una conversazione, se c'e' (ADR 0038). */
  getGroupInfo(conversazioneId: string): GroupInfoRecord | undefined;
  /**
   * Deposita un `GroupInfo`, ma **solo se non fa tornare indietro l'epoch**.
   * Ritorna `false` se quello presente e' piu' avanti: chi rientra deve trovare
   * il presente del gruppo, non un suo passato.
   */
  putGroupInfo(record: {
    conversazioneId: string;
    epoch: number;
    groupInfo: string;
    updatedAt: string;
    updatedBy: string;
  }): boolean;

  /** Il mazzo delle chiavi d'archivio, avvolto (ADR 0037, spike S2). */
  getMazzoArchivio(conversazioneId: string): MazzoArchivioRecord | undefined;
  /** Come `putGroupInfo`: si accetta solo se non fa tornare indietro l'epoch. */
  putMazzoArchivio(record: {
    conversazioneId: string;
    epoch: number;
    mazzo: string;
    updatedAt: string;
    updatedBy: string;
  }): boolean;
  /** Deposita voci d'archivio, ignorando quelle gia' presenti. Ritorna quante ne ha scritte. */
  insertVociArchivio(conversazioneId: string, voci: readonly VoceArchivioRecord[]): number;
  /** Le voci in ordine di tempo, dalla piu' vecchia. */
  listVociArchivio(
    conversazioneId: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ): VoceArchivioRecord[];

  /** Deposita un handshake MLS (commit o Welcome) — ADR 0038. */
  insertHandshake(
    record: Omit<HandshakeRecord, "seq"> & { conversazioneId: string; destinatario?: string },
  ): void;
  /**
   * Gli handshake che spettano a `userId`: quelli per tutti, piu' i Welcome
   * indirizzati a lui. Chi entra deve trovare il suo Welcome, e nessun altro.
   */
  listHandshakePer(
    conversazioneId: string,
    userId: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ): HandshakeRecord[];
}

/** Una riga di `conversazione_handshake`. La busta resta opaca. */
export interface HandshakeRecord {
  /** L'ordine di arrivo assegnato dall'istanza. E' anche il cursore. */
  seq: number;
  id: string;
  tipo: "commit" | "welcome";
  epoch: number;
  busta: string;
  createdAt: string;
}

/**
 * Un cursore che non perde righe.
 *
 * `created_at` da solo non basta: due righe scritte nello stesso millisecondo
 * hanno lo stesso istante, e un `created_at > ?` le salterebbe entrambe. Il
 * cursore porta quindi anche l'`id`, che e' la stessa coppia dell'`ORDER BY`.
 */
export function codificaCursore(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function decodificaCursore(cursore: string): { createdAt: string; id: string } {
  const taglio = cursore.indexOf("|");
  return taglio === -1
    ? { createdAt: cursore, id: "" }
    : { createdAt: cursore.slice(0, taglio), id: cursore.slice(taglio + 1) };
}

/** Una riga di `conversazione_archivio_chiavi`. Il mazzo resta opaco. */
export interface MazzoArchivioRecord {
  conversazioneId: string;
  epoch: number;
  mazzo: string;
  updatedAt: string;
  updatedBy: string;
}

/** Una riga di `archivio_voci`. La busta resta opaca. */
export interface VoceArchivioRecord {
  id: string;
  chiaveN: number;
  busta: string;
  createdAt: string;
}

/** Una riga di `conversazione_group_info`. Il blob resta opaco. */
export interface GroupInfoRecord {
  conversazioneId: string;
  epoch: number;
  groupInfo: string;
  updatedAt: string;
  updatedBy: string;
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
        `SELECT cm.user_id, u.username, u.display_name
         FROM conversazione_membri cm
         LEFT JOIN users u ON u.id = cm.user_id
         WHERE cm.conversazione_id = ?
         ORDER BY cm.joined_at ASC`,
      )
      .all(conversazioneId) as Array<{
      user_id: string;
      username: string | null;
      display_name: string | null;
    }>;

    return rows.map((r) => {
      if (r.username !== null && r.display_name !== null) {
        return {
          id: r.user_id,
          username: r.username,
          displayName: r.display_name,
        };
      }
      if (r.user_id.startsWith("remote:")) {
        const parts = r.user_id.split(":");
        const username = parts.slice(2).join(":") || parts[1] || "remoto";
        return {
          id: r.user_id,
          username,
          displayName: username,
        };
      }
      return {
        id: r.user_id,
        username: r.user_id,
        displayName: r.user_id,
      };
    });
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

  getMessaggioById(id: string): MessaggioRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at
         FROM messaggi
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          conversazione_id: string;
          sender_user_id: string;
          sender_device_id: string;
          busta: string;
          created_at: string;
          consegnato_at: string | null;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      conversazioneId: row.conversazione_id,
      senderUserId: row.sender_user_id,
      senderDeviceId: row.sender_device_id,
      busta: row.busta,
      createdAt: row.created_at,
      consegnatoAt: row.consegnato_at,
    };
  }

  insertMessaggioInUscita(record: {
    id: string;
    messaggioId: string;
    destinatarioChiave: string;
    busta: string;
    prossimoInvio: string;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO messaggi_in_uscita (id, messaggio_id, destinatario_chiave, busta, tentativi, prossimo_invio, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        record.id,
        record.messaggioId,
        record.destinatarioChiave,
        record.busta,
        record.prossimoInvio,
        record.createdAt,
      );
  }

  listMessaggiInUscitaPending(now: string, limit = 20): MessaggioInUscitaRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           o.id,
           o.messaggio_id,
           o.destinatario_chiave,
           o.busta,
           o.tentativi,
           o.prossimo_invio,
           o.created_at,
           COALESCE(m.conversazione_id, '') AS conversazione_id,
           COALESCE(m.sender_user_id, '') AS sender_user_id,
           COALESCE(NULLIF(m.sender_device_id, ''), 'default-device') AS sender_device_id,
           COALESCE(u.username, m.sender_user_id, '') AS sender_username,
           (
             SELECT cm.user_id 
             FROM conversazione_membri cm 
             WHERE cm.conversazione_id = m.conversazione_id 
               AND cm.user_id LIKE 'remote:%'
             LIMIT 1
           ) AS remote_member_id
         FROM messaggi_in_uscita o
         LEFT JOIN messaggi m ON m.id = o.messaggio_id
         LEFT JOIN users u ON u.id = m.sender_user_id
         WHERE o.prossimo_invio <= ?
         ORDER BY o.prossimo_invio ASC
         LIMIT ?`,
      )
      .all(now, limit) as Array<{
      id: string;
      messaggio_id: string;
      destinatario_chiave: string;
      busta: string;
      tentativi: number;
      prossimo_invio: string;
      created_at: string;
      conversazione_id: string;
      sender_user_id: string;
      sender_device_id: string;
      sender_username: string;
      remote_member_id: string | null;
    }>;

    return rows.map((r) => {
      let destinatarioUsername = "destinatario";
      if (r.remote_member_id) {
        const parts = r.remote_member_id.split(":");
        destinatarioUsername = parts.slice(2).join(":") || parts[1] || "destinatario";
      }
      return {
        id: r.id,
        messaggioId: r.messaggio_id,
        conversazioneId: r.conversazione_id,
        senderUserId: r.sender_user_id,
        senderUsername: r.sender_username,
        senderDeviceId: r.sender_device_id,
        destinatarioChiave: r.destinatario_chiave,
        destinatarioUsername,
        busta: r.busta,
        tentativi: r.tentativi,
        prossimoInvio: r.prossimo_invio,
        createdAt: r.created_at,
      };
    });
  }

  incrementaTentativiMessaggioInUscita(id: string, prossimoInvio: string): void {
    this.db
      .prepare(
        `UPDATE messaggi_in_uscita
         SET tentativi = tentativi + 1, prossimo_invio = ?
         WHERE id = ?`,
      )
      .run(prossimoInvio, id);
  }

  deleteMessaggioInUscita(id: string): void {
    this.db.prepare(`DELETE FROM messaggi_in_uscita WHERE id = ?`).run(id);
  }

  risvegliaMessaggiInUscitaPer(destinatarioChiave: string, now: string): number {
    const esito = this.db
      .prepare(
        `UPDATE messaggi_in_uscita
         SET prossimo_invio = ?, tentativi = 0
         WHERE destinatario_chiave = ?
           AND prossimo_invio > ?`,
      )
      .run(now, destinatarioChiave, now);

    return Number(esito.changes ?? 0);
  }

  markDelivered(conversazioneId: string, excludeUserId: string, now: string): void {
    this.db
      .prepare(
        `UPDATE messaggi
         SET consegnato_at = ?
         WHERE conversazione_id = ?
           AND sender_user_id != ?
           AND consegnato_at IS NULL`,
      )
      .run(now, conversazioneId, excludeUserId);
  }

  markDeliveredById(messaggioId: string, consegnatoAt: string): void {
    this.db
      .prepare(
        `UPDATE messaggi
         SET consegnato_at = ?
         WHERE id = ?
           AND consegnato_at IS NULL`,
      )
      .run(consegnatoAt, messaggioId);
  }

  getVistoFinoA(conversazioneId: string, userId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT visto_fino_a
         FROM conversazione_viste
         WHERE conversazione_id = ? AND user_id = ?`,
      )
      .get(conversazioneId, userId) as { visto_fino_a: string } | undefined;
    return row?.visto_fino_a ?? null;
  }

  public getGroupInfo(conversazioneId: string): GroupInfoRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT conversazione_id, epoch, group_info, updated_at, updated_by
           FROM conversazione_group_info WHERE conversazione_id = ?`,
      )
      .get(conversazioneId) as
      | {
          conversazione_id: string;
          epoch: number;
          group_info: string;
          updated_at: string;
          updated_by: string;
        }
      | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      conversazioneId: row.conversazione_id,
      epoch: row.epoch,
      groupInfo: row.group_info,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  public putGroupInfo(record: {
    conversazioneId: string;
    epoch: number;
    groupInfo: string;
    updatedAt: string;
    updatedBy: string;
  }): boolean {
    // `WHERE epoch <= excluded.epoch` e' la regola, ed e' in SQL apposta: due
    // client che depositano insieme non possono far vincere il piu' vecchio.
    const esito = this.db
      .prepare(
        `INSERT INTO conversazione_group_info
           (conversazione_id, epoch, group_info, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (conversazione_id) DO UPDATE SET
           epoch = excluded.epoch,
           group_info = excluded.group_info,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by
         WHERE conversazione_group_info.epoch <= excluded.epoch`,
      )
      .run(
        record.conversazioneId,
        record.epoch,
        record.groupInfo,
        record.updatedAt,
        record.updatedBy,
      );

    return esito.changes > 0;
  }

  public getMazzoArchivio(conversazioneId: string): MazzoArchivioRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT conversazione_id, epoch, mazzo, updated_at, updated_by
           FROM conversazione_archivio_chiavi WHERE conversazione_id = ?`,
      )
      .get(conversazioneId) as
      | {
          conversazione_id: string;
          epoch: number;
          mazzo: string;
          updated_at: string;
          updated_by: string;
        }
      | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      conversazioneId: row.conversazione_id,
      epoch: row.epoch,
      mazzo: row.mazzo,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  public putMazzoArchivio(record: {
    conversazioneId: string;
    epoch: number;
    mazzo: string;
    updatedAt: string;
    updatedBy: string;
  }): boolean {
    const esito = this.db
      .prepare(
        `INSERT INTO conversazione_archivio_chiavi
           (conversazione_id, epoch, mazzo, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (conversazione_id) DO UPDATE SET
           epoch = excluded.epoch,
           mazzo = excluded.mazzo,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by
         WHERE conversazione_archivio_chiavi.epoch <= excluded.epoch`,
      )
      .run(record.conversazioneId, record.epoch, record.mazzo, record.updatedAt, record.updatedBy);

    return esito.changes > 0;
  }

  public insertVociArchivio(conversazioneId: string, voci: readonly VoceArchivioRecord[]): number {
    // `DO NOTHING`: depositare due volte la stessa voce non e' un errore, e non
    // duplica. Due dispositivi che archiviano la stessa conversazione devono
    // poterlo fare senza coordinarsi.
    const inserisci = this.db.prepare(
      `INSERT INTO archivio_voci (conversazione_id, id, chiave_n, busta, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (conversazione_id, id) DO NOTHING`,
    );

    let scritte = 0;
    this.db.exec("BEGIN");
    try {
      for (const voce of voci) {
        // `changes` e' `number | bigint` in node:sqlite: qui vale 0 o 1.
        scritte += Number(
          inserisci.run(conversazioneId, voce.id, voce.chiaveN, voce.busta, voce.createdAt).changes,
        );
      }
      this.db.exec("COMMIT");
    } catch (causa) {
      this.db.exec("ROLLBACK");
      throw causa;
    }

    return scritte;
  }

  public listVociArchivio(
    conversazioneId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): VoceArchivioRecord[] {
    const limit = options.limit ?? 100;
    const dopo = options.dopo === undefined ? undefined : decodificaCursore(options.dopo);
    const rows = (
      dopo === undefined
        ? this.db
            .prepare(
              `SELECT id, chiave_n, busta, created_at FROM archivio_voci
                 WHERE conversazione_id = ?
                 ORDER BY created_at ASC, id ASC LIMIT ?`,
            )
            .all(conversazioneId, limit)
        : this.db
            .prepare(
              `SELECT id, chiave_n, busta, created_at FROM archivio_voci
                 WHERE conversazione_id = ?
                   AND (created_at > ? OR (created_at = ? AND id > ?))
                 ORDER BY created_at ASC, id ASC LIMIT ?`,
            )
            .all(conversazioneId, dopo.createdAt, dopo.createdAt, dopo.id, limit)
    ) as { id: string; chiave_n: number; busta: string; created_at: string }[];

    return rows.map((row) => ({
      busta: row.busta,
      chiaveN: row.chiave_n,
      createdAt: row.created_at,
      id: row.id,
    }));
  }

  public insertHandshake(
    record: Omit<HandshakeRecord, "seq"> & { conversazioneId: string; destinatario?: string },
  ): void {
    this.db
      .prepare(
        `INSERT INTO conversazione_handshake
           (id, conversazione_id, epoch, tipo, destinatario, busta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.conversazioneId,
        record.epoch,
        record.tipo,
        record.destinatario ?? null,
        record.busta,
        record.createdAt,
      );
  }

  public listHandshakePer(
    conversazioneId: string,
    userId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): HandshakeRecord[] {
    const limit = options.limit ?? 100;
    // Il cursore e' il `rowid`: ordine di ARRIVO, non di tempo. Due commit
    // scritti nello stesso millisecondo escono nell'ordine in cui sono entrati,
    // perche' MLS li applica in sequenza.
    const dopo = options.dopo === undefined ? 0 : Number(options.dopo);
    // `destinatario IS NULL` = per tutti; altrimenti solo il suo.
    const rows = this.db
      .prepare(
        `SELECT seq, id, tipo, epoch, busta, created_at FROM conversazione_handshake
           WHERE conversazione_id = ? AND (destinatario IS NULL OR destinatario = ?)
             AND seq > ?
           ORDER BY seq ASC LIMIT ?`,
      )
      .all(conversazioneId, userId, Number.isFinite(dopo) ? dopo : 0, limit) as {
      seq: number;
      id: string;
      tipo: string;
      epoch: number;
      busta: string;
      created_at: string;
    }[];

    return rows.map((row) => ({
      busta: row.busta,
      createdAt: row.created_at,
      epoch: row.epoch,
      id: row.id,
      seq: row.seq,
      tipo: row.tipo as "commit" | "welcome",
    }));
  }
}
