import type { FollowsView, Presence, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { spiega } from "../../errori.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, Choice, Live, SegmentedControl } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

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

const PANNELLI = [
  { icon: "instance" as const, label: "Istanza", value: "istanza" as const },
  { icon: "globe" as const, label: "Rete", value: "rete" as const },
];

function inEstiaNet(presence: Presence): boolean {
  return presence !== "non_presente";
}

function reteDi(presence: Presence): ReteVisibilita {
  return presence === "presente_pubblico" ? "pubblico" : "privato";
}

function presenzaRete(rete: ReteVisibilita): Presence {
  return rete === "pubblico" ? "presente_pubblico" : "presente_privato";
}

/** Che cosa sta succedendo, per gli interruttori che ne hanno uno solo. */
const DETTO: Record<string, string> = {
  "estianet:entra": "Entro in EstiaNet…",
  "estianet:esci": "Esco da EstiaNet…",
  "istanza:privato": "Profilo sull'istanza: privato…",
  "istanza:pubblico": "Profilo sull'istanza: pubblico…",
  "rete:privato": "Profilo di rete: privato…",
  "rete:pubblico": "Profilo di rete: pubblico…",
};

/** E per i gesti sulle righe, dove l'id porta con sé quale riga. */
function dettoPerRiga(lavoro: string): string | undefined {
  const azione = lavoro.split(":")[0];

  switch (azione) {
    case "accetta":
      return "Accetto…";
    case "rifiuta":
      return "Rifiuto…";
    case "smetti":
      return "Smetto di seguire…";
    case "controlla":
      return "Controllo…";
    default:
      return undefined;
  }
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
      <Sezione titolo="Chi ti trova, chi ti segue">
        <p className="muted">Carico…</p>
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
      setErrore(spiega(causa, "Non sono riuscito a salvare la scelta. Riprova."));
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
      setErrore(spiega(causa, "Non ha funzionato. Riprova."));
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
      setEsito("Controllato.");
    } catch (causa) {
      setErrore(spiega(causa, "Non sono riuscito a controllare. Riprova."));
    } finally {
      setLavoro(undefined);
    }
  };

  const inAttesa = follows?.followers.filter((row) => row.state === "in_attesa") ?? [];
  const suEstiaNet = inEstiaNet(profilo.presence);
  const rete = suEstiaNet ? reteDi(profilo.presence) : retePreferita;
  const occupato = lavoro !== undefined;
  const durante = lavoro === undefined ? undefined : (DETTO[lavoro] ?? dettoPerRiga(lavoro));

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
    <Sezione titolo="Chi ti trova, chi ti segue">
      {errore !== undefined && <Alert tone="error">{errore}</Alert>}
      <Live>{durante ?? esito ?? ""}</Live>

      {inAttesa.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Vogliono seguirti</h2>
          {inAttesa.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale"
                    ? "Da questa istanza"
                    : `Da un'istanza che si identifica con ${row.instanceKey.slice(0, 16)}…: quel nome lo dichiara lei, l'unica cosa verificata è l'istanza`}
                </span>
              </span>
              <span className="row__end">
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `accetta:${row.id}`,
                      () => api.acceptFollower(token, row.id),
                      `Adesso @${row.username} ti segue.`,
                    )
                  }
                >
                  {lavoro === `accetta:${row.id}` ? "Accetto…" : "Accetta"}
                </Button>
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `rifiuta:${row.id}`,
                      () => api.removeFollower(token, row.id),
                      "Richiesta rifiutata.",
                    )
                  }
                  variant="secondary"
                >
                  {lavoro === `rifiuta:${row.id}` ? "Rifiuto…" : "Rifiuta"}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Il tuo profilo</h2>
        <SegmentedControl
          label="Quali impostazioni stai guardando"
          onChange={setPannello}
          options={PANNELLI}
          value={pannello}
        />

        {pannello === "istanza" ? (
          <>
            <p className="muted">
              Su questa istanza chiunque può trovarti nella ricerca. Qui decidi che cosa vede chi
              apre il tuo profilo: i post, oppure solo la possibilità di chiederti di seguirti.
            </p>
            <Choice
              checked={!profilo.openFollows}
              disabled={occupato}
              name="istanza-profilo"
              note="Chi apre il tuo profilo può chiederti di seguirti. I post li vede solo dopo che hai accettato."
              onChoose={() => void salva({ openFollows: false }, "istanza:privato")}
              title={lavoro === "istanza:privato" ? "Privato…" : "Privato"}
            />
            <Choice
              checked={profilo.openFollows}
              disabled={occupato}
              name="istanza-profilo"
              note="Chi apre il tuo profilo vede i tuoi post. Può seguirti senza aspettare un sì."
              onChoose={() => void salva({ openFollows: true }, "istanza:pubblico")}
              title={lavoro === "istanza:pubblico" ? "Pubblico…" : "Pubblico"}
            />
          </>
        ) : (
          <>
            <p className="muted">
              Sulla rete fra istanze, se sei in EstiaNet, chiunque può trovarti nella ricerca delle
              istanze collegate. Qui decidi che cosa vede chi apre il tuo profilo: i post, oppure
              solo la possibilità di chiederti di seguirti.
              {!suEstiaNet &&
                " Vale quando entri in EstiaNet: finché sei fuori, resta solo una preferenza."}
            </p>
            <Choice
              checked={rete === "privato"}
              disabled={occupato}
              name="rete-profilo"
              note="Chi apre il tuo profilo può chiederti di seguirti. I post li vede solo dopo che hai accettato."
              onChoose={() => scegliRete("privato")}
              title={lavoro === "rete:privato" ? "Privato…" : "Privato"}
            />
            <Choice
              checked={rete === "pubblico"}
              disabled={occupato}
              name="rete-profilo"
              note="Chi apre il tuo profilo vede i tuoi post di rete."
              onChoose={() => scegliRete("pubblico")}
              title={lavoro === "rete:pubblico" ? "Pubblico…" : "Pubblico"}
            />
          </>
        )}
      </div>

      <div aria-busy={lavoro?.startsWith("estianet:") || undefined} className="card">
        <h2>EstiaNet</h2>
        <p className="muted">
          {suEstiaNet
            ? "Le istanze collegate possono trovarti e aprire il tuo profilo, nei limiti di privato o pubblico scelti sopra."
            : "Sei solo in questa istanza. Nessuna altra istanza sa che ci sei, e non compari nelle loro ricerche."}
        </p>
        {suEstiaNet ? (
          <Button
            aria-busy={lavoro === "estianet:esci" || undefined}
            disabled={occupato}
            onClick={esciEstiaNet}
            variant="secondary"
          >
            {lavoro === "estianet:esci" ? "Esco da EstiaNet…" : "Esci da EstiaNet"}
          </Button>
        ) : (
          <Button
            aria-busy={lavoro === "estianet:entra" || undefined}
            disabled={occupato}
            onClick={entraEstiaNet}
          >
            {lavoro === "estianet:entra" ? "Entro in EstiaNet…" : "Entra in EstiaNet"}
          </Button>
        )}
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Chi segui</h2>
        {follows === undefined || follows.following.length === 0 ? (
          <p className="empty-inline">Nessuno, per ora. Qualcuno si trova dalla ricerca.</p>
        ) : (
          follows.following.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale" ? "Su questa istanza" : "Su un'altra istanza"}
                  {row.state === "in_attesa"
                    ? " · richiesta in attesa: chi accetta non ti avvisa, si controlla"
                    : ""}
                  {row.state === "accettato" && !row.leggibile
                    ? " · manca la prova per leggere i suoi post: controlla"
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
                    {lavoro === `controlla:${row.id}` ? "Controllo…" : "Controlla"}
                  </Button>
                )}
                <Button
                  disabled={occupato}
                  onClick={() =>
                    void decidi(
                      `smetti:${row.id}`,
                      () => api.unfollow(token, row.id),
                      `Non segui più @${row.username}.`,
                    )
                  }
                  variant="secondary"
                >
                  {lavoro === `smetti:${row.id}` ? "Smetto…" : "Smetti"}
                </Button>
              </span>
            </div>
          ))
        )}
      </div>
    </Sezione>
  );
}
