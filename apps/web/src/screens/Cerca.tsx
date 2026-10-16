import type {
  ConnectedInstanceView,
  FollowingView,
  FollowsView,
  ProfileSearchResult,
} from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { PersonLink } from "../components/PersonLink.js";
import { spiega } from "../errori.js";
import { t, useT } from "../lingua.js";
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
  const { tn, tc } = useT();
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
          ? t("cerca.accettato", { utente: username })
          : t("cerca.richiesta", { utente: username }),
      );
    } catch (errore) {
      setNota(spiega(errore, t("cerca.errore_segui")));
    }
  };

  /** Quello che già si segue non offre un pulsante che non farebbe niente. */
  const riga = (instanceKey: string, username: string): FollowingView | undefined =>
    follows?.following.find((row) => row.username === username && row.instanceKey === instanceKey);

  const azione = (instanceKey: string, username: string): React.ReactElement => {
    const corrente = riga(instanceKey, username)?.state;

    // Seguito e leggibile: non c'è niente da premere.
    if (corrente === "accettato" && riga(instanceKey, username)?.leggibile === true) {
      return <span className="muted">{t("cerca.lo_segui")}</span>;
    }

    // Seguito e non leggibile: la relazione c'è, la prova per leggere no.
    if (corrente === "accettato") {
      return (
        <Button onClick={() => void segui(instanceKey, username)} variant="secondary">
          {t("cerca.attiva_lettura")}
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
          {t("cerca.in_attesa")}
        </Button>
      );
    }

    return (
      <Button onClick={() => void segui(instanceKey, username)} variant="secondary">
        {t("profilo.segui")}
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
              ? t("cerca.etichetta.istanza", { istanza: nomeIstanza(instance) })
              : t("cerca.etichetta.rete")}
          </label>
          <input
            autoComplete="off"
            className="input"
            id="cerca"
            onChange={(event) => setTermine(event.target.value)}
            placeholder={t("cerca.esempio")}
            type="search"
            value={termine}
          />
          <span className="field__hint">
            {ambito === "istanza" ? t("cerca.aiuto.istanza") : t("cerca.aiuto.rete")}
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
              <EmptyState
                icon="users"
                title={t("cerca.chi_abita", { istanza: nomeIstanza(instance) })}
              >
                <p>
                  {t("cerca.scrivi_nome")} {tn("cerca.membri", instance.memberCount)}
                </p>
              </EmptyState>
            </div>
          ) : (
            <div className="list-block">
              <h2 className="gruppo">{t("cerca.dove")}</h2>
              {istanze.length === 0 ? (
                <p className="muted feed-pad">
                  {tc("cerca.nessun_collegamento", {
                    amministrazione: <strong>{t("cerca.amministrazione")}</strong>,
                  })}
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
                            ? t("cerca.senza_nome")
                            : collegata.declaredName}
                        </span>
                      </span>
                    </div>
                  ))}
                  {/* Il nome se lo dà lei, e non c'è modo di verificarlo: una
                      firma prova chi parla, non che dica il vero (ADR 0020 §5). */}
                  <p className="muted feed-pad">{t("cerca.nomi_dichiarati")}</p>
                </>
              )}
            </div>
          ))}

        {abbastanza && cercando && risultati === undefined && (
          <p className="muted feed-pad">{t("cerca.cerco")}</p>
        )}

        {abbastanza && risultati !== undefined && (
          <>
            {risultati.locali.length > 0 && (
              <div className="list-block">
                <h2 className="gruppo">
                  {ambito === "istanza" ? t("cerca.qui") : t("cerca.qui_e_rete")}
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
                <h2 className="gruppo">{t("cerca.altre_istanze")}</h2>
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
                          @{trovato.username} ·{" "}
                          {t("cerca.trovato_tramite", {
                            casa:
                              trovato.tramite === ""
                                ? t("cerca.senza_nome_minuscolo")
                                : trovato.tramite,
                          })}
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
                <EmptyState icon="search" title={t("cerca.nessuno.titolo")}>
                  {ambito === "istanza" ? (
                    <p>
                      {tc("cerca.nessuno.istanza", {
                        rete: <strong>{t("cerca.nessuno.rete_lente")}</strong>,
                      })}
                    </p>
                  ) : (
                    <p>{t("cerca.nessuno.rete")}</p>
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
