import type {
  ConnectedInstanceView,
  FollowingView,
  FollowsView,
  ProfileSearchResult,
} from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { PersonLink } from "../components/PersonLink.js";
import { nomeIstanza, useSignedIn } from "../state.js";
import { Alert, Avatar, Button, EmptyState, Icon } from "../ui/index.js";

/** Sotto i due caratteri ogni nome somiglia a ogni altro nome. */
const MINIMO = 2;
const ATTESA_MS = 300;

/**
 * Trovare qualcuno, dove si sta guardando.
 *
 * L'ambito non è un filtro sui risultati: decide **se la domanda esce di
 * casa**. In modalità istanza non parte niente verso nessuno — e non è un
 * dettaglio di efficienza, è che il termine che una persona scrive è un dato
 * suo. In modalità rete la domanda parte adesso verso ogni istanza collegata:
 * se una è spenta non risponde, e nessuna tiene una copia di chi c'è, quindi
 * non esistono elenchi che invecchiano (ADR 0018).
 */
export function Cerca(): React.ReactElement {
  const { instance, modo, token } = useSignedIn();
  const ambito = modo === "istanza" ? "istanza" : "rete";

  const [termine, setTermine] = useState("");
  const [risultati, setRisultati] = useState<ProfileSearchResult | undefined>();
  const [istanze, setIstanze] = useState<ConnectedInstanceView[]>([]);
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [cercando, setCercando] = useState(false);
  const [nota, setNota] = useState<string | undefined>();

  const caricaFollows = useCallback(async () => {
    setFollows(await api.follows(token));
  }, [token]);

  useEffect(() => {
    void caricaFollows();
    void api
      .connectedInstances(token)
      .then((risposta) => setIstanze(risposta.instances))
      .catch(() => undefined);
  }, [caricaFollows, token]);

  /*
   * Si cerca mentre si scrive, ma non a ogni tasto: un attimo di pausa vale
   * una richiesta sola invece di una per lettera. E la richiesta precedente
   * viene annullata, perché altrimenti la risposta a «ann» può arrivare dopo
   * quella ad «anna» e sovrascriverla.
   */
  useEffect(() => {
    const cercabile = termine.trim();

    if (cercabile.length < MINIMO) {
      setRisultati(undefined);
      return;
    }

    const annulla = new AbortController();
    const attesa = setTimeout(() => {
      setCercando(true);
      setNota(undefined);

      api
        .searchProfiles(token, cercabile, ambito, annulla.signal)
        .then(setRisultati)
        .catch(() => undefined)
        .finally(() => setCercando(false));
    }, ATTESA_MS);

    return () => {
      clearTimeout(attesa);
      annulla.abort();
    };
  }, [ambito, termine, token]);

  /**
   * Chiedere di seguire, e richiedere.
   *
   * È lo stesso gesto perché è la stessa domanda: fuori casa chi accetta non
   * spedisce niente a nessuno (ADR 0022), quindi la propria metà resta «in
   * attesa» finché non si richiede. La riga non si duplica — di qua e di là
   * quella che c'è viene riusata — e la risposta è lo stato aggiornato.
   */
  const segui = async (instanceKey: string, username: string): Promise<void> => {
    setNota(undefined);

    try {
      await api.follow(token, { instanceKey, username });

      const aggiornati = await api.follows(token);

      setFollows(aggiornati);

      const stato = aggiornati.following.find(
        (row) => row.username === username && row.instanceKey === instanceKey,
      )?.state;

      setNota(
        stato === "accettato"
          ? `@${username} ti ha accettato: ora lo segui.`
          : `Richiesta a @${username}: decide chi la riceve, e lo scopri controllando.`,
      );
    } catch (errore) {
      setNota(errore instanceof Error ? errore.message : String(errore));
    }
  };

  /** Quello che già si segue non offre un pulsante che non farebbe niente. */
  const riga = (instanceKey: string, username: string): FollowingView | undefined =>
    follows?.following.find((row) => row.username === username && row.instanceKey === instanceKey);

  const azione = (instanceKey: string, username: string): React.ReactElement => {
    const corrente = riga(instanceKey, username)?.state;

    // Seguito e leggibile: non c'è niente da premere.
    if (corrente === "accettato" && riga(instanceKey, username)?.leggibile === true) {
      return <span className="muted">Lo segui</span>;
    }

    // Seguito e non leggibile: la relazione c'è, la prova per leggere no.
    if (corrente === "accettato") {
      return (
        <Button onClick={() => void segui(instanceKey, username)} variant="secondary">
          Lo segui · attiva la lettura
        </Button>
      );
    }

    // «In attesa» non è uno stato che si aggiorna da solo: chi accetta, di là,
    // non manda niente. Il pulsante è il modo di scoprirlo, ed è anche il modo
    // di richiedere a chi aveva detto di no — che è una decisione di chi
    // chiede, mai un ciclo automatico.
    if (corrente === "in_attesa") {
      return (
        <Button onClick={() => void segui(instanceKey, username)} variant="secondary">
          In attesa · controlla
        </Button>
      );
    }

    return (
      <Button onClick={() => void segui(instanceKey, username)} variant="secondary">
        Segui
      </Button>
    );
  };

  const abbastanza = termine.trim().length >= MINIMO;

  return (
    <>
      <main className="column column--feed">
        <search className="feed-pad stack--tight cerca-campo">
          <label className="field__label" htmlFor="cerca">
            {ambito === "istanza"
              ? `Cerca fra le persone di ${nomeIstanza(instance)}`
              : "Cerca nelle istanze collegate"}
          </label>
          <input
            autoComplete="off"
            className="input"
            id="cerca"
            onChange={(event) => setTermine(event.target.value)}
            placeholder="Un nome"
            type="search"
            value={termine}
          />
          <span className="field__hint">
            {ambito === "istanza"
              ? "La domanda non esce da questa istanza: nessuno, là fuori, sa che cosa stai cercando."
              : "La domanda parte adesso verso ogni istanza collegata. Chi è spento non risponde, e nessuna tiene una copia di chi c'è."}
          </span>
        </search>

        {nota !== undefined && (
          <div className="feed-pad">
            <Alert>{nota}</Alert>
          </div>
        )}

        {!abbastanza &&
          (ambito === "istanza" ? (
            <div className="feed-pad">
              <EmptyState icon="users" title={`Chi abita ${nomeIstanza(instance)}`}>
                <p>
                  Scrivi un nome per trovare qualcuno.{" "}
                  {instance.memberCount === 1
                    ? "Per ora sei solo tu."
                    : `Siete in ${String(instance.memberCount)}.`}
                </p>
              </EmptyState>
            </div>
          ) : (
            <div className="list-block">
              <h2 className="gruppo">Dove stai cercando</h2>
              {istanze.length === 0 ? (
                <p className="muted feed-pad">
                  Questa istanza non è collegata a nessun&apos;altra, quindi una ricerca nella rete
                  non raggiunge nessuno. I collegamenti si aggiungono dall&apos;
                  <strong>amministrazione</strong>.
                </p>
              ) : (
                <>
                  {istanze.map((collegata) => (
                    <div className="row" key={collegata.declaredName}>
                      <span className="row__icon">
                        <Icon name="instance" size={20} />
                      </span>
                      <span className="row__body">
                        <span className="row__title">
                          {collegata.declaredName === ""
                            ? "Un'istanza senza nome dichiarato"
                            : collegata.declaredName}
                        </span>
                      </span>
                    </div>
                  ))}
                  {/* Il nome se lo dà lei, e non c'è modo di verificarlo: una
                      firma prova chi parla, non che dica il vero (ADR 0020 §5). */}
                  <p className="muted feed-pad">
                    Ogni nome è quello che quell&apos;istanza dà a sé stessa. L&apos;unica cosa
                    verificata è la sua chiave.
                  </p>
                </>
              )}
            </div>
          ))}

        {abbastanza && cercando && risultati === undefined && (
          <p className="muted feed-pad">Cerco…</p>
        )}

        {abbastanza && risultati !== undefined && (
          <>
            {risultati.locali.length > 0 && (
              <div className="list-block">
                <h2 className="gruppo">
                  {ambito === "istanza" ? "Qui" : "Qui, e visibili nella rete"}
                </h2>
                {risultati.locali.map((trovato) => (
                  <div className="row" key={trovato.username}>
                    <PersonLink className="row__hit" username={trovato.username}>
                      <Avatar
                        displayName={trovato.displayName}
                        size="md"
                        username={trovato.username}
                      />
                      <span className="row__body">
                        <span className="row__title">{trovato.displayName}</span>
                        <span className="row__note">
                          @{trovato.username}
                          {trovato.bio !== "" && ` · ${trovato.bio}`}
                        </span>
                      </span>
                    </PersonLink>
                    <span className="row__end">{azione("locale", trovato.username)}</span>
                  </div>
                ))}
              </div>
            )}

            {ambito === "rete" && risultati.remoti.length > 0 && (
              <div className="list-block">
                <h2 className="gruppo">Su altre istanze</h2>
                {risultati.remoti.map((trovato) => (
                  <div className="row" key={`${trovato.instanceKey}/${trovato.username}`}>
                    <PersonLink
                      className="row__hit"
                      instanceKey={trovato.instanceKey}
                      username={trovato.username}
                    >
                      <Avatar
                        displayName={trovato.displayName}
                        size="md"
                        username={trovato.username}
                      />
                      <span className="row__body">
                        <span className="row__title">{trovato.displayName}</span>
                        {/* Da chi è stato trovato, sempre: un nome senza la casa
                            da cui viene non è un'identità, e quel nome lo
                            dichiara quell'istanza (ADR 0018, ADR 0020 §5). */}
                        <span className="row__note">
                          @{trovato.username} · trovato tramite{" "}
                          {trovato.tramite === ""
                            ? "un'istanza senza nome dichiarato"
                            : trovato.tramite}
                        </span>
                      </span>
                    </PersonLink>
                    <span className="row__end">
                      {azione(trovato.instanceKey, trovato.username)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {risultati.locali.length === 0 && risultati.remoti.length === 0 && (
              <div className="feed-pad">
                <EmptyState icon="search" title="Nessuno con questo nome">
                  {ambito === "istanza" ? (
                    <p>
                      Se la persona che cerchi sta su un&apos;altra istanza, provala dalla lente{" "}
                      <strong>Rete</strong>.
                    </p>
                  ) : (
                    <p>
                      Nessuna istanza collegata ha risposto con questo nome. Chi ha scelto di non
                      comparire nelle ricerche non compare: lo si raggiunge solo se qualcuno lo
                      indica.
                    </p>
                  )}
                </EmptyState>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
