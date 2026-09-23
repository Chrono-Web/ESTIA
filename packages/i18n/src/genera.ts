/**
 * `pnpm i18n`: checks the catalogues and writes everything that comes from
 * them (ADR 0044 §6).
 *
 * - `packages/i18n/src/keys.generated.ts` — the type of every key;
 * - `packages/i18n/src/languages.generated.ts` — languages and completeness;
 * - the sentence tables inside `install.sh` and `bin/estia`;
 * - the table of languages in `docs/TRANSLATIONS.md`.
 *
 * `pnpm i18n --check` writes nothing and fails if any of those is stale, which
 * is what the test in `generated.test.ts` runs in CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Catalogue, languages, SHELL_NAMESPACES, validate } from "./catalog.js";
import { readCatalogue } from "./node.js";
import {
  DOCS_BEGIN,
  DOCS_END,
  renderDocsTable,
  renderKeys,
  renderLanguages,
  renderShell,
  replaceBetween,
  SHELL_BEGIN,
  SHELL_END,
} from "./render.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export interface GeneratedFile {
  /** Relative to the repository root. */
  path: string;
  content: string;
}

async function formatted(path: string, source: string): Promise<string> {
  const prettier = await import("prettier");
  const absolute = REPOSITORY_ROOT + path;
  const options = (await prettier.resolveConfig(absolute)) ?? {};

  return prettier.format(source, { ...options, filepath: absolute });
}

function shellScript(
  path: string,
  catalogue: Catalogue,
  namespace: string,
): GeneratedFile | undefined {
  const current = readFileSync(REPOSITORY_ROOT + path, "utf8");
  const content = replaceBetween(
    current,
    SHELL_BEGIN,
    SHELL_END,
    renderShell(catalogue, [namespace]),
  );

  return content === undefined ? undefined : { content, path };
}

/** What the generated files should contain, given the catalogues on disk. */
export async function plan(catalogue: Catalogue = readCatalogue()): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const packagePath = PACKAGE_ROOT.slice(REPOSITORY_ROOT.length);

  for (const [name, source] of [
    ["keys.generated.ts", renderKeys(catalogue)],
    ["languages.generated.ts", renderLanguages(catalogue)],
  ] as const) {
    const path = `${packagePath}src/${name}`;
    files.push({ content: await formatted(path, source), path });
  }

  const [installerNamespace, cliNamespace] = SHELL_NAMESPACES;

  for (const [path, namespace] of [
    ["install.sh", installerNamespace],
    ["bin/estia", cliNamespace],
  ] as const) {
    const script = shellScript(path, catalogue, namespace);

    if (script !== undefined) {
      files.push(script);
    }
  }

  const docsPath = "docs/TRANSLATIONS.md";
  const docs = replaceBetween(
    readFileSync(REPOSITORY_ROOT + docsPath, "utf8"),
    DOCS_BEGIN,
    DOCS_END,
    renderDocsTable(languages(catalogue)),
  );

  if (docs !== undefined) {
    files.push({ content: await formatted(docsPath, docs), path: docsPath });
  }

  return files;
}

/** The generated files whose content on disk differs from what it should be. */
export function stale(files: readonly GeneratedFile[]): string[] {
  return files
    .filter((file) => {
      let current: string;

      try {
        current = readFileSync(REPOSITORY_ROOT + file.path, "utf8");
      } catch {
        return true;
      }

      return current !== file.content;
    })
    .map((file) => file.path);
}

async function main(argv: readonly string[]): Promise<number> {
  const check = argv.includes("--check");
  const catalogue = readCatalogue();
  const problems = validate(catalogue);

  if (problems.length > 0) {
    process.stderr.write(`The catalogues have ${problems.length} problem(s):\n\n`);

    for (const problem of problems) {
      process.stderr.write(`  - ${problem}\n`);
    }

    return 1;
  }

  const files = await plan(catalogue);
  const outdated = stale(files);

  if (check) {
    if (outdated.length > 0) {
      process.stderr.write(
        `Generated from the catalogues and out of date — run \`pnpm i18n\`:\n\n${outdated
          .map((path) => `  - ${path}`)
          .join("\n")}\n`,
      );

      return 1;
    }

    return 0;
  }

  for (const file of files) {
    if (outdated.includes(file.path)) {
      writeFileSync(REPOSITORY_ROOT + file.path, file.content);
      process.stdout.write(`updated ${file.path}\n`);
    }
  }

  for (const language of languages(catalogue)) {
    process.stdout.write(
      `${language.code}  ${String(language.percent).padStart(3)}%  ${language.name}\n`,
    );
  }

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
