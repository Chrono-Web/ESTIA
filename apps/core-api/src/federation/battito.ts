import type { RemoteInstanceRecord } from "./repository.js";
import { TIMEOUT_BATTITO_MS } from "./service.js";

/**
 * Il battito di [ADR 0041]: l'istanza si accorge da sola di chi è acceso.
 *
 * Prima di questo file la raggiungibilità non era uno stato — la scopriva, ogni
 * volta da capo, il membro che apriva la lente «rete» — e da lì discendeva il
 * difetto che contava davvero: la coda dei messaggi arretrava fino a un'ora e
 * **nessuno la rimetteva in partenza** quando l'altra casa tornava.
 *
 * Tre regole, e la terza è quella che le altre due esistono per servire:
 *
 * 1. si chiede ogni cinque minuti, e si **arretra invece di tacere** quando non
 *    risponde: 5 → 10 → 20 → 40, tetto a un'ora. La formulazione ingenua
 *    («smetto, e aspetto che sia lei a cercarmi») muore sul buco nel mezzo, dove
 *    smettono tutte e due e nessuna ricomincia;
 * 2. **qualunque contatto in arrivo vale come battito.** Non si tiene una verità
 *    propria: si legge `last_seen_at`, che ogni richiesta in arrivo scrive già,
 *    quindi lo stato non può divergere da ciò che è successo davvero;
 * 3. al passaggio **spenta → accesa** la coda verso quella casa riparte.
 *
 * Non è l'avviso vuoto di [ADR 0018], e non va fatto diventare quello: chiede,
 * non sveglia nessuno di là, e non porta contenuti in nessuna direzione.
 */

/** Il ritmo normale: una domanda ogni cinque minuti per casa collegata. */
export const BATTITO_BASE_MS = 5 * 60_000;

/** Il tetto dell'arretramento: una casa spenta da una settimana costa 24 domande al giorno. */
export const BATTITO_MASSIMO_MS = 60 * 60_000;

/** Ogni quanto si guarda l'orologio. Non è il ritmo: è la grana con cui lo si rispetta. */
export const BATTITO_TICK_MS = 30_000;

export interface BattitoLogger {
  info(details: Record<string, unknown>, message: string): void;
}

/** Che cosa il battito deve sapere delle istanze remote, e nient'altro. */
export interface IstanzeDaGuardare {
  list(): RemoteInstanceRecord[];
  findByKey(publicKey: string): RemoteInstanceRecord | undefined;
}

/** La sola domanda che il battito fa. Il tetto di tempo è suo, e più stretto. */
export interface ChiSiPresenta {
  ping(publicKey: string, timeoutMs?: number): Promise<{ reached: boolean }>;
}

export interface BattitoOptions {
  federation: ChiSiPresenta;
  remotes: IstanzeDaGuardare;
  /** Il risveglio della coda (ADR 0041 §4). Chiamato **solo** al passaggio a raggiungibile. */
  risveglia?: ((publicKey: string) => void) | undefined;
  attesaBaseMs?: number | undefined;
  attesaMassimaMs?: number | undefined;
  tickMs?: number | undefined;
  now?: (() => number) | undefined;
  logger?: BattitoLogger | undefined;
}

interface StatoDiUnaCasa {
  /** Quando tornare a chiedere, in millisecondi dell'orologio di `now`. */
  prossimo: number;
  /** Quanto si aspetterà se questa volta non risponde. */
  attesa: number;
  /** `undefined` finché non si è ancora saputo niente di lei da questo avvio. */
  viva: boolean | undefined;
  /** L'ultimo `last_seen_at` osservato: serve a distinguere il suo traffico dal nostro. */
  vistaA: string | null;
}

export class BattitoDelleIstanze {
  #timer: ReturnType<typeof setInterval> | null = null;
  #inCorso = false;

  readonly #stato = new Map<string, StatoDiUnaCasa>();
  readonly #federation: ChiSiPresenta;
  readonly #remotes: IstanzeDaGuardare;
  readonly #risveglia: ((publicKey: string) => void) | undefined;
  readonly #base: number;
  readonly #massimo: number;
  readonly #tickMs: number;
  readonly #now: () => number;
  readonly #logger: BattitoLogger | undefined;

  public constructor(options: BattitoOptions) {
    this.#federation = options.federation;
    this.#remotes = options.remotes;
    this.#risveglia = options.risveglia;
    this.#base = options.attesaBaseMs ?? BATTITO_BASE_MS;
    this.#massimo = options.attesaMassimaMs ?? BATTITO_MASSIMO_MS;
    this.#tickMs = options.tickMs ?? BATTITO_TICK_MS;
    this.#now = options.now ?? Date.now;
    this.#logger = options.logger;
  }

  public start(): void {
    if (this.#timer) {
      return;
    }

    this.#timer = setInterval(() => {
      void this.batti();
    }, this.#tickMs);
    this.#timer.unref?.();
  }

  public stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** Che cosa il battito crede di sapere adesso. Per il pannello e per i test. */
  public raggiungibile(publicKey: string): boolean | undefined {
    return this.#stato.get(publicKey)?.viva;
  }

  /**
   * Lo stesso, con il quando: è ciò che il pannello mostra a chi amministra.
   *
   * `undefined` finché il battito non ha ancora chiesto — e «non lo so ancora»
   * non va mai mostrato come «non risponde», che è un'altra cosa e allarma.
   */
  public statoDi(
    publicKey: string,
  ): { raggiungibile: boolean; prossimoTentativo: number } | undefined {
    const stato = this.#stato.get(publicKey);

    if (stato === undefined || stato.viva === undefined) {
      return undefined;
    }

    return { prossimoTentativo: stato.prossimo, raggiungibile: stato.viva };
  }

  /**
   * Un giro. Non solleva mai: una casa che non risponde è uno stato, non un guasto.
   */
  public async batti(): Promise<{ chieste: number; raggiunte: number; risvegliate: number }> {
    if (this.#inCorso) {
      return { chieste: 0, raggiunte: 0, risvegliate: 0 };
    }

    this.#inCorso = true;

    let chieste = 0;
    let raggiunte = 0;
    let risvegliate = 0;

    try {
      const collegate = this.#remotes.list().filter((remota) => remota.state === "collegata");

      this.#dimenticaLeNonPiuCollegate(collegate);

      const daChiedere: RemoteInstanceRecord[] = [];

      for (const remota of collegate) {
        const stato = this.#statoDi(remota);

        // 1. Si è fatta viva lei: vale come battito, e costa zero richieste.
        if (remota.lastSeenAt !== null && remota.lastSeenAt !== stato.vistaA) {
          stato.vistaA = remota.lastSeenAt;
          stato.attesa = this.#base;
          stato.prossimo = this.#now() + this.#base;

          if (this.#accendi(stato, remota.publicKey, "contatto")) {
            risvegliate += 1;
          }

          continue;
        }

        // 2. Altrimenti si chiede, ma solo quando è ora.
        if (this.#now() >= stato.prossimo) {
          daChiedere.push(remota);
        }
      }

      await Promise.all(
        daChiedere.map(async (remota) => {
          chieste += 1;

          const esito = await this.#chiedi(remota.publicKey);
          const stato = this.#statoDi(remota);

          // Il nostro stesso battito ha appena scritto `last_seen_at`: si rilegge,
          // altrimenti al giro dopo lo si scambierebbe per traffico in arrivo.
          stato.vistaA = this.#remotes.findByKey(remota.publicKey)?.lastSeenAt ?? stato.vistaA;

          if (esito) {
            raggiunte += 1;
            stato.attesa = this.#base;
            stato.prossimo = this.#now() + this.#base;

            if (this.#accendi(stato, remota.publicKey, "battito")) {
              risvegliate += 1;
            }

            return;
          }

          this.#spegni(stato, remota.publicKey);
          stato.attesa = Math.min(stato.attesa * 2, this.#massimo);
          stato.prossimo = this.#now() + stato.attesa;
        }),
      );
    } finally {
      this.#inCorso = false;
    }

    return { chieste, raggiunte, risvegliate };
  }

  async #chiedi(publicKey: string): Promise<boolean> {
    try {
      const esito = await this.#federation.ping(publicKey, TIMEOUT_BATTITO_MS);

      return esito.reached;
    } catch {
      return false;
    }
  }

  #statoDi(remota: RemoteInstanceRecord): StatoDiUnaCasa {
    const esistente = this.#stato.get(remota.publicKey);

    if (esistente !== undefined) {
      return esistente;
    }

    // Appena conosciuta (o appena riavviata l'istanza): si chiede subito, perché
    // «non so» e «spenta» non sono la stessa cosa e non vanno confuse per mezz'ora.
    const nuovo: StatoDiUnaCasa = {
      attesa: this.#base,
      prossimo: this.#now(),
      viva: undefined,
      vistaA: remota.lastSeenAt,
    };

    this.#stato.set(remota.publicKey, nuovo);

    return nuovo;
  }

  /** Ritorna `true` se questo è il passaggio a raggiungibile, cioè se la coda è ripartita. */
  #accendi(stato: StatoDiUnaCasa, publicKey: string, come: "battito" | "contatto"): boolean {
    if (stato.viva === true) {
      return false;
    }

    stato.viva = true;

    this.#logger?.info(
      { come, event: "istanza_raggiungibile", istanza: publicKey },
      "Un'istanza collegata è tornata raggiungibile",
    );

    this.#risveglia?.(publicKey);

    return true;
  }

  #spegni(stato: StatoDiUnaCasa, publicKey: string): void {
    if (stato.viva === false) {
      return;
    }

    stato.viva = false;

    this.#logger?.info(
      { event: "istanza_non_raggiungibile", istanza: publicKey },
      "Un'istanza collegata non risponde",
    );
  }

  #dimenticaLeNonPiuCollegate(collegate: readonly RemoteInstanceRecord[]): void {
    const vive = new Set(collegate.map((remota) => remota.publicKey));

    for (const chiave of this.#stato.keys()) {
      if (!vive.has(chiave)) {
        this.#stato.delete(chiave);
      }
    }
  }
}
