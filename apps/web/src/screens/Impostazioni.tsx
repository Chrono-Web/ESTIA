import { api } from "../api.js";
import { ScreenHead } from "../app/ScreenHead.js";
import { useSignedIn } from "../state.js";
import { Avatar, Button, ListRow } from "../ui/index.js";

/**
 * Il centro delle impostazioni.
 *
 * Per ora raccoglie ciò che esiste già e stava sparso nella barra in alto. La
 * forma però è quella definitiva: **gruppi di righe, una pagina per gruppo**,
 * invece di un muro unico. È divulgazione progressiva, e serve soprattutto a
 * chi amministra: la diagnostica, i backup, gli inviti e la federazione sono
 * sette argomenti diversi, e oggi stanno tutti in una schermata sola.
 */
export function Impostazioni(): React.ReactElement {
  const { instance, signOut, token, user } = useSignedIn();

  const esci = async (): Promise<void> => {
    try {
      await api.logout(token);
    } catch {
      // La sessione può essere già finita: lo stato locale si pulisce comunque.
    }

    signOut();
  };

  return (
    <>
      <ScreenHead title="Impostazioni" />

      <main className="column column--detail stack">
        <div className="card cluster">
          <Avatar displayName={user.displayName} size="lg" username={user.username} />
          <div className="grow">
            <strong>{user.displayName}</strong>
            <div className="muted">@{user.username}</div>
          </div>
        </div>

        <div className="card card--flush">
          <ListRow
            icon="user"
            note="Nome visibile, descrizione, chi può seguirti"
            title="Profilo"
            to="/profilo"
          />
          <ListRow
            icon="shield"
            note="Ogni accesso è un dispositivo, e si revoca da qui"
            title="Dispositivi collegati"
            to="/impostazioni/dispositivi"
          />
        </div>

        {user.role === "instance_admin" && (
          <div className="card card--flush">
            <ListRow
              icon="instance"
              note="Chi entra, inviti, backup, rete e stato dell'istanza"
              title="Amministrazione"
              to="/impostazioni/istanza"
            />
          </div>
        )}

        <div className="card">
          <h2>Questa istanza</h2>
          <p className="muted">
            <strong>{instance.name}</strong> ·{" "}
            {instance.memberCount === 1 ? "1 persona" : `${String(instance.memberCount)} persone`}
          </p>
          <p className="muted">
            ESTIA è software libero, sotto licenza AGPL-3.0. I contenuti stanno su questa macchina e
            non su quella di qualcun altro.
          </p>
        </div>

        <Button block onClick={() => void esci()} variant="secondary">
          Esci
        </Button>
      </main>
    </>
  );
}
