import { Sezione } from "./Sezione.js";

export function Informazioni(): React.ReactElement {
  return (
    <Sezione titolo="Informazioni">
      <div className="card">
        <h2>Che cos&apos;è ESTIA</h2>
        <p>
          Un social network in cui i contenuti stanno fisicamente su una macchina che è tua, o della
          tua comunità. Non c&apos;è un algoritmo che decide l&apos;ordine, non c&apos;è pubblicità,
          e non c&apos;è nessuna azienda in mezzo che debba essere creduta sulla parola.
        </p>
        <p className="muted">
          Quello che scrivi qui non viene copiato altrove. Quando cancelli un post è cancellato
          davvero, perché non ne esiste una copia da nessun&apos;altra parte.
        </p>
      </div>

      <div className="card">
        <h2>Licenza</h2>
        <p className="muted">
          ESTIA è software libero sotto <strong>AGPL-3.0</strong>. Chiunque può leggerne il codice,
          modificarlo e ospitarne una copia; chi lo offre ad altri come servizio deve rendere
          disponibili le proprie modifiche. È la licenza che rende difficile trasformarlo nella cosa
          da cui vuole difendere.
        </p>
      </div>
    </Sezione>
  );
}
