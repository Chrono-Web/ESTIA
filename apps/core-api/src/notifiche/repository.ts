import type { DatabaseSync } from "node:sqlite";

import type { NotificaTipo } from "@estia/contracts";

/**
 * Le notifiche lette dalle sei sorgenti che già le contengono ([ADR 0025] §4).
 *
 * **Non esiste una tabella di notifiche, e la sua assenza è la decisione.** Il
 * modo consueto di costruirle è una riga per ogni cosa che succede, con dentro
 * una copia di chi l'ha fatta e di che cosa riguardava — cioè esattamente ciò
 * che [ADR 0018] ha tolto dal prodotto cancellando l'indice dei profili: «una
 * riga d'indice è una copia che sopravvive a chi nomina».
 *
 * Da cui tre proprietà che qui sono gratis e che una tabella di eventi avrebbe
 * dovuto inseguire: un post cancellato porta via le proprie notifiche, un cuore
 * tolto toglie la propria, e non c'è niente da ripulire mai.
 *
 * Il prezzo è questo file: una domanda con sei rami invece di una `SELECT`.
 */

export interface NotificaRiga {
  tipo: NotificaTipo;
  quando: string;
  postId: string | null;
  commentId: string | null;
  attoreUsername: string;
  attoreNome: string;
  /** La chiave dell'istanza di chi ha fatto la cosa, o `null` per chi è di casa. */
  attoreIstanza: string | null;
  /** Solo per le richieste di follow: la riga da accettare. */
  followerId: string | null;
  /** La **tua** cosa che l'ha causata: il post amato, il commento a cui si risponde. */
  anteprima: string | null;
  /** Le parole nuove, quando ce ne sono: il testo della risposta. */
  testo: string | null;
}

export interface NotificheQuery {
  userId: string;
  tipi: readonly NotificaTipo[];
  /** Inclusivo, come il cursore del feed di rete: i gemelli si scartano dopo. */
  atOrBefore?: string;
  limit: number;
}

export interface NotificheRepository {
  elenco(query: NotificheQuery): NotificaRiga[];
  /** Quante cose sono successe dopo quell'istante. `undefined` vuol dire «tutte». */
  contaDopo(userId: string, dopo: string | undefined): number;
  vistoFinoA(userId: string): string | null;
  segnaViste(userId: string, at: string): void;
}

/**
 * Quanto testo si porta dietro una notifica per farsi riconoscere.
 *
 * Corto di proposito: serve a sapere **quale** cosa tua, non a rileggerla. Il
 * testo intero sta un tocco più in là, sulla pagina del post.
 */
const ANTEPRIMA = 160;

/**
 * I sei rami, e ognuno dice da dove sa quello che dice.
 *
 * Le colonne sono le stesse in tutti — è ciò che permette a `UNION ALL` di
 * esistere — e dove una sorgente non ha una colonna mette `NULL` invece di
 * inventarla.
 *
 * `anteprima` e `testo` sono due cose diverse e vanno tenute distinte: la
 * prima è **la tua**, quella che ha causato la notizia; la seconda sono le
 * **parole nuove**, quando ce ne sono. Una risposta le ha tutte e due — sopra
 * ciò a cui si risponde, sotto ciò che si è detto — e un cuore solo la prima,
 * perché un cuore non porta parole. `hidden_at` non filtra niente: un post nascosto da chi modera
 * resta un post di chi l'ha scritto, e le notizie che lo riguardano sono sue.
 */
const SORGENTI = `
  SELECT 'cuore_post' AS tipo, pl.created_at AS quando, p.id AS post_id, NULL AS comment_id,
         u.username AS attore_username, u.display_name AS attore_nome,
         NULL AS attore_istanza, NULL AS follower_id,
         substr(p.body, 1, ${String(ANTEPRIMA)}) AS anteprima, NULL AS testo
  FROM post_likes pl
  JOIN posts p ON p.id = pl.post_id
  JOIN users u ON u.id = pl.user_id
  WHERE p.author_id = ? AND pl.user_id <> ? AND p.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  -- Il cuore che ha attraversato. Il nome è quello dichiarato dall'altra casa,
  -- e vale anche come nome visibile: un profilo di là non lo conosciamo, e
  -- inventargli un nome proprio sarebbe peggio che mostrare quello che c'è.
  SELECT 'cuore_post', rl.created_at, p.id, NULL,
         rl.username, rl.username, rl.instance_key, NULL,
         substr(p.body, 1, ${String(ANTEPRIMA)}), NULL
  FROM remote_post_likes rl
  JOIN posts p ON p.id = rl.post_id
  WHERE p.author_id = ? AND p.deleted_at IS NULL

  UNION ALL

  SELECT 'cuore_commento', cl.created_at, c.post_id, c.id,
         u.username, u.display_name, NULL, NULL,
         substr(c.body, 1, ${String(ANTEPRIMA)}), NULL
  FROM comment_likes cl
  JOIN comments c ON c.id = cl.comment_id
  JOIN users u ON u.id = cl.user_id
  WHERE c.author_id = ? AND cl.user_id <> ? AND c.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  SELECT 'risposta_post', c.created_at, c.post_id, c.id,
         u.username, u.display_name, NULL, NULL,
         substr(p.body, 1, ${String(ANTEPRIMA)}), substr(c.body, 1, ${String(ANTEPRIMA)})
  FROM comments c
  JOIN posts p ON p.id = c.post_id
  JOIN users u ON u.id = c.author_id
  WHERE p.author_id = ? AND c.author_id <> ? AND c.parent_id IS NULL
    AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  -- Una risposta a un mio commento arriva a me anche se il post è di qualcun
  -- altro: il thread di ADR 0023 non cambia di chi sono le parole.
  SELECT 'risposta_commento', c.created_at, c.post_id, c.id,
         u.username, u.display_name, NULL, NULL,
         substr(genitore.body, 1, ${String(ANTEPRIMA)}), substr(c.body, 1, ${String(ANTEPRIMA)})
  FROM comments c
  JOIN comments genitore ON genitore.id = c.parent_id
  JOIN users u ON u.id = c.author_id
  WHERE genitore.author_id = ? AND c.author_id <> ?
    AND c.deleted_at IS NULL AND genitore.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  -- Le due facce della stessa riga: chiesto e accettato. La data è quella della
  -- decisione quando c'è, perché è quel momento la notizia — «adesso ti segue»
  -- non è successo quando l'ha chiesto.
  SELECT CASE WHEN f.state = 'in_attesa' THEN 'follow_richiesta' ELSE 'follow_nuovo' END,
         COALESCE(f.decided_at, f.created_at), NULL, NULL,
         f.follower_username, COALESCE(lu.display_name, f.follower_username),
         CASE WHEN f.follower_instance = 'locale' THEN NULL ELSE f.follower_instance END,
         f.id, NULL, NULL
  FROM followers f
  LEFT JOIN users lu ON f.follower_instance = 'locale' AND lu.username = f.follower_username
  WHERE f.user_id = ?
`;

/** Quante volte `SORGENTI` chiede chi sta guardando. */
const PARAMETRI_UTENTE = 10;

type Riga = {
  tipo: string;
  quando: string;
  post_id: string | null;
  comment_id: string | null;
  attore_username: string;
  attore_nome: string;
  attore_istanza: string | null;
  follower_id: string | null;
  anteprima: string | null;
  testo: string | null;
};

function toRiga(row: Riga): NotificaRiga {
  return {
    anteprima: row.anteprima,
    attoreIstanza: row.attore_istanza,
    attoreNome: row.attore_nome,
    attoreUsername: row.attore_username,
    commentId: row.comment_id,
    followerId: row.follower_id,
    postId: row.post_id,
    quando: row.quando,
    testo: row.testo,
    tipo: row.tipo as NotificaTipo,
  };
}

export class SqliteNotificheRepository implements NotificheRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public elenco(query: NotificheQuery): NotificaRiga[] {
    if (query.tipi.length === 0) {
      return [];
    }

    const segnaposti = query.tipi.map(() => "?").join(", ");
    const finestra = query.atOrBefore === undefined ? "" : " AND quando <= ?";
    const sql = `SELECT * FROM (${SORGENTI}) WHERE tipo IN (${segnaposti})${finestra}
                 ORDER BY quando DESC LIMIT ?`;

    const parametri = [
      ...utente(query.userId),
      ...query.tipi,
      ...(query.atOrBefore === undefined ? [] : [query.atOrBefore]),
      query.limit,
    ];

    return (this.database.prepare(sql).all(...parametri) as Riga[]).map(toRiga);
  }

  /**
   * Il numero del pallino, e conta **cose successe** e non voci in elenco.
   *
   * I cuori sullo stesso post si raggruppano quando si disegnano, non quando si
   * contano: «tre persone hanno messo un cuore» sono tre cose successe, e un
   * pallino che dicesse «1» sarebbe la cosa sbagliata da dire a chi decide se
   * aprire la pagina.
   */
  public contaDopo(userId: string, dopo: string | undefined): number {
    const filtro = dopo === undefined ? "" : " WHERE quando > ?";
    const row = this.database
      .prepare(`SELECT COUNT(*) AS totale FROM (${SORGENTI})${filtro}`)
      .get(...utente(userId), ...(dopo === undefined ? [] : [dopo])) as { totale: number };

    return Number(row.totale);
  }

  public vistoFinoA(userId: string): string | null {
    const row = this.database
      .prepare("SELECT viste_at FROM notifiche_viste WHERE user_id = ?")
      .get(userId) as { viste_at: string } | undefined;

    return row?.viste_at ?? null;
  }

  /**
   * Non torna mai indietro.
   *
   * Due schede aperte segnano due istanti diversi, e la seconda potrebbe essere
   * più vecchia della prima: prenderla per buona farebbe **ricomparire** come
   * nuove delle notifiche già guardate. `MAX` è la regola giusta perché «fin
   * dove ho guardato» è un livello dell'acqua, non un ultimo evento.
   */
  public segnaViste(userId: string, at: string): void {
    this.database
      .prepare(
        `INSERT INTO notifiche_viste (user_id, viste_at) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET viste_at = MAX(viste_at, excluded.viste_at)`,
      )
      .run(userId, at);
  }
}

function utente(userId: string): string[] {
  return Array.from({ length: PARAMETRI_UTENTE }, () => userId);
}
