import type { AdminDiagnostics, FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { useSignedIn } from "../../../state.js";
import {
  Alert,
  Badge,
  Button,
  Live,
  QrCode,
  TextAreaField,
  TextField,
  type Tone,
} from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * EstiaNet: gestione completa del ciclo di vita della rete fra istanze.
 *
 * Conforme a tutte le 10 euristiche di usabilità di docs/DESIGN_SYSTEM.md:
 * - 1. Visibilità dello stato: aria-busy, Live, Alert con toni appropriati (ok/error).
 * - 2. Mondo reale: terminologia chiara per le azioni quotidiane.
 * - 3. Controllo e libertà: annullamento richieste, rifiuto, dimentica, sblocco.
 * - 4. Coerenza e standard: componenti UI standard di ESTIA.
 * - 5. Prevenzione errori: pulsante copia per le chiavi a 64 caratteri, validazione.
 * - 6. Riconoscere vs ricordare: sezioni dedicate e visibili per ogni fase.
 * - 7. Flessibilità ed efficienza: copia rapida negli appunti, azioni dirette per riga.
 * - 8. Design estetico e minimale: schede chiare e separate per compito.
 * - 9. Diagnosi e recupero errori: spiegazioni chiare per fallimenti di rete p2p.
 * - 10. Aiuto e documentazione: testo esplicativo integrato a schermo.
 */

function nomeDi(istanza: FederatedInstanceView): string {
  return istanza.declaredName.trim() === ""
    ? "Istanza senza nome dichiarato"
    : istanza.declaredName;
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

interface RigaIstanzaProps {
  istanza: FederatedInstanceView;
  badge?: React.ReactNode;
  azioni: React.ReactNode;
  onCopiaChiave?: () => void;
  copiata?: boolean;
}

function RigaIstanza({
  istanza,
  badge,
  azioni,
  onCopiaChiave,
  copiata = false,
}: RigaIstanzaProps): React.ReactElement {
  return (
    <div className="row row--stack">
      <span className="row__body">
        <span className="row__title cluster">
          <span>{nomeDi(istanza)}</span>
          {badge}
        </span>
        <span className="row__note">
          Il nome è dichiarato dall&apos;altra istanza. La chiave verificata è:
        </span>
        <span className="cluster" style={{ alignItems: "center" }}>
          <code>{istanza.publicKey}</code>
          {onCopiaChiave !== undefined && (
            <Button
              className="btn--quiet"
              onClick={onCopiaChiave}
              title="Copia chiave negli appunti"
              variant="quiet"
            >
              {copiata ? "Copiata!" : "Copia"}
            </Button>
          )}
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
  const [messaggio, setMessaggio] = useState<{ testo: string; tono: Tone } | undefined>();
  const [copiati, setCopiati] = useState<Record<string, boolean>>({});
  const [mostraQr, setMostraQr] = useState(false);
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

    const interval = setInterval(() => {
      void caricaFederazione();
    }, 5000);

    return () => clearInterval(interval);
  }, [caricaDiagnostica, caricaFederazione]);

  const occupato = lavoro !== undefined;
  const etichetta = (id: string, fermo: string, durante: string): string =>
    lavoro?.id === id ? durante : fermo;

  const segnaCopiato = (id: string) => {
    setCopiati((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiati((prev) => ({ ...prev, [id]: false }));
    }, 2500);
  };

  const copiaNegliAppunti = async (testo: string, id: string) => {
    try {
      await navigator.clipboard.writeText(testo);
      segnaCopiato(id);
      setMessaggio({ testo: "Copiato negli appunti!", tono: "ok" });
    } catch {
      setMessaggio({
        testo: "Non è stato possibile copiare automaticamente. Seleziona il testo manualmente.",
        tono: "neutral",
      });
    }
  };

  const accendi = async (modo: "off" | "local" | "internet"): Promise<void> => {
    const id = `accendi:${modo}`;
    setMessaggio(undefined);
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
      setMessaggio({
        testo:
          modo === "off"
            ? "EstiaNet è stato spento."
            : modo === "local"
              ? "EstiaNet è acceso sulla sola rete di casa."
              : "EstiaNet è acceso e raggiungibile anche da fuori.",
        tono: "ok",
      });
    } catch (causa) {
      setMessaggio({
        testo: spiega(
          causa,
          modo === "off"
            ? "Non sono riuscito a spegnere EstiaNet. Riprova."
            : "Non sono riuscito ad accendere EstiaNet. Riprova.",
        ),
        tono: "error",
      });
    } finally {
      setLavoro(undefined);
    }
  };

  const agisci = async (
    id: string,
    durante: string,
    azione: () => Promise<FederationView>,
    messaggioSuccesso?: string,
  ): Promise<void> => {
    setMessaggio(undefined);
    setLavoro({ detto: durante, id });

    try {
      const nuovaFederazione = await azione();
      setFederazione(nuovaFederazione);
      if (messaggioSuccesso !== undefined) {
        setMessaggio({ testo: messaggioSuccesso, tono: "ok" });
      }
    } catch (causa) {
      setMessaggio({
        testo: spiega(causa, "L'operazione non è riuscita. Riprova più tardi."),
        tono: "error",
      });
    } finally {
      setLavoro(undefined);
    }
  };

  const eseguiPing = async (publicKey: string): Promise<void> => {
    const id = `ping:${publicKey}`;
    setMessaggio(undefined);
    setLavoro({ detto: "Provo a raggiungere l'istanza…", id });

    try {
      const ping = await api.pingInstance(token, publicKey);
      await caricaFederazione();
      setMessaggio({
        testo: ping.detail,
        tono: ping.reached ? "ok" : "error",
      });
    } catch (causa) {
      setMessaggio({
        testo: spiega(causa, "Errore durante la verifica di raggiungibilità."),
        tono: "error",
      });
    } finally {
      setLavoro(undefined);
    }
  };

  const chiediCollegamento = async (): Promise<void> => {
    const pulita = chiave.trim();
    if (pulita === "") return;

    if (diagnostica?.network.endpointId === pulita) {
      setMessaggio({
        testo: "Questa è la chiave di questa istanza: non puoi collegare un'istanza a sé stessa.",
        tono: "error",
      });
      return;
    }

    setMessaggio(undefined);
    setLavoro({
      detto: "Sto chiedendo il collegamento… può richiedere qualche secondo.",
      id: "chiedi",
    });

    try {
      const nuovaFederazione = await api.connectInstance(token, pulita);
      setFederazione(nuovaFederazione);
      setChiave("");

      const record = nuovaFederazione.instances.find((r) => r.publicKey === pulita);
      if (record?.state === "collegata") {
        setMessaggio({
          testo: "Collegamento completato con successo: le due istanze sono ora collegate.",
          tono: "ok",
        });
      } else if (record?.lastSeenAt !== null && record?.lastSeenAt !== undefined) {
        setMessaggio({
          testo: "Richiesta inviata e recapitata: in attesa che l'altra istanza accetti.",
          tono: "ok",
        });
      } else {
        setMessaggio({
          testo:
            "Richiesta salvata. L'altra istanza al momento non risponde: quando sarà accesa, usa «Prova a raggiungerla» o «Mandala di nuovo».",
          tono: "neutral",
        });
      }
    } catch (causa) {
      setMessaggio({
        testo: spiega(causa, "Non sono riuscito a richiedere il collegamento. Riprova."),
        tono: "error",
      });
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
      {/* Live sempre presente per gli screen reader */}
      <Live>{lavoro?.detto ?? messaggio?.testo ?? ""}</Live>

      {/* Avvisi visivi: lavoro in corso oppure esito/errore */}
      {lavoro !== undefined && <Alert>{lavoro.detto}</Alert>}
      {lavoro === undefined && messaggio !== undefined && (
        <Alert tone={messaggio.tono}>{messaggio.testo}</Alert>
      )}

      {/* FASE 1: Accensione e stato della rete */}
      <div className="card">
        <h2>1. Accensione e stato di rete</h2>
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
                «Rete di casa» non tocca infrastrutture di terzi e serve se le due istanze sono
                sotto lo stesso modem Wi-Fi. «Anche da fuori» usa i server di scoperta e relay di
                iroh per trovarsi tra case diverse.
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

      {/* FASE 2: La tua chiave da condividere */}
      {accesa && (
        <div className="card">
          <h2>2. La tua chiave da condividere</h2>
          <p className="muted">
            Questa è l&apos;unica chiave da comunicare a chi desidera collegarsi con la tua istanza.{" "}
            <strong>Non cambia mai</strong>: è derivata dall&apos;identità permanente
            dell&apos;istanza e resiste a riavvii, aggiornamenti e ripristini da backup.
          </p>
          <div className="cluster" style={{ alignItems: "center", marginBlock: "var(--s-2)" }}>
            <code className="secret">{rete.endpointId ?? ""}</code>
            {rete.endpointId !== undefined && rete.endpointId !== "" && (
              <>
                <Button
                  onClick={() => void copiaNegliAppunti(rete.endpointId ?? "", "chiave_propria")}
                  variant="secondary"
                >
                  {copiati["chiave_propria"] ? "Copiata!" : "Copia chiave"}
                </Button>
                <Button onClick={() => setMostraQr(!mostraQr)} variant="secondary">
                  {mostraQr ? "Nascondi QR Code" : "Mostra QR Code"}
                </Button>
              </>
            )}
          </div>

          {mostraQr && rete.endpointId !== undefined && rete.endpointId !== "" && (
            <div
              style={{
                alignItems: "center",
                background: "var(--surface-2)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--radius-md)",
                display: "inline-flex",
                flexDirection: "column",
                gap: "var(--s-2)",
                marginBlock: "var(--s-3)",
                padding: "var(--s-4)",
              }}
            >
              <QrCode
                size={220}
                title="QR Code della chiave dell'istanza"
                value={rete.reachableByKey ? (rete.endpointId ?? "") : (rete.ticket ?? "")}
              />
              <p
                className="muted"
                style={{ fontSize: "var(--t-sm)", margin: 0, textAlign: "center" }}
              >
                Inquadra questo codice con la fotocamera per acquisire la chiave all&apos;istante.
              </p>
            </div>
          )}

          {rete.reachableByKey !== true && (
            <>
              <p className="muted">
                In modalità <code>local</code> (rete di casa) non c&apos;è scoperta globale:
                condividi invece questo codice, che include gli indirizzi IP attuali della macchina.
              </p>
              <TextAreaField
                label="Codice con gli indirizzi di adesso"
                readOnly
                rows={2}
                value={rete.ticket ?? ""}
              />
              {rete.ticket !== undefined && rete.ticket !== "" && (
                <Button
                  onClick={() => void copiaNegliAppunti(rete.ticket ?? "", "ticket_proprio")}
                  variant="secondary"
                >
                  {copiati["ticket_proprio"] ? "Codice copiato!" : "Copia codice"}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* FASE 3: Collegati a un'altra istanza */}
      <div className="card">
        <h2>3. Collegati a un&apos;altra istanza</h2>

        {!federazione.networkOn ? (
          <Alert>
            EstiaNet è spento. Accendilo nella sezione 1 per poterti collegare ad altre istanze.
          </Alert>
        ) : (
          <>
            <p className="muted">
              Incolla la <strong>chiave pubblica</strong> dell&apos;altra istanza. Il collegamento
              diventerà attivo non appena entrambe le parti lo avranno approvato.
            </p>

            {!federazione.reachableByKey && (
              <Alert>
                Su «rete di casa» non c&apos;è scoperta: qui va incollato il codice lungo
                dell&apos;altra istanza.
              </Alert>
            )}

            <TextField
              label={
                federazione.reachableByKey
                  ? "Chiave pubblica dell'altra istanza"
                  : "Codice dell'altra istanza"
              }
              onChange={(event) => setChiave(event.target.value)}
              placeholder="Inserisci la chiave a 64 caratteri (es. 370c4a...)"
              value={chiave}
            />

            <Button
              aria-busy={lavoro?.id === "chiedi"}
              disabled={occupato || chiave.trim() === ""}
              onClick={() => void chiediCollegamento()}
            >
              {etichetta("chiedi", "Chiedi il collegamento", "Sto chiedendo…")}
            </Button>
          </>
        )}
      </div>

      {/* FASE 4: Ti hanno chiesto di collegarsi (Richieste in arrivo) */}
      {federazione.networkOn && inArrivo.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Ti hanno chiesto di collegarsi</h2>
          <p className="empty-inline muted">
            Queste istanze hanno richiesto di collegarsi alla tua. Clicca su «Accetta» per
            completare il collegamento reciproco, oppure «Rifiuta» per togliere la richiesta.
          </p>

          {inArrivo.map((istanza) => (
            <RigaIstanza
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
                        "Collegamento accettato con successo.",
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
              badge={<Badge tone="on">Richiesta in arrivo</Badge>}
              copiata={copiati[istanza.publicKey] === true}
              istanza={istanza}
              key={istanza.publicKey}
              onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
            />
          ))}
        </div>
      )}

      {/* FASE 5: In attesa della loro risposta (Richieste inviate) */}
      {federazione.networkOn && inAttesa.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">In attesa della loro risposta</h2>
          <p className="empty-inline muted">
            Hai inviato la richiesta a queste istanze. Se non rispondono, verifica che l&apos;altra
            macchina sia accesa su «Anche da fuori». «Prova a raggiungerla» effettua un test di rete
            in tempo reale.
          </p>

          {inAttesa.map((istanza) => (
            <RigaIstanza
              azioni={
                <>
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
                    onClick={() => void eseguiPing(istanza.publicKey)}
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
              badge={<Badge>In attesa</Badge>}
              copiata={copiati[istanza.publicKey] === true}
              istanza={istanza}
              key={istanza.publicKey}
              onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
            />
          ))}
        </div>
      )}

      {/* FASE 6: Istanze collegate */}
      {federazione.networkOn && (
        <div className="card card--flush">
          <h2 className="gruppo">Istanze collegate</h2>
          <p className="empty-inline muted">
            Le istanze collegate consentono ai membri delle due case di trovarsi nella ricerca e di
            seguire i rispettivi profili pubblici e privati.
          </p>

          {collegate.length === 0 && (
            <p className="empty-inline">Nessuna istanza collegata per ora.</p>
          )}

          {collegate.map((istanza) => (
            <RigaIstanza
              azioni={
                <>
                  <Button
                    aria-busy={lavoro?.id === `ping:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() => void eseguiPing(istanza.publicKey)}
                    variant="secondary"
                  >
                    {etichetta(`ping:${istanza.publicKey}`, "Verifica collegamento", "Verifico…")}
                  </Button>
                  <Button
                    aria-busy={lavoro?.id === `blocca:${istanza.publicKey}`}
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `blocca:${istanza.publicKey}`,
                        "Blocco l'istanza…",
                        () => api.blockInstance(token, istanza.publicKey),
                        "Istanza bloccata. Le connessioni aperte sono state interrotte.",
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
                        "Collegamento rimosso.",
                      )
                    }
                    variant="secondary"
                  >
                    {etichetta(`dimentica:${istanza.publicKey}`, "Dimentica", "Dimentico…")}
                  </Button>
                </>
              }
              badge={<Badge tone="ok">collegata</Badge>}
              copiata={copiati[istanza.publicKey] === true}
              istanza={istanza}
              key={istanza.publicKey}
              onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
            />
          ))}
        </div>
      )}

      {/* FASE 7: Istanze bloccate */}
      {federazione.networkOn && bloccate.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Istanze bloccate</h2>
          <p className="empty-inline muted">
            Le istanze bloccate vengono rifiutate all&apos;istante e non possono richiedere profili,
            bacheche o collegamenti a questa macchina.
          </p>

          {bloccate.map((istanza) => (
            <RigaIstanza
              azioni={
                <Button
                  aria-busy={lavoro?.id === `sblocca:${istanza.publicKey}`}
                  disabled={occupato}
                  onClick={() =>
                    void agisci(
                      `sblocca:${istanza.publicKey}`,
                      "Tolgo il blocco…",
                      () => api.forgetInstance(token, istanza.publicKey),
                      "Blocco rimosso con successo.",
                    )
                  }
                  variant="secondary"
                >
                  {etichetta(`sblocca:${istanza.publicKey}`, "Togli il blocco", "Tolgo…")}
                </Button>
              }
              badge={<Badge tone="error">bloccata</Badge>}
              copiata={copiati[istanza.publicKey] === true}
              istanza={istanza}
              key={istanza.publicKey}
              onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
            />
          ))}
        </div>
      )}
    </Sezione>
  );
}
