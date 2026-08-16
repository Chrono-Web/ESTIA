import type { BackupArchiveView, BackupSettingsView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

/**
 * Backups from the panel, without a terminal (ADR 0016).
 *
 * There is no restore button, and its absence is the decision: a restore is
 * needed exactly when this page cannot be reached. The command is shown instead,
 * so that the procedure is written down where the person will look for it.
 */

function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} kB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(value: string): string {
  return new Date(value).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export interface BackupsProps {
  /**
   * Told whenever the backups change, so that «Stato dell'istanza» above does
   * not keep saying «non configurati» to someone who has just configured them.
   * Two cards describing the same thing must not disagree on the same screen.
   */
  onChanged: () => void;
}

export function Backups({ onChanged }: BackupsProps): React.ReactElement {
  const { token } = useSignedIn();
  const [settings, setSettings] = useState<BackupSettingsView | undefined>();
  const [archives, setArchives] = useState<BackupArchiveView[]>([]);
  const [privateKey, setPrivateKey] = useState<string | undefined>();
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [current, list] = await Promise.all([
      api.backupSettings(token),
      api.backupArchives(token),
    ]);

    setSettings(current);
    setArchives(list.archives);
    setPublicKey(current.publicKey ?? "");
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const guard = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);

    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Qualcosa non ha funzionato.");
    } finally {
      setBusy(false);
    }
  };

  const generate = (): Promise<void> =>
    guard(async () => {
      const pair = await api.createBackupKeys(token);

      // Shown once. The instance keeps only the public half, which is what
      // stops it from being able to read its own archives.
      setPrivateKey(pair.privateKey);
      setPublicKey(pair.publicKey);
    });

  const save = (): Promise<void> =>
    guard(async () => {
      const saved = await api.saveBackupSettings(token, {
        intervalHours: settings?.intervalHours ?? 24,
        keep: settings?.keep ?? 7,
        publicKey,
      });

      setSettings(saved);
      await load();
      onChanged();
    });

  const runNow = (): Promise<void> =>
    guard(async () => {
      await api.runBackup(token);
      await load();
      onChanged();
    });

  const download = (name: string): Promise<void> =>
    guard(async () => {
      const blob = await api.downloadBackup(token, name);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    });

  if (settings === undefined) {
    return <div className="card">Sto guardando i backup…</div>;
  }

  return (
    <div className="card">
      <h2>Backup</h2>

      {error !== undefined && <div className="alert error">{error}</div>}

      {privateKey !== undefined && (
        <div className="alert ok">
          Questa è la <strong>chiave privata</strong>. Compare una volta sola e l'istanza non la
          conserva: senza di lei nessuno può riaprire i tuoi backup, noi compresi. Mettila in un
          gestore di password, o stampala — <strong>fuori da questo NAS</strong>.
          <code className="secret">{privateKey}</code>
        </div>
      )}

      {!settings.editable && (
        <div className="alert">
          Questi backup sono configurati dalle variabili d'ambiente del container, quindi da qui si
          vedono ma non si cambiano: modificarli qui verrebbe annullato al prossimo riavvio.
        </div>
      )}

      <div className="row">
        <div className="grow">
          Chiave pubblica
          <div className="muted">
            Sull'istanza vive solo questa. È ciò che le impedisce di rileggere i propri archivi.
          </div>
        </div>
        {settings.configured ? (
          <span className="badge on">impostata</span>
        ) : (
          <span className="badge">mancante</span>
        )}
      </div>

      <div className="actions spaced">
        <input
          aria-label="Chiave pubblica di backup"
          className="grow-input"
          disabled={!settings.editable}
          onChange={(event) => setPublicKey(event.target.value)}
          placeholder="age1…"
          value={publicKey}
        />
        <button disabled={busy || !settings.editable} onClick={() => void generate()} type="button">
          Genera una coppia
        </button>
      </div>

      <div className="actions spaced">
        <label className="inline">
          Ogni
          <input
            aria-label="Ore fra un backup e il successivo"
            disabled={!settings.editable}
            max={720}
            min={1}
            onChange={(event) =>
              setSettings({ ...settings, intervalHours: Number(event.target.value) })
            }
            type="number"
            value={settings.intervalHours}
          />
          ore
        </label>
        <label className="inline">
          Tienine
          <input
            aria-label="Quanti archivi tenere"
            disabled={!settings.editable}
            max={365}
            min={1}
            onChange={(event) => setSettings({ ...settings, keep: Number(event.target.value) })}
            type="number"
            value={settings.keep}
          />
        </label>
        <button disabled={busy || !settings.editable} onClick={() => void save()} type="button">
          Salva
        </button>
        <button disabled={busy || !settings.configured} onClick={() => void runNow()} type="button">
          Fai un backup adesso
        </button>
      </div>

      <div className="muted">
        Gli archivi vanno in <code>{settings.directory}</code>.
      </div>

      {settings.directoryIsBesideData && (
        <div className="alert">
          Sono <strong>sullo stesso disco dei dati</strong>: ti proteggono da un errore e da un
          aggiornamento andato male, non dalla rottura del disco né dal furto del NAS. Scaricane uno
          ogni tanto e tienilo altrove — è cifrato apposta perché tu possa metterlo ovunque.
        </div>
      )}

      {archives.length === 0 && <p className="empty">Nessun archivio, per ora.</p>}

      {archives.map((archive) => (
        <div className="row" key={archive.name}>
          <div className="grow">
            {archive.name.startsWith("estia-aggiornamento-") ? (
              <strong>Prima di un aggiornamento</strong>
            ) : (
              <strong>Backup periodico</strong>
            )}
            <div className="muted">
              {when(archive.modifiedAt)} · {size(archive.byteSize)}
            </div>
          </div>
          <button disabled={busy} onClick={() => void download(archive.name)} type="button">
            Scarica
          </button>
        </div>
      ))}

      <div className="muted">
        <strong>Ripristinare non si fa da qui</strong>, di proposito: serve proprio quando questa
        pagina non si apre più. Si fa da terminale, con l'archivio e la chiave privata, ed è scritto
        nella guida di installazione.
      </div>
    </div>
  );
}
