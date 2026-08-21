import type { BackupArchiveView, BackupSettingsView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { Alert, Badge, Button } from "../ui/index.js";

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

      {error !== undefined && <Alert tone="error">{error}</Alert>}

      {privateKey !== undefined && (
        <Alert tone="ok">
          <p>
            Questa è la <strong>chiave privata</strong>. Compare una volta sola e l&apos;istanza non
            la conserva: senza di lei nessuno può riaprire i tuoi backup, noi compresi. Mettila in
            un gestore di password, o stampala — <strong>fuori da questo NAS</strong>.
          </p>
          <code className="secret">{privateKey}</code>
        </Alert>
      )}

      {!settings.editable && (
        <Alert>
          Questi backup sono configurati dalle variabili d&apos;ambiente del container, quindi da
          qui si vedono ma non si cambiano: modificarli qui verrebbe annullato al prossimo riavvio.
        </Alert>
      )}

      <div className="row">
        <span className="row__body">
          <span className="row__title">Chiave pubblica</span>
          <span className="row__note">
            Sull&apos;istanza vive solo questa. È ciò che le impedisce di rileggere i propri
            archivi.
          </span>
        </span>
        <span className="row__end">
          {settings.configured ? <Badge tone="on">impostata</Badge> : <Badge>mancante</Badge>}
        </span>
      </div>

      <div className="cluster">
        <input
          aria-label="Chiave pubblica di backup"
          className="input grow"
          disabled={!settings.editable}
          onChange={(event) => setPublicKey(event.target.value)}
          placeholder="age1…"
          value={publicKey}
        />
        <Button disabled={busy || !settings.editable} onClick={() => void generate()}>
          Genera una coppia
        </Button>
      </div>

      <div className="cluster">
        <label className="campo-breve">
          Ogni
          <input
            aria-label="Ore fra un backup e il successivo"
            className="input"
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
        <label className="campo-breve">
          Tienine
          <input
            aria-label="Quanti archivi tenere"
            className="input"
            disabled={!settings.editable}
            max={365}
            min={1}
            onChange={(event) => setSettings({ ...settings, keep: Number(event.target.value) })}
            type="number"
            value={settings.keep}
          />
        </label>
        <Button disabled={busy || !settings.editable} onClick={() => void save()}>
          Salva
        </Button>
        <Button
          disabled={busy || !settings.configured}
          onClick={() => void runNow()}
          variant="secondary"
        >
          Fai un backup adesso
        </Button>
      </div>

      <p className="muted">
        Gli archivi vanno in <code>{settings.directory}</code>.
      </p>

      {settings.directoryIsBesideData && (
        <Alert>
          Sono <strong>sullo stesso disco dei dati</strong>: ti proteggono da un errore e da un
          aggiornamento andato male, non dalla rottura del disco né dal furto del NAS. Scaricane uno
          ogni tanto e tienilo altrove — è cifrato apposta perché tu possa metterlo ovunque.
        </Alert>
      )}

      {archives.length === 0 && <p className="empty-inline">Nessun archivio, per ora.</p>}

      {archives.map((archive) => (
        <div className="row" key={archive.name}>
          <span className="row__body">
            <span className="row__title">
              {archive.name.startsWith("estia-aggiornamento-")
                ? "Prima di un aggiornamento"
                : "Backup periodico"}
            </span>
            <span className="row__note">
              {when(archive.modifiedAt)} · {size(archive.byteSize)}
            </span>
          </span>
          <span className="row__end">
            <Button
              disabled={busy}
              icon="download"
              onClick={() => void download(archive.name)}
              variant="secondary"
            >
              Scarica
            </Button>
          </span>
        </div>
      ))}

      <p className="muted">
        <strong>Ripristinare non si fa da qui</strong>, di proposito: serve proprio quando questa
        pagina non si apre più. Si fa da terminale, con l&apos;archivio e la chiave privata, ed è
        scritto nella guida di installazione.
      </p>
    </div>
  );
}
