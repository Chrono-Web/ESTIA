import type {
  AdminDiagnostics,
  BackupArchiveView,
  BackupReport,
  BackupSettingsView,
} from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * Backup dal pannello, senza terminale (ADR 0016).
 *
 * Tre sezioni, un lavoro ciascuna: se stanno funzionando, ogni quanto,
 * gli archivi da portarsi via. Il ripristino non sta qui di proposito.
 */

/** Rosso solo dove chi amministra crede di essere protetto e non lo è. */
const ALLARMANTI = new Set(["missing", "stale"]);

const SALUTE: Record<BackupReport["health"], string> = {
  healthy: "funzionano",
  missing: "non producono archivi",
  not_configured: "non attivi",
  stale: "in ritardo",
  waiting: "in attesa del primo",
};

type Lavoro = "genera" | "salva" | "esegui" | `scarica:${string}`;

function dimensione(byte: number): string {
  return byte < 1024 * 1024
    ? `${String(Math.round(byte / 1024))} kB`
    : `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function eAggiornamento(name: string): boolean {
  return name.startsWith("estia-aggiornamento-");
}

function tonoSalute(health: BackupReport["health"]): "on" | "error" | "neutral" {
  if (health === "healthy" || health === "waiting") {
    return "on";
  }

  if (ALLARMANTI.has(health)) {
    return "error";
  }

  return "neutral";
}

export function Backup(): React.ReactElement {
  const { token } = useSignedIn();
  const [diagnostica, setDiagnostica] = useState<AdminDiagnostics | undefined>();
  const [settings, setSettings] = useState<BackupSettingsView | undefined>();
  const [archives, setArchives] = useState<BackupArchiveView[]>([]);
  const [publicKey, setPublicKey] = useState("");
  const [intervalHours, setIntervalHours] = useState(24);
  const [keep, setKeep] = useState(7);
  const [privateKey, setPrivateKey] = useState<string | undefined>();
  const [modificaChiave, setModificaChiave] = useState(false);
  const [lavoro, setLavoro] = useState<Lavoro | undefined>();
  const [esito, setEsito] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  const carica = useCallback(async () => {
    const [diag, current, list] = await Promise.all([
      api.diagnostics(token),
      api.backupSettings(token),
      api.backupArchives(token),
    ]);

    setDiagnostica(diag);
    setSettings(current);
    setArchives(list.archives);
    setPublicKey(current.publicKey ?? "");
    setIntervalHours(current.intervalHours);
    setKeep(current.keep);
    setModificaChiave(false);
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const busy = lavoro !== undefined;
  const report = diagnostica?.backups;

  const esegui = async (id: Lavoro, detto: string, work: () => Promise<void>): Promise<void> => {
    setLavoro(id);
    setErrore(undefined);
    setEsito(undefined);

    try {
      await work();
      setEsito(detto);
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Qualcosa non ha funzionato.");
    } finally {
      setLavoro(undefined);
    }
  };

  const genera = (): Promise<void> =>
    esegui(
      "genera",
      "Coppia generata. Conserva la chiave privata fuori da questo NAS, poi premi Salva.",
      async () => {
        const pair = await api.createBackupKeys(token);

        setPrivateKey(pair.privateKey);
        setPublicKey(pair.publicKey);
        setModificaChiave(true);
      },
    );

  const salva = (): Promise<void> =>
    esegui("salva", "Salvato. I backup automatici usano queste impostazioni.", async () => {
      const saved = await api.saveBackupSettings(token, {
        intervalHours,
        keep,
        publicKey,
      });

      setSettings(saved);
      setPrivateKey(undefined);
      setModificaChiave(false);
      await carica();
    });

  const eseguiOra = (): Promise<void> =>
    esegui("esegui", "Backup scritto. Lo trovi nella lista sotto.", async () => {
      await api.runBackup(token);
      await carica();
    });

  const scarica = (name: string): Promise<void> =>
    esegui(`scarica:${name}`, "Download avviato.", async () => {
      const blob = await api.downloadBackup(token, name);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    });

  if (settings === undefined || report === undefined) {
    return (
      <Sezione titolo="Backup">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  const configurati = settings.configured;
  const modificabili = settings.editable;
  // Prima volta, oppure chi ha scelto «Cambia…»: la chiave è in vista.
  const chiaveInVista = !configurati || modificaChiave;

  return (
    <Sezione titolo="Backup">
      {(errore !== undefined || esito !== undefined) && (
        <Alert aria-live="polite" tone={errore === undefined ? "ok" : "error"}>
          {errore ?? esito}
        </Alert>
      )}

      {/* 1. Come stanno andando — una riga, niente nomi di file. */}
      <div className="card card--flush">
        <div className="row">
          <span className="row__body">
            <span className="row__title">Stato</span>
            <span className="row__note">{report.detail}</span>
          </span>
          <span className="row__end">
            <Badge tone={tonoSalute(report.health)}>{SALUTE[report.health]}</Badge>
          </span>
        </div>

        {report.memoryWarning !== undefined && <Alert>{report.memoryWarning}</Alert>}

        {ALLARMANTI.has(report.health) && (
          <Alert tone="error">
            I backup sono impostati ma <strong>non stanno funzionando</strong>. Finché non è
            sistemato, questa istanza non ha da dove tornare indietro.
          </Alert>
        )}
      </div>

      {/* 2. Frequenza e chiave — un lavoro: farli partire o regolarli. */}
      <div className="card">
        <h2>{configurati ? "Frequenza" : "Attiva i backup"}</h2>

        {!configurati && (
          <p className="muted">
            Serve una coppia di chiavi: l&apos;istanza tiene solo quella pubblica e scrive archivi
            che non sa rileggere. La privata la vedi una volta sola — mettila fuori da questo NAS.
          </p>
        )}

        {!modificabili && (
          <Alert>
            Queste impostazioni arrivano dalle variabili d&apos;ambiente del container: da qui si
            vedono, non si cambiano.
          </Alert>
        )}

        {configurati && (
          <p className="muted">
            Ogni {settings.intervalHours} ore · tiene gli ultimi {settings.keep} archivi.
          </p>
        )}

        <div className="cluster">
          <label className="campo-breve">
            Ogni
            <input
              aria-label="Ore fra un backup e il successivo"
              className="input"
              disabled={!modificabili || busy}
              max={720}
              min={1}
              onChange={(event) => setIntervalHours(Number(event.target.value))}
              type="number"
              value={intervalHours}
            />
            ore
          </label>
          <label className="campo-breve">
            Tieni gli ultimi
            <input
              aria-label="Quanti archivi tenere"
              className="input"
              disabled={!modificabili || busy}
              max={365}
              min={1}
              onChange={(event) => setKeep(Number(event.target.value))}
              type="number"
              value={keep}
            />
          </label>
        </div>

        {privateKey !== undefined && (
          <Alert tone="ok">
            <p>
              Questa è la <strong>chiave privata</strong>. Compare una volta sola: senza di lei
              nessuno può riaprire i tuoi backup. Mettila in un gestore di password, o stampala —
              <strong> fuori da questo NAS</strong>. Poi premi Salva.
            </p>
            <code className="secret">{privateKey}</code>
          </Alert>
        )}

        {configurati && !chiaveInVista && (
          <div className="cluster cluster--between">
            <span className="row__body">
              <span className="row__title">Chiave di cifratura</span>
              <span className="row__note">
                Impostata. Serve solo se vuoi cambiarla — una chiave nuova non apre gli archivi
                vecchi.
              </span>
            </span>
            <Button
              disabled={busy || !modificabili}
              onClick={() => setModificaChiave(true)}
              variant="secondary"
            >
              Cambia…
            </Button>
          </div>
        )}

        {chiaveInVista && (
          <>
            {configurati && (
              <Alert>
                Una chiave nuova non apre gli archivi già scritti. Generane una solo se hai perso
                quella privata, o se vuoi ricominciare da zero.
              </Alert>
            )}
            <TextField
              disabled={!modificabili || busy}
              hint="Sull'istanza vive solo questa metà. Inizia con age1…"
              label="Chiave pubblica"
              onChange={(event) => setPublicKey(event.target.value)}
              placeholder="age1…"
              value={publicKey}
            />
            <div className="cluster">
              {configurati ? (
                <Button
                  aria-busy={lavoro === "genera" || undefined}
                  disabled={busy || !modificabili}
                  onClick={() => void genera()}
                  variant="secondary"
                >
                  {lavoro === "genera" ? "Genero…" : "Genera una coppia"}
                </Button>
              ) : (
                <Button
                  aria-busy={lavoro === "genera" || undefined}
                  disabled={busy || !modificabili}
                  onClick={() => void genera()}
                >
                  {lavoro === "genera" ? "Genero…" : "Genera una coppia"}
                </Button>
              )}
              {configurati && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setModificaChiave(false);
                    setPrivateKey(undefined);
                    setPublicKey(settings.publicKey ?? "");
                  }}
                  variant="secondary"
                >
                  Annulla
                </Button>
              )}
            </div>
          </>
        )}

        <div className="cluster">
          <Button
            aria-busy={lavoro === "salva" || undefined}
            disabled={busy || !modificabili}
            onClick={() => void salva()}
          >
            {lavoro === "salva" ? "Salvo…" : "Salva"}
          </Button>
          {configurati && (
            <Button
              aria-busy={lavoro === "esegui" || undefined}
              disabled={busy}
              onClick={() => void eseguiOra()}
              variant="secondary"
            >
              {lavoro === "esegui" ? "Scrivo il backup…" : "Fai un backup adesso"}
            </Button>
          )}
        </div>

        {settings.directoryIsBesideData && configurati && (
          <Alert>
            Gli archivi stanno <strong>sullo stesso disco dei dati</strong>: proteggono da un errore
            e da un aggiornamento andato male, non dalla rottura del disco né dal furto del NAS.
            Scaricane uno ogni tanto dalla lista sotto e tienilo altrove.
          </Alert>
        )}
      </div>

      {/* 3. La lista — data in evidenza, tipo come badge, niente nomi di file. */}
      <div className="card card--flush">
        <h2 className="gruppo">Archivi</h2>
        <p className="muted empty-inline">
          Scaricane uno ogni tanto e tienilo fuori dal NAS. Sono cifrati: puoi metterli ovunque.
        </p>

        {archives.length === 0 && (
          <p className="empty-inline">
            Nessun archivio ancora. Se hai appena attivato i backup, il primo arriva entro un
            minuto.
          </p>
        )}

        {archives.map((archive) => {
          const scaricando = lavoro === `scarica:${archive.name}`;
          const aggiornamento = eAggiornamento(archive.name);

          return (
            <div className="row" key={archive.name}>
              <span className="row__body">
                <span className="row__title">
                  {quando(archive.modifiedAt)}{" "}
                  <Badge>{aggiornamento ? "prima di un aggiornamento" : "periodico"}</Badge>
                </span>
                <span className="row__note">{dimensione(archive.byteSize)}</span>
              </span>
              <span className="row__end">
                <Button
                  aria-busy={scaricando || undefined}
                  disabled={busy}
                  icon="download"
                  onClick={() => void scarica(archive.name)}
                  variant="secondary"
                >
                  {scaricando ? "Scarico…" : "Scarica"}
                </Button>
              </span>
            </div>
          );
        })}

        <p className="muted empty-inline">
          <strong>Ripristinare non si fa da qui</strong>, di proposito: serve proprio quando questa
          pagina non si apre più. Si fa da terminale, con un archivio e la chiave privata — è nella
          guida di installazione.
        </p>
      </div>
    </Sezione>
  );
}
