/**
 * La faccia di una persona, finché non c'è una faccia.
 *
 * Le foto profilo non esistono ancora in ESTIA — non nello schema, non nelle
 * API — quindi qui si mostrano le iniziali su un fondo colorato. Lo slot per
 * l'immagine c'è già: il giorno che il profilo porterà un `avatarId`, entra
 * `src` e il resto di questo componente non cambia.
 *
 * Il colore **è una classe**, non un attributo `style`, e la ragione è la
 * policy dell'istanza: `style-src 'self'` senza `unsafe-inline` fa scartare dal
 * browser qualunque colore scritto sull'elemento.
 */

const PALETTES = 6;

/** Deterministico e stabile: la stessa persona ha sempre lo stesso colore. */
function paletteOf(seed: string): number {
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.codePointAt(0)!) % 100_000;
  }

  return hash % PALETTES;
}

/** Una lettera, o due se il nome ne offre due distinte. */
function initialsOf(name: string, fallback: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");

  if (words.length === 0) {
    return (fallback[0] ?? "?").toUpperCase();
  }

  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";

  return `${first}${second}`.toUpperCase();
}

export type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  /** Il nome visibile: è da qui che escono le iniziali. */
  displayName: string;
  /** Lo username: decide il colore, perché non cambia quando cambia il nome. */
  username: string;
  size?: AvatarSize;
}

export function Avatar({ displayName, username, size = "md" }: AvatarProps): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar--${size} avatar--c${String(paletteOf(username))}`}
    >
      {initialsOf(displayName, username)}
    </span>
  );
}
