import process from "node:process";

import { BRIDGE_LANGUAGE, createTranslator, type Params, type Translator } from "@estia/i18n";
import { createProcessTranslator } from "@estia/i18n/node";

/**
 * What the server process and its command-line tools print to a terminal, in
 * the language their environment asks for (ADR 0044 §3): `ESTIA_LANG`, which
 * the installer sets on the container, then the POSIX locale, then English.
 *
 * Logs are not here: they stay in English (ADR 0044 §5).
 */
export function consoleTranslator(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Translator {
  try {
    return createProcessTranslator(environment, ["server", "meta"]);
  } catch {
    // Without its catalogues the process still has to print the setup code:
    // an empty translator shows the keys, and the code next to them.
    return createTranslator({ catalogs: {}, language: BRIDGE_LANGUAGE });
  }
}

/** Colours for a terminal, or nothing at all when `NO_COLOR` is set. */
export interface Style {
  bold(text: string): string;
  dim(text: string): string;
  cyan(text: string): string;
  green(text: string): string;
  red(text: string): string;
  boldCyan(text: string): string;
  boldYellow(text: string): string;
  boldRed(text: string): string;
}

export function terminalStyle(colour: boolean): Style {
  const wrap =
    (code: string) =>
    (text: string): string =>
      colour ? `\x1b[${code}m${text}\x1b[0m` : text;

  return {
    bold: wrap("1"),
    boldCyan: wrap("1;36"),
    boldRed: wrap("1;31"),
    boldYellow: wrap("1;33"),
    cyan: wrap("36"),
    dim: wrap("2"),
    green: wrap("32"),
    red: wrap("31"),
  };
}

// eslint-disable-next-line no-control-regex -- the escape sequences are what this removes
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * The columns a string takes in a terminal: colours take none, a pictograph
 * takes two, the emoji variation selector none. Enough for the alphabets of
 * today's catalogues and the icons ESTIA prints.
 */
export function displayWidth(text: string): number {
  let width = 0;

  for (const character of text.replace(ANSI, "")) {
    const code = character.codePointAt(0) ?? 0;

    if (code === 0xfe0f) {
      continue;
    }

    width += code >= 0x1f300 && code <= 0x1faff ? 2 : 1;
  }

  return width;
}

/**
 * The double-line box of ESTIA's titles, 68 columns inside or wider when a
 * translated line needs it, so the right border never cuts a sentence.
 */
export function box(style: Style, rows: readonly string[]): string {
  const inner = Math.max(68, ...rows.map((row) => displayWidth(row) + 3));
  const border = "═".repeat(inner);

  return [
    style.cyan(`╔${border}╗`),
    ...rows.map(
      (row) =>
        `${style.cyan("║")}  ${row}${" ".repeat(inner - 2 - displayWidth(row))}${style.cyan("║")}`,
    ),
    style.cyan(`╚${border}╝`),
  ].join("\n");
}

/**
 * A sentence with rich tags, each turned into terminal text by `render`
 * (ADR 0044 §1: the catalogue names the emphasis, the code decides its look).
 */
export function richText(
  translator: Translator,
  key: string,
  params: Params | undefined,
  render: (tag: string, text: string) => string,
): string {
  return translator
    .rich(key, params)
    .map((segment) => (typeof segment === "string" ? segment : render(segment.tag, segment.text)))
    .join("");
}
