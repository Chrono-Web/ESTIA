import type { AdminDiagnostics } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import { ScreenHead } from "../../app/ScreenHead.js";
import { useSignedIn } from "../../state.js";
import { Avatar, Icon, ListRow } from "../../ui/index.js";
import { filtra, GRUPPI, type Chiave } from "./registro.js";

/**
 * Il centro delle impostazioni.
 *
 * Gruppi di righe e una pagina per gruppo, invece di un muro unico: era la
 * forma di `Admin.tsx`, che impilava sette argomenti diversi in una schermata
 * sola e la rendeva illeggibile proprio a chi doveva usarla di corsa.
 *
 * **Gli allarmi salgono fin qui.** La diagnostica di M3 ha una regola precisa —
 * rosso solo dove chi amministra crede di essere protetto e non lo è — e
 * dividere le sezioni l'avrebbe tradita: un avviso che si trova solo aprendo la
 * pagina giusta è un avviso spento. Da qui si vede quale sezione ha qualcosa da
 * dire, senza che questa schermata sappia che cosa.
 */
function allarmi(diagnostica: AdminDiagnostics): ReadonlySet<Chiave> {
  const acceso = new Set<Chiave>();

  if (diagnostica.dataDurability === "anonymous" || diagnostica.dataDurability === "ephemeral") {
    acceso.add("stato");
  }

  if (!diagnostica.atRest.consistent) {
    acceso.add("stato");
  }

  if (diagnostica.connections.some((visto) => visto.origin === "public")) {
    acceso.add("stato");
  }

  if (diagnostica.lastUpgrade?.backupStatus === "failed") {
    acceso.add("stato");
  }

  // Configurati e fermi è un allarme; non configurati è una constatazione.
  if (diagnostica.backups.health === "missing" || diagnostica.backups.health === "stale") {
    acceso.add("backup");
  }

  return acceso;
}

export function Impostazioni(): React.ReactElement {
  const { token, user } = useSignedIn();
  const [termine, setTermine] = useState("");
  const [accesi, setAccesi] = useState<ReadonlySet<Chiave>>(new Set());
  const amministra = user.role === "instance_admin";

  useEffect(() => {
    if (!amministra) {
      return;
    }

    void api
      .diagnostics(token)
      .then((diagnostica) => setAccesi(allarmi(diagnostica)))
      .catch(() => undefined);
  }, [amministra, token]);

  const gruppi = filtra(GRUPPI, termine)
    .map((gruppo) => ({
      ...gruppo,
      voci: gruppo.voci.filter((voce) => voce.soloAdmin !== true || amministra),
    }))
    .filter((gruppo) => gruppo.voci.length > 0);

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

        <search className="card">
          <label className="only-screen-reader" htmlFor="cerca-impostazioni">
            Cerca nelle impostazioni
          </label>
          <div className="cluster">
            <Icon name="search" size={18} />
            <input
              autoComplete="off"
              className="input grow"
              id="cerca-impostazioni"
              onChange={(event) => setTermine(event.target.value)}
              placeholder="Cerca nelle impostazioni"
              type="search"
              value={termine}
            />
          </div>
        </search>

        {gruppi.map((gruppo) => (
          <div className="card card--flush" key={gruppo.titolo}>
            <h2 className="gruppo">{gruppo.titolo}</h2>
            {gruppo.voci.map((voce) => (
              <ListRow
                alarm={accesi.has(voce.chiave)}
                icon={voce.icona}
                key={voce.chiave}
                note={voce.nota}
                title={voce.titolo}
                to={voce.to}
              />
            ))}
          </div>
        ))}

        {gruppi.length === 0 && (
          <div className="card">
            <p className="muted">Nessuna impostazione con questo nome.</p>
          </div>
        )}
      </main>
    </>
  );
}
