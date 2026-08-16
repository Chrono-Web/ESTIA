import type {
  AdminDiagnostics,
  AuditEventView,
  BackupHealth,
  InviteView,
  JoinRequestView,
  SchemaBackupStatus,
} from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { Backups } from "../components/Backups.js";
import { useSignedIn } from "../state.js";

const AUDIT_LABELS: Record<string, string> = {
  invite_created: "Invito creato",
  invite_revoked: "Invito ritirato",
  join_request_rejected: "Richiesta rifiutata",
  member_admitted: "Persona ammessa",
};

const AT_REST_LABELS: Record<AdminDiagnostics["atRest"]["detected"], string> = {
  active: "rilevata",
  inactive: "non rilevata",
  unknown: "non verificabile",
};

const DECLARED_LABELS: Record<AdminDiagnostics["atRest"]["declared"], string> = {
  automatic: "sblocco automatico",
  none: "nessuna, per scelta",
  passphrase: "passphrase all'avvio",
  unspecified: "non dichiarata",
};

const UPGRADE_LABELS: Record<SchemaBackupStatus, string> = {
  created: "con backup",
  failed: "backup fallito",
  not_configured: "senza backup",
};

const BACKUP_LABELS: Record<BackupHealth, string> = {
  healthy: "attivi",
  missing: "nessun archivio",
  not_configured: "non configurati",
  stale: "in ritardo",
  waiting: "in attesa del primo",
};

/** Rosso solo dove l'amministratore crede di essere protetto e non lo è. */
const BACKUP_ALARMING: readonly BackupHealth[] = ["missing", "stale"];

function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} kB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(value: string): string {
  return new Date(value).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Admin(): React.ReactElement {
  const { refreshInstance, token } = useSignedIn();
  const [requests, setRequests] = useState<JoinRequestView[]>([]);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostics | undefined>();
  const [freshCode, setFreshCode] = useState<string | undefined>();
  const [reusable, setReusable] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [pending, list, audit, health] = await Promise.all([
      api.joinRequests(token),
      api.invites(token),
      api.audit(token),
      api.diagnostics(token),
    ]);

    setRequests(pending.requests);
    setInvites(list.invites);
    setEvents(audit.events);
    setDiagnostics(health);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (): Promise<void> => {
    setBusy(true);

    try {
      const created = await api.createInvite(token, {
        label,
        ...(reusable ? { maxUses: 10 } : {}),
      });

      // Shown once: the instance keeps only the hash.
      setFreshCode(created.code);
      setLabel("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (request: JoinRequestView, approve: boolean): Promise<void> => {
    await (approve ? api.approve(token, request.id) : api.reject(token, request.id));
    await Promise.all([load(), refreshInstance()]);
  };

  return (
    <main>
      <div className="card">
        <h1>Chi vuole entrare</h1>

        {requests.length === 0 && <p className="empty">Nessuna richiesta in attesa.</p>}

        {requests.map((request) => (
          <div className="row" key={request.id}>
            <div className="grow">
              <strong>{request.displayName}</strong>{" "}
              <span className="muted">@{request.username}</span>
              {request.message !== "" && <div>{request.message}</div>}
              <div className="muted">Ha chiesto il {when(request.createdAt)}</div>
            </div>
            <div className="actions">
              <button onClick={() => void decide(request, true)} type="button">
                Fai entrare
              </button>
              <button className="danger" onClick={() => void decide(request, false)} type="button">
                Rifiuta
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Inviti</h2>

        {freshCode !== undefined && (
          <div className="alert ok">
            Ecco il codice da consegnare. Compare solo adesso: l'istanza ne conserva un'impronta,
            non il codice.
            <code className="secret">{freshCode}</code>
          </div>
        )}

        <div className="actions spaced">
          <input
            aria-label="Nota sull'invito"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Per chi è? es. Scala B"
            className="grow-input"
            value={label}
          />
          <button disabled={busy} onClick={() => void create()} type="button">
            Crea invito
          </button>
        </div>

        <label>
          <input
            checked={reusable}
            onChange={(event) => setReusable(event.target.checked)}
            type="checkbox"
          />{" "}
          Riutilizzabile fino a 10 persone
          <span className="hint">
            Un invito monouso è più sicuro: se gira di mano in mano, ne serve uno nuovo ogni volta.
          </span>
        </label>

        {invites.length === 0 && <p className="empty">Nessun invito creato.</p>}

        {invites.map((invite) => (
          <div className="row" key={invite.id}>
            <div className="grow">
              <strong>{invite.label === "" ? "Invito" : invite.label}</strong>{" "}
              {invite.usable ? (
                <span className="badge on">valido</span>
              ) : (
                <span className="badge">esaurito</span>
              )}
              <div className="muted">
                Usato {invite.usedCount} di {invite.maxUses} · scade il {when(invite.expiresAt)}
              </div>
            </div>
            {invite.usable && (
              <button
                className="danger"
                onClick={() => void api.revokeInvite(token, invite.id).then(load)}
                type="button"
              >
                Ritira
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Stato dell'istanza</h2>
        {diagnostics !== undefined && (
          <>
            <div className="row">
              <div className="grow">Persone</div>
              <strong>{diagnostics.memberCount}</strong>
            </div>
            <div className="row">
              <div className="grow">
                Cifratura dei dati a riposo
                <div className="muted">{diagnostics.atRest.detail}</div>
                {diagnostics.atRest.declared !== "unspecified" && (
                  <div className="muted">
                    Dichiarata in configurazione: {DECLARED_LABELS[diagnostics.atRest.declared]}.
                  </div>
                )}
              </div>
              <span
                className={
                  diagnostics.atRest.consistent && diagnostics.atRest.detected === "active"
                    ? "badge on"
                    : "badge"
                }
              >
                {AT_REST_LABELS[diagnostics.atRest.detected]}
              </span>
            </div>

            {/* Solo quando manca: una directory con i permessi giusti è la
                norma, e dirlo ogni volta la trasformerebbe in rumore. */}
            {!diagnostics.dataDirectorySecure && (
              <div className="row">
                <div className="grow">
                  Permessi della cartella dei dati
                  <div className="muted">
                    Il filesystem ha rifiutato di stringerla a 0700: altri utenti di questa macchina
                    possono elencarne il contenuto. Succede sulle condivisioni di rete e su alcuni
                    bind mount.
                  </div>
                </div>
                <span className="badge">troppo aperti</span>
              </div>
            )}

            {/* Un backup che ha smesso di funzionare non si nota finché non
                serve. Qui si nota. */}
            <div className="row">
              <div className="grow">
                Backup automatici
                <div className="muted">{diagnostics.backups.detail}</div>
                {diagnostics.backups.last !== undefined && (
                  <div className="muted">
                    {diagnostics.backups.last.name} · {size(diagnostics.backups.last.byteSize)}
                  </div>
                )}
                {diagnostics.backups.lastUpgradeArchive !== undefined && (
                  <div className="muted">
                    Prima dell'ultimo aggiornamento: {diagnostics.backups.lastUpgradeArchive.name}
                  </div>
                )}
              </div>
              <span className={diagnostics.backups.health === "healthy" ? "badge on" : "badge"}>
                {BACKUP_LABELS[diagnostics.backups.health]}
              </span>
            </div>

            {/* Una previsione, non un guasto: il backup che verrebbe ucciso
                dal limite di memoria del container non ha ancora fallito. */}
            {diagnostics.backups.memoryWarning !== undefined && (
              <div className="alert">{diagnostics.backups.memoryWarning}</div>
            )}

            {BACKUP_ALARMING.includes(diagnostics.backups.health) && (
              <div className="alert error">
                I backup sono configurati ma <strong>non stanno funzionando</strong>. Finché non è
                sistemato, questa istanza non ha da dove tornare indietro.
              </div>
            )}

            {/* Una protezione dichiarata che l'istanza non vede è la cosa più
                pericolosa da mostrare in silenzio (ADR 0007). */}
            {!diagnostics.atRest.consistent && (
              <div className="alert error">
                La configurazione dichiara una cifratura che l'istanza non rileva. Finché non è
                chiarito, considera i dati <strong>non protetti</strong> da un furto del NAS.
              </div>
            )}

            {/* Le migrazioni vanno solo in avanti: se un aggiornamento è stato
                applicato senza backup, resta senza punto di ritorno per sempre,
                e non è una cosa che possa sparire al riavvio dopo (ADR 0014). */}
            {diagnostics.lastUpgrade !== undefined && (
              <>
                <div className="row">
                  <div className="grow">
                    Ultimo aggiornamento dello schema
                    <div className="muted">
                      Versione {diagnostics.lastUpgrade.fromVersion} →{" "}
                      {diagnostics.lastUpgrade.toVersion}, il{" "}
                      {when(diagnostics.lastUpgrade.appliedAt)}
                    </div>
                    {diagnostics.lastUpgrade.backupStatus === "created" && (
                      <div className="muted">{diagnostics.lastUpgrade.detail}</div>
                    )}
                  </div>
                  <span
                    className={
                      diagnostics.lastUpgrade.backupStatus === "created" ? "badge on" : "badge"
                    }
                  >
                    {UPGRADE_LABELS[diagnostics.lastUpgrade.backupStatus]}
                  </span>
                </div>

                {/* La stessa frase dei log e dell'API, non una sua parafrasi: due
                    testi che raccontano lo stesso fatto finiscono per divergere,
                    e questo è un fatto su cui non ci si può permettere due
                    versioni. In rosso solo il backup fallito, perché chi lo ha
                    configurato crede di essere protetto e non lo è. */}
                {diagnostics.lastUpgrade.backupStatus !== "created" && (
                  <div
                    className={
                      diagnostics.lastUpgrade.backupStatus === "failed" ? "alert error" : "alert"
                    }
                  >
                    {diagnostics.lastUpgrade.detail}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Backups onChanged={() => void load()} />

      <div className="card">
        <h2>Registro</h2>
        {events.length === 0 && <p className="empty">Ancora nulla da mostrare.</p>}
        {events.map((event) => (
          <div className="row" key={event.id}>
            <div className="grow">
              {AUDIT_LABELS[event.action] ?? event.action}
              {event.action === "member_admitted" && <> · {event.subject}</>}
              <div className="muted">
                {when(event.createdAt)}
                {event.actorUsername !== null && <> · da {event.actorUsername}</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
