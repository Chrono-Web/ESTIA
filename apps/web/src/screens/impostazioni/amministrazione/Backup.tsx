import type {
  AdminDiagnostics,
  BackupArchiveView,
  BackupReport,
  BackupSettingsView,
} from "@estia/contracts";
import type { PlainMessageKey } from "@estia/i18n";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { formatoData, formatoNumero, T, t } from "../../../i18n/index.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button, Live, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";
import { titoloSezione } from "../sezioni.js";
import { dettaglio } from "../../../dettaglio.js";

/**
 * Backup dal pannello, senza terminale (ADR 0016).
 *
 * Tre sezioni, un lavoro ciascuna: se stanno funzionando, ogni quanto,
 * gli archivi da portarsi via. Il ripristino non sta qui di proposito.
 */

/** Rosso solo dove chi amministra crede di essere protetto e non lo è. */
const ALLARMANTI = new Set(["missing", "stale"]);

/** Chiavi del catalogo `admin`: la frase si sceglie quando si disegna (ADR 0044). */
const SALUTE: Record<BackupReport["health"], PlainMessageKey> = {
  healthy: "admin.backup.health.healthy",
  missing: "admin.backup.health.missing",
  not_configured: "admin.backup.health.not_configured",
  stale: "admin.backup.health.stale",
  waiting: "admin.backup.health.waiting",
};

type Lavoro = "genera" | "salva" | "esegui" | `scarica:${string}`;

/** Che cosa sta succedendo, detto a chi non vede l'etichetta del pulsante. */
function durante(lavoro: Lavoro): string {
  switch (lavoro) {
    case "genera":
      return t("admin.backup.working.generate");
    case "salva":
      return t("admin.backup.working.save");
    case "esegui":
      return t("admin.backup.working.run");
    default:
      return t("admin.backup.working.download");
  }
}

/** Quanto pesa un archivio, con le unità scritte come le scrive la lingua in uso. */
function dimensione(byte: number): string {
  return byte < 1024 * 1024
    ? formatoNumero(Math.round(byte / 1024), { style: "unit", unit: "kilobyte" })
    : formatoNumero(byte / (1024 * 1024), {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
        style: "unit",
        unit: "megabyte",
      });
}

function quando(valore: string): string {
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
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
      setErrore(spiega(caught, t("admin.backup.error")));
    } finally {
      setLavoro(undefined);
    }
  };

  const genera = (): Promise<void> =>
    esegui("genera", t("admin.backup.done.generate"), async () => {
      const pair = await api.createBackupKeys(token);

      setPrivateKey(pair.privateKey);
      setPublicKey(pair.publicKey);
      setModificaChiave(true);
    });

  const salva = (): Promise<void> =>
    esegui("salva", t("admin.backup.done.save"), async () => {
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
    esegui("esegui", t("admin.backup.done.run"), async () => {
      await api.runBackup(token);
      await carica();
    });

  const scarica = (name: string): Promise<void> =>
    esegui(`scarica:${name}`, t("admin.backup.done.download"), async () => {
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
      <Sezione titolo={titoloSezione("backup")}>
        <p className="muted">{t("sections.loading")}</p>
      </Sezione>
    );
  }

  const configurati = settings.configured;
  const modificabili = settings.editable;
  // Prima volta, oppure chi ha scelto «Cambia…»: la chiave è in vista.
  const chiaveInVista = !configurati || modificaChiave;

  return (
    <Sezione titolo={titoloSezione("backup")}>
      {/*
        `Live` c'è sempre e porta lavoro ed esito; l'errore lo annuncia il
        `role="alert"` del suo tono. Un `aria-live` sull'`Alert` non
        funzionerebbe — vedi `Feedback.tsx`.
      */}
      <Live>{lavoro !== undefined ? durante(lavoro) : (esito ?? "")}</Live>

      {(errore !== undefined || esito !== undefined) && (
        <Alert tone={errore === undefined ? "ok" : "error"}>{errore ?? esito}</Alert>
      )}

      {/* 1. Come stanno andando — una riga, niente nomi di file. */}
      <div className="card card--flush">
        <div className="row">
          <span className="row__body">
            <span className="row__title">{t("admin.backup.status.title")}</span>
            <span className="row__note">{dettaglio(report)}</span>
          </span>
          <span className="row__end">
            <Badge tone={tonoSalute(report.health)}>{t(SALUTE[report.health])}</Badge>
          </span>
        </div>

        {report.memoryWarning !== undefined && (
          <Alert>
            {dettaglio(report.memoryWarning, report.memoryWarningKey, report.memoryWarningParams)}
          </Alert>
        )}

        {ALLARMANTI.has(report.health) && (
          <Alert tone="error">
            <T k="admin.backup.not_working" />
          </Alert>
        )}
      </div>

      {/* 2. Frequenza e chiave — un lavoro: farli partire o regolarli. */}
      <div className="card">
        <h2>{configurati ? t("admin.backup.frequency.title") : t("admin.backup.setup.title")}</h2>

        {!configurati && <p className="muted">{t("admin.backup.setup.intro")}</p>}

        {!modificabili && <Alert>{t("admin.backup.env_only")}</Alert>}

        {configurati && (
          <p className="muted">
            {`${t("admin.backup.frequency.every", { count: settings.intervalHours })} · ${t(
              "admin.backup.frequency.keeps",
              { count: settings.keep },
            )}`}
          </p>
        )}

        <div className="cluster">
          <label className="campo-breve">
            <T
              k="admin.backup.interval.field"
              params={{ count: intervalHours }}
              tags={{
                input: () => (
                  <input
                    aria-label={t("admin.backup.interval.label")}
                    className="input"
                    disabled={!modificabili || busy}
                    max={720}
                    min={1}
                    onChange={(event) => setIntervalHours(Number(event.target.value))}
                    type="number"
                    value={intervalHours}
                  />
                ),
              }}
            />
          </label>
          <label className="campo-breve">
            <T
              k="admin.backup.keep.field"
              tags={{
                input: () => (
                  <input
                    aria-label={t("admin.backup.keep.label")}
                    className="input"
                    disabled={!modificabili || busy}
                    max={365}
                    min={1}
                    onChange={(event) => setKeep(Number(event.target.value))}
                    type="number"
                    value={keep}
                  />
                ),
              }}
            />
          </label>
        </div>

        {privateKey !== undefined && (
          <Alert tone="ok">
            <p>
              <T k="admin.backup.key.private" />
            </p>
            <code className="secret">{privateKey}</code>
          </Alert>
        )}

        {configurati && !chiaveInVista && (
          <div className="cluster cluster--between">
            <span className="row__body">
              <span className="row__title">{t("admin.backup.key.title")}</span>
              <span className="row__note">{t("admin.backup.key.note")}</span>
            </span>
            <Button
              disabled={busy || !modificabili}
              onClick={() => setModificaChiave(true)}
              variant="secondary"
            >
              {t("admin.backup.key.change")}
            </Button>
          </div>
        )}

        {chiaveInVista && (
          <>
            {configurati && <Alert>{t("admin.backup.key.change_warning")}</Alert>}
            <TextField
              disabled={!modificabili || busy}
              hint={t("admin.backup.key.public_hint")}
              label={t("admin.backup.key.public")}
              onChange={(event) => setPublicKey(event.target.value)}
              placeholder={t("admin.backup.key.public_placeholder")}
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
                  {lavoro === "genera" ? t("admin.backup.generating") : t("admin.backup.generate")}
                </Button>
              ) : (
                <Button
                  aria-busy={lavoro === "genera" || undefined}
                  disabled={busy || !modificabili}
                  onClick={() => void genera()}
                >
                  {lavoro === "genera" ? t("admin.backup.generating") : t("admin.backup.generate")}
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
                  {t("admin.backup.cancel")}
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
            {lavoro === "salva" ? t("admin.backup.saving") : t("admin.backup.save")}
          </Button>
          {configurati && (
            <Button
              aria-busy={lavoro === "esegui" || undefined}
              disabled={busy}
              onClick={() => void eseguiOra()}
              variant="secondary"
            >
              {lavoro === "esegui" ? t("admin.backup.running") : t("admin.backup.run")}
            </Button>
          )}
        </div>

        {settings.directoryIsBesideData && configurati && (
          <Alert>
            <T k="admin.backup.beside_data" />
          </Alert>
        )}
      </div>

      {/* 3. La lista — data in evidenza, tipo come badge, niente nomi di file. */}
      <div className="card card--flush">
        <h2 className="gruppo">{t("admin.backup.archives.title")}</h2>
        <p className="muted empty-inline">{t("admin.backup.archives.note")}</p>

        {archives.length === 0 && (
          <p className="empty-inline">{t("admin.backup.archives.empty")}</p>
        )}

        {archives.map((archive) => {
          const scaricando = lavoro === `scarica:${archive.name}`;
          const aggiornamento = eAggiornamento(archive.name);

          return (
            <div className="row" key={archive.name}>
              <span className="row__body">
                <span className="row__title">
                  {quando(archive.modifiedAt)}{" "}
                  <Badge>
                    {aggiornamento
                      ? t("admin.backup.archives.kind.upgrade")
                      : t("admin.backup.archives.kind.periodic")}
                  </Badge>
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
                  {scaricando
                    ? t("admin.backup.archives.downloading")
                    : t("admin.backup.archives.download")}
                </Button>
              </span>
            </div>
          );
        })}

        <p className="muted empty-inline">
          <T k="admin.backup.archives.restore" />
        </p>
      </div>
    </Sezione>
  );
}
