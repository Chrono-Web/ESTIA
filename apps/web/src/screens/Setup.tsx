import { dataAtRisk, PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";

import { api, ApiError } from "../api.js";
import { spiega } from "../errori.js";
import { t, tc, useT } from "../lingua.js";
import { useApp } from "../state.js";
import { Alert, Button, TextAreaField, TextField } from "../ui/index.js";

/**
 * La prima configurazione, un compito per schermata.
 *
 * La versione precedente chiedeva sei campi insieme e verificava il codice
 * **alla fine**: si compilava tutto, si premeva, e solo allora si scopriva che
 * il codice era sbagliato — e cambia a ogni riavvio dell'istanza, quindi
 * sbagliarlo è la norma, non l'eccezione. Prevenire un errore vale più che
 * segnalarlo, e questo si previene mettendo il codice per primo e da solo.
 *
 * L'ordine dei passi non è arbitrario:
 *
 * 0. **I dati hanno un posto** — resta prima di tutto, ed è ADR 0019. Il modulo
 *    non compare finché i dati non sopravvivono a un aggiornamento.
 * 1. **Il codice**, verificato mentre lo si scrive.
 * 2. **L'istanza**: come si chiama, e che cosa è.
 * 3. **Chi la amministra.**
 * 4. **Riepilogo**, perché è l'ultima cosa reversibile.
 * 5. **Il codice di recupero**, che esce comunque alla fine ed è l'unica volta.
 */

const PASSI = ["codice", "istanza", "account", "riepilogo"] as const;

type Passo = (typeof PASSI)[number];

function ComandoCopiabile({ comando }: { comando: string }): React.ReactElement {
  useT();
  const [copiato, setCopiato] = useState(false);

  const copia = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <div className="stack stack--tight">
      <pre className="secret">{comando}</pre>
      <div>
        <Button onClick={() => void copia()} variant="secondary">
          {copiato ? t("comune.copiato") : t("comune.copia_comando")}
        </Button>
      </div>
    </div>
  );
}

export function Setup(): React.ReactElement {
  const { instance, refreshInstance } = useApp();
  useT();
  const [passo, setPasso] = useState<Passo>("codice");
  const [mostraRipristino, setMostraRipristino] = useState(false);
  const [form, setForm] = useState({
    adminPassword: "",
    adminUsername: "",
    description: "",
    name: "",
    setupToken: "",
  });
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>();
  const [scritto, setScritto] = useState(false);
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const numero = PASSI.indexOf(passo) + 1;

  const vaiA = (prossimo: Passo): void => {
    setErrore(undefined);
    setPasso(prossimo);
  };

  /* ---------------------------------------------------------------- ripristino */

  if (mostraRipristino) {
    return (
      <main className="column column--narrow stack">
        <div className="card stack">
          <h1>{t("setup.ripristino.titolo")}</h1>

          <Alert tone="neutral">
            {tc("setup.ripristino.avviso", {
              forte: <strong>{t("setup.ripristino.avviso_forte")}</strong>,
            })}
          </Alert>

          <h2>{t("setup.ripristino.come")}</h2>

          <ol className="stack stack--tight">
            <li>
              {tc("setup.ripristino.passo1", {
                forte: <strong>{t("setup.ripristino.passo1_forte")}</strong>,
              })}
            </li>
            <li>
              {tc("setup.ripristino.passo2", {
                db: <code>estia.db</code>,
                forte: <strong>{t("setup.ripristino.passo2_forte")}</strong>,
              })}
            </li>
            <li>
              {tc("setup.ripristino.passo3", {
                forte: <strong>{t("setup.ripristino.passo3_forte")}</strong>,
              })}
            </li>
            <li>
              {tc("setup.ripristino.passo4", {
                chiave: <code>AGE-SECRET-KEY-1…</code>,
                forte: <strong>{t("setup.ripristino.passo4_forte")}</strong>,
              })}
            </li>
          </ol>

          <p>
            {tc("setup.ripristino.cli", {
              forte: <strong>{t("setup.ripristino.cli_forte")}</strong>,
            })}
          </p>

          <ComandoCopiabile comando="estia ripristino-backup" />

          <p>
            <strong>{t("setup.ripristino.docker")}</strong>
          </p>

          <ComandoCopiabile
            comando={
              "docker run --rm -it --user 0:0 -v /volume1/docker/estia-backup:/backup:ro -v /volume1/docker/estia/data:/restore --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js ripristina /backup/ARCHIVIO.tar.age /restore"
            }
          />

          <p className="muted">
            {tc("setup.ripristino.sostituisci", {
              archivio: <code>ARCHIVIO.tar.age</code>,
              backup: <code>/volume1/docker/estia-backup</code>,
              dati: <code>/volume1/docker/estia/data</code>,
            })}
          </p>

          <p>
            {tc("setup.ripristino.passo5", {
              data: <code>/data</code>,
              forte: <strong>{t("setup.ripristino.passo5_forte")}</strong>,
            })}
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(false)} variant="secondary">
              {t("setup.ripristino.torna")}
            </Button>
            <Button onClick={() => void refreshInstance()}>{t("setup.ripristino.verifica")}</Button>
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- passo 5 */

  if (recoveryCode !== undefined) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("setup.recupero.titolo")}</h1>
          <p>
            {tc("setup.recupero.testo", {
              forte: <strong>{t("setup.recupero.unica_volta")}</strong>,
            })}
          </p>

          <code className="secret">{recoveryCode}</code>

          <p className="muted">
            {tc("setup.recupero.dove", { e: <em>{t("setup.recupero.e")}</em> })}
          </p>

          <label className="choice">
            <input
              checked={scritto}
              onChange={(event) => setScritto(event.target.checked)}
              type="checkbox"
            />
            <span className="choice__body">
              <span className="choice__title">{t("setup.recupero.scritto")}</span>
            </span>
          </label>

          <Button block disabled={!scritto} onClick={() => void refreshInstance()}>
            {t("setup.recupero.entra")}
          </Button>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- passo 0 */

  /*
   * La schermata che non c'era, ed è il motivo per cui questa configurazione è
   * stata rifatta più volte (ADR 0019). Prima qui c'era un avviso sopra il
   * modulo: si poteva leggere, credere di aver capito, e configurare comunque.
   * Adesso il modulo non c'è finché i dati non hanno un posto dove stare.
   */
  if (instance.dataDurability !== undefined && dataAtRisk(instance.dataDurability)) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("setup.dati.titolo")}</h1>

          <Alert tone="error">
            {instance.dataDurability === "ephemeral"
              ? tc("setup.dati.effimero", {
                  forte: <strong>{t("setup.dati.effimero_forte")}</strong>,
                })
              : tc("setup.dati.anonimo", {
                  avviso: <strong>{t("setup.dati.anonimo_avviso")}</strong>,
                  compose: <code>docker compose</code>,
                  forte: <strong>{t("setup.dati.anonimo_forte")}</strong>,
                })}
          </Alert>

          <p>{t("setup.dati.non_ti_lascio")}</p>

          <h2>{t("setup.dati.che_fare")}</h2>

          <p>
            {tc("setup.dati.nas", {
              data: <code>/data</code>,
              esempio: <code>/volume1/docker/estia/data</code>,
              forte: <strong>{t("setup.dati.nas_forte")}</strong>,
            })}
          </p>

          <p>
            {tc("setup.dati.terminale", {
              file: <code>docker-compose.yml</code>,
              forte: <strong>{t("setup.dati.terminale_forte")}</strong>,
            })}
          </p>

          {/* La domanda vera di chi arriva qui non è «come si monta un volume»:
              è «dove sono finiti i miei». Un volume orfano non viene cancellato,
              quindi la risposta è quasi sempre «sono ancora lì», e va data
              adesso — non nella guida, che questa persona ha già letto. */}
          <h2>{t("setup.dati.esisteva.titolo")}</h2>

          <p>
            {tc("setup.dati.esisteva.testo", {
              forte: <strong>{t("setup.dati.esisteva.forte")}</strong>,
            })}
          </p>

          <ComandoCopiabile
            comando={
              'for v in $(docker volume ls -q); do docker run --rm -v "$v":/v alpine test -f /v/estia.db 2>/dev/null && echo "$v $(docker run --rm -v "$v":/v alpine stat -c \'%y\' /v/estia.db)"; done'
            }
          />

          <p>
            {tc("setup.dati.esisteva.dopo", {
              forte: <strong>{t("setup.dati.esisteva.non_cancellare")}</strong>,
            })}
          </p>

          <p className="muted">
            {tc("setup.dati.prova", { variabile: <code>ESTIA_ALLOW_EPHEMERAL_DATA=true</code> })}
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(true)} variant="secondary">
              {t("setup.dati.hai_backup")}
            </Button>
            <Button onClick={() => void refreshInstance()}>{t("setup.dati.sistemato")}</Button>
          </div>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------- passi 1..4 */

  const verificaCodice = async (): Promise<void> => {
    setOccupato(true);
    setErrore(undefined);

    try {
      await api.verifySetupToken(form.setupToken.trim());
      setPasso("istanza");
    } catch (causa) {
      setErrore(spiega(causa, t("comune.istanza_irraggiungibile")));
    } finally {
      setOccupato(false);
    }
  };

  const crea = async (): Promise<void> => {
    setOccupato(true);
    setErrore(undefined);

    try {
      const creata = await api.setup({
        adminPassword: form.adminPassword,
        adminUsername: form.adminUsername,
        description: form.description,
        name: form.name.trim(),
        setupToken: form.setupToken.trim(),
      });

      setRecoveryCode(creata.recoveryCode);
    } catch (causa) {
      /*
       * Il codice può essere scaduto fra il passo 1 e adesso: basta che
       * l'istanza sia ripartita. Riportare al passo 1 con la spiegazione è
       * l'unica cosa utile — un errore generico sul riepilogo lascerebbe a
       * indovinare quale dei sei campi è sbagliato.
       */
      if (causa instanceof ApiError && causa.code === "invalid_setup_token") {
        setForm((corrente) => ({ ...corrente, setupToken: "" }));
        setPasso("codice");
        setErrore(t("setup.codice_scaduto"));
        return;
      }

      setErrore(spiega(causa, t("comune.istanza_irraggiungibile")));
    } finally {
      setOccupato(false);
    }
  };

  const nomeValido = /^[a-z0-9][a-z0-9_.-]{1,30}[a-z0-9]$/.test(form.adminUsername);

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <p className="muted">{t("setup.passo_di", { n: numero, totale: PASSI.length })}</p>
        <div className="progresso">
          {PASSI.map((nome, indice) => (
            <span
              className={
                indice < numero ? "progresso__tacca progresso__tacca--fatta" : "progresso__tacca"
              }
              key={nome}
            />
          ))}
        </div>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        {passo === "codice" && (
          <>
            <h1>{t("setup.codice.titolo")}</h1>
            <p className="muted">{t("setup.codice.intro")}</p>
            <TextField
              autoFocus
              label={t("setup.codice.etichetta")}
              onChange={(event) => setForm({ ...form, setupToken: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && form.setupToken.trim() !== "") {
                  void verificaCodice();
                }
              }}
              value={form.setupToken}
            />
            <Button
              block
              disabled={occupato || form.setupToken.trim() === ""}
              onClick={() => void verificaCodice()}
            >
              {occupato ? t("comune.controllo") : t("comune.avanti")}
            </Button>

            <div className="cluster cluster--between">
              <span className="muted">{t("setup.codice.backup")}</span>
              <Button onClick={() => setMostraRipristino(true)} variant="quiet">
                {t("setup.codice.ripristina")}
              </Button>
            </div>
          </>
        )}

        {passo === "istanza" && (
          <>
            <h1>{t("setup.istanza.titolo")}</h1>
            <p className="muted">{t("setup.istanza.intro")}</p>
            <TextField
              autoFocus
              label={t("setup.istanza.nome")}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("setup.istanza.nome_esempio")}
              value={form.name}
            />
            <TextAreaField
              hint={t("setup.istanza.descrizione_aiuto")}
              label={t("setup.istanza.descrizione")}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={t("setup.istanza.descrizione_esempio")}
              rows={3}
              value={form.description}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("codice")} variant="secondary">
                {t("comune.indietro")}
              </Button>
              <Button disabled={form.name.trim() === ""} onClick={() => vaiA("account")}>
                {t("comune.avanti")}
              </Button>
            </div>
          </>
        )}

        {passo === "account" && (
          <>
            <h1>{t("setup.account.titolo")}</h1>
            <p className="muted">{t("setup.account.intro")}</p>
            <TextField
              autoFocus
              hint={t("setup.account.utente_aiuto")}
              label={t("comune.nome_utente")}
              onChange={(event) =>
                setForm({ ...form, adminUsername: event.target.value.toLowerCase() })
              }
              placeholder={t("entrare.utente.esempio")}
              value={form.adminUsername}
            />
            <TextField
              hint={t("comune.password_minimo", { n: PASSWORD_MIN_LENGTH })}
              label={t("comune.password")}
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              type="password"
              value={form.adminPassword}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("istanza")} variant="secondary">
                {t("comune.indietro")}
              </Button>
              <Button
                disabled={!nomeValido || form.adminPassword.length < PASSWORD_MIN_LENGTH}
                onClick={() => vaiA("riepilogo")}
              >
                {t("comune.avanti")}
              </Button>
            </div>
          </>
        )}

        {passo === "riepilogo" && (
          <>
            <h1>{t("setup.riepilogo.titolo")}</h1>
            <p className="muted">{t("setup.riepilogo.intro")}</p>

            <div className="card card--flush">
              <div className="row">
                <span className="row__body">
                  <span className="row__note">{t("setup.riepilogo.istanza")}</span>
                  <span className="row__title">{form.name}</span>
                </span>
              </div>
              {form.description.trim() !== "" && (
                <div className="row">
                  <span className="row__body">
                    <span className="row__note">{t("setup.istanza.descrizione")}</span>
                    <span className="row__title">{form.description}</span>
                  </span>
                </div>
              )}
              <div className="row">
                <span className="row__body">
                  <span className="row__note">{t("setup.riepilogo.amministratore")}</span>
                  <span className="row__title">@{form.adminUsername}</span>
                </span>
              </div>
            </div>

            <div className="cluster">
              <Button onClick={() => vaiA("account")} variant="secondary">
                {t("comune.indietro")}
              </Button>
              <Button disabled={occupato} onClick={() => void crea()}>
                {occupato ? t("setup.riepilogo.creo") : t("setup.riepilogo.crea")}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
