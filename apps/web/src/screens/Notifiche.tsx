import { EmptyState } from "../ui/index.js";

/**
 * Le notifiche: destinazione vera, funzione ancora da costruire.
 *
 * Seguiranno il profilo e le relazioni della persona, non un flusso globale.
 * Finché non esistono, la pagina lo dichiara.
 */
export function Notifiche(): React.ReactElement {
  return (
    <main className="column column--feed">
      <div className="feed-pad">
        <EmptyState icon="bell" title="Le notifiche non ci sono ancora">
          <p>
            Qui arriveranno gli avvisi che riguardano te: richieste di follow, risposte, e ciò che
            succede sul tuo profilo. Non un flusso di tutta la rete.
          </p>
        </EmptyState>
      </div>
    </main>
  );
}
