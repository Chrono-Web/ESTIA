import type {
  AdminDiagnostics,
  SchemaUpgradeView,
  UpdateCheckResult,
  UpdateCommand,
} from "@estia/contracts";
import type { PlainMessageKey } from "@estia/i18n";
import { useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { formatoData, formatoNumero, T, t, type Tags } from "../../../i18n/index.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";
import { titoloSezione } from "../sezioni.js";

/*
 * Le tabelle portano chiavi del catalogo `admin`, non frasi: la frase si
 * sceglie quando si disegna, nella lingua di chi guarda in quel momento
 * (ADR 0044).
 */

const A_RIPOSO: Record<AdminDiagnostics["atRest"]["detected"], PlainMessageKey> = {
  active: "admin.status.at_rest.detected.active",
  inactive: "admin.status.at_rest.detected.inactive",
  unknown: "admin.status.at_rest.detected.unknown",
};

const DICHIARATA: Record<AdminDiagnostics["atRest"]["declared"], PlainMessageKey> = {
  automatic: "admin.status.at_rest.declared.automatic",
  none: "admin.status.at_rest.declared.none",
  passphrase: "admin.status.at_rest.declared.passphrase",
  unspecified: "admin.status.at_rest.declared.unspecified",
};

const AGGIORNAMENTO: Record<string, PlainMessageKey> = {
  created: "admin.status.schema.backup.created",
  failed: "admin.status.schema.backup.failed",
  not_configured: "admin.status.schema.backup.not_configured",
};

const ORIGINI: Record<string, PlainMessageKey> = {
  local: "admin.status.connections.origin.local",
  loopback: "admin.status.connections.origin.loopback",
  overlay: "admin.status.connections.origin.overlay",
  public: "admin.status.connections.origin.public",
};

const DUREVOLEZZA: Record<AdminDiagnostics["dataDurability"], PlainMessageKey> = {
  anonymous: "admin.status.data.durability.anonymous",
  ephemeral: "admin.status.data.durability.ephemeral",
  persistent: "admin.status.data.durability.persistent",
  unknown: "admin.status.data.durability.unknown",
};

/** Il comando della CLI di ESTIA che aggiorna l'istanza: lo stesso in ogni lingua. */
// eslint-disable-next-line estia/no-ui-literal -- a shell command, typed as it is in every language
const COMANDO_AGGIORNA = "estia aggiorna";

/** Il `<code>` delle frasi che nominano un comando o una revisione. */
const CODICE: Tags = { code: (testo) => <code>{testo}</code> };

/**
 * La frase di un codice che manda l'istanza. Un codice che questo client non
 * conosce ancora — un'istanza più nuova della pagina — si mostra com'è.
 */
function etichetta(tabella: Readonly<Record<string, PlainMessageKey>>, codice: string): string {
  const chiave = tabella[codice];

  return chiave === undefined ? codice : t(chiave);
}

function quando(valore: string): string {
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
}

function corta(sha: string): string {
  return sha.slice(0, 7);
}

/** Un comando da terminale con un bottone che lo copia negli appunti. */
function ComandoCopiabile({ comando }: { comando: string }): React.ReactElement {
  const [copiato, setCopiato] = useState(false);

  const copia = async (): Promise<void> => {
    try {
      // Come in InviteLink: niente Clipboard API in contesti non sicuri
      // (HTTP semplice sulla rete di casa), da cui il fallback selezionabile.
      await navigator.clipboard.writeText(comando);
      setCopiato(true);
    } catch {
      const campo = document.getElementById(`comando-${comando}`);

      if (campo instanceof HTMLInputElement) {
        campo.select();
      }
    }
  };

  return (
    <div className="cluster">
      <input className="input grow secret" id={`comando-${comando}`} readOnly value={comando} />
      <Button onClick={() => void copia()}>
        {copiato ? t("admin.status.command.copied") : t("admin.status.command.copy")}
      </Button>
    </div>
  );
}

/**
 * Un passo dell'aggiornamento: che cosa fa, il comando, e l'avvertenza.
 *
 * La nota non è decorazione. I due modi in cui un aggiornamento sembra riuscito
 * e non lo è — `docker pull` senza ricreare il container, e il `cd` nella
 * cartella sbagliata — si evitano solo leggendola.
 */
function Passo({ passo }: { passo: UpdateCommand }): React.ReactElement {
  return (
    <div className="row">
      <span className="row__body">
        <span className="row__title">{passo.title}</span>
        <ComandoCopiabile comando={passo.command} />
        {passo.note !== undefined && <span className="row__note">{passo.note}</span>}
      </span>
    </div>
  );
}

/**
 * Il testo registrato al momento dell'aggiornamento resta vero sul fatto
 * (punto di ritorno sì/no). La raccomandazione no: dopo ADR 0016 i backup si
 * impostano dal pannello, e un'istanza che li ha già non va mandata alle
 * variabili d'ambiente. Se oggi sono configurati, lo diciamo senza fingere che
 * *quel* aggiornamento ne abbia avuto uno.
 */
function dettaglioAggiornamento(
  upgrade: SchemaUpgradeView,
  backupsOraConfigurati: boolean,
): string {
  if (upgrade.backupStatus === "not_configured" && backupsOraConfigurati) {
    return t("admin.status.schema.no_backup_now_configured");
  }

  return upgrade.detail;
}

/**
 * Quello che l'istanza sa di sé, e che altrimenti resterebbe nei log.
 *
 * Il criterio è sempre lo stesso: **rosso solo dove chi amministra crede di
 * essere protetto e non lo è.** Backup non configurati è una constatazione;
 * backup configurati che non producono archivi è un allarme.
 */
export function Stato(): React.ReactElement {
  const { token } = useSignedIn();
  const [d, setD] = useState<AdminDiagnostics | undefined>();
  const [verifica, setVerifica] = useState<UpdateCheckResult | undefined>();
  const [verificando, setVerificando] = useState(false);
  const [erroreVerifica, setErroreVerifica] = useState<string | undefined>();

  useEffect(() => {
    void api.diagnostics(token).then(setD);
  }, [token]);

  async function verificaAggiornamenti(): Promise<void> {
    setVerificando(true);
    setErroreVerifica(undefined);

    try {
      setVerifica(await api.checkUpdates(token));
    } catch (error) {
      setVerifica(undefined);
      setErroreVerifica(spiega(error, t("admin.status.updates.error")));
    } finally {
      setVerificando(false);
    }
  }

  if (d === undefined) {
    return (
      <Sezione titolo={titoloSezione("stato")}>
        <p className="muted">{t("sections.loading")}</p>
      </Sezione>
    );
  }

  return (
    <Sezione titolo={titoloSezione("stato")}>
      {/* Prima di ogni altra cosa: un'istanza che perde tutto al prossimo
          aggiornamento non ha altri problemi che contino. */}
      {d.dataDurability === "anonymous" && (
        <Alert tone="error">
          <T k="admin.status.data.alert_anonymous" tags={CODICE} />
        </Alert>
      )}

      {d.dataDurability === "ephemeral" && (
        <Alert tone="error">
          <T k="admin.status.data.alert_ephemeral" />
        </Alert>
      )}

      {/* L'assunzione su cui poggia tutto il modello delle minacce è che questa
          istanza non sia raggiungibile da Internet. Se smette di essere vera,
          smette di esserlo in silenzio (SECURITY_BASELINE §5). */}
      {d.connections.some((visto) => visto.origin === "public") && (
        <Alert tone="error">
          <T k="admin.status.connections.public_alert" />
        </Alert>
      )}

      {/* Una protezione dichiarata che l'istanza non vede è la cosa più
          pericolosa da mostrare in silenzio (ADR 0007). */}
      {!d.atRest.consistent && (
        <Alert tone="error">
          <T k="admin.status.at_rest.mismatch" />
        </Alert>
      )}

      <div className="card card--flush">
        <div className="row">
          <span className="row__body">
            <span className="row__title">{t("admin.status.data.title")}</span>
            <span className="row__note">{d.dataDurabilityDetail}</span>
          </span>
          <span className="row__end">
            <Badge tone={d.dataDurability === "persistent" ? "on" : "neutral"}>
              {t(DUREVOLEZZA[d.dataDurability])}
            </Badge>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">{t("admin.status.people")}</span>
          </span>
          <span className="row__end">
            <strong>{formatoNumero(d.memberCount)}</strong>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">{t("admin.status.at_rest.title")}</span>
            <span className="row__note">{d.atRest.detail}</span>
            {d.atRest.declared !== "unspecified" && (
              <span className="row__note">
                {t("admin.status.at_rest.declared_note", {
                  value: t(DICHIARATA[d.atRest.declared]),
                })}
              </span>
            )}
          </span>
          <span className="row__end">
            <Badge tone={d.atRest.consistent && d.atRest.detected === "active" ? "on" : "neutral"}>
              {t(A_RIPOSO[d.atRest.detected])}
            </Badge>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">{t("admin.status.connections.title")}</span>
            <span className="row__note">
              {d.connections.length === 0
                ? t("admin.status.connections.none")
                : d.connections
                    .map((visto) =>
                      t("admin.status.connections.item", {
                        number: formatoNumero(visto.count),
                        origin: etichetta(ORIGINI, visto.origin),
                      }),
                    )
                    .join(" · ")}
            </span>
            <span className="row__note">{t("admin.status.connections.note")}</span>
          </span>
        </div>

        {/* Solo quando manca: una directory con i permessi giusti è la norma, e
            dirlo ogni volta la trasformerebbe in rumore. */}
        {!d.dataDirectorySecure && (
          <div className="row">
            <span className="row__body">
              <span className="row__title">{t("admin.status.directory.title")}</span>
              <span className="row__note">{t("admin.status.directory.note")}</span>
            </span>
            <span className="row__end">
              <Badge>{t("admin.status.directory.badge")}</Badge>
            </span>
          </div>
        )}

        {/* Le migrazioni vanno solo in avanti: un aggiornamento applicato senza
            backup resta senza punto di ritorno per sempre (ADR 0014).
            Rosso solo su «failed»: chi non aveva configurato i backup lo sa;
            chi li aveva e sono falliti crede di essere protetto e non lo è. */}
        {d.lastUpgrade !== undefined && (
          <div className="row">
            <span className="row__body">
              <span className="row__title">{t("admin.status.schema.title")}</span>
              <span className="row__note">
                {t("admin.status.schema.versions", {
                  from: d.lastUpgrade.fromVersion,
                  to: d.lastUpgrade.toVersion,
                  when: quando(d.lastUpgrade.appliedAt),
                })}
              </span>
              <span className="row__note">
                {dettaglioAggiornamento(d.lastUpgrade, d.backups.health !== "not_configured")}
              </span>
            </span>
            <span className="row__end">
              <Badge
                tone={
                  d.lastUpgrade.backupStatus === "created"
                    ? "on"
                    : d.lastUpgrade.backupStatus === "failed"
                      ? "error"
                      : "neutral"
                }
              >
                {etichetta(AGGIORNAMENTO, d.lastUpgrade.backupStatus)}
              </Badge>
            </span>
          </div>
        )}
      </div>

      {/* Controlla il registry e scrive i comandi di questa installazione.
          Aggiornare resta un gesto sul Docker della macchina: l'istanza non ha
          il socket di Docker, e non deve averlo. */}
      <div className="card">
        <h2>{t("admin.status.updates.title")}</h2>
        <p className="muted">
          <T k="admin.status.updates.intro" params={{ command: COMANDO_AGGIORNA }} tags={CODICE} />
        </p>

        <div className="row">
          <span className="row__body">
            <Button disabled={verificando} onClick={() => void verificaAggiornamenti()}>
              {verificando ? t("admin.status.updates.checking") : t("admin.status.updates.check")}
            </Button>
          </span>
          {verifica !== undefined && (
            <span className="row__end">
              <Badge
                tone={
                  verifica.status === "available"
                    ? "error"
                    : verifica.status === "up_to_date"
                      ? "on"
                      : "neutral"
                }
              >
                {verifica.status === "available"
                  ? t("admin.status.updates.badge.available")
                  : verifica.status === "up_to_date"
                    ? t("admin.status.updates.badge.up_to_date")
                    : t("admin.status.updates.badge.unknown")}
              </Badge>
            </span>
          )}
        </div>

        {erroreVerifica !== undefined && <Alert tone="error">{erroreVerifica}</Alert>}

        {verifica !== undefined && (
          <>
            <p className="muted">{verifica.detail}</p>
            {verifica.currentRevision !== undefined && (
              <p className="muted">
                {verifica.latestRevision === undefined ? (
                  <T
                    k="admin.status.updates.revision"
                    params={{ current: corta(verifica.currentRevision) }}
                    tags={CODICE}
                  />
                ) : (
                  <T
                    k="admin.status.updates.revisions"
                    params={{
                      current: corta(verifica.currentRevision),
                      latest: corta(verifica.latestRevision),
                    }}
                    tags={CODICE}
                  />
                )}
              </p>
            )}
          </>
        )}

        {/* Quando un aggiornamento è disponibile o non verificabile, mostra il comando estia in primo piano: */}
        {verifica !== undefined &&
          verifica.status !== "up_to_date" &&
          verifica.commands.length > 0 && (
            <>
              {verifica.commands[0]?.command === COMANDO_AGGIORNA ? (
                <>
                  <div className="card card--flush">
                    <div className="row">
                      <span className="row__body">
                        <span className="row__title">
                          {t("admin.status.updates.command_title")}
                        </span>
                        <ComandoCopiabile comando={COMANDO_AGGIORNA} />
                        <span className="row__note">{t("admin.status.updates.command_note")}</span>
                      </span>
                    </div>
                  </div>

                  {verifica.commands.length > 1 && (
                    <details style={{ marginTop: "var(--s-3)" }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          color: "var(--text-soft)",
                          fontSize: "var(--t-md)",
                          padding: "var(--s-1) 0",
                        }}
                      >
                        {t("admin.status.updates.manual_steps")}
                      </summary>
                      <div className="card card--flush" style={{ marginTop: "var(--s-2)" }}>
                        {verifica.commands.slice(1).map((passo) => (
                          <Passo key={passo.command} passo={passo} />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="card card--flush">
                  {verifica.commands.map((passo) => (
                    <Passo key={passo.command} passo={passo} />
                  ))}
                </div>
              )}
            </>
          )}
      </div>
    </Sezione>
  );
}
