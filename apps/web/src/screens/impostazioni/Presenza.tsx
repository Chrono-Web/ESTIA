import type { FollowsView, Presence, ProfileView } from "@estia/contracts";
import type { PlainMessageKey } from "@estia/i18n";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { spiega } from "../../errori.js";
import { t } from "../../i18n/index.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, Choice, Live, SegmentedControl } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { titoloSezione } from "./sezioni.js";

/**
 * Privacy della persona: due pannelli e un interruttore di rete.
 *
 * Il toggle Istanza/Rete **non** decide se sei fuori casa: serve solo a
 * mostrare le impostazioni di quel contesto. Privato/pubblico **non** parla
 * della ricerca — in EstiaNet (e in istanza) si è cercabili comunque. Decide
 * che cosa vede chi apre il tuo profilo dalla lista: la richiesta di follow,
 * oppure i tuoi post.
 *
 * - Istanza → `openFollows` (chiuso = privato, aperto = pubblico)
 * - Rete → `presente_privato` / `presente_pubblico` (se sei su EstiaNet;
 *   altrimenti resta una preferenza finché non entri)
 * - EstiaNet → `non_presente` oppure la preferenza di rete
 */

type Pannello = "istanza" | "rete";
type ReteVisibilita = "privato" | "pubblico";

/** Le etichette si traducono a ogni disegno: una costante resterebbe nella lingua di allora. */
function pannelli(): { icon: "instance" | "globe"; label: string; value: Pannello }[] {
  return [
    { icon: "instance", label: t("settings.presence.panel.instance"), value: "istanza" },
    { icon: "globe", label: t("settings.presence.panel.network"), value: "rete" },
  ];
}

function inEstiaNet(presence: Presence): boolean {
  return presence !== "non_presente";
}

function reteDi(presence: Presence): ReteVisibilita {
  return presence === "presente_pubblico" ? "pubblico" : "privato";
}

function presenzaRete(rete: ReteVisibilita): Presence {
  return rete === "pubblico" ? "presente_pubblico" : "presente_privato";
}

/**
 * Che cosa sta succedendo, per gli interruttori che ne hanno uno solo.
 * Chiavi del catalogo, tradotte quando si mostrano (ADR 0044).
 */
const DETTO: Readonly<Record<string, PlainMessageKey>> = {
  "estianet:entra": "settings.presence.working.join_estianet",
  "estianet:esci": "settings.presence.working.leave_estianet",
  "istanza:privato": "settings.presence.working.instance_private",
  "istanza:pubblico": "settings.presence.working.instance_public",
  "rete:privato": "settings.presence.working.network_private",
  "rete:pubblico": "settings.presence.working.network_public",
};

/** E per i gesti sulle righe, dove l'id porta con sé quale riga. */
function dettoPerRiga(lavoro: string): string | undefined {
  const azione = lavoro.split(":")[0];

  switch (azione) {
    case "accetta":
      return t("settings.presence.requests.accepting");
    case "rifiuta":
      return t("settings.presence.requests.declining");
    case "smetti":
      return t("settings.presence.working.unfollowing");
    case "controlla":
      return t("settings.presence.following.checking");
    default:
      return undefined;
  }
}

function dettoDi(lavoro: string): string | undefined {
  const chiave = DETTO[lavoro];

  return chiave === undefined ? dettoPerRiga(lavoro) : t(chiave);
}

export function Presenza(): React.ReactElement {
  const { token } = useSignedIn();
  const [profilo, setProfilo] = useState<ProfileView | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  /** Com’è andata, quando è andata bene: la riga che sparisce non lo dice a chi ascolta. */
  const [esito, setEsito] = useState<string | undefined>();
  const [lavoro, setLavoro] = useState<string | undefined>();
  /** Solo visuale: quale blocco di impostazioni stai guardando. */
  const [pannello, setPannello] = useState<Pannello>("istanza");
  /**
   * Preferenza di rete quando sei fuori da EstiaNet (lo schema tiene un solo
   * `non_presente`, e non ricorda se eri privato o pubblico).
   */
  const [retePreferita, setRetePreferita] = useState<ReteVisibilita>("privato");

  const carica = useCallback(async () => {
    const [mio, relazioni] = await Promise.all([api.profile(token), api.follows(token)]);

    setProfilo(mio);
    setFollows(relazioni);

    if (inEstiaNet(mio.presence)) {
      setRetePreferita(reteDi(mio.presence));
    }
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (profilo === undefined) {
    return (
      <Sezione titolo={titoloSezione("presenza")}>
        <p className="muted">{t("sections.loading")}</p>
      </Sezione>
    );
  }

  const salva = async (
    cambio: Partial<Pick<ProfileView, "presence" | "openFollows">>,
    id: string,
  ): Promise<void> => {
    setErrore(undefined);
    setEsito(undefined);
    setLavoro(id);
    setProfilo({
      ...profilo,
      openFollows: cambio.openFollows ?? profilo.openFollows,
      presence: cambio.presence ?? profilo.presence,
    });

    try {
      setProfilo(
        await api.updateProfile(token, {
          bio: profilo.bio,
          openFollows: cambio.openFollows ?? profilo.openFollows,
          presence: cambio.presence ?? profilo.presence,
        }),
      );
    } catch (causa) {
      setErrore(spiega(causa, t("settings.presence.error_save")));
      await carica();
    } finally {
      setLavoro(undefined);
    }
  };

  /**
   * Accetta, Rifiuta, Smetti: gesti brevi che passano comunque dalla rete.
   *
   * Il `try` non è una formalità — senza, un rifiuto che fallisce non lascia
   * niente sullo schermo e finisce in una promise non gestita (euristica 1 e 9).
   */
  const decidi = async (id: string, azione: () => Promise<void>, detto: string): Promise<void> => {
    setErrore(undefined);
    setEsito(undefined);
    setLavoro(id);

    try {
      await azione();
      await carica();
      setEsito(detto);
    } catch (causa) {
      setErrore(spiega(causa, t("settings.presence.error_generic")));
    } finally {
      setLavoro(undefined);
    }
  };

  /**
   * Richiedere, che è il modo di scoprire una risposta già data.
   *
   * Fuori casa chi accetta non spedisce niente a nessuno (ADR 0022): la metà
   * di chi ha chiesto resta «in attesa» finché non richiede. Non si duplica
   * niente — la riga che c'è viene riusata — e resta un gesto, mai un ciclo:
   * un rifiuto non lascia traccia, quindi un richiamo automatico farebbe
   * rinascere per sempre una richiesta che qualcuno ha respinto.
   */
  const controlla = async (row: {
    id: string;
    instanceKey: string;
    username: string;
  }): Promise<void> => {
    setErrore(undefined);
    setEsito(undefined);
    setLavoro(`controlla:${row.id}`);

    try {
      await api.follow(token, { instanceKey: row.instanceKey, username: row.username });
      await carica();
      setEsito(t("settings.presence.checked"));
    } catch (causa) {
      setErrore(spiega(causa, t("settings.presence.error_check")));
    } finally {
      setLavoro(undefined);
    }
  };

  const inAttesa = follows?.followers.filter((row) => row.state === "in_attesa") ?? [];
  const suEstiaNet = inEstiaNet(profilo.presence);
  const rete = suEstiaNet ? reteDi(profilo.presence) : retePreferita;
  const occupato = lavoro !== undefined;
  const durante = lavoro === undefined ? undefined : dettoDi(lavoro);

  const scegliRete = (prossima: ReteVisibilita): void => {
    if (prossima === rete || occupato) {
      return;
    }

    setRetePreferita(prossima);

    if (!suEstiaNet) {
      return;
    }

    void salva({ presence: presenzaRete(prossima) }, `rete:${prossima}`);
  };

  const entraEstiaNet = (): void => {
    if (suEstiaNet || occupato) {
      return;
    }

    void salva({ presence: presenzaRete(retePreferita) }, "estianet:entra");
  };

  const esciEstiaNet = (): void => {
    if (!suEstiaNet || occupato) {
      return;
    }

    setRetePreferita(reteDi(profilo.presence));
    void salva({ presence: "non_presente" }, "estianet:esci");
  };

  return (
    <Sezione titolo={titoloSezione("presenza")}>
      {errore !== undefined && <Alert tone="error">{errore}</Alert>}
      <Live>{durante ?? esito ?? ""}</Live>

      {inAttesa.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">{t("settings.presence.requests.title")}</h2>
          {inAttesa.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale"
                    ? t("settings.presence.requests.from_local")
                    : t("settings.presence.requests.from_remote", {
                        key: row.instanceKey.slice(0, 16),
                      })}
                </span>
              </span>
              <span className="row__end">
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `accetta:${row.id}`,
                      () => api.acceptFollower(token, row.id),
                      t("settings.presence.requests.accepted", { username: row.username }),
                    )
                  }
                >
                  {lavoro === `accetta:${row.id}`
                    ? t("settings.presence.requests.accepting")
                    : t("settings.presence.requests.accept")}
                </Button>
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `rifiuta:${row.id}`,
                      () => api.removeFollower(token, row.id),
                      t("settings.presence.requests.declined"),
                    )
                  }
                  variant="secondary"
                >
                  {lavoro === `rifiuta:${row.id}`
                    ? t("settings.presence.requests.declining")
                    : t("settings.presence.requests.decline")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>{t("settings.presence.profile.title")}</h2>
        <SegmentedControl
          label={t("settings.presence.panel.label")}
          onChange={setPannello}
          options={pannelli()}
          value={pannello}
        />

        {pannello === "istanza" ? (
          <>
            <p className="muted">{t("settings.presence.instance.intro")}</p>
            <Choice
              checked={!profilo.openFollows}
              disabled={occupato}
              name="istanza-profilo"
              note={t("settings.presence.private_note")}
              onChoose={() => void salva({ openFollows: false }, "istanza:privato")}
              title={
                lavoro === "istanza:privato"
                  ? t("settings.presence.private_saving")
                  : t("settings.presence.private")
              }
            />
            <Choice
              checked={profilo.openFollows}
              disabled={occupato}
              name="istanza-profilo"
              note={t("settings.presence.instance.public_note")}
              onChoose={() => void salva({ openFollows: true }, "istanza:pubblico")}
              title={
                lavoro === "istanza:pubblico"
                  ? t("settings.presence.public_saving")
                  : t("settings.presence.public")
              }
            />
          </>
        ) : (
          <>
            <p className="muted">
              {suEstiaNet
                ? t("settings.presence.network.intro")
                : t("settings.presence.network.intro_outside")}
            </p>
            <Choice
              checked={rete === "privato"}
              disabled={occupato}
              name="rete-profilo"
              note={t("settings.presence.private_note")}
              onChoose={() => scegliRete("privato")}
              title={
                lavoro === "rete:privato"
                  ? t("settings.presence.private_saving")
                  : t("settings.presence.private")
              }
            />
            <Choice
              checked={rete === "pubblico"}
              disabled={occupato}
              name="rete-profilo"
              note={t("settings.presence.network.public_note")}
              onChoose={() => scegliRete("pubblico")}
              title={
                lavoro === "rete:pubblico"
                  ? t("settings.presence.public_saving")
                  : t("settings.presence.public")
              }
            />
          </>
        )}
      </div>

      <div aria-busy={lavoro?.startsWith("estianet:") || undefined} className="card">
        <h2>{t("settings.presence.estianet.title")}</h2>
        <p className="muted">
          {suEstiaNet ? t("settings.presence.estianet.in") : t("settings.presence.estianet.out")}
        </p>
        {suEstiaNet ? (
          <Button
            aria-busy={lavoro === "estianet:esci" || undefined}
            disabled={occupato}
            onClick={esciEstiaNet}
            variant="secondary"
          >
            {lavoro === "estianet:esci"
              ? t("settings.presence.working.leave_estianet")
              : t("settings.presence.estianet.leave")}
          </Button>
        ) : (
          <Button
            aria-busy={lavoro === "estianet:entra" || undefined}
            disabled={occupato}
            onClick={entraEstiaNet}
          >
            {lavoro === "estianet:entra"
              ? t("settings.presence.working.join_estianet")
              : t("settings.presence.estianet.join")}
          </Button>
        )}
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">{t("settings.presence.following.title")}</h2>
        {follows === undefined || follows.following.length === 0 ? (
          <p className="empty-inline">{t("settings.presence.following.empty")}</p>
        ) : (
          follows.following.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale"
                    ? t("settings.presence.following.local")
                    : t("settings.presence.following.remote")}
                  {/* Un separatore fra voci di un elenco, non un pezzo di frase. */}
                  {row.state === "in_attesa"
                    ? ` · ${t("settings.presence.following.pending")}`
                    : ""}
                  {row.state === "accettato" && !row.leggibile
                    ? ` · ${t("settings.presence.following.no_proof")}`
                    : ""}
                </span>
              </span>
              <span className="row__end">
                {(row.state === "in_attesa" || !row.leggibile) && (
                  <Button
                    disabled={occupato}
                    onClick={() => void controlla(row)}
                    variant="secondary"
                  >
                    {lavoro === `controlla:${row.id}`
                      ? t("settings.presence.following.checking")
                      : t("settings.presence.following.check")}
                  </Button>
                )}
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `smetti:${row.id}`,
                      () => api.unfollow(token, row.id),
                      t("settings.presence.following.unfollowed", { username: row.username }),
                    )
                  }
                  variant="secondary"
                >
                  {lavoro === `smetti:${row.id}`
                    ? t("settings.presence.following.stopping")
                    : t("settings.presence.following.stop")}
                </Button>
              </span>
            </div>
          ))
        )}
      </div>
    </Sezione>
  );
}
