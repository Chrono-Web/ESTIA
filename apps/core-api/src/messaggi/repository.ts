import type { DatabaseSync } from "node:sqlite";
import type { AuthorView, ConversazioneTipo, VoceArchivioInput } from "@estia/contracts";

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
    /** La casa che mette in fila i commit (ADR 0042 §3). Assente = questa casa. */
    casaCheOrdina?: string | undefined;
  }): ConversazioneRecord;
  /**
   * Chi mette in fila i commit di questa conversazione (ADR 0042 §3).
   *
   * `null` vuol dire **questa casa**, e `undefined` che la conversazione non
   * c'è. Sono due risposte diverse e vanno tenute diverse: la prima autorizza a
   * scrivere nella coda, la seconda è un 404.
   */
  casaCheOrdina(conversazioneId: string): string | null | undefined;
  /**
   * La conversazione ha fra i membri qualcuno della casa `remoteKey`?
   *
   * È la regola di [ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §2,
   * e si risponde **in locale**: nessuna casa può infilare buste in una
   * conversazione a cui non partecipa, e non serve chiedere niente a nessuno
   * per saperlo.
   */
  haMembroDiCasa(conversazioneId: string, remoteKey: string): boolean;
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
  /** Solo retry identici dello stesso autore; undefined su conflitto, senza scritture parziali. */
  insertVociArchivio(
    conversazioneId: string,
    autoreId: string,
    voci: readonly VoceArchivioInput[],
  ): number | undefined;
  /**
   * I segnaposto che questa casa **custodisce**: le voci dei suoi autori dopo
   * un progressivo, con il nome dell'autore e l'ultimo progressivo assegnato
   * ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §4.1).
   */
  listSegnapostiCustoditi(
    conversazioneId: string,
    dopo: number,
    limit: number,
  ): { voci: SegnapostoCustodito[]; ultimoSeq: number };
  /** I segnaposto custoditi con questi id: quelli appena depositati, da spingere. */
  segnapostiCustoditiPerId(conversazioneId: string, ids: readonly string[]): SegnapostoCustodito[];
  /** Il cursore di chi riceve per una casa custode, se ce n'è uno. */
  cursoreSegnaposti(
    conversazioneId: string,
    casaCustode: string,
  ): { cursore: number; riconciliatoIl: string | null } | undefined;
  /**
   * Applica una finestra dichiarata dalla casa custode (§4.1): dentro
   * `(da-1, a]` quello che non è elencato **non esiste**, e si cancella.
   *
   * `false` su conflitto — un id già noto che torna con un altro mittente, un
   * altro orario o un altro progressivo — e allora non si scrive niente.
   */
  applicaFinestraSegnaposti(
    conversazioneId: string,
    casaCustode: string,
    finestra: { da: number; a: number; voci: readonly SegnapostoInput[] },
    ricevutoIl: string,
  ): boolean;
  /**
   * I segnaposto **spinti** dalla casa custode. Si accettano solo sopra il
   * cursore, e non lo muovono: la spinta serve a non aspettare, e la verità
   * della finestra la dice sempre la richiesta.
   */
  inserisciSegnapostiSpinti(
    conversazioneId: string,
    casaCustode: string,
    voci: readonly SegnapostoInput[],
    ricevutoIl: string,
  ): boolean;
  /** I segnaposto di una conversazione, nell'ordine in cui si leggono. */
  listSegnaposti(conversazioneId: string): SegnapostoRecord[];
  /** Via un segnaposto: la casa custode ha detto che quel messaggio non c'è. */
  cancellaSegnaposto(conversazioneId: string, casaCustode: string, id: string): void;
  /**
   * L'indice delle voci di questa casa: id, orario e autore, **senza** la busta.
   * Serve a ricomporre la cronologia senza caricare contenuti che la pagina non
   * mostra.
   */
  indiceVociArchivio(
    conversazioneId: string,
  ): { id: string; createdAt: string; autore: string | null }[];
  /** Le voci con questi id; con `soloAttribuite`, solo quelle con un autore di qui. */
  vociArchivioPerId(
    conversazioneId: string,
    ids: readonly string[],
    soloAttribuite: boolean,
  ): VoceArchivioRecord[];
  /**
   * Il ritiro (ADR 0043 §2): via la voce, **solo** se è di quell'autore. Il
   * posto nel progressivo resta vuoto.
   */
  ritiraVoce(conversazioneId: string, autoreId: string, id: string): boolean;
  /** Le case con almeno un membro nella conversazione. */
  caseDellaConversazione(conversazioneId: string): string[];
  /** Questa casa ha almeno un membro in una qualunque conversazione di qui? */
  casaPartecipa(remoteKey: string): boolean;

  /** Le voci in ordine di tempo, dalla piu' vecchia. */
  listVociArchivio(
    conversazioneId: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ): VoceArchivioRecord[];

  /**
   * Deposita un handshake MLS (commit o Welcome) — ADR 0038.
   *
   * **Un commit si accetta solo se porta un'epoch più alta di ogni commit già
   * in fila** ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §3).
   * Due commit che creano la stessa epoch sono una corsa: il primo entra, il
   * secondo torna `false` e chi l'ha scritto lo rifà sull'epoch nuova. Senza
   * questo controllo la fila sola non basterebbe — accetterebbe entrambi, e
   * ogni client ne applicherebbe uno scoprendo solo dopo che l'altro non si
   * apre più.
   */
  insertHandshake(
    record: Omit<HandshakeRecord, "seq"> & { conversazioneId: string; destinatario?: string },
  ): boolean;
  /**
   * Gli handshake che spettano a `userId`: quelli per tutti, piu' i Welcome
   * indirizzati a lui. Chi entra deve trovare il suo Welcome, e nessun altro.
   */
  listHandshakePer(
    conversazioneId: string,
    userId: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ): HandshakeRecord[];
  /**
   * La stessa coda, per una **casa**: i commit, più i Welcome indirizzati a un
   * suo membro.
   *
   * Un Welcome è per chi entra e per nessun altro, e una casa non è una
   * persona: quello che attraversa sono i Welcome dei suoi, non quelli di tutti.
   */
  listHandshakePerCasa(
    conversazioneId: string,
    remoteKey: string,
    options?: { limit?: number | undefined; dopo?: string | undefined },
  ): HandshakeRecord[];
}

/** Una voce di un autore di questa casa, vista come segnaposto. */
export interface SegnapostoCustodito {
  id: string;
  /** Il nome dell'autore **su questa casa**: la casa la aggiunge chi risponde. */
  autore: string;
  createdAt: string;
  seq: number;
}

/** Un segnaposto come arriva da una casa custode. */
export interface SegnapostoInput {
  id: string;
  /** `username@casa`, la forma della credenziale MLS (ADR 0042 §0). */
  mittente: string;
  inviatoIl: string;
  seq: number;
}

/** Un segnaposto conservato da chi riceve: i sette campi di §4.1. */
export interface SegnapostoRecord extends SegnapostoInput {
  conversazioneId: string;
  casaCustode: string;
  ricevutoIl: string;
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
/**
 * Una chiave d'istanza dentro un `LIKE` va protetta: `_` e `%` lì dentro
 * vorrebbero dire «qualunque carattere», e una chiave che li contenesse
 * finirebbe per corrispondere ai membri di case che non sono la sua.
 */
function escapeLike(valore: string): string {
  return valore.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
  autoreId: string | null;
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
    casaCheOrdina?: string | undefined;
  }): ConversazioneRecord {
    this.db
      .prepare(
        `INSERT INTO conversazioni (id, tipo, created_at, casa_che_ordina)
         VALUES (?, ?, ?, ?)`,
      )
      .run(record.id, record.tipo, record.createdAt, record.casaCheOrdina ?? null);

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
    // Gli eventi di una conversazione vengono da tre posti, e l'elenco li deve
    // vedere tutti: le buste di `ESTIA-E2E-v1` (`messaggi`), le voci che i
    // membri di questa casa hanno scritto (`archivio_voci`), e i segnaposto di
    // chi abita altrove (`segnaposti`). Degli ultimi due si usano soltanto chi
    // e quando — gli stessi dati che il segnaposto porta (ADR 0042 §4.1) —
    // mai un contenuto. Senza, una chat MLS sembrerebbe sempre vuota e senza
    // novità.
    const eventi = `
      SELECT conversazione_id, id, sender_user_id AS mittente_id, created_at FROM messaggi
      UNION ALL
      SELECT conversazione_id, id, autore_id AS mittente_id, created_at
        FROM archivio_voci WHERE autore_id IS NOT NULL
      UNION ALL
      SELECT conversazione_id, id,
             'remote:' || casa_custode || ':' ||
               substr(mittente, 1, length(mittente) - length(casa_custode) - 1) AS mittente_id,
             inviato_il AS created_at
        FROM segnaposti`;

    const convRows = this.db
      .prepare(
        `WITH eventi AS (${eventi})
         SELECT c.id, c.tipo, c.created_at
         FROM conversazioni c
         JOIN conversazione_membri cm ON cm.conversazione_id = c.id
         WHERE cm.user_id = ?
         ORDER BY (
           SELECT COALESCE(MAX(e.created_at), c.created_at)
           FROM eventi e
           WHERE e.conversazione_id = c.id
         ) DESC`,
      )
      .all(userId) as Array<{
      id: string;
      tipo: ConversazioneTipo;
      created_at: string;
    }>;

    const ultimo = this.db.prepare(
      `WITH eventi AS (${eventi})
       SELECT id, mittente_id, created_at FROM eventi
       WHERE conversazione_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    );
    const visto = this.db.prepare(
      `SELECT visto_fino_a FROM conversazione_viste WHERE conversazione_id = ? AND user_id = ?`,
    );
    const nonLetti = this.db.prepare(
      `WITH eventi AS (${eventi})
       SELECT COUNT(*) as count FROM eventi
       WHERE conversazione_id = ? AND mittente_id != ? AND created_at > ?`,
    );

    const result: ConversazioneSummary[] = [];

    for (const conv of convRows) {
      const membri = this.getMembers(conv.id);

      const ultimoMsg = ultimo.get(conv.id) as
        { id: string; mittente_id: string; created_at: string } | undefined;

      const vistoRow = visto.get(conv.id, userId) as { visto_fino_a: string } | undefined;
      const vistoFinoA = vistoRow ? vistoRow.visto_fino_a : "";

      const nonLettiRow = nonLetti.get(conv.id, userId, vistoFinoA) as { count: number };

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
              senderUserId: ultimoMsg.mittente_id,
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

  public insertVociArchivio(
    conversazioneId: string,
    autoreId: string,
    voci: readonly VoceArchivioInput[],
  ): number | undefined {
    const esistente = this.db.prepare(
      `SELECT autore_id, chiave_n, busta, created_at FROM archivio_voci
       WHERE conversazione_id = ? AND id = ?`,
    );
    const inserisci = this.db.prepare(
      `INSERT INTO archivio_voci (conversazione_id, id, chiave_n, busta, created_at, autore_id, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    // Il progressivo del segnaposto (ADR 0042 §4.1), da un contatore che non
    // torna indietro: un posto lasciato vuoto da un ritiro resta vuoto.
    const prossimoSeq = this.db.prepare(
      `INSERT INTO archivio_contatori (conversazione_id, ultimo_seq) VALUES (?, 1)
       ON CONFLICT (conversazione_id) DO UPDATE SET ultimo_seq = ultimo_seq + 1
       RETURNING ultimo_seq`,
    );

    let scritte = 0;
    this.db.exec("BEGIN");
    try {
      for (const voce of voci) {
        const presente = esistente.get(conversazioneId, voce.id) as
          | { autore_id: string | null; chiave_n: number; busta: string; created_at: string }
          | undefined;
        if (presente !== undefined) {
          // L'id da solo non dimostra un retry: un altro autore o altri byte
          // sono un conflitto. Il pregresso NULL non si reclama per somiglianza.
          if (
            presente.autore_id !== autoreId ||
            presente.chiave_n !== voce.chiaveN ||
            presente.busta !== voce.busta ||
            presente.created_at !== voce.createdAt
          ) {
            this.db.exec("ROLLBACK");
            return undefined;
          }
          continue;
        }
        const { ultimo_seq: seq } = prossimoSeq.get(conversazioneId) as { ultimo_seq: number };
        scritte += Number(
          inserisci.run(
            conversazioneId,
            voce.id,
            voce.chiaveN,
            voce.busta,
            voce.createdAt,
            autoreId,
            seq,
          ).changes,
        );
      }
      this.db.exec("COMMIT");
    } catch (causa) {
      this.db.exec("ROLLBACK");
      throw causa;
    }

    return scritte;
  }

  public listSegnapostiCustoditi(
    conversazioneId: string,
    dopo: number,
    limit: number,
  ): { voci: SegnapostoCustodito[]; ultimoSeq: number } {
    const voci = this.db
      .prepare(
        `SELECT v.id, u.username, v.created_at, v.seq
           FROM archivio_voci v JOIN users u ON u.id = v.autore_id
           WHERE v.conversazione_id = ? AND v.seq IS NOT NULL AND v.seq > ?
           ORDER BY v.seq ASC LIMIT ?`,
      )
      .all(conversazioneId, dopo, limit) as {
      id: string;
      username: string;
      created_at: string;
      seq: number;
    }[];
    const contatore = this.db
      .prepare(`SELECT ultimo_seq FROM archivio_contatori WHERE conversazione_id = ?`)
      .get(conversazioneId) as { ultimo_seq: number } | undefined;

    return {
      ultimoSeq: contatore?.ultimo_seq ?? 0,
      voci: voci.map((v) => ({
        autore: v.username,
        createdAt: v.created_at,
        id: v.id,
        seq: v.seq,
      })),
    };
  }

  public segnapostiCustoditiPerId(
    conversazioneId: string,
    ids: readonly string[],
  ): SegnapostoCustodito[] {
    const leggi = this.db.prepare(
      `SELECT v.id, u.username, v.created_at, v.seq
         FROM archivio_voci v JOIN users u ON u.id = v.autore_id
         WHERE v.conversazione_id = ? AND v.id = ? AND v.seq IS NOT NULL`,
    );

    const voci: SegnapostoCustodito[] = [];
    for (const id of ids) {
      const v = leggi.get(conversazioneId, id) as
        { id: string; username: string; created_at: string; seq: number } | undefined;
      if (v !== undefined) {
        voci.push({ autore: v.username, createdAt: v.created_at, id: v.id, seq: v.seq });
      }
    }

    return voci.sort((a, b) => a.seq - b.seq);
  }

  public cursoreSegnaposti(
    conversazioneId: string,
    casaCustode: string,
  ): { cursore: number; riconciliatoIl: string | null } | undefined {
    const row = this.db
      .prepare(
        `SELECT cursore, riconciliato_il FROM segnaposti_cursori
           WHERE conversazione_id = ? AND casa_custode = ?`,
      )
      .get(conversazioneId, casaCustode) as
      { cursore: number; riconciliato_il: string | null } | undefined;

    return row === undefined
      ? undefined
      : { cursore: row.cursore, riconciliatoIl: row.riconciliato_il };
  }

  public applicaFinestraSegnaposti(
    conversazioneId: string,
    casaCustode: string,
    finestra: { da: number; a: number; voci: readonly SegnapostoInput[] },
    ricevutoIl: string,
  ): boolean {
    this.db.exec("BEGIN");
    try {
      if (!this.#scriviSegnaposti(conversazioneId, casaCustode, finestra.voci, ricevutoIl)) {
        this.db.exec("ROLLBACK");
        return false;
      }

      // Dentro la finestra dichiarata, ciò che non è elencato non esiste. È la
      // regola che fa sparire un ritirato — anche uno rimesso qui da un
      // ripristino — senza lapidi da nessuna parte.
      const elencati = new Set(finestra.voci.map((v) => v.id));
      const presenti = this.db
        .prepare(
          `SELECT id FROM segnaposti
             WHERE conversazione_id = ? AND casa_custode = ? AND seq >= ? AND seq <= ?`,
        )
        .all(conversazioneId, casaCustode, finestra.da, finestra.a) as { id: string }[];
      const cancella = this.db.prepare(
        `DELETE FROM segnaposti WHERE conversazione_id = ? AND casa_custode = ? AND id = ?`,
      );
      for (const { id } of presenti) {
        if (!elencati.has(id)) {
          cancella.run(conversazioneId, casaCustode, id);
        }
      }

      // Una finestra che parte da 1 è una riconciliazione da zero: il cursore
      // prende il suo estremo anche se è più basso, perché è la verità della
      // casa custode e non una stima di chi riceve.
      const daZero = finestra.da <= 1;
      this.db
        .prepare(
          `INSERT INTO segnaposti_cursori (conversazione_id, casa_custode, cursore, riconciliato_il)
             VALUES (?, ?, ?, ?)
           ON CONFLICT (conversazione_id, casa_custode) DO UPDATE SET
             cursore = CASE WHEN ? THEN excluded.cursore ELSE MAX(cursore, excluded.cursore) END,
             riconciliato_il = COALESCE(excluded.riconciliato_il, riconciliato_il)`,
        )
        .run(conversazioneId, casaCustode, finestra.a, daZero ? ricevutoIl : null, daZero ? 1 : 0);

      this.db.exec("COMMIT");
      return true;
    } catch (causa) {
      this.db.exec("ROLLBACK");
      throw causa;
    }
  }

  public inserisciSegnapostiSpinti(
    conversazioneId: string,
    casaCustode: string,
    voci: readonly SegnapostoInput[],
    ricevutoIl: string,
  ): boolean {
    const cursore = this.cursoreSegnaposti(conversazioneId, casaCustode)?.cursore ?? 0;
    // Sotto il cursore la spinta non scrive: là la verità l'ha già detta una
    // finestra, e una spinta vecchia non la può smentire.
    const sopra = voci.filter((v) => v.seq > cursore);

    this.db.exec("BEGIN");
    try {
      if (!this.#scriviSegnaposti(conversazioneId, casaCustode, sopra, ricevutoIl)) {
        this.db.exec("ROLLBACK");
        return false;
      }

      this.db.exec("COMMIT");
      return true;
    } catch (causa) {
      this.db.exec("ROLLBACK");
      throw causa;
    }
  }

  /** Scrive senza duplicare; `false` su conflitto. Va chiamata dentro una transazione. */
  #scriviSegnaposti(
    conversazioneId: string,
    casaCustode: string,
    voci: readonly SegnapostoInput[],
    ricevutoIl: string,
  ): boolean {
    const esistente = this.db.prepare(
      `SELECT mittente, inviato_il, seq FROM segnaposti
         WHERE conversazione_id = ? AND casa_custode = ? AND id = ?`,
    );
    const inserisci = this.db.prepare(
      `INSERT INTO segnaposti
         (conversazione_id, casa_custode, id, mittente, inviato_il, ricevuto_il, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const voce of voci) {
      const presente = esistente.get(conversazioneId, casaCustode, voce.id) as
        { mittente: string; inviato_il: string; seq: number } | undefined;

      if (presente !== undefined) {
        // Un id che cambia significato è l'unico modo che una casa avrebbe per
        // riscrivere il passato di un'altra: si rifiuta, e con lui il lotto.
        if (
          presente.mittente !== voce.mittente ||
          presente.inviato_il !== voce.inviatoIl ||
          presente.seq !== voce.seq
        ) {
          return false;
        }
        continue;
      }

      inserisci.run(
        conversazioneId,
        casaCustode,
        voce.id,
        voce.mittente,
        voce.inviatoIl,
        ricevutoIl,
        voce.seq,
      );
    }

    return true;
  }

  public listSegnaposti(conversazioneId: string): SegnapostoRecord[] {
    const rows = this.db
      .prepare(
        `SELECT casa_custode, id, mittente, inviato_il, ricevuto_il, seq FROM segnaposti
           WHERE conversazione_id = ?
           ORDER BY inviato_il ASC, id ASC`,
      )
      .all(conversazioneId) as {
      casa_custode: string;
      id: string;
      mittente: string;
      inviato_il: string;
      ricevuto_il: string;
      seq: number;
    }[];

    return rows.map((r) => ({
      casaCustode: r.casa_custode,
      conversazioneId,
      id: r.id,
      inviatoIl: r.inviato_il,
      mittente: r.mittente,
      ricevutoIl: r.ricevuto_il,
      seq: r.seq,
    }));
  }

  public cancellaSegnaposto(conversazioneId: string, casaCustode: string, id: string): void {
    this.db
      .prepare(`DELETE FROM segnaposti WHERE conversazione_id = ? AND casa_custode = ? AND id = ?`)
      .run(conversazioneId, casaCustode, id);
  }

  public indiceVociArchivio(
    conversazioneId: string,
  ): { id: string; createdAt: string; autore: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT v.id, v.created_at, u.username
           FROM archivio_voci v LEFT JOIN users u ON u.id = v.autore_id
           WHERE v.conversazione_id = ?`,
      )
      .all(conversazioneId) as { id: string; created_at: string; username: string | null }[];

    return rows.map((r) => ({ autore: r.username, createdAt: r.created_at, id: r.id }));
  }

  public vociArchivioPerId(
    conversazioneId: string,
    ids: readonly string[],
    soloAttribuite: boolean,
  ): VoceArchivioRecord[] {
    const leggi = this.db.prepare(
      `SELECT id, autore_id, chiave_n, busta, created_at FROM archivio_voci
         WHERE conversazione_id = ? AND id = ?${soloAttribuite ? " AND autore_id IS NOT NULL" : ""}`,
    );

    const voci: VoceArchivioRecord[] = [];
    for (const id of ids) {
      const r = leggi.get(conversazioneId, id) as
        | {
            id: string;
            autore_id: string | null;
            chiave_n: number;
            busta: string;
            created_at: string;
          }
        | undefined;
      if (r !== undefined) {
        voci.push({
          autoreId: r.autore_id,
          busta: r.busta,
          chiaveN: r.chiave_n,
          createdAt: r.created_at,
          id: r.id,
        });
      }
    }

    return voci;
  }

  public ritiraVoce(conversazioneId: string, autoreId: string, id: string): boolean {
    const esito = this.db
      .prepare(`DELETE FROM archivio_voci WHERE conversazione_id = ? AND id = ? AND autore_id = ?`)
      .run(conversazioneId, id, autoreId);

    return Number(esito.changes) > 0;
  }

  public casaPartecipa(remoteKey: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM conversazione_membri WHERE user_id LIKE ? ESCAPE '\\' LIMIT 1`)
      .get(`remote:${escapeLike(remoteKey)}:%`);

    return row !== undefined;
  }

  public caseDellaConversazione(conversazioneId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT user_id FROM conversazione_membri
           WHERE conversazione_id = ? AND user_id LIKE 'remote:%'`,
      )
      .all(conversazioneId) as { user_id: string }[];

    const case_ = new Set<string>();
    for (const { user_id: id } of rows) {
      const chiave = id.split(":")[1];
      if (chiave !== undefined && chiave.length > 0) {
        case_.add(chiave);
      }
    }

    return [...case_];
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
              `SELECT id, autore_id, chiave_n, busta, created_at FROM archivio_voci
                 WHERE conversazione_id = ?
                 ORDER BY created_at ASC, id ASC LIMIT ?`,
            )
            .all(conversazioneId, limit)
        : this.db
            .prepare(
              `SELECT id, autore_id, chiave_n, busta, created_at FROM archivio_voci
                 WHERE conversazione_id = ?
                   AND (created_at > ? OR (created_at = ? AND id > ?))
                 ORDER BY created_at ASC, id ASC LIMIT ?`,
            )
            .all(conversazioneId, dopo.createdAt, dopo.createdAt, dopo.id, limit)
    ) as {
      id: string;
      autore_id: string | null;
      chiave_n: number;
      busta: string;
      created_at: string;
    }[];

    return rows.map((row) => ({
      autoreId: row.autore_id,
      busta: row.busta,
      chiaveN: row.chiave_n,
      createdAt: row.created_at,
      id: row.id,
    }));
  }

  public insertHandshake(
    record: Omit<HandshakeRecord, "seq"> & { conversazioneId: string; destinatario?: string },
  ): boolean {
    // Un'istruzione sola, quindi atomica: il controllo e la scrittura non si
    // possono separare, e due depositi insieme non passano entrambi.
    const esito = this.db
      .prepare(
        `INSERT INTO conversazione_handshake
           (id, conversazione_id, epoch, tipo, destinatario, busta, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE ? <> 'commit' OR NOT EXISTS (
           SELECT 1 FROM conversazione_handshake
             WHERE conversazione_id = ? AND tipo = 'commit' AND epoch >= ?
         )`,
      )
      .run(
        record.id,
        record.conversazioneId,
        record.epoch,
        record.tipo,
        record.destinatario ?? null,
        record.busta,
        record.createdAt,
        record.tipo,
        record.conversazioneId,
        record.epoch,
      );

    return Number(esito.changes) > 0;
  }

  /**
   * Il cursore della coda come numero di sequenza.
   *
   * Arriva in due forme, e vanno capite tutte e due: il `prossimo` di una pagina
   * è un numero, ma il client ricorda l'**id** dell'ultimo handshake applicato —
   * che è l'unica cosa che vede. Prima un id finiva in `Number()`, diventava
   * `NaN`, cioè zero, e ogni giro rimandava tutta la coda: niente di rotto,
   * perché i commit già applicati si saltano, ma una domanda intera verso la
   * casa che ordina ogni volta che la schermata guarda. Gli id sono quelli
   * della casa che ordina, quindi si risolvono qui.
   */
  #seqDelCursore(conversazioneId: string, dopo: string | undefined): number {
    if (dopo === undefined || dopo.length === 0) {
      return 0;
    }

    if (/^\d+$/.test(dopo)) {
      return Number(dopo);
    }

    const row = this.db
      .prepare(`SELECT seq FROM conversazione_handshake WHERE conversazione_id = ? AND id = ?`)
      .get(conversazioneId, dopo) as { seq: number } | undefined;

    return row?.seq ?? 0;
  }

  public casaCheOrdina(conversazioneId: string): string | null | undefined {
    const row = this.db
      .prepare(`SELECT casa_che_ordina FROM conversazioni WHERE id = ?`)
      .get(conversazioneId) as { casa_che_ordina: string | null } | undefined;

    return row === undefined ? undefined : row.casa_che_ordina;
  }

  public haMembroDiCasa(conversazioneId: string, remoteKey: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM conversazione_membri
           WHERE conversazione_id = ? AND user_id LIKE ? ESCAPE '\\'
           LIMIT 1`,
      )
      .get(conversazioneId, `remote:${escapeLike(remoteKey)}:%`) as { 1: number } | undefined;

    return row !== undefined;
  }

  public listHandshakePerCasa(
    conversazioneId: string,
    remoteKey: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): HandshakeRecord[] {
    const limit = options.limit ?? 100;
    const dopo = this.#seqDelCursore(conversazioneId, options.dopo);
    const rows = this.db
      .prepare(
        `SELECT seq, id, tipo, epoch, busta, created_at FROM conversazione_handshake
           WHERE conversazione_id = ?
             AND (destinatario IS NULL OR destinatario LIKE ? ESCAPE '\\')
             AND seq > ?
           ORDER BY seq ASC LIMIT ?`,
      )
      .all(conversazioneId, `remote:${escapeLike(remoteKey)}:%`, dopo, limit) as {
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

  public listHandshakePer(
    conversazioneId: string,
    userId: string,
    options: { limit?: number | undefined; dopo?: string | undefined } = {},
  ): HandshakeRecord[] {
    const limit = options.limit ?? 100;
    // Il cursore e' il `rowid`: ordine di ARRIVO, non di tempo. Due commit
    // scritti nello stesso millisecondo escono nell'ordine in cui sono entrati,
    // perche' MLS li applica in sequenza.
    const dopo = this.#seqDelCursore(conversazioneId, options.dopo);
    // `destinatario IS NULL` = per tutti; altrimenti solo il suo.
    const rows = this.db
      .prepare(
        `SELECT seq, id, tipo, epoch, busta, created_at FROM conversazione_handshake
           WHERE conversazione_id = ? AND (destinatario IS NULL OR destinatario = ?)
             AND seq > ?
           ORDER BY seq ASC LIMIT ?`,
      )
      .all(conversazioneId, userId, dopo, limit) as {
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
