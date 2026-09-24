import { dataAtRisk, PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api, ApiError } from "../api.js";
import { LinguaRapida } from "../components/LinguaRapida.js";
import { SceltaLingua } from "../components/SceltaLingua.js";
import { spiega } from "../errori.js";
import {
  impostaLingua,
  leggiSceltaLocale,
  lingua,
  scriviSceltaLocale,
  T,
  t,
  type Tags,
  useLingua,
} from "../i18n/index.js";
import { useApp } from "../state.js";
import { Alert, Button, Live, TextAreaField, TextField } from "../ui/index.js";

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
 *
 * Sopra il passo 1 si sceglie la **lingua** (ADR 0044 §3): quella in uso
 * diventa la lingua predefinita dell'istanza. Sta lì e non in un passo suo
 * perché la scelta giusta, quasi sempre, l'ha già fatta il browser.
 */

const PASSI = ["codice", "istanza", "account", "riepilogo"] as const;

type Passo = (typeof PASSI)[number];

interface Modulo {
  adminPassword: string;
  adminUsername: string;
  description: string;
  name: string;
  setupToken: string;
}

const MODULO_VUOTO: Modulo = {
  adminPassword: "",
  adminUsername: "",
  description: "",
  name: "",
  setupToken: "",
};

/**
 * Quello che si era già scritto, mentre si cambia lingua.
 *
 * Cambiare lingua ridisegna tutta la pagina da capo (ADR 0044), e con lei
 * questo modulo: senza un posto dove aspettare, il codice appena scritto
 * sparirebbe. Sta in memoria e mai nello storage del browser, perché il
 * codice di configurazione e la password sono segreti.
 */
let bozza: Modulo | undefined;

/** I comandi e i percorsi dentro le frasi: `<code>` nel catalogo. */
const CODICE: Tags = { code: (testo) => <code>{testo}</code> };

function ComandoCopiabile({ comando }: { comando: string }): React.ReactElement {
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
          {copiato ? t("setup.command.copied") : t("setup.command.copy")}
        </Button>
      </div>
    </div>
  );
}

export function Setup(): React.ReactElement {
  const { instance, refreshInstance } = useApp();
  const [passo, setPasso] = useState<Passo>("codice");
  const [mostraRipristino, setMostraRipristino] = useState(false);
  const [form, setForm] = useState<Modulo>(() => bozza ?? MODULO_VUOTO);
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>();
  const [scritto, setScritto] = useState(false);
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);
  const linguaInUso = useLingua();
  const [cambioLingua, setCambioLingua] = useState<string | undefined>();
  const [erroreLingua, setErroreLingua] = useState<string | undefined>();

  // La bozza è servita a questo montaggio: da qui il modulo è di nuovo nello stato.
  useEffect(() => {
    bozza = undefined;
  }, []);

  const numero = PASSI.indexOf(passo) + 1;

  const vaiA = (prossimo: Passo): void => {
    setErrore(undefined);
    setPasso(prossimo);
  };

  /**
   * La lingua cambia subito, e la conferma è la pagina stessa già nella lingua
   * nuova. La scelta si scrive prima di caricarla perché, quando la pagina si
   * ridisegna, è lei che dice quale lingua tenere; se il caricamento non
   * riesce si rimette quella di prima e si dice perché.
   */
  const cambiaLingua = async (codice: string): Promise<void> => {
    if (codice === lingua()) {
      return;
    }

    const prima = leggiSceltaLocale();

    setErroreLingua(undefined);
    setCambioLingua(codice);
    bozza = form;
    scriviSceltaLocale(codice);

    try {
      await impostaLingua(codice);
    } catch {
      bozza = undefined;
      scriviSceltaLocale(prima);
      setErroreLingua(t("language.error_save"));
    } finally {
      setCambioLingua(undefined);
    }
  };

  /* ---------------------------------------------------------------- ripristino */

  if (mostraRipristino) {
    const archivio = t("setup.restore.archive_file");

    return (
      <main className="column column--narrow stack">
        <div className="card stack">
          <h1>{t("setup.restore.title")}</h1>

          <Alert tone="neutral">
            <T k="setup.restore.why" />
          </Alert>

          <h2>{t("setup.restore.how_title")}</h2>

          <ol className="stack stack--tight">
            <li>
              <T k="setup.restore.step.dont_finish" />
            </li>
            <li>
              <T k="setup.restore.step.stop" tags={CODICE} />
            </li>
            <li>
              <T k="setup.restore.step.terminal" />
            </li>
            <li>
              <T k="setup.restore.step.run" tags={CODICE} />
            </li>
          </ol>

          <p>
            <T k="setup.restore.with_cli" />
          </p>

          <ComandoCopiabile comando="estia ripristino-backup" />

          <p>
            <T k="setup.restore.with_docker" />
          </p>

          <ComandoCopiabile
            comando={
              // Il comando è uguale in ogni lingua; il nome del file, che si sostituisce, no.
              `docker run --rm -it --user 0:0 -v /volume1/docker/estia-backup:/backup:ro -v /volume1/docker/estia/data:/restore --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js ripristina /backup/${archivio} /restore`
            }
          />

          <p className="muted">
            <T k="setup.restore.replace" params={{ archive: archivio }} tags={CODICE} />
          </p>

          <p>
            <T k="setup.restore.step.restart" tags={CODICE} />
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(false)} variant="secondary">
              {t("setup.restore.back")}
            </Button>
            <Button onClick={() => void refreshInstance()}>{t("setup.restore.check")}</Button>
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
          <h1>{t("setup.recovery.title")}</h1>
          <p>
            <T k="setup.recovery.intro" />
          </p>

          <code className="secret">{recoveryCode}</code>

          <p className="muted">
            <T k="setup.recovery.where" tags={{ em: (testo) => <em>{testo}</em> }} />
          </p>

          <label className="choice">
            <input
              checked={scritto}
              onChange={(event) => setScritto(event.target.checked)}
              type="checkbox"
            />
            <span className="choice__body">
              <span className="choice__title">{t("setup.recovery.confirm")}</span>
            </span>
          </label>

          <Button block disabled={!scritto} onClick={() => void refreshInstance()}>
            {t("setup.recovery.enter")}
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
          <h1>{t("setup.data.title")}</h1>

          <Alert tone="error">
            {instance.dataDurability === "ephemeral" ? (
              <T k="setup.data.ephemeral" />
            ) : (
              <T k="setup.data.anonymous" tags={CODICE} />
            )}
          </Alert>

          <p>{t("setup.data.refusal")}</p>

          <h2>{t("setup.data.what_title")}</h2>

          <p>
            <T k="setup.data.from_panel" tags={CODICE} />
          </p>

          <p>
            <T k="setup.data.from_terminal" tags={CODICE} />
          </p>

          {/* La domanda vera di chi arriva qui non è «come si monta un volume»:
              è «dove sono finiti i miei». Un volume orfano non viene cancellato,
              quindi la risposta è quasi sempre «sono ancora lì», e va data
              adesso — non nella guida, che questa persona ha già letto. */}
          <h2>{t("setup.data.existed_title")}</h2>

          <p>
            <T k="setup.data.existed_body" />
          </p>

          <ComandoCopiabile
            comando={
              // eslint-disable-next-line estia/no-ui-literal -- a shell command, typed as it is in every language
              'for v in $(docker volume ls -q); do docker run --rm -v "$v":/v alpine test -f /v/estia.db 2>/dev/null && echo "$v $(docker run --rm -v "$v":/v alpine stat -c \'%y\' /v/estia.db)"; done'
            }
          />

          <p>
            <T k="setup.data.existed_next" />
          </p>

          <p className="muted">
            <T k="setup.data.just_trying" tags={CODICE} />
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(true)} variant="secondary">
              {t("setup.data.restore")}
            </Button>
            <Button onClick={() => void refreshInstance()}>{t("setup.data.fixed")}</Button>
          </div>
        </div>

        {/* Qui non si è scritto ancora niente, e chi non legge questa lingua
            deve poter capire che cosa fare prima di arrivare alla scelta. */}
        <LinguaRapida />
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
      setErrore(
        causa instanceof ApiError && causa.code === "invalid_setup_token"
          ? t("setup.code.error_invalid")
          : causa instanceof ApiError
            ? spiega(causa, causa.message)
            : t("setup.error_unreachable"),
      );
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
        // La lingua in uso diventa quella dell'istanza (ADR 0044 §3).
        language: lingua(),
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
        setErrore(t("setup.code.error_expired"));
        return;
      }

      // Il rifiuto dell'istanza, nella lingua di chi legge quando il catalogo
      // ne conosce il codice; altrimenti il suo messaggio, come prima.
      setErrore(
        causa instanceof ApiError ? spiega(causa, causa.message) : t("setup.error_unreachable"),
      );
    } finally {
      setOccupato(false);
    }
  };

  const nomeValido = /^[a-z0-9][a-z0-9_.-]{1,30}[a-z0-9]$/.test(form.adminUsername);

  return (
    <main className="column column--narrow stack">
      {/* Prima di scrivere qualunque cosa: cambiare lingua ridisegna la pagina. */}
      {passo === "codice" && (
        <div className="card">
          <h2 id="setup-lingua">{t("language.instance")}</h2>
          <p className="muted">{t("setup.language.note")}</p>

          {erroreLingua !== undefined && <Alert tone="error">{erroreLingua}</Alert>}

          <div aria-labelledby="setup-lingua" role="radiogroup">
            <SceltaLingua
              durante={t("setup.language.switching")}
              inCorso={cambioLingua}
              nome="lingua-istanza"
              onScegli={(codice) => void cambiaLingua(codice)}
              valore={linguaInUso}
            />
          </div>

          <Live>{cambioLingua === undefined ? undefined : t("setup.language.switching")}</Live>
        </div>
      )}

      <div className="card">
        <p className="muted">{t("setup.step", { step: numero, total: PASSI.length })}</p>
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
            <h1>{t("setup.code.title")}</h1>
            <p className="muted">{t("setup.code.where")}</p>
            <TextField
              autoFocus
              label={t("setup.code.label")}
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
              {occupato ? t("setup.code.checking") : t("setup.next")}
            </Button>

            <div className="cluster cluster--between">
              <span className="muted">{t("setup.code.have_backup")}</span>
              <Button onClick={() => setMostraRipristino(true)} variant="quiet">
                {t("setup.code.restore")}
              </Button>
            </div>
          </>
        )}

        {passo === "istanza" && (
          <>
            <h1>{t("setup.instance.title")}</h1>
            <p className="muted">{t("setup.instance.intro")}</p>
            <TextField
              autoFocus
              label={t("setup.instance.name")}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("setup.instance.name_placeholder")}
              value={form.name}
            />
            <TextAreaField
              hint={t("setup.instance.description_hint")}
              label={t("setup.instance.description")}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={t("setup.instance.description_placeholder")}
              rows={3}
              value={form.description}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("codice")} variant="secondary">
                {t("setup.back")}
              </Button>
              <Button disabled={form.name.trim() === ""} onClick={() => vaiA("account")}>
                {t("setup.next")}
              </Button>
            </div>
          </>
        )}

        {passo === "account" && (
          <>
            <h1>{t("setup.account.title")}</h1>
            <p className="muted">{t("setup.account.intro")}</p>
            <TextField
              autoFocus
              hint={t("setup.account.username_hint")}
              label={t("setup.account.username")}
              onChange={(event) =>
                setForm({ ...form, adminUsername: event.target.value.toLowerCase() })
              }
              placeholder={t("setup.account.username_placeholder")}
              value={form.adminUsername}
            />
            <TextField
              hint={t("setup.account.password_hint", { min: PASSWORD_MIN_LENGTH })}
              label={t("setup.account.password")}
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              type="password"
              value={form.adminPassword}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("istanza")} variant="secondary">
                {t("setup.back")}
              </Button>
              <Button
                disabled={!nomeValido || form.adminPassword.length < PASSWORD_MIN_LENGTH}
                onClick={() => vaiA("riepilogo")}
              >
                {t("setup.next")}
              </Button>
            </div>
          </>
        )}

        {passo === "riepilogo" && (
          <>
            <h1>{t("setup.summary.title")}</h1>
            <p className="muted">{t("setup.summary.intro")}</p>

            <div className="card card--flush">
              <div className="row">
                <span className="row__body">
                  <span className="row__note">{t("setup.summary.instance")}</span>
                  <span className="row__title">{form.name}</span>
                </span>
              </div>
              {form.description.trim() !== "" && (
                <div className="row">
                  <span className="row__body">
                    <span className="row__note">{t("setup.summary.description")}</span>
                    <span className="row__title">{form.description}</span>
                  </span>
                </div>
              )}
              <div className="row">
                <span className="row__body">
                  <span className="row__note">{t("setup.summary.admin")}</span>
                  <span className="row__title">@{form.adminUsername}</span>
                </span>
              </div>
            </div>

            <div className="cluster">
              <Button onClick={() => vaiA("account")} variant="secondary">
                {t("setup.back")}
              </Button>
              <Button disabled={occupato} onClick={() => void crea()}>
                {occupato ? t("setup.summary.creating") : t("setup.summary.create")}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
