import type { FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge, Button, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * Che cosa dice una riga di collegamento, e che cosa non dice.
 *
 * Non c'è nessuna spunta e nessun «verificata»: il nome di un'istanza remota è
 * una cosa che lei dichiara di sé, e una firma prova chi parla, non che dica il
 * vero (ADR 0020 §5). L'unica cosa verificata qui è la chiave.
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

export function Collegate(): React.ReactElement {
  const { token } = useSignedIn();
  const [federazione, setFederazione] = useState<FederationView | undefined>();
  const [chiave, setChiave] = useState("");
  const [nota, setNota] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(async () => {
    setFederazione(await api.federation(token));
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  /**
   * Ogni azione restituisce la vista intera, perché lo stato di un collegamento
   * cambia anche dall'altra parte: aggiornare una riga sola mostrerebbe metà
   * verità fino al prossimo caricamento.
   */
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

  if (federazione === undefined) {
    return (
      <Sezione titolo="Istanze collegate">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  if (!federazione.networkOn) {
    return (
      <Sezione titolo="Istanze collegate">
        <div className="card">
          <Alert>
            La rete fra istanze è spenta. Si accende dalla sezione <strong>Rete</strong>, ed è
            quello che serve prima di collegarsi a qualcuno.
          </Alert>
        </div>
      </Sezione>
    );
  }

  return (
    <Sezione titolo="Istanze collegate">
      <div className="card">
        <p className="muted">
          Per collegarti serve la <strong>chiave pubblica</strong> dell&apos;altra istanza, che si
          fa dare da chi la amministra. Il collegamento vale quando tutte e due l&apos;hanno
          chiesto: finché una sola ha chiesto, resta in attesa.
        </p>

        {!federazione.reachableByKey && (
          <Alert>
            Su «rete di casa» non c&apos;è scoperta, quindi qui va incollato il codice lungo invece
            della chiave.
          </Alert>
        )}

        <TextField
          label={
            federazione.reachableByKey ? "Chiave dell'altra istanza" : "Codice dell'altra istanza"
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
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Collegamenti</h2>

        {federazione.instances.length === 0 && (
          <p className="empty">Nessuna istanza collegata, per ora.</p>
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
                Il nome è quello che <em>lei dichiara di sé</em>: l&apos;unica cosa verificata è la
                chiave.
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
                        const esito = await api.pingInstance(token, istanza.publicKey);

                        setNota(esito.detail);

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
    </Sezione>
  );
}
