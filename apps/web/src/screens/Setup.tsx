import { dataAtRisk, PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";

import { api, ApiError } from "../api.js";
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

export function Setup(): React.ReactElement {
  const { instance, refreshInstance } = useApp();
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
          <h1>Ripristinare un backup</h1>

          <Alert tone="neutral">
            <strong>I backup sono cifrati e la chiave privata non passa dal browser.</strong> Per
            proteggere i dati della comunità anche in caso di furto o compromissione, l&apos;istanza
            conserva solo la chiave pubblica per scrivere i backup. La chiave privata ce l&apos;hai
            solo tu: non deve mai essere inserita nel browser né viaggiare su HTTP (ADR 0013 e ADR
            0016).
          </Alert>

          <h2>Come si ripristina</h2>

          <ol className="stack stack--tight">
            <li>
              <strong>Non completare questo modulo di configurazione</strong>: eviterai di creare
              una nuova istanza con una chiave diversa da quella del tuo backup.
            </li>
            <li>
              <strong>Apri un terminale sulla macchina</strong> (o collegati via SSH al NAS).
            </li>
            <li>
              <strong>Esegui il comando di ripristino</strong> inserendo la tua chiave privata
              (quella che comincia con <code>AGE-SECRET-KEY-1…</code>) quando richiesta:
            </li>
          </ol>

          <pre className="secret">
            {
              'read -s -p "chiave privata: " K; echo; docker run --rm --user 0:0 -e ESTIA_BACKUP_PRIVATE_KEY="$K" -v /volume1/docker/estia-backup:/backup:ro -v /volume1/docker/estia/data:/restore --entrypoint sh ghcr.io/chrono-web/estia:latest -c \'node dist/backup/cli.js ripristina /backup/ARCHIVIO.tar.age /restore && chown -R 10001:10001 /restore\''
            }
          </pre>

          <p className="muted">
            Sostituisci <code>/volume1/docker/estia-backup</code> con la cartella dove hai i backup,{" "}
            <code>ARCHIVIO.tar.age</code> con il nome del file e{" "}
            <code>/volume1/docker/estia/data</code> con la cartella dei dati.
          </p>

          <p>
            4. <strong>Riavvia il container</strong> (o accendilo dal pannello del NAS) con la
            cartella dei dati montata su <code>/data</code>. Questa schermata sparirà e
            l&apos;istanza ripartirà con tutti i contenuti e gli account al loro posto.
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(false)} variant="secondary">
              Torna alla configurazione
            </Button>
            <Button onClick={() => void refreshInstance()}>Verifica ripristino</Button>
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
          <h1>Scrivi questo codice, adesso</h1>
          <p>
            È il codice di recupero della tua istanza. Serve a rientrare se dimentichi la password,
            ed è <strong>l&apos;unica volta</strong> in cui viene mostrato: l&apos;istanza ne
            conserva solo un&apos;impronta, e non può più mostrartelo.
          </p>

          <code className="secret">{recoveryCode}</code>

          <p className="muted">
            Copialo su un foglio, in un gestore di password, su una chiavetta — dove preferisci,
            purché non sia solo su questo computer. Se perdi il codice <em>e</em> la password,
            l&apos;istanza non è più recuperabile da nessuno.
          </p>

          <label className="choice">
            <input
              checked={scritto}
              onChange={(event) => setScritto(event.target.checked)}
              type="checkbox"
            />
            <span className="choice__body">
              <span className="choice__title">L&apos;ho scritto in un posto sicuro</span>
            </span>
          </label>

          <Button block disabled={!scritto} onClick={() => void refreshInstance()}>
            Entra nell&apos;istanza
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
          <h1>Prima diamo una casa ai dati</h1>

          <Alert tone="error">
            {instance.dataDurability === "ephemeral" ? (
              <>
                <strong>I dati di questa istanza stanno dentro il container.</strong> Spariscono al
                primo aggiornamento dell&apos;immagine — tutti, compresa la chiave privata che la
                rende riconoscibile ai suoi membri, che non è sostituibile.
              </>
            ) : (
              <>
                <strong>I dati di questa istanza stanno su un volume anonimo.</strong> Docker lo ha
                creato da sé perché nessuno gliene ha chiesto uno, e se lo porta dietro soltanto
                quando è <code>docker compose</code> a ricreare il container.{" "}
                <strong>
                  Se aggiorni dal pannello del NAS, l&apos;istanza riparte vuota ogni volta
                </strong>
                : account, contenuti, fotografie e la chiave privata, che non è sostituibile.
              </>
            )}
          </Alert>

          <p>
            Non ti lascio configurarla così. Adesso non c&apos;è ancora niente dentro, quindi
            sistemarlo costa cinque minuti; dopo costerebbe tutto quello che questa comunità ci avrà
            messo.
          </p>

          <h2>Che cosa fare</h2>

          <p>
            <strong>Dal pannello del NAS</strong>: ferma il container, aprilo in modifica e nella
            sezione dei volumi (o delle cartelle) aggiungi una riga che punti una cartella tua — per
            esempio <code>/volume1/docker/estia/data</code> — al percorso <code>/data</code> dentro
            il container. Poi riavvialo.
          </p>

          <p>
            <strong>Da terminale</strong>: usa il file <code>docker-compose.yml</code> della guida
            di installazione, che dichiara un volume con un nome. È anche il modo in cui gli
            aggiornamenti non ti chiedono più niente.
          </p>

          {/* La domanda vera di chi arriva qui non è «come si monta un volume»:
              è «dove sono finiti i miei». Un volume orfano non viene cancellato,
              quindi la risposta è quasi sempre «sono ancora lì», e va data
              adesso — non nella guida, che questa persona ha già letto. */}
          <h2>Se questa istanza esisteva già</h2>

          <p>
            Allora <strong>i dati vecchi sono quasi certamente ancora sulla macchina</strong>: il
            volume che li conteneva non è stato cancellato, è soltanto rimasto senza nessuno che lo
            usi. Da un terminale sulla macchina, questo elenca i volumi che contengono un database
            ESTIA con la data dell&apos;ultima scrittura:
          </p>

          <pre className="secret">
            {
              'for v in $(docker volume ls -q); do docker run --rm -v "$v":/v alpine test -f /v/estia.db 2>/dev/null && echo "$v $(docker run --rm -v "$v":/v alpine stat -c \'%y\' /v/estia.db)"; done'
            }
          </pre>

          <p>
            Ne esce uno per ogni volta che l&apos;istanza è ripartita da zero. Il più recente è
            l&apos;ultima configurazione che stavi usando; si riporta al suo posto copiandolo nella
            cartella che monterai qui sopra, e la guida di installazione lo spiega passo per passo.
            <strong> Non cancellare niente</strong> finché non hai verificato che l&apos;istanza è
            tornata con dentro le tue cose.
          </p>

          <p className="muted">
            Se invece stai solo dando un&apos;occhiata a ESTIA e butterai via tutto fra dieci
            minuti, avvia il container con <code>ESTIA_ALLOW_EPHEMERAL_DATA=true</code> e questa
            schermata ti lascerà passare.
          </p>

          <div className="cluster cluster--between">
            <Button onClick={() => setMostraRipristino(true)} variant="secondary">
              Hai un backup da ripristinare?
            </Button>
            <Button onClick={() => void refreshInstance()}>Ho sistemato la cartella</Button>
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
      setErrore(
        causa instanceof ApiError && causa.code === "invalid_setup_token"
          ? "Questo codice non è valido. È quello stampato nella console dell'istanza, e cambia a ogni riavvio."
          : causa instanceof ApiError
            ? causa.message
            : "Non riesco a contattare l'istanza.",
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
        setErrore(
          "Il codice non è più valido: l'istanza è ripartita e ne ha stampato uno nuovo. Guarda di nuovo la console e riscrivilo — il resto l'ho tenuto.",
        );
        return;
      }

      setErrore(causa instanceof ApiError ? causa.message : "Non riesco a contattare l'istanza.");
    } finally {
      setOccupato(false);
    }
  };

  const nomeValido = /^[a-z0-9][a-z0-9_.-]{1,30}[a-z0-9]$/.test(form.adminUsername);

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <p className="muted">
          Passo {numero} di {PASSI.length}
        </p>
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
            <h1>Il codice di configurazione</h1>
            <p className="muted">
              Lo trovi stampato nella console dell&apos;istanza, quando parte. Non finisce nei log,
              e ne stampa uno nuovo a ogni riavvio.
            </p>
            <TextField
              autoFocus
              label="Codice"
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
              {occupato ? "Controllo…" : "Avanti"}
            </Button>

            <div className="cluster cluster--between">
              <span className="muted">Hai già un backup da ripristinare?</span>
              <Button onClick={() => setMostraRipristino(true)} variant="quiet">
                Ripristina backup
              </Button>
            </div>
          </>
        )}

        {passo === "istanza" && (
          <>
            <h1>Diamo un nome a questa istanza</h1>
            <p className="muted">
              Il nome lo vedono i suoi membri, e chi riceve un invito prima di chiedere di entrare.
            </p>
            <TextField
              autoFocus
              label="Nome dell'istanza"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Via Roma"
              value={form.name}
            />
            <TextAreaField
              hint="La vedrà chi riceve un invito, prima di chiedere di entrare."
              label="Descrizione"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Il feed di chi abita in via Roma."
              rows={3}
              value={form.description}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("codice")} variant="secondary">
                Indietro
              </Button>
              <Button disabled={form.name.trim() === ""} onClick={() => vaiA("account")}>
                Avanti
              </Button>
            </div>
          </>
        )}

        {passo === "account" && (
          <>
            <h1>Il tuo account</h1>
            <p className="muted">
              Sei la prima persona di questa istanza, e quella che la amministra.
            </p>
            <TextField
              autoFocus
              hint="Minuscolo, senza spazi. Non si cambia: è il nome con cui ti conosceranno qui e sulle altre istanze."
              label="Nome utente"
              onChange={(event) =>
                setForm({ ...form, adminUsername: event.target.value.toLowerCase() })
              }
              placeholder="palu"
              value={form.adminUsername}
            />
            <TextField
              hint={`Almeno ${String(PASSWORD_MIN_LENGTH)} caratteri.`}
              label="Password"
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              type="password"
              value={form.adminPassword}
            />
            <div className="cluster">
              <Button onClick={() => vaiA("istanza")} variant="secondary">
                Indietro
              </Button>
              <Button
                disabled={!nomeValido || form.adminPassword.length < PASSWORD_MIN_LENGTH}
                onClick={() => vaiA("riepilogo")}
              >
                Avanti
              </Button>
            </div>
          </>
        )}

        {passo === "riepilogo" && (
          <>
            <h1>Ci siamo</h1>
            <p className="muted">
              Da qui nascono l&apos;istanza e il suo amministratore. È l&apos;ultima schermata prima
              che esista qualcosa.
            </p>

            <div className="card card--flush">
              <div className="row">
                <span className="row__body">
                  <span className="row__note">Istanza</span>
                  <span className="row__title">{form.name}</span>
                </span>
              </div>
              {form.description.trim() !== "" && (
                <div className="row">
                  <span className="row__body">
                    <span className="row__note">Descrizione</span>
                    <span className="row__title">{form.description}</span>
                  </span>
                </div>
              )}
              <div className="row">
                <span className="row__body">
                  <span className="row__note">Amministratore</span>
                  <span className="row__title">@{form.adminUsername}</span>
                </span>
              </div>
            </div>

            <div className="cluster">
              <Button onClick={() => vaiA("account")} variant="secondary">
                Indietro
              </Button>
              <Button disabled={occupato} onClick={() => void crea()}>
                {occupato ? "Creo l'istanza…" : "Crea l'istanza"}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
