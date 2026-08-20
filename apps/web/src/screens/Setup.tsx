import { dataAtRisk, PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";

import { api, ApiError } from "../api.js";
import { useApp } from "../state.js";

export function Setup(): React.ReactElement {
  const { instance, refreshInstance } = useApp();
  const [form, setForm] = useState({
    adminPassword: "",
    adminUsername: "",
    description: "",
    name: "",
    setupToken: "",
  });
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>();
  const [written, setWritten] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const created = await api.setup({
        adminPassword: form.adminPassword,
        adminUsername: form.adminUsername,
        description: form.description,
        name: form.name,
        setupToken: form.setupToken,
      });

      setRecoveryCode(created.recoveryCode);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "invalid_setup_token"
          ? "Il codice di configurazione non è valido. È quello stampato nella console dell'istanza, e cambia a ogni riavvio."
          : cause instanceof ApiError
            ? cause.message
            : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCode !== undefined) {
    return (
      <main className="narrow">
        <div className="card">
          <h1>Scrivi questo codice, adesso</h1>
          <p>
            È il codice di recupero della tua istanza. Serve a rientrare se dimentichi la password,
            ed è <strong>l'unica volta</strong> in cui viene mostrato: l'istanza ne conserva solo
            un'impronta, e non può più mostrartelo.
          </p>

          <code className="secret">{recoveryCode}</code>

          <p className="muted">
            Copialo su un foglio, in un gestore di password, su una chiavetta — dove preferisci,
            purché non sia solo su questo computer. Se perdi il codice <em>e</em> la password,
            l'istanza non è più recuperabile da nessuno.
          </p>

          <label>
            <input
              checked={written}
              onChange={(event) => setWritten(event.target.checked)}
              type="checkbox"
            />{" "}
            L'ho scritto in un posto sicuro
          </label>

          <button disabled={!written} onClick={() => void refreshInstance()} type="button">
            Entra nell'istanza
          </button>
        </div>
      </main>
    );
  }

  /*
   * La schermata che non c'era, ed è il motivo per cui questa configurazione è
   * stata rifatta più volte (ADR 0019). Prima qui c'era un avviso sopra il
   * modulo: si poteva leggere, credere di aver capito, e configurare comunque.
   * Adesso il modulo non c'è finché i dati non hanno un posto dove stare.
   */
  if (instance.dataDurability !== undefined && dataAtRisk(instance.dataDurability)) {
    return (
      <main className="narrow">
        <div className="card">
          <h1>Prima diamo una casa ai dati</h1>

          <div className="alert error">
            {instance.dataDurability === "ephemeral" ? (
              <>
                <strong>I dati di questa istanza stanno dentro il container.</strong> Spariscono al
                primo aggiornamento dell'immagine — tutti, compresa la chiave privata che la rende
                riconoscibile ai suoi membri, che non è sostituibile.
              </>
            ) : (
              <>
                <strong>I dati di questa istanza stanno su un volume anonimo.</strong> Docker lo ha
                creato da sé perché nessuno gliene ha chiesto uno, e se lo porta dietro soltanto
                quando è <code>docker compose</code> a ricreare il container.{" "}
                <strong>
                  Se aggiorni dal pannello del NAS, l'istanza riparte vuota ogni volta
                </strong>
                : account, contenuti, fotografie e la chiave privata, che non è sostituibile.
              </>
            )}
          </div>

          <p>
            Non ti lascio configurarla così. Adesso non c'è ancora niente dentro, quindi sistemarlo
            costa cinque minuti; dopo costerebbe tutto quello che questa comunità ci avrà messo.
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
              è «dove sono finiti i miei». Un volume orfano non viene
              cancellato, quindi la risposta è quasi sempre «sono ancora lì», e
              va data adesso — non nella guida, che questa persona ha già letto
              e che l'ha portata fin qui. */}
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
        </div>
      </main>
    );
  }

  return (
    <main className="narrow">
      <div className="card">
        <h1>Diamo un nome a questa istanza</h1>
        <p className="muted">
          Stai configurando ESTIA per la prima volta. Da qui nascono l'istanza e il suo
          amministratore.
        </p>

        {error !== undefined && <div className="alert error">{error}</div>}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span className="label-text">Codice di configurazione</span>
            <input
              autoFocus
              onChange={(event) => setForm({ ...form, setupToken: event.target.value })}
              required
              value={form.setupToken}
            />
            <span className="hint">
              Lo trovi stampato nella console dell'istanza. Non finisce nei log e cambia a ogni
              riavvio.
            </span>
          </label>

          <label>
            <span className="label-text">Nome dell&apos;istanza</span>
            <input
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Via Roma"
              required
              value={form.name}
            />
          </label>

          <label>
            <span className="label-text">Descrizione</span>
            <textarea
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Il feed di chi abita in via Roma."
              value={form.description}
            />
            <span className="hint">
              La vedrà chi riceve un invito, prima di chiedere di entrare.
            </span>
          </label>

          <label>
            <span className="label-text">Il tuo nome utente</span>
            <input
              onChange={(event) =>
                setForm({ ...form, adminUsername: event.target.value.toLowerCase() })
              }
              pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
              placeholder="palu"
              required
              value={form.adminUsername}
            />
          </label>

          <label>
            <span className="label-text">La tua password</span>
            <input
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              required
              type="password"
              value={form.adminPassword}
            />
            <span className="hint">Almeno {PASSWORD_MIN_LENGTH} caratteri.</span>
          </label>

          <button disabled={busy} type="submit">
            {busy ? "Creo l'istanza…" : "Crea l'istanza"}
          </button>
        </form>
      </div>
    </main>
  );
}
