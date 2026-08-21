import type { InviteView, JoinRequestView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { InviteLink } from "../../../components/InviteLink.js";
import { spiega } from "../../../errori.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Avatar, Badge, Button, Choice, Live, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

/**
 * Gli inviti, e la porta che aprono.
 *
 * Erano due sezioni — «Inviti» e «Chi entra» — e la separazione faceva pagare
 * a chi amministra il costo di ricordarsi che sono due metà dello stesso
 * lavoro: un invito non fa entrare nessuno da solo (PRODUCT_VISION §5.1),
 * serve sempre che una persona apra la porta. Chi crea un invito lo crea *per
 * far entrare qualcuno*, e la richiesta che ne nasce arrivava in un altro
 * posto, che si scopriva solo sapendo che esisteva.
 *
 * L'ordine della pagina è quello del tempo: chi sta aspettando sta in cima
 * perché è l'unica cosa che vuole una risposta adesso; l'invito nuovo viene
 * dopo; in fondo restano quelli già in giro, che si ritirano da lì. Resta
 * vero il §8 di `DESIGN_SYSTEM.md` — una sezione, un lavoro — perché il lavoro
 * qui è uno solo: far entrare qualcuno.
 */
function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function nomeDi(richiesta: JoinRequestView): string {
  return richiesta.displayName === "" ? richiesta.username : richiesta.displayName;
}

export function Inviti(): React.ReactElement {
  const { refreshInstance, token } = useSignedIn();
  const [inviti, setInviti] = useState<InviteView[]>([]);
  const [richieste, setRichieste] = useState<JoinRequestView[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [etichetta, setEtichetta] = useState("");
  const [riutilizzabile, setRiutilizzabile] = useState(false);
  /** Il codice appena creato: si vede una volta sola, e non sopravvive al gesto dopo. */
  const [appena, setAppena] = useState<{ code: string; joinUrl: string } | undefined>();
  /** Messaggio di esito riuscito, dopo. */
  const [nota, setNota] = useState<string | undefined>();
  /** Tenuto separato da `nota`: un fallimento non deve avere la faccia di un esito. */
  const [errore, setErrore] = useState<string | undefined>();
  /** Che cosa sta facendo adesso, e quale controllo (euristica 1). */
  const [lavoro, setLavoro] = useState<{ id: string; detto: string } | undefined>();

  const carica = useCallback(async () => {
    const [elencoInviti, elencoRichieste] = await Promise.all([
      api.invites(token),
      api.joinRequests(token),
    ]);

    setInviti(elencoInviti.invites);
    setRichieste(elencoRichieste.requests);
    setCaricato(true);
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const occupato = lavoro !== undefined;
  const etichettaDi = (id: string, fermo: string, durante: string): string =>
    lavoro?.id === id ? durante : fermo;

  const agisci = async (
    id: string,
    durante: string,
    azione: () => Promise<unknown>,
    detto?: string,
  ): Promise<void> => {
    setNota(undefined);
    setErrore(undefined);
    // Il link di prima non deve restare a galleggiare sopra un altro gesto:
    // vale per l'invito che l'ha appena prodotto, e per quello soltanto.
    setAppena(undefined);
    setLavoro({ detto: durante, id });

    try {
      await azione();
      await carica();

      if (detto !== undefined) {
        setNota(detto);
      }
    } catch (causa) {
      setErrore(spiega(causa, "Non ha funzionato. Riprova, o riprova più tardi."));
    } finally {
      setLavoro(undefined);
    }
  };

  const crea = (): Promise<void> =>
    agisci(
      "crea",
      "Creo l'invito…",
      async () => {
        const creato = await api.createInvite(token, {
          label: etichetta,
          ...(riutilizzabile ? { maxUses: 10 } : {}),
        });

        // Mostrato una volta sola: l'istanza ne conserva solo l'impronta.
        setAppena({ code: creato.code, joinUrl: creato.joinUrl });
        setEtichetta("");
      },
      "Invito creato. Il link da mandare compare una volta sola: copialo adesso.",
    );

  const decidi = (richiesta: JoinRequestView, entra: boolean): Promise<void> =>
    agisci(
      `${entra ? "entra" : "rifiuta"}:${richiesta.id}`,
      entra ? "Apro la porta…" : "Rifiuto la richiesta…",
      async () => {
        await (entra ? api.approve(token, richiesta.id) : api.reject(token, richiesta.id));
        // Il conteggio delle persone dell'istanza cambia solo quando entra qualcuno.
        await refreshInstance();
      },
      entra
        ? `${nomeDi(richiesta)} adesso fa parte di questa istanza.`
        : "Richiesta rifiutata: la persona non entra, e l'invito resta com'era.",
    );

  if (!caricato) {
    return (
      <Sezione titolo="Inviti">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  return (
    <Sezione titolo="Inviti">
      {/*
        Lo stato passa da due canali diversi di proposito: `Live` c'è sempre e
        annuncia lavoro ed esito, l'errore lo annuncia il suo `role="alert"`.
        Un `aria-live` sull'`Alert` non funzionerebbe — vedi `Feedback.tsx`.
      */}
      <Live>{lavoro?.detto ?? nota ?? ""}</Live>

      {errore !== undefined && <Alert tone="error">{errore}</Alert>}

      {appena !== undefined && <InviteLink code={appena.code} joinUrl={appena.joinUrl} />}

      {/* Quando c'è un link appena creato l'esito è già quello, e ripeterlo in
          una seconda scatola sarebbe rumore: qui resta la voce di tutti gli
          altri gesti. */}
      {(lavoro !== undefined || (nota !== undefined && appena === undefined)) && (
        <Alert>{lavoro?.detto ?? nota}</Alert>
      )}

      <div className="card card--flush">
        <h2 className="gruppo">
          Chi ha chiesto di entrare{" "}
          {richieste.length > 0 && <Badge tone="on">{richieste.length}</Badge>}
        </h2>
        <p className="empty-inline">
          {richieste.length === 0
            ? "Adesso non sta aspettando nessuno. Chi apre un invito sceglie un nome e chiede di entrare: la richiesta compare qui, perché un invito non fa entrare nessuno da solo — la porta la apri tu."
            : "Un invito non fa entrare nessuno da solo: chi entra lo decidi qui."}
        </p>

        {richieste.map((richiesta) => (
          // `row--stack`: nella colonna stretta del dettaglio i due pulsanti
          // vanno a capo interi, invece di strizzare il nome una parola per riga.
          <div className="row row--stack" key={richiesta.id}>
            <Avatar displayName={richiesta.displayName} size="md" username={richiesta.username} />
            <span className="row__body">
              <span className="row__title">
                {nomeDi(richiesta)} <span className="muted">@{richiesta.username}</span>
              </span>
              {richiesta.message !== "" && <span className="row__note">{richiesta.message}</span>}
              <span className="row__note">Ha chiesto il {quando(richiesta.createdAt)}</span>
            </span>
            <span className="row__end row__end--actions">
              <Button
                aria-busy={lavoro?.id === `entra:${richiesta.id}`}
                disabled={occupato}
                onClick={() => void decidi(richiesta, true)}
              >
                {etichettaDi(`entra:${richiesta.id}`, "Fai entrare", "Apro…")}
              </Button>
              <Button
                aria-busy={lavoro?.id === `rifiuta:${richiesta.id}`}
                disabled={occupato}
                onClick={() => void decidi(richiesta, false)}
                variant="danger"
              >
                {etichettaDi(`rifiuta:${richiesta.id}`, "Rifiuta", "Rifiuto…")}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Un invito nuovo</h2>
        <p className="muted">
          Il link vale finché non scade o finché non è esaurito, e si ritira quando vuoi. Chi lo
          riceve non entra: chiede di entrare, e la richiesta torna qui sopra.
        </p>

        <TextField
          hint="Per ricordarti a chi l'hai dato. Lo vedi solo tu."
          label="Per chi è questo invito?"
          onChange={(event) => setEtichetta(event.target.value)}
          placeholder="es. Scala B"
          value={etichetta}
        />

        <Choice
          checked={riutilizzabile}
          name="riutilizzabile"
          note="Un invito monouso è più sicuro: se gira di mano in mano, ne serve uno nuovo ogni volta."
          onChoose={() => setRiutilizzabile(!riutilizzabile)}
          title="Riutilizzabile fino a 10 persone"
          type="checkbox"
        />

        <Button aria-busy={lavoro?.id === "crea"} disabled={occupato} onClick={() => void crea()}>
          {etichettaDi("crea", "Crea invito", "Creo…")}
        </Button>
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Inviti creati</h2>
        {inviti.length === 0 && <p className="empty-inline">Nessun invito creato.</p>}
        {inviti.map((invito) => (
          <div className="row" key={invito.id}>
            <span className="row__body">
              <span className="row__title">
                {invito.label === "" ? "Invito" : invito.label}{" "}
                {invito.usable ? <Badge tone="on">valido</Badge> : <Badge>esaurito</Badge>}
              </span>
              <span className="row__note">
                Usato {invito.usedCount} di {invito.maxUses} · scade il {quando(invito.expiresAt)}
              </span>
            </span>
            <span className="row__end">
              {invito.usable && (
                <Button
                  aria-busy={lavoro?.id === `ritira:${invito.id}`}
                  disabled={occupato}
                  onClick={() =>
                    void agisci(
                      `ritira:${invito.id}`,
                      "Ritiro l'invito…",
                      () => api.revokeInvite(token, invito.id),
                      "Invito ritirato: da adesso quel link non fa più chiedere di entrare.",
                    )
                  }
                  variant="danger"
                >
                  {etichettaDi(`ritira:${invito.id}`, "Ritira", "Ritiro…")}
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
