import type { AdminDiagnostics } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Button, TextAreaField, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * La rete fra istanze: la chiave da mandare, e la prova che si arrivi.
 *
 * Compare **anche da spenta**, ed è la lezione di ADR 0016: una misura che si
 * accende solo da terminale è una misura che non si accende.
 */
export function Rete(): React.ReactElement {
  const { token } = useSignedIn();
  const [diagnostica, setDiagnostica] = useState<AdminDiagnostics | undefined>();
  const [altra, setAltra] = useState("");
  const [esito, setEsito] = useState<string | undefined>();

  const carica = useCallback(async () => {
    setDiagnostica(await api.diagnostics(token));
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const accendi = async (modo: "off" | "local" | "internet"): Promise<void> => {
    setEsito(undefined);
    await api.setNetworkProbe(token, modo);
    await carica();
  };

  if (diagnostica === undefined) {
    return (
      <Sezione titolo="Rete">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  const rete = diagnostica.network;

  return (
    <Sezione titolo="Rete">
      <div className="card">
        <h2>Stato</h2>
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
              Spegni la rete
            </Button>
          )
        ) : (
          <p className="muted">
            Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui si vede
            e non si cambia, perché il riavvio annullerebbe la modifica.
          </p>
        )}
      </div>

      {rete.state === "ready" && (
        <>
          <div className="card">
            <h2>La chiave di questa istanza</h2>
            <p className="muted">
              È l&apos;unica cosa da mandare a chi vuole collegarsi. <strong>Non cambia mai</strong>
              : è derivata dalla chiave dell&apos;istanza, quindi resta la stessa dopo un riavvio,
              dopo un aggiornamento dell&apos;immagine e dopo un ripristino da backup. Chi l&apos;ha
              salvata continua a trovarti, e non contiene dove sei.
            </p>
            <code className="secret">{rete.endpointId ?? ""}</code>

            {rete.reachableByKey !== true && (
              <>
                <p className="muted">
                  Su <code>local</code> però non c&apos;è nessuna scoperta, quindi la sola chiave
                  non basta a farti trovare: manda invece questo codice, che porta con sé anche gli
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

          <div className="card">
            <h2>Prova a raggiungere un&apos;altra istanza</h2>
            <p className="muted">
              Misura e basta: non trasporta niente e non stabilisce nessun collegamento.
            </p>
            <TextField
              label="Chiave o codice dell'altra istanza"
              onChange={(event) => setAltra(event.target.value)}
              value={altra}
            />
            <Button
              disabled={altra.trim() === ""}
              onClick={() => {
                setEsito("Provo…");
                void api
                  .probeNetwork(token, altra.trim())
                  .then((risultato) =>
                    setEsito(
                      `${risultato.detail}${
                        risultato.elapsedMs === undefined
                          ? ""
                          : ` — andata e ritorno ${String(Math.round(risultato.elapsedMs))} ms`
                      }`,
                    ),
                  )
                  .catch(() => setEsito("La prova non è riuscita a partire."));
              }}
            >
              Prova
            </Button>
            {esito !== undefined && <Alert>{esito}</Alert>}
          </div>
        </>
      )}
    </Sezione>
  );
}
