import {
  NOTIFICA_FILTRI,
  type NotificaAttore,
  type NotificaFiltro,
  type NotificaLente,
  type NotificaView,
  type NotifichePage,
} from "@estia/contracts";
import type { MessageKey, PlainMessageKey } from "@estia/i18n";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api.js";
import { percorsoPersona } from "../components/PersonLink.js";
import { spiega } from "../errori.js";
import { formatoElenco, T, t } from "../i18n/index.js";
import { useNotifiche } from "../notifiche.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Alert, Avatar, Button, EmptyState, Icon, Live, type IconName } from "../ui/index.js";

/**
 * L'attività: che cosa è successo alle cose tue ([ADR 0025] §4).
 *
 * Non è un flusso della rete e non lo diventerà: sono i fatti che **ti
 * riguardano**, dedotti da dove già stanno — un cuore, una risposta, una riga
 * di follower. Niente qui viene da una tabella di eventi, e per questo un post
 * cancellato porta via le proprie notifiche invece di lasciarne il fantasma.
 *
 * Sta **nella lente corrente**, come la bacheca e la ricerca ([ADR 0018]
 * §«un pulsante per feed»): la leva in cima gira anche questo elenco, e non
 * c'è una terza leva che funziona solo qui. Con una conseguenza presa sul
 * serio: il segno «viste» è **per lente** — guardare l'istanza non spegne le
 * novità della rete, che restano nel pallino e sono dette dalla riga sotto.
 *
 * La forma è quella di un mini-feed: a sinistra la faccia con il segno di che
 * cosa è successo, a destra il nome con la data, **la tua cosa in tono
 * attenuato** e, quando ci sono, le parole nuove in tono pieno. È la stessa
 * gerarchia del thread dei commenti — il contesto sta dietro, la notizia sta
 * davanti — applicata a un elenco invece che a un albero.
 */

/** Le chiavi, non le frasi: si traducono quando si disegna (ADR 0044). */
const ETICHETTE: Record<NotificaFiltro, PlainMessageKey> = {
  cuori: "notifications.filter.likes",
  follow: "notifications.filter.follows",
  risposte: "notifications.filter.replies",
  tutte: "notifications.filter.all",
};

/**
 * Il segno sopra la faccia: **una forma diversa per ogni cosa**, non un colore
 * diverso.
 *
 * Il colore da solo sarebbe il criterio 1.4.1 di WCAG violato in silenzio: chi
 * non separa il rosa dal blu non avrebbe **nessun** modo di distinguere un
 * cuore da una risposta. Cuore, fumetto e persona si distinguono al buio.
 */
const SEGNI: Record<NotificaView["tipo"], { icona: IconName; classe: string }> = {
  cuore_commento: { classe: "cuore", icona: "heart" },
  cuore_post: { classe: "cuore", icona: "heart" },
  follow_nuovo: { classe: "follow", icona: "user" },
  follow_richiesta: { classe: "follow", icona: "user" },
  risposta_commento: { classe: "risposta", icona: "comment" },
  risposta_post: { classe: "risposta", icona: "comment" },
};

/**
 * Che cosa è successo: una frase intera per tipo, al plurale giusto, con chi
 * l'ha fatto dentro (ADR 0044).
 *
 * Nel catalogo i nomi sono `<names/>` e non un `{{segnaposto}}`: li scrivono le
 * persone, anche di altre case, e un nome con dentro `<event>` non deve poter
 * spostare la frase. Così i nomi non passano mai dal testo che si analizza.
 */
const FRASI: Record<NotificaView["tipo"], MessageKey> = {
  cuore_commento: "notifications.event.like_comment",
  cuore_post: "notifications.event.like_post",
  follow_nuovo: "notifications.event.follow_new",
  follow_richiesta: "notifications.event.follow_request",
  risposta_commento: "notifications.event.reply_comment",
  risposta_post: "notifications.event.reply_post",
};

/** I nomi, e quanti non ci stanno. «Anna, Marco e altre 3 persone». */
function nomi(attori: readonly NotificaAttore[], altri: number): string {
  const elenco = attori.map((attore) => attore.displayName);

  // La congiunzione e le virgole sono della lingua: «a, b e c», «a, b, and c».
  return formatoElenco(
    altri > 0 ? [...elenco, t("notifications.others", { count: altri })] : elenco,
  );
}

const SETTIMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Come si chiama l'altra lente, in una frase rivolta a chi la sta guardando. */
function fraseAltrove(n: number, altra: NotificaLente): string {
  return altra === "rete"
    ? t("notifications.elsewhere.network", { count: n })
    : t("notifications.elsewhere.instance", { count: n });
}

export function Notifiche(): React.ReactElement {
  const { modo, token } = useSignedIn();
  const { imposta } = useNotifiche();
  const [filtro, setFiltro] = useState<NotificaFiltro>("tutte");
  const [pagina, setPagina] = useState<NotifichePage | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const [lavoro, setLavoro] = useState<string | undefined>();
  const [esito, setEsito] = useState<string | undefined>();

  const carica = useCallback(
    async (quale: NotificaFiltro): Promise<void> => {
      setErrore(undefined);

      try {
        const risposta = await api.notifiche(token, { filtro: quale, lente: modo });

        setPagina(risposta);

        /*
         * Si segna «viste» **dopo** aver letto, mai prima: la pagina appena
         * caricata evidenzia ciò che è nuovo rispetto all'ultima volta, e
         * azzerare per primi cancellerebbe proprio l'informazione che si è
         * venuti a vedere. E solo **in questa lente**: guardare l'istanza non
         * tocca il segno della rete.
         */
        if (risposta.nuove > 0) {
          await api.segnaNotificheViste(token, modo);
        }

        /*
         * Il pallino resta il conto di entrambe: quello appena segnato qui
         * cade, ciò che sta nell'altra lente resta. È vero anche quando qui
         * non c'era niente di nuovo — allora il totale era già solo «altrove».
         */
        imposta(risposta.altrove);
      } catch (causa) {
        setErrore(spiega(causa, t("notifications.error.load")));
      }
    },
    [imposta, modo, token],
  );

  useEffect(() => {
    // Lente o filtro cambiati: ciò che sta a schermo appartiene all'altro
    // elenco, e mostrarlo mentre arriva quello nuovo sembrerebbe l'elenco
    // sbagliato. Il ricaricamento dopo Accetta/Rifiuta passa da `decidi`, che
    // non passa di qui, e lì la lista resta visibile apposta.
    setPagina(undefined);
    void carica(filtro);
  }, [carica, filtro]);

  const ancora = async (): Promise<void> => {
    const cursore = pagina?.nextCursor;

    if (cursore === undefined) {
      return;
    }

    setLavoro("ancora");

    try {
      const seguito = await api.notifiche(token, { cursor: cursore, filtro, lente: modo });

      setPagina((prima) =>
        prima === undefined
          ? seguito
          : { ...seguito, notifiche: [...prima.notifiche, ...seguito.notifiche] },
      );
    } catch (causa) {
      setErrore(spiega(causa, t("notifications.error.more")));
    } finally {
      setLavoro(undefined);
    }
  };

  /** Accettare una richiesta si fa **da qui**: è dove la si legge. */
  const decidi = async (notifica: NotificaView, accetta: boolean): Promise<void> => {
    const id = notifica.followerId;

    if (id === undefined) {
      return;
    }

    setLavoro(notifica.id);
    setErrore(undefined);
    setEsito(undefined);

    try {
      if (accetta) {
        await api.acceptFollower(token, id);
        setEsito(
          t("notifications.request.accepted", { names: nomi(notifica.attori, notifica.altri) }),
        );
      } else {
        await api.removeFollower(token, id);
        setEsito(t("notifications.request.declined"));
      }

      await carica(filtro);
    } catch (causa) {
      setErrore(spiega(causa, t("notifications.error.request")));
    } finally {
      setLavoro(undefined);
    }
  };

  const adesso = Date.now();
  const recenti = pagina?.notifiche.filter((n) => adesso - Date.parse(n.quando) < SETTIMANA_MS);
  const prima = pagina?.notifiche.filter((n) => adesso - Date.parse(n.quando) >= SETTIMANA_MS);
  const altra: NotificaLente = modo === "istanza" ? "rete" : "istanza";

  return (
    <main className="column column--feed">
      <div aria-label={t("notifications.filter.label")} className="chips" role="group">
        {NOTIFICA_FILTRI.map((quale) => (
          <button
            aria-pressed={quale === filtro}
            className="chips__chip"
            key={quale}
            onClick={() => setFiltro(quale)}
            type="button"
          >
            {t(ETICHETTE[quale])}
          </button>
        ))}
      </div>

      <Live>{esito}</Live>
      {errore !== undefined && (
        <div className="feed-pad">
          <Alert tone="error">{errore}</Alert>
        </div>
      )}

      {/*
       * La divisione non si tace: se nell'altra lente c'è qualcosa, lo dice
       * una riga e porta là con un tocco. Una divisione taciuta sarebbe
       * indistinguibile da una perdita — chi non sa dell'altro elenco conclude
       * che quelle notizie non sono mai arrivate.
       */}
      {pagina !== undefined && pagina.altrove > 0 && (
        <div className="feed-pad">
          <Link className="attivita__altrove" to={`/notifiche?modo=${altra}`}>
            <span>{fraseAltrove(pagina.altrove, altra)}</span>
            <strong>
              {altra === "rete"
                ? t("notifications.elsewhere.open_network")
                : t("notifications.elsewhere.open_instance")}
            </strong>
          </Link>
        </div>
      )}

      {pagina === undefined && errore === undefined && (
        <p className="muted feed-pad">{t("notifications.loading")}</p>
      )}

      {pagina !== undefined && pagina.notifiche.length === 0 && (
        <div className="feed-pad">
          <EmptyState icon="bell" title={t("notifications.empty.title")}>
            {modo === "istanza" ? (
              <p>{t("notifications.empty.instance")}</p>
            ) : (
              <p>{t("notifications.empty.network")}</p>
            )}
          </EmptyState>
        </div>
      )}

      {[
        { etichetta: t("notifications.period.recent"), voci: recenti ?? [] },
        { etichetta: t("notifications.period.earlier"), voci: prima ?? [] },
      ]
        .filter((sezione) => sezione.voci.length > 0)
        .map((sezione) => (
          <section key={sezione.etichetta}>
            <h2 className="attivita__periodo">{sezione.etichetta}</h2>
            <ol className="attivita">
              {sezione.voci.map((notifica) => (
                <Voce
                  decidi={decidi}
                  key={notifica.id}
                  lavoro={lavoro === notifica.id}
                  notifica={notifica}
                />
              ))}
            </ol>
          </section>
        ))}

      {pagina?.nextCursor !== undefined && (
        <div className="feed-pad">
          <Button
            block
            disabled={lavoro === "ancora"}
            onClick={() => void ancora()}
            variant="secondary"
          >
            {lavoro === "ancora" ? t("notifications.more_loading") : t("notifications.more")}
          </Button>
        </div>
      )}
    </main>
  );
}

function Voce({
  notifica,
  decidi,
  lavoro,
}: {
  notifica: NotificaView;
  decidi: (notifica: NotificaView, accetta: boolean) => Promise<void>;
  lavoro: boolean;
}): React.ReactElement {
  const primo = notifica.attori[0];
  const segno = SEGNI[notifica.tipo];
  const casa = primo?.istanza;

  /*
   * Dove porta il tocco.
   *
   * Un cuore o una risposta portano alla cosa: il post, o il commento dentro
   * la sua pagina. Un follow porta alla persona, che è l'unica cosa che c'è da
   * guardare — e se viene da un'altra casa, alla sua pagina là ([ADR 0023]).
   */
  const dove =
    notifica.oggetto === undefined
      ? primo === undefined
        ? "/notifiche"
        : percorsoPersona(primo.username, casa?.instanceKey)
      : notifica.oggetto.commentId === undefined
        ? `/p/${notifica.oggetto.postId}`
        : `/p/${notifica.oggetto.postId}/c/${notifica.oggetto.commentId}`;

  return (
    <li className={notifica.nuova ? "attivita__voce attivita__voce--nuova" : "attivita__voce"}>
      <Link className="attivita__link" to={dove}>
        <span className="attivita__rail">
          <Avatar
            displayName={primo?.displayName ?? "?"}
            size="md"
            username={primo?.username ?? "?"}
          />
          <span aria-hidden="true" className={`attivita__segno attivita__segno--${segno.classe}`}>
            <Icon name={segno.icona} size={12} />
          </span>
        </span>

        <span className="attivita__corpo">
          <span className="attivita__testa">
            <T
              k={FRASI[notifica.tipo]}
              params={{ count: notifica.attori.length + notifica.altri }}
              tags={{
                event: (testo) => <span className="attivita__frase">{testo}</span>,
                names: () => (
                  <>
                    <span className="attivita__nomi">{nomi(notifica.attori, notifica.altri)}</span>
                    {casa !== undefined && (
                      // Due «marco» su due case sono due persone: la casa fa parte del
                      // nome, e tacerla qui sarebbe confondere due persone diverse.
                      <span className="attivita__casa">{casa.istanza}</span>
                    )}
                  </>
                ),
              }}
            />
            <span className="post__handle">·</span>
            <time
              className="post__time"
              dateTime={notifica.quando}
              title={quandoPerEsteso(notifica.quando)}
            >
              {quandoBreve(notifica.quando)}
            </time>
          </span>

          {/* La tua cosa, in tono attenuato: è il contesto, non la notizia. */}
          {notifica.oggetto !== undefined && notifica.oggetto.anteprima !== "" && (
            <span className="attivita__citazione">{notifica.oggetto.anteprima}</span>
          )}

          {/* Le parole nuove, in tono pieno: questa è la notizia. */}
          {notifica.oggetto?.risposta !== undefined && (
            <span className="attivita__parole">{notifica.oggetto.risposta}</span>
          )}
        </span>
      </Link>

      {/*
       * Accetta e Rifiuta stanno **qui**, dove la richiesta si legge.
       *
       * Prima vivevano solo in Impostazioni → Presenza, cioè in un posto in cui
       * bisognava sapere di dover andare: è la stessa classe di difetto che M5
       * ha trovato nel follow — un gesto che esiste ma non ha un posto in cui
       * essere visto. E la via d'uscita sta accanto all'azione, non altrove.
       */}
      {notifica.tipo === "follow_richiesta" && (
        <div className="attivita__azioni">
          <Button disabled={lavoro} onClick={() => void decidi(notifica, true)}>
            {lavoro ? t("notifications.request.busy") : t("notifications.request.accept")}
          </Button>
          <Button disabled={lavoro} onClick={() => void decidi(notifica, false)} variant="quiet">
            {t("notifications.request.decline")}
          </Button>
        </div>
      )}
    </li>
  );
}
