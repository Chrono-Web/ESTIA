import {
  NOTIFICA_TIPI,
  type NotificaAttore,
  type NotificaFiltro,
  type NotificaLente,
  type NotificaTipo,
  type NotificaView,
  type NotifichePage,
  type NotificheNuove,
} from "@estia/contracts";

import type { NomiDelleIstanze } from "../feed/rete.js";

import type { NotificaRiga, NotificheRepository } from "./repository.js";

/**
 * Da sei sorgenti a un elenco solo ([ADR 0025] §4).
 *
 * Due mestieri, e nessuno dei due è una query: **raggruppare** i cuori sullo
 * stesso oggetto, perché quindici cuori non devono poter seppellire una
 * risposta; e **impaginare** ciò che ne esce.
 *
 * Il raggruppamento avviene dentro la pagina che si sta leggendo, ed è una
 * conseguenza dichiarata: se i cuori di un post stanno a cavallo di due pagine,
 * il post ricompare più in basso con i più vecchi. L'alternativa —
 * raggruppare prima di impaginare — vorrebbe leggere tutto per mostrarne trenta.
 */

/** Quante facce si nominano prima di dire «e altre N». Tre stanno in una riga. */
const ATTORI_MOSTRATI = 3;

/**
 * Quante righe leggere per riempire una pagina di gruppi.
 *
 * Tre per gruppo: nel caso peggiore ogni voce è un cuore isolato e il fattore
 * è sprecato, nel caso normale evita di andare a chiedere due volte. Non è una
 * soglia di prodotto, è quanto costa meno sbagliare.
 */
const RIGHE_PER_GRUPPO = 3;

const TIPI_PER_FILTRO: Record<NotificaFiltro, readonly NotificaTipo[]> = {
  cuori: ["cuore_post", "cuore_commento"],
  follow: ["follow_richiesta", "follow_nuovo"],
  risposte: ["risposta_post", "risposta_commento"],
  tutte: NOTIFICA_TIPI,
};

interface Finestra {
  t: string;
  visti: string[];
}

/**
 * La chiave di una **riga**, per non rimostrarla al confine della pagina.
 *
 * Stessa medicina del cursore del feed di rete: il confine è inclusivo, perché
 * uno esclusivo perderebbe in silenzio i fatti avvenuti sullo stesso
 * millisecondo, e ciò che è già passato si scarta per nome.
 */
function chiaveRiga(riga: NotificaRiga): string {
  return [
    riga.tipo,
    riga.postId ?? "",
    riga.commentId ?? "",
    riga.attoreIstanza ?? "locale",
    riga.attoreUsername,
  ].join(" ");
}

/**
 * La chiave di un **gruppo**: che cosa fa di due righe la stessa voce.
 *
 * Solo i cuori si raggruppano. Due risposte non sono «due persone hanno
 * risposto»: sono due cose da leggere, e fonderle nasconderebbe delle parole.
 */
function chiaveGruppo(riga: NotificaRiga): string {
  if (riga.tipo === "cuore_post") {
    return `cuore_post:${riga.postId ?? ""}`;
  }

  if (riga.tipo === "cuore_commento") {
    return `cuore_commento:${riga.commentId ?? ""}`;
  }

  return `${riga.tipo}:${riga.commentId ?? riga.followerId ?? riga.attoreUsername}`;
}

function leggiCursore(cursore: string | undefined): Finestra | undefined {
  if (cursore === undefined) {
    return undefined;
  }

  try {
    const letto = JSON.parse(Buffer.from(cursore, "base64url").toString("utf8")) as Finestra;

    return typeof letto.t === "string" && Array.isArray(letto.visti) ? letto : undefined;
  } catch {
    return undefined;
  }
}

function scriviCursore(finestra: Finestra): string {
  return Buffer.from(JSON.stringify(finestra), "utf8").toString("base64url");
}

export interface NotificheServiceOptions {
  notifiche: NotificheRepository;
  /** Come si chiama la casa da cui arriva un cuore. Dichiarata da lei, mai verificata. */
  nomi: NomiDelleIstanze;
  now?: () => Date;
}

/** L'altra lente: quella che questa pagina non sta mostrando. */
function altraLente(lente: NotificaLente): NotificaLente {
  return lente === "istanza" ? "rete" : "istanza";
}

export class NotificheService {
  readonly #notifiche: NotificheRepository;
  readonly #nomi: NomiDelleIstanze;
  readonly #now: () => Date;

  public constructor(options: NotificheServiceOptions) {
    this.#notifiche = options.notifiche;
    this.#nomi = options.nomi;
    this.#now = options.now ?? (() => new Date());
  }

  public pagina(
    userId: string,
    options: { filtro: NotificaFiltro; lente: NotificaLente; limit: number; cursor?: string },
  ): NotifichePage {
    const finestra = leggiCursore(options.cursor);
    const vistoFinoA = this.#notifiche.vistoFinoA(userId, options.lente);
    const limite = options.limit;

    const righe = this.#notifiche
      .elenco({
        limit: limite * RIGHE_PER_GRUPPO + 1 + (finestra?.visti.length ?? 0),
        lente: options.lente,
        tipi: TIPI_PER_FILTRO[options.filtro],
        userId,
        ...(finestra === undefined ? {} : { atOrBefore: finestra.t }),
      })
      .filter((riga) => !(finestra?.visti ?? []).includes(chiaveRiga(riga)));

    const gruppi = new Map<string, NotificaRiga[]>();
    const consumate: NotificaRiga[] = [];
    let interrotto = false;

    for (const riga of righe) {
      const chiave = chiaveGruppo(riga);
      const esistente = gruppi.get(chiave);

      // Il gruppo che sfonderebbe la pagina non si apre, e la riga che l'avrebbe
      // aperto resta per la prossima: prenderla e scartarla la perderebbe.
      if (esistente === undefined && gruppi.size >= limite) {
        interrotto = true;
        break;
      }

      gruppi.set(chiave, [...(esistente ?? []), riga]);
      consumate.push(riga);
    }

    const notifiche = [...gruppi].map(([id, insieme]) => this.#vista(id, insieme, vistoFinoA));
    const ultima = consumate.at(-1);
    const altra = altraLente(options.lente);

    return {
      notifiche,
      nuove: this.#notifiche.contaDopo(userId, options.lente, vistoFinoA ?? undefined),
      altrove: this.#notifiche.contaDopo(
        userId,
        altra,
        this.#notifiche.vistoFinoA(userId, altra) ?? undefined,
      ),
      vistoFinoA,
      ...(interrotto && ultima !== undefined
        ? {
            nextCursor: scriviCursore({
              t: ultima.quando,
              visti: consumate
                .filter((riga) => riga.quando === ultima.quando)
                .map((riga) => chiaveRiga(riga)),
            }),
          }
        : {}),
    };
  }

  /**
   * Il pallino, che è uno e parla di entrambe le lenti.
   *
   * `nuove` è la somma — la campanella non sa in quale lente ti trovi, e se
   * contasse solo quella girare la lente farebbe apparire novità che c'erano
   * da ore. Le due componenti stanno accanto, perché è **la schermata** che
   * deve poter dire «nella rete ce ne sono altre» invece di lasciare la
   * divisione indovinare ([ADR 0025] §4).
   */
  public nuove(userId: string): NotificheNuove {
    const istanza = this.#conta(userId, "istanza");
    const rete = this.#conta(userId, "rete");

    return { istanza, nuove: istanza + rete, rete };
  }

  #conta(userId: string, lente: NotificaLente): number {
    return this.#notifiche.contaDopo(
      userId,
      lente,
      this.#notifiche.vistoFinoA(userId, lente) ?? undefined,
    );
  }

  /**
   * Segna fin dove si è guardato **in quella lente**.
   *
   * L'istante è **quello del server**, non uno mandato da chi chiede: un
   * orologio sbagliato su un telefono spegnerebbe delle notifiche che non ha
   * visto, o le riaccenderebbe tutte.
   *
   * E una lente sola: guardare l'istanza non può spegnere in silenzio le
   * novità della rete — è il difetto per cui il segno esiste due volte.
   */
  public segnaViste(userId: string, lente: NotificaLente): void {
    this.#notifiche.segnaViste(userId, lente, this.#now().toISOString());
  }

  #vista(id: string, insieme: NotificaRiga[], vistoFinoA: string | null): NotificaView {
    const prima = insieme[0]!;
    const attori: NotificaAttore[] = insieme.slice(0, ATTORI_MOSTRATI).map((riga) => ({
      displayName: riga.attoreNome,
      username: riga.attoreUsername,
      ...(riga.attoreIstanza === null
        ? {}
        : {
            istanza: {
              instanceKey: riga.attoreIstanza,
              istanza: this.#nomi.nomeDi(riga.attoreIstanza),
            },
          }),
    }));

    return {
      altri: Math.max(0, insieme.length - attori.length),
      attori,
      id,
      nuova: vistoFinoA === null || prima.quando > vistoFinoA,
      quando: prima.quando,
      tipo: prima.tipo,
      ...(prima.postId === null
        ? {}
        : {
            oggetto: {
              anteprima: prima.anteprima ?? "",
              postId: prima.postId,
              ...(prima.commentId === null ? {} : { commentId: prima.commentId }),
              ...(prima.testo === null ? {} : { risposta: prima.testo }),
            },
          }),
      ...(prima.followerId === null ? {} : { followerId: prima.followerId }),
    };
  }
}
