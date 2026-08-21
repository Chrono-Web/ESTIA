import { ApiError } from "./api.js";

/**
 * Che cosa si legge quando qualcosa non riesce.
 *
 * Le cause arrivano da due posti, e la regola le distingue. Quello che manda
 * l'istanza è già una frase scritta per chi la legge (`DomainError`), e si
 * mostra com'è. Quello che alza il browser — la rete caduta, l'istanza
 * irraggiungibile — è testo dell'ambiente («Failed to fetch»), e non si mostra
 * mai: al suo posto va la frase di chi ha chiesto l'azione, che sa qual era.
 *
 * È l'euristica 9 di `DESIGN_SYSTEM.md`: causa e prossima mossa quando si
 * conoscono, mai un codice grezzo come unico esito.
 */
export function spiega(causa: unknown, ripiego: string): string {
  if (causa instanceof ApiError) {
    return causa.message;
  }

  // `fetch` fallisce con TypeError quando non arriva a destinazione: è l'unico
  // caso in cui la macchina sa più di quanto possa dire, e la frase utile è
  // quella che dice come rimediare.
  if (causa instanceof TypeError) {
    return "Non riesco a raggiungere l'istanza. Controlla il collegamento e riprova.";
  }

  return ripiego;
}
