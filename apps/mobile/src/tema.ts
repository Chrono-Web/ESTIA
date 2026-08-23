import type { FeedKind } from "@estia/contracts";

export interface Palette {
  fondo: string;
  fondoVetro: string;
  superficie: string;
  superficieCard: string;
  superficieVetro: string;
  bordo: string;
  bordoSottile: string;
  bordoForte: string;
  vetroBordo: string;
  vetroLuminoso: string;
  pillolaFondo: string;
  pillolaAttiva: string;
  testo: string;
  testoMorbido: string;
  accento: string;
  suAccento: string;
  accentoLocale: string;
  accentoRete: string;
  rete: string;
  pericolo: string;
  pericoloFondo: string;
  rail: string;
  ombraVetro: string;
}

export const paletteChiaroBase = {
  accentoLocale: "#b4552d",
  accentoRete: "#2b6b7a",
  bordo: "rgba(0, 0, 0, 0.08)",
  bordoForte: "#757575",
  bordoSottile: "rgba(0, 0, 0, 0.05)",
  fondo: "#f9f9fb",
  fondoVetro: "rgba(255, 255, 255, 0.78)",
  ombraVetro: "rgba(0, 0, 0, 0.10)",
  pericolo: "#a32d2d",
  pericoloFondo: "#f8eaea",
  pillolaAttiva: "#ffffff",
  pillolaFondo: "rgba(120, 120, 128, 0.12)",
  rail: "rgba(0, 0, 0, 0.08)",
  rete: "#2b6b7a",
  suAccento: "#ffffff",
  superficie: "#f0f0f4",
  superficieCard: "#ffffff",
  superficieVetro: "rgba(245, 245, 248, 0.85)",
  testo: "#111113",
  testoMorbido: "#71717a",
  vetroBordo: "rgba(255, 255, 255, 0.80)",
  vetroLuminoso: "rgba(255, 255, 255, 0.95)",
};

export const paletteScuroBase = {
  accentoLocale: "#e0844f",
  accentoRete: "#5fb3c9",
  bordo: "rgba(255, 255, 255, 0.10)",
  bordoForte: "#8a8a8a",
  bordoSottile: "rgba(255, 255, 255, 0.06)",
  fondo: "#0a0a0c",
  fondoVetro: "rgba(22, 22, 26, 0.80)",
  ombraVetro: "rgba(0, 0, 0, 0.45)",
  pericolo: "#e08278",
  pericoloFondo: "#1f1210",
  pillolaAttiva: "rgba(255, 255, 255, 0.18)",
  pillolaFondo: "rgba(120, 120, 128, 0.24)",
  rail: "rgba(255, 255, 255, 0.10)",
  rete: "#5fb3c9",
  suAccento: "#0a0a0c",
  superficie: "#18181c",
  superficieCard: "#141417",
  superficieVetro: "rgba(26, 26, 30, 0.85)",
  testo: "#f4f4f6",
  testoMorbido: "#a1a1aa",
  vetroBordo: "rgba(255, 255, 255, 0.14)",
  vetroLuminoso: "rgba(255, 255, 255, 0.12)",
};

export function creaPalette(scuro: boolean, modo: FeedKind = "locale"): Palette {
  const base = scuro ? paletteScuroBase : paletteChiaroBase;
  const accento = modo === "seguiti" ? base.accentoRete : base.accentoLocale;
  return {
    ...base,
    accento,
  };
}

export const paletteChiaro: Palette = creaPalette(false, "locale");
export const paletteScuro: Palette = creaPalette(true, "locale");
