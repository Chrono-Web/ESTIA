import type { InviteView, JoinRequestView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { InviteLink } from "../../../components/InviteLink.js";
import { spiega } from "../../../errori.js";
import { formatoData, t } from "../../../i18n/index.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Avatar, Badge, Button, Choice, Live, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";
import { titoloSezione } from "../sezioni.js";

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
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
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
      setErrore(spiega(causa, t("admin.invites.error")));
    } finally {
      setLavoro(undefined);
    }
  };

  const crea = (): Promise<void> =>
    agisci(
      "crea",
      t("admin.invites.working.create"),
      async () => {
        const creato = await api.createInvite(token, {
          label: etichetta,
          ...(riutilizzabile ? { maxUses: 10 } : {}),
        });

        // Mostrato una volta sola: l'istanza ne conserva solo l'impronta.
        setAppena({ code: creato.code, joinUrl: creato.joinUrl });
        setEtichetta("");
      },
      t("admin.invites.done.created"),
    );

  const decidi = (richiesta: JoinRequestView, entra: boolean): Promise<void> =>
    agisci(
      `${entra ? "entra" : "rifiuta"}:${richiesta.id}`,
      entra ? t("admin.invites.working.admit") : t("admin.invites.working.reject"),
      async () => {
        await (entra ? api.approve(token, richiesta.id) : api.reject(token, richiesta.id));
        // Il conteggio delle persone dell'istanza cambia solo quando entra qualcuno.
        await refreshInstance();
      },
      entra
        ? t("admin.invites.done.approved", { name: nomeDi(richiesta) })
        : t("admin.invites.done.rejected"),
    );

  if (!caricato) {
    return (
      <Sezione titolo={titoloSezione("inviti")}>
        <p className="muted">{t("sections.loading")}</p>
      </Sezione>
    );
  }

  return (
    <Sezione titolo={titoloSezione("inviti")}>
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
          {t("admin.invites.requests.title")}{" "}
          {richieste.length > 0 && <Badge tone="on">{richieste.length}</Badge>}
        </h2>
        <p className="empty-inline">
          {richieste.length === 0
            ? t("admin.invites.requests.empty")
            : t("admin.invites.requests.note")}
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
              <span className="row__note">
                {t("admin.invites.requests.asked_on", { when: quando(richiesta.createdAt) })}
              </span>
            </span>
            <span className="row__end row__end--actions">
              <Button
                aria-busy={lavoro?.id === `entra:${richiesta.id}`}
                disabled={occupato}
                onClick={() => void decidi(richiesta, true)}
              >
                {etichettaDi(
                  `entra:${richiesta.id}`,
                  t("admin.invites.requests.admit"),
                  t("admin.invites.requests.admitting"),
                )}
              </Button>
              <Button
                aria-busy={lavoro?.id === `rifiuta:${richiesta.id}`}
                disabled={occupato}
                onClick={() => void decidi(richiesta, false)}
                variant="danger"
              >
                {etichettaDi(
                  `rifiuta:${richiesta.id}`,
                  t("admin.invites.requests.reject"),
                  t("admin.invites.requests.rejecting"),
                )}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>{t("admin.invites.new.title")}</h2>
        <p className="muted">{t("admin.invites.new.intro")}</p>

        <TextField
          hint={t("admin.invites.new.label_hint")}
          label={t("admin.invites.new.label")}
          onChange={(event) => setEtichetta(event.target.value)}
          placeholder={t("admin.invites.new.label_placeholder")}
          value={etichetta}
        />

        <Choice
          checked={riutilizzabile}
          name="riutilizzabile"
          note={t("admin.invites.new.reusable_note")}
          onChoose={() => setRiutilizzabile(!riutilizzabile)}
          title={t("admin.invites.new.reusable")}
          type="checkbox"
        />

        <Button aria-busy={lavoro?.id === "crea"} disabled={occupato} onClick={() => void crea()}>
          {etichettaDi("crea", t("admin.invites.create"), t("admin.invites.creating"))}
        </Button>
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">{t("admin.invites.list.title")}</h2>
        {inviti.length === 0 && <p className="empty-inline">{t("admin.invites.list.empty")}</p>}
        {inviti.map((invito) => (
          <div className="row" key={invito.id}>
            <span className="row__body">
              <span className="row__title">
                {invito.label === "" ? t("admin.invites.list.untitled") : invito.label}{" "}
                {invito.usable ? (
                  <Badge tone="on">{t("admin.invites.list.valid")}</Badge>
                ) : (
                  <Badge>{t("admin.invites.list.exhausted")}</Badge>
                )}
              </span>
              <span className="row__note">
                {t("admin.invites.list.usage", {
                  max: invito.maxUses,
                  used: invito.usedCount,
                  when: quando(invito.expiresAt),
                })}
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
                      t("admin.invites.working.revoke"),
                      () => api.revokeInvite(token, invito.id),
                      t("admin.invites.done.revoked"),
                    )
                  }
                  variant="danger"
                >
                  {etichettaDi(
                    `ritira:${invito.id}`,
                    t("admin.invites.list.revoke"),
                    t("admin.invites.list.revoking"),
                  )}
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
