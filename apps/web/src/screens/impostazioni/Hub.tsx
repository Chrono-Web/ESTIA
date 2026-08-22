import type { AdminDiagnostics, FederationView } from "@estia/contracts";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { api } from "../../api.js";
import { useSignedIn } from "../../state.js";
import { Icon, ListRow } from "../../ui/index.js";
import { filtra, GRUPPI, type Chiave } from "./registro.js";

/**
 * La lista delle sezioni.
 *
 * Sul telefono è l'unica cosa che si vede sull'hub. Sul desktop è la colonna
 * sinistra del guscio. Gli allarmi della diagnostica salgono qui — e con loro
 * chi sta aspettando alla porta e le richieste EstiaNet in arrivo, altrimenti
 * «Fai entrare» e «Accetta» vivono solo se apri la pagina giusta (euristica 6:
 * riconoscere piuttosto che ricordare).
 */
function allarmi(
  diagnostica: AdminDiagnostics,
  federazione: FederationView | undefined,
  inAttesa: number,
): ReadonlySet<Chiave> {
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

  if (diagnostica.backups.health === "missing" || diagnostica.backups.health === "stale") {
    acceso.add("backup");
  }

  if (federazione?.instances.some((row) => row.state === "richiesta_ricevuta") === true) {
    acceso.add("estianet");
  }

  if (inAttesa > 0) {
    acceso.add("inviti");
  }

  return acceso;
}

export function SettingsNav(): React.ReactElement {
  const { token, user } = useSignedIn();
  const { pathname } = useLocation();
  const [termine, setTermine] = useState("");
  const [accesi, setAccesi] = useState<ReadonlySet<Chiave>>(new Set());
  const amministra = user.role === "instance_admin";

  useEffect(() => {
    if (!amministra) {
      return;
    }

    void Promise.all([api.diagnostics(token), api.federation(token), api.joinRequests(token)])
      .then(([diagnostica, federazione, richieste]) =>
        setAccesi(allarmi(diagnostica, federazione, richieste.requests.length)),
      )
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
      <header className="screen-head">
        <h1 className="screen-head__title">Impostazioni</h1>
      </header>

      <div className="stack">
        <search className="split-layout__search">
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
          <div className="list-block" key={gruppo.titolo}>
            <h2 className="gruppo">{gruppo.titolo}</h2>
            {gruppo.voci.map((voce) => (
              <ListRow
                active={pathname === voce.to}
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

        {gruppi.length === 0 && <p className="muted">Nessuna impostazione con questo nome.</p>}
      </div>
    </>
  );
}
