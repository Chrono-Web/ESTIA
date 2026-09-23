import { ApiError } from "./api.js";
import { haChiave, t, tChiave } from "./i18n/index.js";

/**
 * Che cosa si legge quando qualcosa non riesce.
 *
 * Le cause arrivano da due posti, e la regola le distingue. Quello che manda
 * l'istanza ha un codice stabile, e la frase per quel codice sta nel catalogo
 * `errors`, nella lingua di chi legge e con i parametri che l'istanza ha
 * mandato (ADR 0044 §5). Quello che alza il browser — la rete caduta, l'istanza
 * irraggiungibile — è testo dell'ambiente («Failed to fetch»), e non si mostra
 * mai: al suo posto va la frase di chi ha chiesto l'azione, che sa qual era.
 *
 * È l'euristica 9 di `DESIGN_SYSTEM.md`: causa e prossima mossa quando si
 * conoscono, mai un codice grezzo come unico esito.
 */
export function spiega(causa: unknown, ripiego: string): string {
  if (causa instanceof ApiError) {
    const chiave = `errors.${causa.code}`;

    if (haChiave(chiave)) {
      return tChiave(chiave, causa.params);
    }

    // Un rifiuto della validazione degli schemi non ha un codice di ESTIA, e
    // il suo testo è per chi programma: vale di più la frase di chi ha chiesto.
    if (causa.code.startsWith("FST_") || causa.code === "bad_request") {
      return ripiego;
    }

    // Un codice che questo client non conosce ancora — un'istanza più nuova
    // della pagina: il messaggio dell'istanza è l'ultima risposta sensata.
    return causa.message;
  }

  // `fetch` fallisce con TypeError quando non arriva a destinazione: è l'unico
  // caso in cui la macchina sa più di quanto possa dire, e la frase utile è
  // quella che dice come rimediare.
  if (causa instanceof TypeError) {
    return t("common.error.unreachable");
  }

  return ripiego;
}
