import { EmptyState } from "../ui/index.js";

/**
 * I messaggi diretti: destinazione vera, funzione ancora da costruire.
 *
 * ADR 0006 impone che arrivino con la cifratura end-to-end nello stesso
 * rilascio. Finché non c'è, questa pagina lo dice — niente chat finta.
 */
export function Messaggi(): React.ReactElement {
  return (
    <main className="column column--feed">
      <div className="feed-pad">
        <EmptyState icon="send" title="I messaggi non ci sono ancora">
          <p>
            Qui arriveranno i messaggi diretti e i gruppi, cifrati da un capo all&apos;altro. Non
            esiste una versione in chiaro di mezzo: quando ci saranno, saranno privati anche
            rispetto a chi ospita l&apos;istanza.
          </p>
        </EmptyState>
      </div>
    </main>
  );
}
