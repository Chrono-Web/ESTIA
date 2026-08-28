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

import { etichettaDi, fraseDi, segnaleDi, type Segnale } from "./raggiungibilita.js";

/**
 * EstiaNet: la rete fra istanze, per chi amministra.
 *
 * **L'ordine della pagina è una decisione, non un accumulo.** Segue quello che
 * si fa, nell'ordine in cui lo si fa: si dà la propria chiave, si prende quella
 * di un altro, e poi si guarda com'è andata. Lo spegnimento sta in fondo, dove
 * stanno le cose che si fanno una volta o mai — prima era in cima, e la prima
 * cosa che si leggeva aprendo la pagina era come disfarla.
 *
 * A rete spenta l'ordine salta e resta una cosa sola: accenderla. Un
 * interruttore in fondo a una pagina di funzioni che non funzionano sarebbe un
 * vicolo cieco (euristica 3), non un ordine coerente.
 *
 * **La lista delle istanze è una sola scheda** e non quattro: sono lo stesso
 * elenco in momenti diversi della stessa storia, e quattro schede separate
 * facevano sembrare quattro argomenti (euristica 8). Ogni riga dice se quella
 * casa **risponde adesso** — è il battito di ADR 0041, che senza un posto dove
 * mostrarsi resterebbe una cosa che l'istanza fa e nessuno vede.
 */

function nomeDi(istanza: FederatedInstanceView): string {
  return istanza.declaredName.trim() === ""
    ? "Istanza senza nome dichiarato"
    : istanza.declaredName;
}

/** Chiave intera per chi copia, accorciata per chi legge. */
function chiaveBreve(publicKey: string): string {
  return publicKey.length <= 20 ? publicKey : `${publicKey.slice(0, 10)}…${publicKey.slice(-6)}`;
}

const PUNTO: Record<Segnale, string> = {
  "in-ascolto": "attesa",
  "non-osservata": "",
  "non-risponde": "no",
  raggiungibile: "si",
};

/**
 * Il segnale: pallino più parola, mai il pallino da solo.
 *
 * Un colore non si legge a voce e non lo vedono tutti allo stesso modo; la
 * parola accanto è l'informazione, il pallino è la scorciatoia per l'occhio.
 */
function Segnale({ istanza }: { istanza: FederatedInstanceView }): React.ReactElement | null {
  const segnale = segnaleDi(istanza);

  if (segnale === "non-osservata") {
    return null;
  }

  return (
    <span className={`segnale segnale--${PUNTO[segnale]}`}>
      <span className={`segnale__punto segnale__punto--${PUNTO[segnale]}`} />
      {etichettaDi(segnale)}
    </span>
  );
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
        <span className="row__note riga-segnale">
          <Segnale istanza={istanza} />
          <span>{fraseDi(istanza)}</span>
        </span>
        <span className="cluster" style={{ alignItems: "center" }}>
          <code title={istanza.publicKey}>{chiaveBreve(istanza.publicKey)}</code>
          {onCopiaChiave !== undefined && (
            <Button
              className="btn--quiet"
              onClick={onCopiaChiave}
              title="Copia la chiave intera negli appunti"
              variant="quiet"
            >
              {copiata ? "Copiata!" : "Copia chiave"}
            </Button>
          )}
          <span className="row__note">Il nome lo dichiara l&apos;altra istanza; la chiave no.</span>
        </span>
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

      {/*
        A rete spenta c'è una cosa sola da fare, e sta in cima: qui l'ordine
        della pagina non vale, perché niente sotto funzionerebbe.
      */}
      {!accesa && (
        <div className="card">
          <h2>Accendi EstiaNet</h2>
          <p className="muted">{rete.detail}</p>

          {rete.editable ? (
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
                sotto lo stesso modem Wi-Fi. «Anche da fuori» usa i server di scoperta e i relay di
                iroh per trovarsi fra case diverse.
              </p>
            </>
          ) : (
            <p className="muted">
              Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui si
              vede e non si cambia, perché il riavvio annullerebbe la modifica.
            </p>
          )}
        </div>
      )}

      {/* 1. La propria chiave: la sola cosa da dare a un'altra casa. */}
      {accesa && (
        <div className="card">
          <h2>1. La tua chiave, da dare all&apos;altra casa</h2>
          <p className="muted">
            È l&apos;unica cosa da comunicare a chi vuole collegarsi con questa istanza.{" "}
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
            <div className="qr-riquadro">
              <QrCode
                size={220}
                title="QR Code della chiave dell'istanza"
                value={rete.reachableByKey ? (rete.endpointId ?? "") : (rete.ticket ?? "")}
              />
              <p className="muted qr-riquadro__nota">
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

      {/* 2. La chiave dell'altra casa: dove si incolla. */}
      {accesa && (
        <div className="card">
          <h2>2. La chiave dell&apos;altra casa</h2>
          <p className="muted">
            Incolla qui {federazione.reachableByKey ? "la chiave pubblica" : "il codice"}{" "}
            dell&apos;altra istanza. Il collegamento diventa attivo quando{" "}
            <strong>anche di là</strong> qualcuno dice di sì: è una decisione in due, e da un lato
            solo non si fa.
          </p>

          {!federazione.reachableByKey && (
            <Alert>
              Su «rete di casa» non c&apos;è scoperta: qui va incollato il codice lungo
              dell&apos;altra istanza, non la sola chiave.
            </Alert>
          )}

          <TextField
            label={
              federazione.reachableByKey
                ? "Chiave pubblica dell'altra istanza"
                : "Codice dell'altra istanza"
            }
            onChange={(event) => setChiave(event.target.value)}
            placeholder="Incolla qui la chiave a 64 caratteri (es. 370c4a…)"
            value={chiave}
          />

          <Button
            aria-busy={lavoro?.id === "chiedi"}
            disabled={occupato || chiave.trim() === ""}
            onClick={() => void chiediCollegamento()}
          >
            {etichetta("chiedi", "Chiedi il collegamento", "Sto chiedendo…")}
          </Button>
        </div>
      )}

      {/* 3. Le istanze: un elenco solo, con lo stato di adesso su ogni riga. */}
      {accesa && (
        <div className="card card--flush">
          <h2 className="gruppo gruppo--passo">3. Le istanze</h2>
          <p className="empty-inline muted">
            Questa istanza chiede da sola alle case collegate se ci sono,{" "}
            <strong>ogni cinque minuti</strong>, anche mentre nessuno guarda questa pagina. Qui
            sotto c&apos;è l&apos;esito. Una casa che non risponde non richiede niente a mano: si
            riprova da sé, diradando i tentativi, e «Verifica adesso» serve solo a non aspettare il
            prossimo giro.
          </p>

          {inArrivo.length > 0 && (
            <>
              <h3 className="gruppo">Ti hanno chiesto di collegarsi</h3>
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
                            "Collegamento accettato: adesso le due case si parlano.",
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
                  badge={<Badge tone="on">Ti ha chiesto</Badge>}
                  copiata={copiati[istanza.publicKey] === true}
                  istanza={istanza}
                  key={istanza.publicKey}
                  onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
                />
              ))}
            </>
          )}

          {inAttesa.length > 0 && (
            <>
              <h3 className="gruppo">Aspettano una risposta</h3>
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
                        {etichetta(`ping:${istanza.publicKey}`, "Verifica adesso", "Verifico…")}
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
                  badge={<Badge>In attesa di loro</Badge>}
                  copiata={copiati[istanza.publicKey] === true}
                  istanza={istanza}
                  key={istanza.publicKey}
                  onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
                />
              ))}
            </>
          )}

          <h3 className="gruppo">Collegate</h3>
          {collegate.length === 0 ? (
            <p className="empty-inline">
              Nessuna istanza collegata per ora. Quando ce ne sarà una, i membri delle due case si
              troveranno nella ricerca e potranno seguirsi.
            </p>
          ) : (
            collegate.map((istanza) => (
              <RigaIstanza
                azioni={
                  <>
                    <Button
                      aria-busy={lavoro?.id === `ping:${istanza.publicKey}`}
                      disabled={occupato}
                      onClick={() => void eseguiPing(istanza.publicKey)}
                      variant="secondary"
                    >
                      {etichetta(`ping:${istanza.publicKey}`, "Verifica adesso", "Verifico…")}
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
                badge={<Badge tone="ok">Collegata</Badge>}
                copiata={copiati[istanza.publicKey] === true}
                istanza={istanza}
                key={istanza.publicKey}
                onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
              />
            ))
          )}

          {bloccate.length > 0 && (
            <>
              <h3 className="gruppo">Bloccate</h3>
              <p className="empty-inline muted">
                Rifiutate all&apos;istante: non possono chiedere profili, bacheche né collegamenti.
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
                          "Blocco rimosso.",
                        )
                      }
                      variant="secondary"
                    >
                      {etichetta(`sblocca:${istanza.publicKey}`, "Togli il blocco", "Tolgo…")}
                    </Button>
                  }
                  badge={<Badge tone="error">Bloccata</Badge>}
                  copiata={copiati[istanza.publicKey] === true}
                  istanza={istanza}
                  key={istanza.publicKey}
                  onCopiaChiave={() => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/*
        In fondo, dove stanno le cose che si fanno una volta o mai. Spegnere
        EstiaNet non è un'impostazione fra le altre: toglie i collegamenti a
        tutte le case insieme, e va detto qui invece che scoperto dopo.
      */}
      {accesa && (
        <div className="card">
          <h2>Spegni EstiaNet</h2>
          {rete.editable ? (
            <>
              <p className="muted">
                Questa istanza smette di farsi trovare e di cercare le altre. I collegamenti non si
                perdono — restano nell&apos;elenco e tornano quando riaccendi — ma finché è spenta
                nessun contenuto attraversa e nessun messaggio parte verso un&apos;altra casa.
              </p>
              <Button
                aria-busy={lavoro?.id === "accendi:off"}
                disabled={occupato}
                onClick={() => void accendi("off")}
                variant="danger"
              >
                {etichetta("accendi:off", "Spegni EstiaNet", "Spengo…")}
              </Button>
            </>
          ) : (
            <p className="muted">
              Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui si
              vede e non si cambia, perché il riavvio annullerebbe la modifica.
            </p>
          )}
        </div>
      )}
    </Sezione>
  );
}
