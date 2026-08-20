import type { AdminDiagnostics } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { Backups } from "../../../components/Backups.js";
import { useSignedIn } from "../../../state.js";
import { Alert } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/** Rosso solo dove chi amministra crede di essere protetto e non lo è. */
const ALLARMANTI = ["missing", "stale"];

function dimensione(byte: number): string {
  return byte < 1024 * 1024
    ? `${String(Math.round(byte / 1024))} kB`
    : `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

export function Backup(): React.ReactElement {
  const { token } = useSignedIn();
  const [diagnostica, setDiagnostica] = useState<AdminDiagnostics | undefined>();

  const carica = useCallback(async () => {
    setDiagnostica(await api.diagnostics(token));
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const backups = diagnostica?.backups;

  return (
    <Sezione titolo="Backup">
      {backups !== undefined && (
        <div className="card">
          <h2>Stato</h2>
          <p className="muted">{backups.detail}</p>
          {backups.last !== undefined && (
            <p className="muted">
              Ultimo archivio: {backups.last.name} · {dimensione(backups.last.byteSize)}
            </p>
          )}
          {backups.lastUpgradeArchive !== undefined && (
            <p className="muted">
              Prima dell&apos;ultimo aggiornamento: {backups.lastUpgradeArchive.name}
            </p>
          )}

          {/* Una previsione, non un guasto: il backup che verrebbe ucciso dal
              limite di memoria del container non ha ancora fallito. */}
          {backups.memoryWarning !== undefined && <Alert>{backups.memoryWarning}</Alert>}

          {ALLARMANTI.includes(backups.health) && (
            <Alert tone="error">
              I backup sono configurati ma <strong>non stanno funzionando</strong>. Finché non è
              sistemato, questa istanza non ha da dove tornare indietro.
            </Alert>
          )}
        </div>
      )}

      <Backups onChanged={() => void carica()} />
    </Sezione>
  );
}
