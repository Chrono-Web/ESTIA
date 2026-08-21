import type { AdminDiagnostics, FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button, Live, TextAreaField, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * EstiaNet: accendere, condividere la chiave, collegare altre istanze.
 *
 * Un solo percorso al posto di «Rete» e «Istanze collegate». Compare anche da
 * spenta (lezione di ADR 0016). Il nome di un'istanza remota è dichiarato, non
 * verificato (ADR 0020 §5).
 *
 * Le richieste in arrivo stanno in una sezione propria, con Accetta in vista —
 * non mischiate a Prova / Blocca / Dimentica, altrimenti il sì sparisce.
 */
function nomeDi(istanza: FederatedInstanceView): string {
  return istanza.declaredName === "" ? "Istanza senza nome dichiarato" : istanza.declaredName;
}

function vista(istanza: FederatedInstanceView): string {
  if (istanza.lastSeenAt === null) {
    return "Mai raggiunta finora.";
  }

  const via =
    istanza.lastReachedVia === "relay"
      ? " attraverso un relay"
      : istanza.lastReachedVia === "diretto"
        ? " per collegamento diretto"
        : "";

  return `Vista l'ultima volta il ${new Date(istanza.lastSeenAt).toLocaleString("it-IT")}${via}.`;
}

function RigaIstanza({
  istanza,
  azioni,
}: {
  istanza: FederatedInstanceView;
  azioni: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="row row--stack">
      <span className="row__body">
        <span className="row__title">{nomeDi(istanza)}</span>
        <span className="row__note">
          Il nome è quello che <em>lei dichiara di sé</em>: l&apos;unica cosa verificata è la
          chiave.
        </span>
        <span className="row__note">
          <code>{istanza.publicKey}</code>
        </span>
        <span className="row__note">{vista(istanza)}</span>
      </span>
      <span className="row__end row__end--actions">{azioni}</span>
    </div>
  );
}

export function EstiaNet(): React.ReactElement {
  const { token } = useSignedIn();
  const [diagnostica, setDiagnostica] = useState<AdminDiagnostics | undefined>();
  const [federazione, setFederazione] = useState<FederationView | undefined>();
  const [chiave, setChiave] = useState("");
  /** Messaggio di esito riuscito, dopo. */
  const [nota, setNota] = useState<string | undefined>();
  /** Tenuto separato da `nota`: un fallimento non deve avere la faccia di un esito. */
  const [errore, setErrore] = useState<string | undefined>();
  /**
   * Che cosa sta facendo adesso, e quale controllo.
   *
   * Senza questo un click su una rete lenta sembra un pulsante rotto
   * (euristica 1: visibilità dello stato del sistema).
   */
  const [lavoro, setLavoro] = useState<{ id: string; detto: string } | undefined>();

  const caricaDiagnostica = useCallback(async () => {
    setDiagnostica(await api.diagnostics(token));
  }, [token]);

  const caricaFederazione = useCallback(async () => {
    setFederazione(await api.federation(token));
  }, [token]);

  useEffect(() => {
    void caricaDiagnostica();
    void caricaFederazione();
  }, [caricaDiagnostica, caricaFederazione]);

  const occupato = lavoro !== undefined;
  const etichetta = (id: string, fermo: string, durante: string): string =>
    lavoro?.id === id ? durante : fermo;

  const accendi = async (modo: "off" | "local" | "internet"): Promise<void> => {
    const id = `accendi:${modo}`;
    setNota(undefined);
    setErrore(undefined);
    setLavoro({
      detto:
        modo === "off"
          ? "Spengo EstiaNet…"
          : modo === "local"
            ? "Accendo sulla rete di casa…"
            : "Accendo anche da fuori…",
      id,
    });

    try {
      await api.setNetworkProbe(token, modo);
      await Promise.all([caricaDiagnostica(), caricaFederazione()]);
      setNota(modo === "off" ? "EstiaNet spento." : "EstiaNet acceso.");
    } catch (causa) {
      setErrore(
        spiega(
          causa,
          modo === "off"
            ? "Non sono riuscito a spegnere EstiaNet. Riprova."
            : "Non sono riuscito ad accendere EstiaNet. Riprova.",
        ),
      );
    } finally {
      setLavoro(undefined);
    }
  };

  const agisci = async (
    id: string,
    durante: string,
    azione: () => Promise<FederationView>,
    detto?: string,
  ): Promise<void> => {
    setNota(undefined);
    setErrore(undefined);
    setLavoro({ detto: durante, id });

    try {
      setFederazione(await azione());
      if (detto !== undefined) {
        setNota(detto);
      }
    } catch (causa) {
      setErrore(spiega(causa, "Non ha funzionato. Riprova, o riprova più tardi."));
    } finally {
      setLavoro(undefined);
    }
  };

  if (diagnostica === undefined || federazione === undefined) {
    return (
      <Sezione titolo="EstiaNet">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  const rete = diagnostica.network;
  const accesa = rete.state === "ready";
  const inArrivo = federazione.instances.filter((row) => row.state === "richiesta_ricevuta");
  const inAttesa = federazione.instances.filter((row) => row.state === "richiesta_inviata");
  const collegate = federazione.instances.filter((row) => row.state === "collegata");
  const bloccate = federazione.instances.filter((row) => row.state === "bloccata");

  return (
    <Sezione titolo="EstiaNet">
      {/*
        Lo stato passa da due canali diversi di proposito: `Live` c'è sempre e
        annuncia lavoro ed esito, l'errore lo annuncia il suo `role="alert"`.
        Un `aria-live` sull'`Alert` non funzionerebbe — vedi `Feedback.tsx`.
      */}
      <Live>{lavoro?.detto ?? nota ?? ""}</Live>

      {errore !== undefined && <Alert tone="error">{errore}</Alert>}

      {(lavoro !== undefined || nota !== undefined) && <Alert>{lavoro?.detto ?? nota}</Alert>}

      <div className="card">
        <h2>Accensione</h2>
        <p className="muted">{rete.detail}</p>

        {rete.editable ? (
          rete.mode === "off" ? (
            <>
              <div className="cluster">
                <Button
                  aria-busy={lavoro?.id === "accendi:local"}
                  disabled={occupato}
                  onClick={() => void accendi("local")}
                >
                  {etichetta("accendi:local", "Accendi sulla rete di casa", "Accendo…")}
                </Button>
                <Button
                  aria-busy={lavoro?.id === "accendi:internet"}
                  disabled={occupato}
                  onClick={() => void accendi("internet")}
                  variant="secondary"
                >
                  {etichetta("accendi:internet", "Accendi anche da fuori", "Accendo…")}
                </Button>
              </div>
              <p className="muted">
                «Rete di casa» non tocca nessuna infrastruttura di terzi e serve se le due istanze
                sono sotto lo stesso tetto. «Anche da fuori» usa i server pubblici di iroh per farsi
                trovare, ed è quello che serve fra due case diverse.
              </p>
            </>
          ) : (
            <Button
              aria-busy={lavoro?.id === "accendi:off"}
              disabled={occupato}
              onClick={() => void accendi("off")}
              variant="danger"
            >
              {etichetta("accendi:off", "Spegni EstiaNet", "Spengo…")}
            </Button>
          )
        ) : (
          <p className="muted">
            Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui si vede
            e non si cambia, perché il riavvio annullerebbe la modifica.
          </p>
        )}
      </div>

      {accesa && (
        <div className="card">
          <h2>La chiave da mandare</h2>
          <p className="muted">
            È l&apos;unica cosa da mandare a chi vuole collegarsi. <strong>Non cambia mai</strong>:
            è derivata dalla chiave dell&apos;istanza, quindi resta la stessa dopo un riavvio, dopo
            un aggiornamento dell&apos;immagine e dopo un ripristino da backup. Chi l&apos;ha
            salvata continua a trovarti, e non contiene dove sei.
          </p>
          <code className="secret">{rete.endpointId ?? ""}</code>

          {rete.reachableByKey !== true && (
            <>
              <p className="muted">
                Su <code>local</code> però non c&apos;è nessuna scoperta, quindi la sola chiave non
                basta a farti trovare: manda invece questo codice, che porta con sé anche gli
                indirizzi di adesso — e che, a differenza della chiave, smette di valere quando
                cambiano.
              </p>
              <TextAreaField
                label="Codice con gli indirizzi di adesso"
                readOnly
                rows={2}
                value={rete.ticket ?? ""}
              />
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Collegamenti</h2>

        {!federazione.networkOn ? (
          <Alert>
            EstiaNet è spento. Accendilo qui sopra: è quello che serve prima di collegarsi a
            qualcuno.
          </Alert>
        ) : (
          <>
            <p className="muted">
              Per collegarti serve la <strong>chiave pubblica</strong> dell&apos;altra istanza, che
              si fa dare da chi la amministra. Il collegamento vale quando tutte e due l&apos;hanno
              chiesto: finché una sola ha chiesto, resta in attesa.
            </p>

            {!federazione.reachableByKey && (
              <Alert>
                Su «rete di casa» non c&apos;è scoperta, quindi qui va incollato il codice lungo
                invece della chiave.
              </Alert>
            )}

            <TextField
              label={
                federazione.reachableByKey
                  ? "Chiave dell'altra istanza"
                  : "Codice dell'altra istanza"
              }
              onChange={(event) => setChiave(event.target.value)}
              value={chiave}
            />

            <Button
              aria-busy={lavoro?.id === "chiedi"}
              disabled={occupato || chiave.trim() === ""}
              onClick={() => {
                const pulita = chiave.trim();

                void agisci(
                  "chiedi",
                  "Sto chiedendo il collegamento… può richiedere qualche secondo.",
                  () => api.connectInstance(token, pulita),
                  "Richiesta mandata. Sarà collegata quando anche l'altra istanza avrà chiesto.",
                ).then(() => setChiave(""));
              }}
            >
              {etichetta("chiedi", "Chiedi il collegamento", "Sto chiedendo…")}
            </Button>
          </>
        )}
      </div>

      {federazione.networkOn && inArrivo.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Ti hanno chiesto di collegarsi</h2>
          <p className="empty-inline muted">
            Qui si decide: Accetta apre il collegamento, Rifiuta toglie la richiesta.
          </p>

          {inArrivo.map((istanza) => (
            <RigaIstanza
              key={istanza.publicKey}
              istanza={istanza}
              azioni={
                <>
                  <Button
                    aria-busy={lavoro?.id === `accetta:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `accetta:${istanza.publicKey}`,
                        "Accetto il collegamento…",
                        () => api.acceptInstance(token, istanza.publicKey),
                        "Collegamento accettato.",
                      )
                    }
                  >
                    {etichetta(`accetta:${istanza.publicKey}`, "Accetta", "Accetto…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `rifiuta:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `rifiuta:${istanza.publicKey}`,
                        "Rifiuto la richiesta…",
                        () => api.forgetInstance(token, istanza.publicKey),
                        "Richiesta rifiutata.",
                      )
                    }
                    variant="danger"
                  >
                    {etichetta(`rifiuta:${istanza.publicKey}`, "Rifiuta", "Rifiuto…")}
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {federazione.networkOn && inAttesa.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">In attesa della loro risposta</h2>
          <p className="empty-inline muted">
            Hai già chiesto tu. Se non rispondono, puoi mandare di nuovo la richiesta — «Prova a
            raggiungerla» misura soltanto se sono raggiungibili, non completa il collegamento.
          </p>

          {inAttesa.map((istanza) => (
            <RigaIstanza
              key={istanza.publicKey}
              istanza={istanza}
              azioni={
                <>
                  <Badge>In attesa</Badge>
                  <Button
                    aria-busy={lavoro?.id === `di-nuovo:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `di-nuovo:${istanza.publicKey}`,
                        "Rimando la richiesta…",
                        () => api.connectInstance(token, istanza.publicKey),
                        "Richiesta mandata di nuovo.",
                      )
                    }
                  >
                    {etichetta(`di-nuovo:${istanza.publicKey}`, "Mandala di nuovo", "Rimando…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `ping:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `ping:${istanza.publicKey}`,
                        "Provo a raggiungerla…",
                        async () => {
                          const ping = await api.pingInstance(token, istanza.publicKey);
                          setNota(ping.detail);
                          return api.federation(token);
                        },
                      )
                    }
                    variant="secondary"
                  >
                    {etichetta(`ping:${istanza.publicKey}`, "Prova a raggiungerla", "Provo…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `dimentica:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `dimentica:${istanza.publicKey}`,
                        "Dimentico la richiesta…",
                        () => api.forgetInstance(token, istanza.publicKey),
                        "Richiesta dimenticata.",
                      )
                    }
                    variant="secondary"
                  >
                    {etichetta(`dimentica:${istanza.publicKey}`, "Dimentica", "Dimentico…")}
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {federazione.networkOn && (
        <div className="card card--flush">
          <h2 className="gruppo">Collegate</h2>

          {collegate.length === 0 && (
            <p className="empty-inline">Nessuna istanza collegata, per ora.</p>
          )}

          {collegate.map((istanza) => (
            <RigaIstanza
              key={istanza.publicKey}
              istanza={istanza}
              azioni={
                <>
                  <Badge tone="on">collegata</Badge>
                  <Button
                    aria-busy={lavoro?.id === `ping:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `ping:${istanza.publicKey}`,
                        "Provo a raggiungerla…",
                        async () => {
                          const ping = await api.pingInstance(token, istanza.publicKey);
                          setNota(ping.detail);
                          return api.federation(token);
                        },
                      )
                    }
                    variant="secondary"
                  >
                    {etichetta(`ping:${istanza.publicKey}`, "Prova a raggiungerla", "Provo…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `blocca:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `blocca:${istanza.publicKey}`,
                        "Blocco l'istanza…",
                        () => api.blockInstance(token, istanza.publicKey),
                        "Bloccata. Le connessioni aperte sono state chiuse subito.",
                      )
                    }
                    variant="danger"
                  >
                    {etichetta(`blocca:${istanza.publicKey}`, "Blocca", "Blocco…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `dimentica:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `dimentica:${istanza.publicKey}`,
                        "Dimentico il collegamento…",
                        () => api.forgetInstance(token, istanza.publicKey),
                        "Collegamento dimenticato.",
                      )
                    }
                    variant="secondary"
                  >
                    {etichetta(`dimentica:${istanza.publicKey}`, "Dimentica", "Dimentico…")}
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {federazione.networkOn && bloccate.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Bloccate</h2>

          {bloccate.map((istanza) => (
            <RigaIstanza
              key={istanza.publicKey}
              istanza={istanza}
              azioni={
                <Button
                  aria-busy={lavoro?.id === `sblocca:${istanza.publicKey}`}
                  disabled={occupato}
                  onClick={() =>
                    void agisci(
                      `sblocca:${istanza.publicKey}`,
                      "Tolgo il blocco…",
                      () => api.forgetInstance(token, istanza.publicKey),
                      "Blocco tolto.",
                    )
                  }
                  variant="secondary"
                >
                  {etichetta(`sblocca:${istanza.publicKey}`, "Togli il blocco", "Tolgo…")}
                </Button>
              }
            />
          ))}
        </div>
      )}
    </Sezione>
  );
}
