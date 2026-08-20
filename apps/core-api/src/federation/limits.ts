/**
 * How much work this instance is willing to do for another one (ADR 0020 §2).
 *
 * The rule that shapes this file is arithmetic, not caution: **a single global
 * ceiling turns one noisy instance into everybody else's problem.** If one
 * saturates the budget, the legitimate requests of twenty connected instances
 * are refused along with its own. So the budget is counted per key.
 *
 * And nothing here touches the disk. Counters for instances we have no
 * relationship with live in memory, with a ceiling and an expiry, and a restart
 * forgets them — because the alternative is a persistent record of everyone who
 * ever knocked, which ADR 0020 §3 refuses to build.
 */

export interface Budget {
  /** How many requests are allowed inside one window. */
  requests: number;
  /** How long the window lasts, in milliseconds. */
  windowMs: number;
}

export interface BudgetOptions {
  /**
   * An unknown instance may do exactly one thing — introduce itself — so its
   * budget only has to cover that, and being stingy here costs nobody anything.
   */
  unknown?: Budget;
  /**
   * A connected instance is one somebody said yes to, and that yes is also a
   * statement about how much work we are willing to do for them.
   */
  connected?: Budget;
  /**
   * How many unknown keys are tracked at once. The map itself must not become
   * the way to exhaust this instance's memory.
   */
  maxTrackedUnknown?: number;
  now?: () => number;
}

const DEFAULTS = {
  connected: { requests: 120, windowMs: 60_000 },
  maxTrackedUnknown: 1024,
  unknown: { requests: 5, windowMs: 60_000 },
} as const;

interface Window {
  startedAt: number;
  count: number;
  connected: boolean;
}

export type BudgetLevel = "sconosciuta" | "collegata";

export class RemoteBudgets {
  readonly #windows = new Map<string, Window>();
  readonly #unknown: Budget;
  readonly #connected: Budget;
  readonly #maxTrackedUnknown: number;
  readonly #now: () => number;

  public constructor(options: BudgetOptions = {}) {
    this.#unknown = options.unknown ?? DEFAULTS.unknown;
    this.#connected = options.connected ?? DEFAULTS.connected;
    this.#maxTrackedUnknown = options.maxTrackedUnknown ?? DEFAULTS.maxTrackedUnknown;
    this.#now = options.now ?? Date.now;
  }

  /** True when the request may proceed. Never throws, never blocks. */
  public allow(publicKey: string, level: BudgetLevel): boolean {
    const connected = level === "collegata";
    const budget = connected ? this.#connected : this.#unknown;
    const now = this.#now();
    const existing = this.#windows.get(publicKey);

    if (existing === undefined || now - existing.startedAt >= budget.windowMs) {
      if (!connected && !this.#roomForAnotherUnknown(now)) {
        // Full, and this one is a stranger: refuse rather than evict somebody
        // who is inside their budget. Failing closed here costs an unknown
        // instance a retry; failing open would make the ceiling decorative.
        return false;
      }

      this.#windows.set(publicKey, { connected, count: 1, startedAt: now });

      return true;
    }

    if (existing.count >= budget.requests) {
      return false;
    }

    existing.count += 1;
    existing.connected = connected;

    return true;
  }

  #roomForAnotherUnknown(now: number): boolean {
    let tracked = 0;

    for (const [key, window] of this.#windows) {
      // Expired windows are swept here rather than on a timer: the only moment
      // this map's size matters is the moment something is being added to it.
      if (window.connected) {
        continue;
      }

      if (now - window.startedAt >= this.#unknown.windowMs) {
        this.#windows.delete(key);
        continue;
      }

      tracked += 1;
    }

    return tracked < this.#maxTrackedUnknown;
  }

  /** Lets a revoked relationship stop counting as a generous one immediately. */
  public forget(publicKey: string): void {
    this.#windows.delete(publicKey);
  }
}
