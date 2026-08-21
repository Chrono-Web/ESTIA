import type { DatabaseSync } from "node:sqlite";

import type { NotificaLente, NotificaTipo } from "@estia/contracts";

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
  /** Opzionale: se omesso restituisce entrambe le lenti. */
  lente?: NotificaLente;
  /** Inclusivo, come il cursore del feed di rete: i gemelli si scartano dopo. */
  atOrBefore?: string;
  limit: number;
}

export interface NotificheRepository {
  elenco(query: NotificheQuery): NotificaRiga[];
  /**
   * Quante cose sono successe dopo quell'istante **in quella lente**.
   *
   * La lente è obbligatoria e non un default: il totale che si mostra in
   * barra è la somma delle due, e chi somma decide lui cosa sta sommando.
   */
  contaDopo(userId: string, lente: NotificaLente, dopo: string | undefined): number;
  /** Fin dove si era guardato **in quella lente**, o `null` alla prima volta. */
  vistoFinoA(userId: string, lente: NotificaLente): string | null;
  segnaViste(userId: string, lente: NotificaLente, at: string): void;
}

/**
 * Quanto testo si porta dietro una notifica per farsi riconoscere.
 *
 * Corto di proposito: serve a sapere **quale** cosa tua, non a rileggerla. Il
 * testo intero sta un tocco più in là, sulla pagina del post.
 */
const ANTEPRIMA = 160;

/**
 * In quale lente sta un post, e quindi tutto ciò che lo riguarda.
 *
 * È la stessa riga di `scopeDelFeed` letta al contrario: `local` è ciò che non
 * esce di casa, tutto il resto è la superficie che raggiunge chi ti segue. Non
 * è una convenzione di questo file — è ADR 0018 §«un pulsante per feed».
 */
const LENTE_DEL_POST = "CASE WHEN p.scope = 'local' THEN 'istanza' ELSE 'rete' END";

/**
 * I sei rami, e ognuno dice da dove sa quello che dice.
 *
 * Le colonne sono le stesse in tutti — è ciò che permette a `UNION ALL` di
 * esistere — e dove una sorgente non ha una colonna mette `NULL` invece di
 * inventarla.
 *
 * **La lente esce dalla domanda invece di essere una domanda diversa**
 * ([ADR 0025] §4): ogni ramo dichiara in quale delle due sta ciò di cui parla
 * — lo scope del post per i cuori e le risposte, la casa di chi chiede per i
 * follow — e il filtro si applica fuori. Due query separate avrebbero voluto
 * dire tenere allineate per sempre due copie delle stesse sei regole.
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
         substr(p.body, 1, ${String(ANTEPRIMA)}) AS anteprima, NULL AS testo,
         ${LENTE_DEL_POST} AS lente
  FROM post_likes pl
  JOIN posts p ON p.id = pl.post_id
  JOIN users u ON u.id = pl.user_id
  WHERE p.author_id = ? AND pl.user_id <> ? AND p.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  -- Il cuore che ha attraversato. Il nome è quello dichiarato dall'altra casa,
  -- e vale anche come nome visibile: un profilo di là non lo conosciamo, e
  -- inventargli un nome proprio sarebbe peggio che mostrare quello che c'è.
  -- Sempre 'rete', e non per convenzione: una bacheca servita fuori non
  -- contiene post local ([ADR 0020]), quindi un cuore da un'altra casa non
  -- può essersi posato su una cosa di casa.
  SELECT 'cuore_post', rl.created_at, p.id, NULL,
         rl.username, rl.username, rl.instance_key, NULL,
         substr(p.body, 1, ${String(ANTEPRIMA)}), NULL, 'rete'
  FROM remote_post_likes rl
  JOIN posts p ON p.id = rl.post_id
  WHERE p.author_id = ? AND p.deleted_at IS NULL

  UNION ALL

  -- Un commento non ha uno scope suo: vive dove vive il post che lo ospita,
  -- ed è da lì che prende la lente.
  SELECT 'cuore_commento', cl.created_at, c.post_id, c.id,
         u.username, u.display_name, NULL, NULL,
         substr(c.body, 1, ${String(ANTEPRIMA)}), NULL, ${LENTE_DEL_POST}
  FROM comment_likes cl
  JOIN comments c ON c.id = cl.comment_id
  JOIN posts p ON p.id = c.post_id
  JOIN users u ON u.id = cl.user_id
  WHERE c.author_id = ? AND cl.user_id <> ? AND c.deleted_at IS NULL
    AND p.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  SELECT 'risposta_post', c.created_at, c.post_id, c.id,
         u.username, u.display_name, NULL, NULL,
         substr(p.body, 1, ${String(ANTEPRIMA)}), substr(c.body, 1, ${String(ANTEPRIMA)}),
         ${LENTE_DEL_POST}
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
         substr(genitore.body, 1, ${String(ANTEPRIMA)}), substr(c.body, 1, ${String(ANTEPRIMA)}),
         ${LENTE_DEL_POST}
  FROM comments c
  JOIN comments genitore ON genitore.id = c.parent_id
  JOIN posts p ON p.id = c.post_id
  JOIN users u ON u.id = c.author_id
  WHERE genitore.author_id = ? AND c.author_id <> ?
    AND c.deleted_at IS NULL AND genitore.deleted_at IS NULL
    AND p.deleted_at IS NULL AND u.deleted_at IS NULL

  UNION ALL

  -- Le due facce della stessa riga: chiesto e accettato. La data è quella della
  -- decisione quando c'è, perché è quel momento la notizia — «adesso ti segue»
  -- non è successo quando l'ha chiesto.
  SELECT CASE WHEN f.state = 'in_attesa' THEN 'follow_richiesta' ELSE 'follow_nuovo' END,
         COALESCE(f.decided_at, f.created_at), NULL, NULL,
         f.follower_username, COALESCE(lu.display_name, f.follower_username),
         CASE WHEN f.follower_instance = 'locale' THEN NULL ELSE f.follower_instance END,
         f.id, NULL, NULL,
         -- Un follow non ha un post da cui prendere la lente: la prende da
         -- **dove abita chi lo chiede**. Seguire un vicino di casa non passa
         -- dalla rete ([ADR 0022]), quindi non è una notizia della rete.
         CASE WHEN f.follower_instance = 'locale' THEN 'istanza' ELSE 'rete' END
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
    const lente = query.lente === undefined ? "" : " AND lente = ?";
    const finestra = query.atOrBefore === undefined ? "" : " AND quando <= ?";
    const sql = `SELECT * FROM (${SORGENTI}) WHERE tipo IN (${segnaposti})${lente}${finestra}
                 ORDER BY quando DESC LIMIT ?`;

    const parametri = [
      ...utente(query.userId),
      ...query.tipi,
      ...(query.lente === undefined ? [] : [query.lente]),
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
  public contaDopo(userId: string, lente: NotificaLente, dopo: string | undefined): number {
    const filtro = dopo === undefined ? " WHERE lente = ?" : " WHERE lente = ? AND quando > ?";
    const row = this.database
      .prepare(`SELECT COUNT(*) AS totale FROM (${SORGENTI})${filtro}`)
      .get(...utente(userId), lente, ...(dopo === undefined ? [] : [dopo])) as { totale: number };

    return Number(row.totale);
  }

  public vistoFinoA(userId: string, lente: NotificaLente): string | null {
    const row = this.database
      .prepare("SELECT viste_at FROM notifiche_viste WHERE user_id = ? AND lente = ?")
      .get(userId, lente) as { viste_at: string } | undefined;

    return row?.viste_at ?? null;
  }

  /**
   * Non torna mai indietro.
   *
   * Due schede aperte segnano due istanti diversi, e la seconda potrebbe essere
   * più vecchia della prima: prenderla per buona farebbe **ricomparire** come
   * nuove delle notifiche già guardate. `MAX` è la regola giusta perché «fin
   * dove ho guardato» è un livello dell'acqua, non un ultimo evento.
   *
   * Il conflitto è su `(user_id, lente)` e non su `user_id`: è la trappola che
   * dà il nome alla migrazione — un segno unico spegnerebbe in silenzio le
   * novità dell'altra lente, e qui le due acque restano separate.
   */
  public segnaViste(userId: string, lente: NotificaLente, at: string): void {
    this.database
      .prepare(
        `INSERT INTO notifiche_viste (user_id, lente, viste_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id, lente) DO UPDATE SET viste_at = MAX(viste_at, excluded.viste_at)`,
      )
      .run(userId, lente, at);
  }
}

function utente(userId: string): string[] {
  return Array.from({ length: PARAMETRI_UTENTE }, () => userId);
}
