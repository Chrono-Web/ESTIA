import type { Params, Translator } from "@estia/i18n";

import { box, richText, type Style } from "../console.js";
import { UnsafeArchiveEntryError } from "./archive.js";
import { BackupKeyError } from "./crypto.js";
import { RestoreDestinationOccupiedError } from "./service.js";

/**
 * Everything the backup CLI prints, in the language of whoever runs it
 * (ADR 0044). Pure functions of a translator and a style, so the tests read
 * them in both languages without running a command.
 *
 * The command names — `chiavi`, `backup`, `ripristina`, `--sovrascrivi` — are
 * commands, not sentences, and are the same in every language.
 */

const COMMAND = "node dist/backup/cli.js";

/** A problem the CLI itself finds, said with a catalogue key. */
export class CliProblem extends Error {
  public constructor(
    public readonly key: string,
    public readonly params?: Params,
  ) {
    super(key);
    this.name = "CliProblem";
  }
}

/** Each line of a sentence after the first, indented under a tree branch. */
function indented(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function usageText(translator: Translator, style: Style): string {
  const { t } = translator;
  const archive = `<${t("server.backup_cli.usage.arg_archive")}>`;
  const destination = `<${t("server.backup_cli.usage.arg_destination")}>`;

  return [
    "",
    box(style, [style.cyan(`🔐 ${t("server.backup_cli.usage.title")}`)]),
    "",
    style.bold(`🛠  ${t("server.backup_cli.usage.commands")}`),
    `   ${style.cyan("├──")} ${style.bold(`${COMMAND} chiavi`)}`,
    indented(t("server.backup_cli.usage.keys"), "   │   "),
    "   │",
    `   ${style.cyan("├──")} ${style.bold(`${COMMAND} backup ${destination}`)}`,
    indented(t("server.backup_cli.usage.backup"), "   │   "),
    "   │",
    `   ${style.cyan("└──")} ${style.bold(`${COMMAND} ripristina ${archive} ${destination} [--sovrascrivi]`)}`,
    indented(t("server.backup_cli.usage.restore"), "       "),
    "",
    style.dim(`📖 ${indented(t("server.backup_cli.usage.footer"), "   ").slice(3)}`),
    "",
  ].join("\n");
}

export function keyPairText(
  translator: Translator,
  style: Style,
  pair: { publicKey: string; privateKey: string },
): string {
  const { t } = translator;

  return [
    "",
    `  ${style.boldCyan("🔑 ")}${richText(translator, "server.backup_cli.keys.public", undefined, (_tag, text) => style.boldCyan(text))}`,
    "",
    `      ${style.cyan(pair.publicKey)}`,
    "",
    `  ${style.boldYellow("🔐 ")}${richText(translator, "server.backup_cli.keys.private", undefined, (tag, text) => (tag === "em" ? style.boldRed(text) : style.boldYellow(text)))}`,
    "",
    `      ${style.boldYellow(pair.privateKey)}`,
    "",
    indented(t("server.backup_cli.keys.warning"), "  ")
      .split("\n")
      .map((line) => style.dim(line))
      .join("\n"),
    "",
    "",
  ].join("\n");
}

/** A result line: label, value with its number in cyan. */
function counted(translator: Translator, style: Style, key: string, count: number): string {
  return richText(translator, key, { count }, (_tag, text) => style.cyan(text));
}

/** Labels padded to the longest, so the values line up in every language. */
function labelled(style: Style, rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(...rows.map(([label]) => [...label].length)) + 1;

  return rows.map(
    ([label, value], index) =>
      `   ${style.cyan(index === rows.length - 1 ? "└──" : "├──")} ${label.padEnd(width)}${value}`,
  );
}

export function backupDoneText(
  translator: Translator,
  style: Style,
  result: { path: string; fileCount: number; byteSize: number },
): string {
  const { t } = translator;

  return [
    `${style.green("●")} ${style.bold(t("server.backup_cli.backup.done"))}`,
    ...labelled(style, [
      [t("server.backup_cli.backup.archive"), style.bold(result.path)],
      [
        t("server.backup_cli.backup.files_label"),
        counted(translator, style, "server.backup_cli.backup.files", result.fileCount),
      ],
      [
        t("server.backup_cli.backup.size_label"),
        counted(translator, style, "server.backup_cli.backup.size", result.byteSize),
      ],
    ]),
    "",
    "",
  ].join("\n");
}

export function restoreDoneText(
  translator: Translator,
  style: Style,
  result: { destination: string; fileCount: number },
): string {
  const { t } = translator;

  return [
    `${style.green("●")} ${style.bold(t("server.backup_cli.restore.done"))}`,
    ...labelled(style, [
      [t("server.backup_cli.restore.destination"), style.bold(result.destination)],
      [
        t("server.backup_cli.restore.files_label"),
        counted(translator, style, "server.backup_cli.restore.files", result.fileCount),
      ],
    ]),
    "",
    "",
  ].join("\n");
}

export function privateKeyPromptText(translator: Translator, style: Style): string {
  const { t } = translator;
  const yellowBold = (_tag: string, text: string): string => style.boldYellow(text);

  return [
    "",
    box(style, [
      style.bold(`🔐 ${t("server.backup_cli.prompt.title")}`),
      "",
      richText(translator, "server.backup_cli.prompt.paste", undefined, (_tag, text) =>
        style.bold(text),
      ),
      richText(translator, "server.backup_cli.prompt.hint", undefined, yellowBold),
    ]),
    "",
  ].join("\n");
}

export function privateKeyQuestion(translator: Translator, style: Style): string {
  return `${style.bold(`👉 ${translator.t("server.backup_cli.prompt.question")}`)} `;
}

/** What went wrong, in the person's language when ESTIA knows what it was. */
export function errorText(translator: Translator, style: Style, error: unknown): string {
  const { t } = translator;
  let message: string;

  if (error instanceof CliProblem) {
    message = t(error.key, error.params);
  } else if (error instanceof BackupKeyError) {
    message = t(`server.backup_cli.error.${error.problem}`);
  } else if (error instanceof RestoreDestinationOccupiedError) {
    message = t("server.backup_cli.error.destination_occupied", { path: error.destination });
  } else if (error instanceof UnsafeArchiveEntryError) {
    message = t("server.backup_cli.error.unsafe_entry", { name: error.entry });
  } else if (error instanceof Error) {
    // The configuration's own messages (`ConfigurationError`) and the system's
    // (a missing file) go out as they are.
    message = error.message;
  } else {
    message = t("server.backup_cli.error.unexpected");
  }

  return `${style.red(`❌ ${t("server.backup_cli.error.label")}`)} ${message}\n`;
}
