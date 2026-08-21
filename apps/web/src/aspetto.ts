/**
 * Preferenze UI personali (ADR 0024).
 *
 * Dopo il login vince il server. Prima, e sullo schermo di accesso,
 * `localStorage` è solo cache — così lo splash non lampeggia sul tema di sistema
 * mentre si aspetta `/me`.
 */

import {
  DEFAULT_UI_PREFERENCES,
  type Aspetto,
  type Contrasto,
  type Palette,
  type UiPreferences,
} from "@estia/contracts";

export type { Aspetto, Contrasto, Palette, UiPreferences };

const CHIAVE = "estia.ui";
const CHIAVE_LEGACY = "estia.aspetto";
const CHIAVE_MIGRAZIONE = "estia.ui.migrato";

const ASPETTI: readonly Aspetto[] = ["sistema", "chiaro", "scuro"];
const CONTRASTI: readonly Contrasto[] = ["normale", "alto"];
const PALETTE: readonly Palette[] = ["terracotta", "ambra-acqua", "rosso-petrolio", "neutro"];

export function isAspetto(value: unknown): value is Aspetto {
  return typeof value === "string" && (ASPETTI as readonly string[]).includes(value);
}

export function isContrasto(value: unknown): value is Contrasto {
  return typeof value === "string" && (CONTRASTI as readonly string[]).includes(value);
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTE as readonly string[]).includes(value);
}

export function isUiPreferences(value: unknown): value is UiPreferences {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return isAspetto(record.aspetto) && isContrasto(record.contrasto) && isPalette(record.palette);
}

function leggiCacheLocale(): UiPreferences {
  const grezzo = globalThis.localStorage?.getItem(CHIAVE);

  if (grezzo !== undefined && grezzo !== null) {
    try {
      const letto = JSON.parse(grezzo) as unknown;

      if (isUiPreferences(letto)) {
        return letto;
      }
    } catch {
      // Cache corrotta: si ricomincia dai default.
    }
  }

  // Migrazione dalla sola chiave `estia.aspetto` di prima di ADR 0024.
  const legacy = globalThis.localStorage?.getItem(CHIAVE_LEGACY);

  if (isAspetto(legacy)) {
    return { ...DEFAULT_UI_PREFERENCES, aspetto: legacy };
  }

  return { ...DEFAULT_UI_PREFERENCES };
}

export function leggiPreferenze(): UiPreferences {
  return leggiCacheLocale();
}

/** Solo l'asse aspetto, per i radio rapidi del menù Altro. */
export function leggiAspetto(): Aspetto {
  return leggiPreferenze().aspetto;
}

export function scriviPreferenzeLocali(preferences: UiPreferences): void {
  globalThis.localStorage?.setItem(CHIAVE, JSON.stringify(preferences));
  globalThis.localStorage?.removeItem(CHIAVE_LEGACY);
  applicaPreferenze(preferences);
}

export function scriviAspetto(aspetto: Aspetto): void {
  scriviPreferenzeLocali({ ...leggiPreferenze(), aspetto });
}

export function applicaPreferenze(preferences: UiPreferences = leggiPreferenze()): void {
  const root = document.documentElement;

  if (preferences.aspetto === "sistema") {
    delete root.dataset.aspetto;
  } else {
    root.dataset.aspetto = preferences.aspetto;
  }

  if (preferences.contrasto === "normale") {
    delete root.dataset.contrasto;
  } else {
    root.dataset.contrasto = preferences.contrasto;
  }

  if (preferences.palette === "terracotta") {
    delete root.dataset.palette;
  } else {
    root.dataset.palette = preferences.palette;
  }
}

/** Alias storico: applica solo l'asse aspetto, lasciando contrasto e palette. */
export function applicaAspetto(aspetto: Aspetto = leggiAspetto()): void {
  applicaPreferenze({ ...leggiPreferenze(), aspetto });
}

/**
 * All'ingresso: il server vince. Se in cache c'è un aspetto scelto e sul
 * profilo ci sono ancora i default, si fa una migrazione one-shot verso il
 * profilo (e non si ripete).
 */
export function preferenzeDaServer(appearance: UiPreferences): {
  daApplicare: UiPreferences;
  daMigrare: UiPreferences | undefined;
} {
  const locale = leggiCacheLocale();
  const giaMigrato = globalThis.localStorage?.getItem(CHIAVE_MIGRAZIONE) === "1";
  const serverDefault =
    appearance.aspetto === DEFAULT_UI_PREFERENCES.aspetto &&
    appearance.contrasto === DEFAULT_UI_PREFERENCES.contrasto &&
    appearance.palette === DEFAULT_UI_PREFERENCES.palette;
  const localeHaAspetto = locale.aspetto !== DEFAULT_UI_PREFERENCES.aspetto;

  if (!giaMigrato && serverDefault && localeHaAspetto) {
    const migrate: UiPreferences = {
      aspetto: locale.aspetto,
      contrasto: appearance.contrasto,
      palette: appearance.palette,
    };

    return { daApplicare: migrate, daMigrare: migrate };
  }

  return { daApplicare: appearance, daMigrare: undefined };
}

export function marcaMigrazioneFatta(): void {
  globalThis.localStorage?.setItem(CHIAVE_MIGRAZIONE, "1");
}

export const CATALOGO_PALETTE: readonly {
  id: Palette;
  titolo: string;
  nota: string;
}[] = [
  {
    id: "terracotta",
    titolo: "Terracotta",
    nota: "La coppia di partenza: caldo in casa, freddo in rete.",
  },
  {
    id: "ambra-acqua",
    titolo: "Ambra e acqua",
    nota: "Caldo ambrato e acqua fredda, stesso contrasto.",
  },
  {
    id: "rosso-petrolio",
    titolo: "Rosso e petrolio",
    nota: "Più saturo: le due lenti restano distinte.",
  },
  {
    id: "neutro",
    titolo: "Neutro",
    nota: "Accenti sul testo: utile con il contrasto alto.",
  },
];
