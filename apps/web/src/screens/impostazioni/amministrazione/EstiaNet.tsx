import type { AdminDiagnostics, FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button, TextAreaField, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * EstiaNet: accendere, condividere la chiave, collegare altre istanze.
 *
 * Un solo percorso al posto di «Rete» e «Istanze collegate». Compare anche da
 * spenta (lezione di ADR 0016). Il nome di un'istanza remota è dichiarato, non
 * verificato (ADR 0020 §5).
 */
function stato(state: FederatedInstanceView["state"]): string {
  switch (state) {
    case "collegata":
      return "Collegata";
    case "richiesta_inviata":
      return "Richiesta inviata — aspetta che accettino";
    case "richiesta_ricevuta":
      return "Ti ha chiesto di collegarsi";
    case "bloccata":
      return "Bloccata";
  }
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

export function EstiaNet(): React.ReactElement {
  const { token } = useSignedIn();
  const [diagnostica, setDiagnostica] = useState<AdminDiagnostics | undefined>();
  const [federazione, setFederazione] = useState<FederationView | undefined>();
  const [chiave, setChiave] = useState("");
  const [nota, setNota] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

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

  const accendi = async (modo: "off" | "local" | "internet"): Promise<void> => {
    await api.setNetworkProbe(token, modo);
    await Promise.all([caricaDiagnostica(), caricaFederazione()]);
  };

  const agisci = async (azione: () => Promise<FederationView>, detto?: string): Promise<void> => {
    setNota(undefined);
    setOccupato(true);

    try {
      setFederazione(await azione());
      setNota(detto);
    } catch (causa) {
      setNota(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setOccupato(false);
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

  return (
    <Sezione titolo="EstiaNet">
      <div className="card">
        <h2>Accensione</h2>
        <p className="muted">{rete.detail}</p>

        {rete.editable ? (
          rete.mode === "off" ? (
            <>
              <div className="cluster">
                <Button onClick={() => void accendi("local")}>Accendi sulla rete di casa</Button>
                <Button onClick={() => void accendi("internet")} variant="secondary">
                  Accendi anche da fuori
                </Button>
              </div>
              <p className="muted">
                «Rete di casa» non tocca nessuna infrastruttura di terzi e serve se le due istanze
                sono sotto lo stesso tetto. «Anche da fuori» usa i server pubblici di iroh per farsi
                trovare, ed è quello che serve fra due case diverse.
              </p>
            </>
          ) : (
            <Button onClick={() => void accendi("off")} variant="danger">
              Spegni EstiaNet
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
              disabled={occupato || chiave.trim() === ""}
              onClick={() => {
                const pulita = chiave.trim();

                void agisci(
                  () => api.connectInstance(token, pulita),
                  "Richiesta mandata. Sarà collegata quando anche l'altra istanza avrà chiesto.",
                ).then(() => setChiave(""));
              }}
            >
              Chiedi il collegamento
            </Button>

            {nota !== undefined && <Alert>{nota}</Alert>}
          </>
        )}
      </div>

      {federazione.networkOn && (
        <div className="card card--flush">
          <h2 className="gruppo">Istanze</h2>

          {federazione.instances.length === 0 && (
            <p className="empty-inline">Nessuna istanza collegata, per ora.</p>
          )}

          {federazione.instances.map((istanza) => (
            <div className="row" key={istanza.publicKey}>
              <span className="row__body">
                <span className="row__title">
                  {istanza.declaredName === ""
                    ? "Istanza senza nome dichiarato"
                    : istanza.declaredName}{" "}
                  {istanza.state === "collegata" ? (
                    <Badge tone="on">collegata</Badge>
                  ) : (
                    <Badge>{stato(istanza.state)}</Badge>
                  )}
                </span>
                <span className="row__note">
                  Il nome è quello che <em>lei dichiara di sé</em>: l&apos;unica cosa verificata è
                  la chiave.
                </span>
                <span className="row__note">
                  <code>{istanza.publicKey}</code>
                </span>
                <span className="row__note">{vista(istanza)}</span>
              </span>
              <span className="row__end">
                {istanza.state === "richiesta_ricevuta" && (
                  <Button
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        () => api.acceptInstance(token, istanza.publicKey),
                        "Collegamento accettato.",
                      )
                    }
                  >
                    Accetta
                  </Button>
                )}
                {istanza.state !== "bloccata" && (
                  <>
                    <Button
                      disabled={occupato}
                      onClick={() =>
                        void agisci(async () => {
                          const ping = await api.pingInstance(token, istanza.publicKey);

                          setNota(ping.detail);

                          return api.federation(token);
                        })
                      }
                      variant="secondary"
                    >
                      Prova a raggiungerla
                    </Button>
                    <Button
                      disabled={occupato}
                      onClick={() =>
                        void agisci(
                          () => api.blockInstance(token, istanza.publicKey),
                          "Bloccata. Le connessioni aperte sono state chiuse subito.",
                        )
                      }
                      variant="danger"
                    >
                      Blocca
                    </Button>
                  </>
                )}
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void agisci(
                      () => api.forgetInstance(token, istanza.publicKey),
                      istanza.state === "bloccata" ? "Blocco tolto." : "Collegamento dimenticato.",
                    )
                  }
                  variant="secondary"
                >
                  {istanza.state === "bloccata" ? "Togli il blocco" : "Dimentica"}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Sezione>
  );
}
