import type { AdminDiagnostics, FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { useSignedIn } from "../../../state.js";
import {
  Alert,
  Button,
  Icon,
  ListRow,
  MenuAzioni,
  QrCode,
  TextAreaField,
  TextField,
  type Tone,
  type VoceMenu,
} from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

import { ASPETTO, GRUPPI, gruppoDi, principaliDi, secondarieDi, type Azione } from "./gruppi.js";
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
 * I titoli non sono più numerati: un «1.» scritto a mano dice che l'ordine è
 * obbligato e si sfalsa da solo appena una scheda sparisce, come succede qui
 * quando la rete è spenta (`DESIGN_SYSTEM.md` §«Come è fatta una pagina di
 * impostazioni»).
 *
 * A rete spenta l'ordine salta e resta una cosa sola: accenderla. Un
 * interruttore in fondo a una pagina di funzioni che non funzionano sarebbe un
 * vicolo cieco (euristica 3), non un ordine coerente.
 *
 * **La lista delle case è una sola scheda** e non quattro: sono lo stesso
 * elenco in momenti diversi della stessa storia, e quattro schede separate
 * facevano sembrare quattro argomenti (euristica 8). Ogni riga dice se quella
 * casa **risponde adesso** — è il battito di ADR 0041, che senza un posto dove
 * mostrarsi resterebbe una cosa che l'istanza fa e nessuno vede.
 *
 * **Ogni riga è una `ListRow`**, la primitiva delle impostazioni, ed è il
 * burger a renderlo possibile: con tre pulsanti in fila la riga non poteva
 * essere quella degli altri nove schermi. Fuori resta la sola azione che ci si
 * aspetta di premere — «Accetta» su una richiesta in arrivo, e «Rifiuta»
 * accanto — perché una decisione che si vede solo aprendo un menu è una
 * decisione che nessuno prende (euristiche 3 e 6). Quale azione va dove sta in
 * `gruppi.ts`, con i suoi test.
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

  const rete = diagnostica?.network;
  const accesa = rete?.state === "ready";

  /**
   * Le voci del burger di una casa, dal catalogo di `gruppi.ts`.
   *
   * Il catalogo dice **quali** azioni valgono per quello stato e quali chiedono
   * conferma; qui si dice che cosa fanno e come si chiamano. Le due cose stanno
   * separate perché la prima si può provare senza un browser, e la seconda no.
   */
  const catalogoDi = (istanza: FederatedInstanceView): Record<Azione, VoceMenu> => {
    const gruppo = gruppoDi(istanza);
    const nome = nomeDi(istanza);

    const catalogo: Record<Azione, VoceMenu> = {
      accetta: {
        id: "accetta",
        onClick: () =>
          void agisci(
            `accetta:${istanza.publicKey}`,
            "Accetto il collegamento…",
            () => api.acceptInstance(token, istanza.publicKey),
            "Collegamento accettato: adesso le due case si parlano.",
          ),
        title: "Accetta",
      },
      blocca: {
        conferma: {
          etichetta: "Sì, blocca",
          testo:
            "Le richieste da questa casa saranno rifiutate all'istante e le connessioni aperte si chiudono. Resta nell'elenco, fra le bloccate.",
          titolo: `Bloccare ${nome}?`,
        },
        icon: "shield",
        id: "blocca",
        onClick: () =>
          void agisci(
            `blocca:${istanza.publicKey}`,
            "Blocco la casa…",
            () => api.blockInstance(token, istanza.publicKey),
            "Casa bloccata. Le connessioni aperte sono state interrotte.",
          ),
        title: "Blocca questa casa",
        tono: "danger",
      },
      copia: {
        icon: "key",
        id: "copia",
        note: "La chiave intera, negli appunti",
        onClick: () => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey),
        title: "Copia la chiave",
      },
      /*
       * «Dimentica» toglie la casa dall'elenco davvero: lato istanza è
       * `remotes.remove`. Prima, sulla riga di una bloccata, si chiamava «Togli
       * il blocco» e diceva «Blocco rimosso» — cioè prometteva un ritorno allo
       * stato di prima che non avviene. Qui la parola dice quello che succede.
       */
      dimentica: {
        conferma: {
          etichetta: "Sì, dimentica",
          testo:
            gruppo === "collegata"
              ? "Il collegamento si interrompe e la casa esce dall'elenco. Per rifarlo servirà di nuovo un sì da tutte e due le parti."
              : gruppo === "bloccata"
                ? "Non sarà più bloccata e uscirà dall'elenco. Se vorrà, potrà chiedere di nuovo il collegamento."
                : "La richiesta che hai mandato sparisce dall'elenco. Potrai sempre rifarla.",
          titolo: gruppo === "in-attesa" ? "Dimenticare la richiesta?" : `Dimenticare ${nome}?`,
        },
        id: "dimentica",
        onClick: () =>
          void agisci(
            `dimentica:${istanza.publicKey}`,
            "Dimentico…",
            () => api.forgetInstance(token, istanza.publicKey),
            "Fatto: la casa è uscita dall'elenco.",
          ),
        title: gruppo === "in-attesa" ? "Dimentica la richiesta" : "Dimentica questa casa",
        tono: "danger",
      },
      rifiuta: {
        id: "rifiuta",
        onClick: () =>
          void agisci(
            `rifiuta:${istanza.publicKey}`,
            "Rifiuto la richiesta…",
            () => api.forgetInstance(token, istanza.publicKey),
            "Richiesta rifiutata.",
          ),
        title: "Rifiuta",
        tono: "danger",
      },
      rimanda: {
        icon: "send",
        id: "rimanda",
        note: "Se di là non è mai arrivata",
        onClick: () =>
          void agisci(
            `di-nuovo:${istanza.publicKey}`,
            "Rimando la richiesta…",
            () => api.connectInstance(token, istanza.publicKey),
            "Richiesta mandata di nuovo.",
          ),
        title: "Mandala di nuovo",
      },
      verifica: {
        icon: "check",
        id: "verifica",
        note: "Senza aspettare il prossimo giro",
        onClick: () => void eseguiPing(istanza.publicKey),
        title: "Verifica adesso",
      },
    };

    return catalogo;
  };

  const RigaCasa = (istanza: FederatedInstanceView): React.ReactElement => {
    const gruppo = gruppoDi(istanza);
    const catalogo = catalogoDi(istanza);

    return (
      <ListRow
        end={
          <>
            {principaliDi(gruppo).map((azione) => (
              <Button
                disabled={occupato}
                key={azione}
                onClick={catalogo[azione].onClick}
                variant={catalogo[azione].tono === "danger" ? "secondary" : "primary"}
              >
                {etichetta(
                  `${azione === "accetta" ? "accetta" : "rifiuta"}:${istanza.publicKey}`,
                  catalogo[azione].title,
                  azione === "accetta" ? "Accetto…" : "Rifiuto…",
                )}
              </Button>
            ))}
            <MenuAzioni
              etichetta={`Azioni su ${nomeDi(istanza)}`}
              occupato={occupato}
              titolo={nomeDi(istanza)}
              voci={secondarieDi(gruppo).map((azione) => catalogo[azione])}
            />
          </>
        }
        key={istanza.publicKey}
        note={
          <span className="riga-segnale">
            <Segnale istanza={istanza} />
            <span>{fraseDi(istanza)}</span>
            <code title={istanza.publicKey}>{chiaveBreve(istanza.publicKey)}</code>
          </span>
        }
        title={nomeDi(istanza)}
      />
    );
  };

  return (
    <Sezione
      avviso={messaggio}
      caricamento={diagnostica === undefined || federazione === undefined}
      chiave="estianet"
      lavoro={lavoro?.detto}
      scopo="Collega questa casa ad altre case ESTIA, e tieni d'occhio se rispondono."
    >
      {rete !== undefined && federazione !== undefined && (
        <>
          {/*
            A rete spenta c'è una cosa sola da fare, e sta in cima: qui l'ordine
            della pagina non vale, perché niente sotto funzionerebbe, e un
            interruttore in fondo a funzioni morte è un vicolo cieco.
          */}
          {!accesa && (
            <div className="card">
              <h2 className="gruppo">Accendi EstiaNet</h2>
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
                    «Rete di casa» non tocca infrastrutture di terzi e serve se le due case sono
                    sotto lo stesso modem Wi-Fi. «Anche da fuori» usa i server di scoperta e i relay
                    di iroh per trovarsi fra case diverse.
                  </p>
                </>
              ) : (
                <p className="muted">
                  Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui
                  si vede e non si cambia, perché il riavvio annullerebbe la modifica.
                </p>
              )}
            </div>
          )}

          {accesa && (
            <div className="card">
              <h2 className="gruppo">La tua chiave</h2>
              <p className="muted">
                È l&apos;unica cosa da dare a chi vuole collegarsi con questa casa.{" "}
                <strong>Non cambia mai</strong>: è derivata dall&apos;identità permanente
                dell&apos;istanza e resiste a riavvii, aggiornamenti e ripristini da backup.
              </p>
              <div className="cluster chiave-propria">
                <code className="secret">{rete.endpointId ?? ""}</code>
                {rete.endpointId !== undefined && rete.endpointId !== "" && (
                  <>
                    <Button
                      onClick={() =>
                        void copiaNegliAppunti(rete.endpointId ?? "", "chiave_propria")
                      }
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
                    Inquadra questo codice con la fotocamera per acquisire la chiave
                    all&apos;istante.
                  </p>
                </div>
              )}

              {rete.reachableByKey !== true && (
                <>
                  <p className="muted">
                    In modalità <code>local</code> (rete di casa) non c&apos;è scoperta globale:
                    condividi invece questo codice, che include gli indirizzi IP attuali della
                    macchina.
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

          {accesa && (
            <div className="card">
              <h2 className="gruppo">Collega un&apos;altra casa</h2>
              <p className="muted">
                Incolla qui {federazione.reachableByKey ? "la chiave pubblica" : "il codice"}{" "}
                dell&apos;altra casa. Il collegamento diventa attivo quando{" "}
                <strong>anche di là</strong> qualcuno dice di sì: è una decisione in due, e da un
                lato solo non si fa.
              </p>

              {!federazione.reachableByKey && (
                <Alert>
                  Su «rete di casa» non c&apos;è scoperta: qui va incollato il codice lungo
                  dell&apos;altra casa, non la sola chiave.
                </Alert>
              )}

              <TextField
                label={
                  federazione.reachableByKey
                    ? "Chiave pubblica dell'altra casa"
                    : "Codice dell'altra casa"
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

          {accesa && (
            <div className="card card--flush">
              <h2 className="gruppo">Le case</h2>
              <p className="empty-inline muted">
                Questa casa chiede da sola alle case collegate se ci sono,{" "}
                <strong>ogni cinque minuti</strong>, anche mentre nessuno guarda questa pagina. Qui
                sotto c&apos;è l&apos;esito. Una casa che non risponde non richiede niente a mano:
                si riprova da sé, diradando i tentativi.
              </p>

              {GRUPPI.map((gruppo) => {
                const case_ = federazione.instances.filter(
                  (istanza) => gruppoDi(istanza) === gruppo,
                );

                if (case_.length === 0 && gruppo !== "collegata") {
                  return null;
                }

                const aspetto = ASPETTO[gruppo];

                return (
                  <div key={gruppo}>
                    <h3
                      className={`gruppo gruppo--casa${aspetto.tinta === "" ? "" : ` gruppo--casa-${aspetto.tinta}`}`}
                    >
                      <Icon name={aspetto.icona} size={18} />
                      {aspetto.titolo}
                    </h3>

                    {case_.length === 0 ? (
                      <p className="empty-inline">
                        Nessuna casa collegata per ora. Quando ce ne sarà una, i membri delle due
                        case si troveranno nella ricerca e potranno seguirsi.
                      </p>
                    ) : (
                      case_.map((istanza) => RigaCasa(istanza))
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/*
            In fondo, dove stanno le cose che si fanno una volta o mai: la prima
            cosa che si legge aprendo la pagina non deve essere come disfarla.
          */}
          {accesa && (
            <div className="card card--grave">
              <h2 className="gruppo">Spegni EstiaNet</h2>
              {rete.editable ? (
                <>
                  <p className="muted">
                    Questa casa smette di farsi trovare e di cercare le altre. I collegamenti non si
                    perdono — restano nell&apos;elenco e tornano quando riaccendi — ma finché è
                    spenta nessun contenuto attraversa e nessun messaggio parte verso un&apos;altra
                    casa.
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
                  Impostata da <code>ESTIA_NETWORK_PROBE</code> nel file di configurazione: da qui
                  si vede e non si cambia, perché il riavvio annullerebbe la modifica.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Sezione>
  );
}
