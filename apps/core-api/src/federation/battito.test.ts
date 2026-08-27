import { describe, expect, it } from "vitest";

import {
  BATTITO_BASE_MS,
  BATTITO_MASSIMO_MS,
  BattitoDelleIstanze,
  type IstanzeDaGuardare,
} from "./battito.js";
import type { RemoteInstanceRecord, RemoteState } from "./repository.js";

/**
 * Il battito di [ADR 0041], e le due cose che deve fare bene.
 *
 * La prima è il ritmo: chiedere quando è ora, arretrare invece di tacere, e non
 * scambiare il proprio battito per traffico in arrivo — un errore che si nota
 * solo dopo due giri, quindi va tenuto fermo da un test e non dall'attenzione.
 *
 * La seconda è il risveglio della coda, che è la ragione per cui questo file
 * esiste: **una sola volta al passaggio**, non a ogni battito riuscito, perché
 * rimettere in partenza una coda ogni cinque minuti sarebbe un modo elaborato
 * di non avere l'arretramento di ADR 0029.
 */

class CaseFinte implements IstanzeDaGuardare {
  readonly #righe = new Map<string, RemoteInstanceRecord>();

  public constructor(chiavi: readonly string[], state: RemoteState = "collegata") {
    for (const chiave of chiavi) {
      this.#righe.set(chiave, {
        createdAt: "2026-08-27T10:00:00.000Z",
        declaredName: `casa-${chiave}`,
        id: `id-${chiave}`,
        lastReachedVia: null,
        lastSeenAt: null,
        publicKey: chiave,
        state,
        updatedAt: "2026-08-27T10:00:00.000Z",
      });
    }
  }

  public list(): RemoteInstanceRecord[] {
    return [...this.#righe.values()];
  }

  public findByKey(publicKey: string): RemoteInstanceRecord | undefined {
    return this.#righe.get(publicKey);
  }

  /** Quello che scrive `markSeen` quando una richiesta arriva da fuori. */
  public siEFattaViva(publicKey: string, quando: string): void {
    const riga = this.#righe.get(publicKey);

    if (riga !== undefined) {
      this.#righe.set(publicKey, { ...riga, lastSeenAt: quando });
    }
  }

  public scollega(publicKey: string): void {
    const riga = this.#righe.get(publicKey);

    if (riga !== undefined) {
      this.#righe.set(publicKey, { ...riga, state: "bloccata" });
    }
  }
}

/** Una federazione che risponde quello che le si dice, e conta le domande. */
class FederazioneFinta {
  public chieste: string[] = [];
  public risponde = true;

  readonly #case: CaseFinte | undefined;
  readonly #orologio: (() => number) | undefined;

  public constructor(case_?: CaseFinte, orologio?: () => number) {
    this.#case = case_;
    this.#orologio = orologio;
  }

  public ping(publicKey: string): Promise<{ reached: boolean }> {
    this.chieste.push(publicKey);

    // Un ping riuscito scrive `last_seen_at`, esattamente come quello vero.
    if (this.risponde && this.#case !== undefined && this.#orologio !== undefined) {
      this.#case.siEFattaViva(publicKey, new Date(this.#orologio()).toISOString());
    }

    return Promise.resolve({ reached: this.risponde });
  }
}

function conOrologio(): { adesso: () => number; avanza: (ms: number) => void } {
  let t = 1_700_000_000_000;

  return {
    adesso: () => t,
    avanza: (ms: number) => {
      t += ms;
    },
  };
}

describe("il battito fra istanze", () => {
  it("chiede subito la prima volta, poi tace fino al ritmo", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa"]);
    const federation = new FederazioneFinta(case_, orologio.adesso);
    const battito = new BattitoDelleIstanze({
      federation,
      now: orologio.adesso,
      remotes: case_,
    });

    // Appena avviata l'istanza «non so» non è «spenta»: si chiede.
    expect(await battito.batti()).toMatchObject({ chieste: 1, raggiunte: 1 });
    expect(battito.raggiungibile("alfa")).toBe(true);

    // Il proprio battito ha appena scritto `last_seen_at`: il giro dopo non deve
    // scambiarlo per traffico in arrivo, e non deve chiedere di nuovo.
    orologio.avanza(30_000);
    expect(await battito.batti()).toMatchObject({ chieste: 0 });

    orologio.avanza(BATTITO_BASE_MS);
    expect(await battito.batti()).toMatchObject({ chieste: 1 });
    expect(federation.chieste).toHaveLength(2);
  });

  it("arretra invece di tacere, e si ferma al tetto", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa"]);
    const federation = new FederazioneFinta(case_, orologio.adesso);
    federation.risponde = false;

    const battito = new BattitoDelleIstanze({
      federation,
      now: orologio.adesso,
      remotes: case_,
    });

    await battito.batti();
    expect(battito.raggiungibile("alfa")).toBe(false);

    // 5 → 10 → 20 → 40 → 60 (tetto). Prima dell'attesa non si chiede.
    for (const attesa of [10, 20, 40, 60].map((minuti) => minuti * 60_000)) {
      orologio.avanza(attesa - 1_000);
      expect(await battito.batti()).toMatchObject({ chieste: 0 });

      orologio.avanza(1_000);
      expect(await battito.batti()).toMatchObject({ chieste: 1 });
    }

    // Al tetto ci resta: non cresce oltre l'ora.
    orologio.avanza(BATTITO_MASSIMO_MS);
    expect(await battito.batti()).toMatchObject({ chieste: 1 });
  });

  it("un contatto in arrivo vale come battito, e non costa una richiesta", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa"]);
    const federation = new FederazioneFinta(case_, orologio.adesso);
    federation.risponde = false;

    const battito = new BattitoDelleIstanze({
      federation,
      now: orologio.adesso,
      remotes: case_,
    });

    await battito.batti();
    expect(battito.raggiungibile("alfa")).toBe(false);

    // Si riaccende e ci scrive lei: una ricerca, un cuore, un messaggio.
    case_.siEFattaViva("alfa", "2026-08-27T11:00:00.000Z");

    const giro = await battito.batti();

    expect(giro.chieste).toBe(0);
    expect(giro.risvegliate).toBe(1);
    expect(battito.raggiungibile("alfa")).toBe(true);

    // E l'attesa è tornata al ritmo normale, non a quella dell'arretramento.
    orologio.avanza(BATTITO_BASE_MS);
    expect(await battito.batti()).toMatchObject({ chieste: 1 });
  });

  it("risveglia la coda al passaggio, e una volta sola", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa"]);
    const federation = new FederazioneFinta(case_, orologio.adesso);
    const risvegli: string[] = [];

    const battito = new BattitoDelleIstanze({
      federation,
      now: orologio.adesso,
      remotes: case_,
      risveglia: (chiave) => risvegli.push(chiave),
    });

    await battito.batti();
    expect(risvegli).toEqual(["alfa"]);

    // Battiti riusciti a ripetizione non sono passaggi: la coda non si tocca.
    for (let giro = 0; giro < 3; giro += 1) {
      orologio.avanza(BATTITO_BASE_MS);
      await battito.batti();
    }

    expect(risvegli).toEqual(["alfa"]);

    // Si spegne…
    federation.risponde = false;
    orologio.avanza(BATTITO_BASE_MS);
    await battito.batti();
    expect(battito.raggiungibile("alfa")).toBe(false);

    // …e torna: adesso sì.
    federation.risponde = true;
    orologio.avanza(BATTITO_MASSIMO_MS);
    await battito.batti();

    expect(risvegli).toEqual(["alfa", "alfa"]);
  });

  it("guarda solo le case collegate, e dimentica quelle che non lo sono più", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa", "beta"]);
    const federation = new FederazioneFinta(case_, orologio.adesso);

    const battito = new BattitoDelleIstanze({
      federation,
      now: orologio.adesso,
      remotes: case_,
    });

    expect(await battito.batti()).toMatchObject({ chieste: 2 });

    case_.scollega("beta");
    orologio.avanza(BATTITO_BASE_MS);

    expect(await battito.batti()).toMatchObject({ chieste: 1 });
    expect(federation.chieste.filter((chiave) => chiave === "beta")).toHaveLength(1);
    expect(battito.raggiungibile("beta")).toBeUndefined();
  });

  it("una casa che non risponde non fa saltare il giro delle altre", async () => {
    const orologio = conOrologio();
    const case_ = new CaseFinte(["alfa", "beta"]);
    const battito = new BattitoDelleIstanze({
      federation: {
        ping: (publicKey) =>
          publicKey === "beta"
            ? Promise.reject(new Error("niente rete"))
            : Promise.resolve({ reached: true }),
      },
      now: orologio.adesso,
      remotes: case_,
    });

    const giro = await battito.batti();

    expect(giro).toMatchObject({ chieste: 2, raggiunte: 1 });
    expect(battito.raggiungibile("alfa")).toBe(true);
    expect(battito.raggiungibile("beta")).toBe(false);
  });
});
