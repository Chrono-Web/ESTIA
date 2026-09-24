/**
 * Every refusal the server sends has a sentence in the catalogue (ADR 0044 §5).
 *
 * The client shows `errors.<code>` in the reader's language, and falls back to
 * the server's own message only for a code it does not know — which, for a
 * code this server sends, means a sentence someone forgot to write. This test
 * reads the source the way a reviewer would: every `new DomainError("code", …)`
 * and every reply written as `{ code: "…", message }`, and asks the Italian
 * catalogue for each code.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { localesDirectory } from "@estia/i18n/node";
import { placeholdersOf } from "@estia/i18n";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Codes with no sentence on purpose. `bad_request` is what a schema
 * validation error becomes: the client shows the sentence of whoever asked
 * (`spiega` in `apps/web/src/errori.ts`), and a catalogue sentence would take
 * its place for every malformed form.
 */
const WITHOUT_SENTENCE = new Set(["bad_request"]);

/**
 * Codes built at run time, which the scan cannot read. None today; a new one
 * goes here, with every value it can take.
 */
const DYNAMIC_CODES: readonly string[] = [];

interface Site {
  where: string;
  code: string;
  /** The names given in `params`, or `undefined` when there is no fourth argument. */
  params: string[] | undefined;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(full);
    }

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

function propertyNames(node: ts.ObjectLiteralExpression): string[] {
  return node.properties.flatMap((property) =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      ? [property.name.text]
      : [],
  );
}

function scan(): { sites: Site[]; unreadable: string[] } {
  const sites: Site[] = [];
  const unreadable: string[] = [];

  for (const file of sourceFiles(SOURCE)) {
    const text = readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const where = (node: ts.Node): string =>
      `${path.relative(SOURCE, file)}:${String(tree.getLineAndCharacterOfPosition(node.getStart()).line + 1)}`;

    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && node.expression.getText() === "DomainError") {
        const [code, , , params] = node.arguments ?? [];

        if (code !== undefined && ts.isStringLiteral(code)) {
          sites.push({
            code: code.text,
            params:
              params === undefined
                ? undefined
                : ts.isObjectLiteralExpression(params)
                  ? propertyNames(params)
                  : ["*"],
            where: where(node),
          });
        } else {
          unreadable.push(where(node));
        }
      }

      // A reply written by hand: `reply.status(404).send({ code: "…", message: "…" })`.
      if (ts.isObjectLiteralExpression(node)) {
        const names = propertyNames(node);
        const code = node.properties.find(
          (property): property is ts.PropertyAssignment =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "code",
        );

        if (
          names.includes("message") &&
          code !== undefined &&
          ts.isStringLiteral(code.initializer)
        ) {
          sites.push({ code: code.initializer.text, params: undefined, where: where(node) });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(tree);
  }

  return { sites, unreadable };
}

const italian = JSON.parse(
  readFileSync(path.join(localesDirectory(), "it", "errors.json"), "utf8"),
) as Record<string, string>;

describe("the sentences of the server's refusals", () => {
  const { sites, unreadable } = scan();

  it("finds the refusals it is meant to check", () => {
    // A scan that silently finds nothing would pass everything below.
    expect(sites.length).toBeGreaterThan(100);
    expect(sites.map((site) => site.code)).toContain("rate_limited");
  });

  it("reads every code from the source, or knows it is built at run time", () => {
    expect(unreadable, "DomainError codes that are not a string literal").toEqual([]);
  });

  it("has an Italian sentence for every code", () => {
    const missing = [
      ...sites.filter((site) => !WITHOUT_SENTENCE.has(site.code)).map((site) => site.code),
      ...DYNAMIC_CODES,
    ]
      .filter((code, index, all) => all.indexOf(code) === index)
      .filter((code) => italian[code] === undefined);

    expect(missing, "codes without a sentence in packages/i18n/locales/it/errors.json").toEqual([]);
  });

  it("gives every placeholder of a sentence a value", () => {
    const unfilled = sites.flatMap((site) => {
      const sentence = italian[site.code];

      if (sentence === undefined || site.params?.includes("*") === true) {
        return [];
      }

      return placeholdersOf(sentence)
        .filter((name) => !(site.params ?? []).includes(name))
        .map((name) => `${site.where}: ${site.code} needs {{${name}}} in its params`);
    });

    expect(unfilled).toEqual([]);
  });
});
