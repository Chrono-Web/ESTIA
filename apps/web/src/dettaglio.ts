import { haChiave, tChiave } from "./i18n/index.js";

type Parametri = Readonly<Record<string, string | number>>;

/**
 * Una frase che scrive l'istanza — sulla cifratura, sui backup, sugli
 * aggiornamenti, sulla rete — nella lingua di chi legge (ADR 0044 §5).
 *
 * L'istanza manda il testo italiano e, accanto, la chiave del catalogo
 * `diagnostics` con i suoi parametri. Si usa la chiave quando questo client la
 * conosce; altrimenti — un'istanza più nuova della pagina, o una frase che
 * arriva da un'altra istanza e non ha chiave — si mostra il testo così com'è.
 *
 * Due forme, per lo stesso lavoro:
 *
 * - `dettaglio(rapporto)`, per ciò che porta `detail`, `detailKey` e
 *   `detailParams`;
 * - `dettaglio(testo, chiave, parametri)`, per i campi con un altro nome:
 *   `dettaglio(passo.note, passo.noteKey, passo.noteParams)`.
 */
export function dettaglio(fonte: {
  detail: string;
  detailKey?: string | undefined;
  detailParams?: Parametri | undefined;
}): string;
export function dettaglio(
  testo: string,
  chiave: string | undefined,
  parametri?: Parametri | undefined,
): string;
export function dettaglio(
  fonte:
    | string
    | { detail: string; detailKey?: string | undefined; detailParams?: Parametri | undefined },
  chiave?: string | undefined,
  parametri?: Parametri | undefined,
): string {
  const [testo, key, params] =
    typeof fonte === "string"
      ? [fonte, chiave, parametri]
      : [fonte.detail, fonte.detailKey, fonte.detailParams];

  return key !== undefined && haChiave(key) ? tChiave(key, params) : testo;
}
