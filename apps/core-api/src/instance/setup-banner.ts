import type { Translator } from "@estia/i18n";

/**
 * What the process prints at first start, with the setup code, in the language
 * of its environment — the installer passes its own as `ESTIA_LANG`, so an
 * instance installed in English says this in English (ADR 0044 §3).
 */
export function setupBanner(translator: Translator, token: string): string {
  const { t } = translator;

  return [
    "",
    `  ${t("server.setup.title")}`,
    `  ${t("server.setup.instructions")}`,
    "",
    `      ${token}`,
    "",
    `  ${t("server.setup.validity")}`,
    "",
    "",
  ].join("\n");
}
