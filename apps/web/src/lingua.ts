/**
 * La lingua dell'interfaccia (ADR 0046).
 *
 * Per ora è quella dichiarata da `index.html`. Quando la lingua entrerà fra le
 * preferenze della persona (ADR 0024), sarà quella scelta a cambiare l'attributo
 * `lang` della radice, e questa funzione non cambierà: lo stesso attributo dice
 * anche al lettore di schermo come pronunciare il testo.
 */
export function linguaCorrente(): string {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang === "" ? "it" : lang;
}
