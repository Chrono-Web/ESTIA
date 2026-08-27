import type { PostView } from "@estia/contracts";

/**
 * Che cosa resta sullo schermo mentre le case rispondono di nuovo.
 *
 * Prima, rientrare nella lente «rete» azzerava l'elenco: schermo vuoto, e sopra
 * la sala macchine («sto contattando…», casa per casa) come primo contenuto
 * della schermata. Non era un problema di grafica — era che la raggiungibilità
 * non esisteva da nessun'altra parte, quindi la diagnosi la pagava chi apriva
 * ([ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md)).
 *
 * Il confine da non superare è [ADR 0018] decisione 2: i contenuti di un'altra
 * casa **si visitano e non si copiano**, e «tiene i contenuti in memoria e non
 * li scrive su disco» è un vincolo di implementazione, non un'ottimizzazione
 * mancata. Quindi questa memoria vive nella scheda del browser e muore con lei:
 * niente `localStorage`, niente IndexedDB, niente che sopravviva alla chiusura.
 *
 * Da lì discendono le due regole qui sotto, e la seconda conta quanto la prima:
 *
 * - **durante** l'aggiornamento si mostra l'unione, così l'elenco non si
 *   accorcia sotto le dita di chi sta leggendo;
 * - **alla fine** si tiene solo ciò che è arrivato adesso. Una casa che non ha
 *   risposto si porta via i suoi post, ed è giusto così: mostrarli lo stesso
 *   sarebbe tenere in piedi contenuti che quella casa non può più autorizzare —
 *   cioè trasformare una visita in una copia senza dirlo.
 */

const perData = (uno: PostView, altro: PostView): number =>
  uno.createdAt < altro.createdAt ? 1 : uno.createdAt > altro.createdAt ? -1 : 0;

/**
 * L'unione di ciò che si ricorda e di ciò che sta arrivando, dal più recente.
 *
 * A parità di `id` vince il fresco: un post modificato, o con un cuore in più,
 * è quello appena arrivato e non quello di trenta secondi fa.
 */
export function unisci(ricordati: readonly PostView[], freschi: Iterable<PostView>): PostView[] {
  const per_id = new Map<string, PostView>();

  for (const post of ricordati) {
    per_id.set(post.id, post);
  }

  for (const post of freschi) {
    per_id.set(post.id, post);
  }

  return [...per_id.values()].sort(perData);
}

/** Ciò che resta quando tutte le case hanno detto la loro: solo il fresco. */
export function soloIlFresco(freschi: Iterable<PostView>): PostView[] {
  return [...freschi].sort(perData);
}
