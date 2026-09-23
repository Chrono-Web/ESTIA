/**
 * `estia/no-ui-literal`: visible text belongs in the catalogues, not in the
 * code (ADR 0044 §6).
 *
 * The rule looks for three things in the web client:
 *
 * 1. text between JSX tags — `<p>Salva</p>`;
 * 2. a string given to a JSX attribute that is not technical —
 *    `placeholder="Cerca"`, `titolo="Aspetto"`;
 * 3. any other string or template literal that reads like a sentence — it has
 *    a letter and a space, or starts with a capital letter, or has an accented
 *    letter, guillemets or an ellipsis.
 *
 * What it leaves alone, because it is not text anyone reads: class lists,
 * paths and URLs, import sources, object keys, literal types, comparisons
 * (`event.key === "ArrowDown"`), the messages of `new Error(...)` — which are
 * for whoever reads the stack trace — and `console.*`.
 *
 * A real exception is declared on its line, with the reason:
 * `// eslint-disable-next-line estia/no-ui-literal -- a brand name, never translated`.
 *
 * Plain JavaScript and no build step, so `eslint.config.mjs` can import it
 * before anything is compiled.
 */

/** Attributes whose values are for the machine, not for a reader. */
const TECHNICAL_ATTRIBUTES = new Set([
  "accept",
  "action",
  "as",
  "autoCapitalize",
  "autoComplete",
  "autoCorrect",
  "className",
  "clipRule",
  "crossOrigin",
  "cx",
  "cy",
  "d",
  "dateTime",
  "decoding",
  "dir",
  "download",
  "encType",
  "enterKeyHint",
  "fill",
  "fillRule",
  "form",
  "height",
  "href",
  "htmlFor",
  "icon",
  "id",
  "inputMode",
  "k",
  "key",
  "kind",
  "lang",
  "loading",
  "method",
  "mode",
  "modo",
  "name",
  "pattern",
  "points",
  "preserveAspectRatio",
  "r",
  "referrerPolicy",
  "rel",
  "role",
  "rx",
  "ry",
  "size",
  "sizes",
  "spellCheck",
  "src",
  "srcSet",
  "stroke",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeWidth",
  "target",
  "tipo",
  "to",
  "tone",
  "transform",
  "type",
  "value",
  "variant",
  "viewBox",
  "width",
  "wrap",
  "x",
  "x1",
  "x2",
  "xmlns",
  "y",
  "y1",
  "y2",
]);

/** `aria-*` attributes that point at things rather than say things. */
const TECHNICAL_ARIA = new Set([
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-busy",
  "aria-checked",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-disabled",
  "aria-expanded",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-selected",
  "aria-sort",
]);

/** Attributes whose whole purpose is to be read, even when the value is one lowercase word. */
const TEXT_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
]);

function isTechnicalAttribute(name) {
  return TECHNICAL_ATTRIBUTES.has(name) || TECHNICAL_ARIA.has(name) || name.startsWith("data-");
}

const LETTER = /\p{L}/u;
const ACCENTED = /[À-ÖØ-öø-ÿ]/u;
const PROSE_MARKS = /[«»…“”’]/u;
const CAPITALIZED_WORD = /^\p{Lu}\p{Ll}/u;
const WORD_SPACE_WORD = /[\p{L}\p{N}][\p{L}\p{N},.;:!?'’)]*\s+[\p{L}(«"“]/u;
/** `ApiError`, `EstiaNet`: an identifier or a brand, one word with inner capitals. */
const PASCAL_CASE = /^\p{Lu}\p{Ll}+(\p{Lu}[\p{Ll}\p{N}]*)+$/u;
/** Protocol words that happen to be capitalized. */
const PROTOCOL = /^Bearer\s/;
/** An identifier or a key: one lowercase token of technical characters. */
const MACHINE_TOKEN = /^[a-z0-9_\-:/[\]().#=@%&?*+,${}]+$/;
/** A token that only code writes: it has a hyphen, underscore, colon, slash, dot or digit. */
const TECHNICAL_CHARACTER = /[-_:/.\d]/;
const PATH_OR_URL = /^(\/|\.\/|\.\.\/|https?:|mailto:|data:|#|blob:)/;

/** Whether a string reads like something a person reads. */
export function looksLikeText(value) {
  const text = value.trim();

  if (text === "" || !LETTER.test(text)) {
    return false;
  }

  if (PATH_OR_URL.test(text) || PASCAL_CASE.test(text) || PROTOCOL.test(text)) {
    return false;
  }

  // `invalid_setup_token`, `card card--flush`: lowercase tokens, and — when
  // there is more than one — at least one carrying something prose does not.
  // Without that second condition «solo per te» would pass for a class list.
  const tokens = text.split(/\s+/);

  if (
    tokens.every((token) => MACHINE_TOKEN.test(token)) &&
    (tokens.length === 1 ||
      tokens.some((token) => !/^\d+$/.test(token) && TECHNICAL_CHARACTER.test(token)))
  ) {
    return false;
  }

  return (
    WORD_SPACE_WORD.test(text) ||
    CAPITALIZED_WORD.test(text) ||
    ACCENTED.test(text) ||
    PROSE_MARKS.test(text)
  );
}

function isInsideComparison(node) {
  const parent = node.parent;

  if (parent === undefined || parent === null) {
    return false;
  }

  if (parent.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(parent.operator)) {
    return true;
  }

  return parent.type === "SwitchCase" && parent.test === node;
}

function calleeName(callee) {
  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (callee.type === "MemberExpression" && callee.object.type === "Identifier") {
    return `${callee.object.name}.${callee.property.type === "Identifier" ? callee.property.name : ""}`;
  }

  return "";
}

/** Methods whose string arguments are matched or looked up, never shown. */
const LOOKUP_METHODS = new Set([
  "addEventListener",
  "closest",
  "endsWith",
  "get",
  "getAttribute",
  "getItem",
  "has",
  "includes",
  "indexOf",
  "lastIndexOf",
  "match",
  "matchAll",
  "querySelector",
  "querySelectorAll",
  "removeEventListener",
  "removeItem",
  "replace",
  "replaceAll",
  "search",
  "setItem",
  "split",
  "startsWith",
]);

/** Places where a string is code, whatever it looks like. */
function isExempt(node) {
  let current = node;
  let parent = node.parent;

  // Walk up through the trivial wrappers a string can sit in.
  while (
    parent !== undefined &&
    parent !== null &&
    ["TemplateLiteral", "ConditionalExpression", "LogicalExpression", "TSAsExpression"].includes(
      parent.type,
    )
  ) {
    current = parent;
    parent = parent.parent;
  }

  if (parent === undefined || parent === null) {
    return false;
  }

  switch (parent.type) {
    case "ImportDeclaration":
    case "ExportAllDeclaration":
    case "ExportNamedDeclaration":
    case "ImportExpression":
    case "TSLiteralType":
    case "TSEnumMember":
    case "TSExternalModuleReference":
    case "TSImportType":
      return true;
    case "Property":
      return parent.key === current && !parent.computed;
    case "NewExpression":
      return parent.callee.type === "Identifier" && /Error$/.test(parent.callee.name);
    case "CallExpression": {
      const name = calleeName(parent.callee);

      if (
        parent.callee.type === "MemberExpression" &&
        parent.callee.property.type === "Identifier" &&
        LOOKUP_METHODS.has(parent.callee.property.name)
      ) {
        return true;
      }

      return (
        name.startsWith("console.") ||
        name === "t" ||
        name === "tChiave" ||
        name === "haChiave" ||
        name === "require" ||
        name === "import.meta.glob"
      );
    }
    default:
      return isInsideComparison(current);
  }
}

function attributeName(node) {
  let current = node.parent;

  while (current !== undefined && current !== null) {
    if (current.type === "JSXAttribute") {
      return current.name.type === "JSXNamespacedName"
        ? `${current.name.namespace.name}:${current.name.name.name}`
        : current.name.name;
    }

    if (current.type === "JSXElement" || current.type === "Program") {
      return undefined;
    }

    current = current.parent;
  }

  return undefined;
}

const MESSAGE =
  "Visible text in the code: move it to the catalogue (packages/i18n/locales) and use t() or <T> — ADR 0044.";

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Visible text belongs in the translation catalogues (ADR 0044)." },
    messages: { literal: MESSAGE },
    schema: [],
  },
  create(context) {
    const report = (node) => context.report({ messageId: "literal", node });

    const checkString = (node, value) => {
      if (isExempt(node)) {
        return;
      }

      const attribute = attributeName(node);

      if (attribute !== undefined && isTechnicalAttribute(attribute)) {
        return;
      }

      // An attribute that exists to be read: any letter is text someone reads.
      if (attribute !== undefined && TEXT_ATTRIBUTES.has(attribute)) {
        if (LETTER.test(value) && !PATH_OR_URL.test(value.trim())) {
          report(node);
        }

        return;
      }

      // Anything else — a component's own prop, a variable, a return value —
      // is text when it reads like text. `chiave="lingua"` does not.
      if (looksLikeText(value)) {
        report(node);
      }
    };

    return {
      JSXText(node) {
        if (LETTER.test(node.value)) {
          report(node);
        }
      },
      Literal(node) {
        if (typeof node.value === "string") {
          checkString(node, node.value);
        }
      },
      TemplateLiteral(node) {
        if (node.parent?.type === "TaggedTemplateExpression") {
          return;
        }

        // Each `${…}` stands in as `0`: a number next to words (`${n} min` →
        // «0 min», prose), part of a value next to units (`${n}px` → «0px»)
        // and of an identifier next to code (`card${suffix}` → «card0»).
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? "").join("0");

        if (node.quasis.every((quasi) => (quasi.value.cooked ?? "").trim() === "")) {
          return;
        }

        checkString(node, text);
      },
    };
  },
};

export default {
  meta: { name: "estia" },
  rules: { "no-ui-literal": rule },
};
