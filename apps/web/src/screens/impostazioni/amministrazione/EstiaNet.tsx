import type { AdminDiagnostics, FederatedInstanceView, FederationView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { spiega } from "../../../errori.js";
import { T, t } from "../../../i18n/index.js";
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
  return istanza.declaredName.trim() === "" ? t("network.instance.unnamed") : istanza.declaredName;
}

/** Un nome di configurazione dentro una frase: si mostra com'è, non si traduce. */
const codice = (testo: string): React.ReactElement => <code>{testo}</code>;

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
      setMessaggio({ testo: t("network.copy.done"), tono: "ok" });
    } catch {
      setMessaggio({ testo: t("network.copy.failed"), tono: "neutral" });
    }
  };

  const accendi = async (modo: "off" | "local" | "internet"): Promise<void> => {
    const id = `accendi:${modo}`;
    setMessaggio(undefined);
    setLavoro({
      detto:
        modo === "off"
          ? t("network.power.off.working")
          : modo === "local"
            ? t("network.power.local.working")
            : t("network.power.internet.working"),
      id,
    });

    try {
      await api.setNetworkProbe(token, modo);
      await Promise.all([caricaDiagnostica(), caricaFederazione()]);
      setMessaggio({
        testo:
          modo === "off"
            ? t("network.power.off.done")
            : modo === "local"
              ? t("network.power.local.done")
              : t("network.power.internet.done"),
        tono: "ok",
      });
    } catch (causa) {
      setMessaggio({
        testo: spiega(
          causa,
          modo === "off" ? t("network.power.off.failed") : t("network.power.on.failed"),
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
        testo: spiega(causa, t("network.action.failed")),
        tono: "error",
      });
    } finally {
      setLavoro(undefined);
    }
  };

  const eseguiPing = async (publicKey: string): Promise<void> => {
    const id = `ping:${publicKey}`;
    setMessaggio(undefined);
    setLavoro({ detto: t("network.ping.working"), id });

    try {
      const ping = await api.pingInstance(token, publicKey);
      await caricaFederazione();
      setMessaggio({
        // Frase dell'istanza: si mostra com'è finché non manda una chiave.
        testo: ping.detail,
        tono: ping.reached ? "ok" : "error",
      });
    } catch (causa) {
      setMessaggio({
        testo: spiega(causa, t("network.ping.failed")),
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
      setMessaggio({ testo: t("network.connect.self"), tono: "error" });
      return;
    }

    setMessaggio(undefined);
    setLavoro({ detto: t("network.connect.working"), id: "chiedi" });

    try {
      const nuovaFederazione = await api.connectInstance(token, pulita);
      setFederazione(nuovaFederazione);
      setChiave("");

      const record = nuovaFederazione.instances.find((r) => r.publicKey === pulita);
      if (record?.state === "collegata") {
        setMessaggio({ testo: t("network.connect.done.linked"), tono: "ok" });
      } else if (record?.lastSeenAt !== null && record?.lastSeenAt !== undefined) {
        setMessaggio({ testo: t("network.connect.done.delivered"), tono: "ok" });
      } else {
        setMessaggio({ testo: t("network.connect.done.saved"), tono: "neutral" });
      }
    } catch (causa) {
      setMessaggio({
        testo: spiega(causa, t("network.connect.failed")),
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
            t("network.row.accept.working"),
            () => api.acceptInstance(token, istanza.publicKey),
            t("network.row.accept.done"),
          ),
        title: t("network.row.accept.title"),
      },
      blocca: {
        conferma: {
          etichetta: t("network.row.block.confirm.button"),
          testo: t("network.row.block.confirm.text"),
          titolo: t("network.row.block.confirm.title", { name: nome }),
        },
        icon: "shield",
        id: "blocca",
        onClick: () =>
          void agisci(
            `blocca:${istanza.publicKey}`,
            t("network.row.block.working"),
            () => api.blockInstance(token, istanza.publicKey),
            t("network.row.block.done"),
          ),
        title: t("network.row.block.title"),
        tono: "danger",
      },
      copia: {
        icon: "key",
        id: "copia",
        note: t("network.row.copy.note"),
        onClick: () => void copiaNegliAppunti(istanza.publicKey, istanza.publicKey),
        title: t("network.row.copy.title"),
      },
      /*
       * «Dimentica» toglie la casa dall'elenco davvero: lato istanza è
       * `remotes.remove`. Prima, sulla riga di una bloccata, si chiamava «Togli
       * il blocco» e diceva «Blocco rimosso» — cioè prometteva un ritorno allo
       * stato di prima che non avviene. Qui la parola dice quello che succede.
       */
      dimentica: {
        conferma: {
          etichetta: t("network.row.forget.confirm.button"),
          testo:
            gruppo === "collegata"
              ? t("network.row.forget.confirm.text.linked")
              : gruppo === "bloccata"
                ? t("network.row.forget.confirm.text.blocked")
                : t("network.row.forget.confirm.text.request"),
          titolo:
            gruppo === "in-attesa"
              ? t("network.row.forget.confirm.title.request")
              : t("network.row.forget.confirm.title.home", { name: nome }),
        },
        id: "dimentica",
        onClick: () =>
          void agisci(
            `dimentica:${istanza.publicKey}`,
            t("network.row.forget.working"),
            () => api.forgetInstance(token, istanza.publicKey),
            t("network.row.forget.done"),
          ),
        title:
          gruppo === "in-attesa"
            ? t("network.row.forget.title.request")
            : t("network.row.forget.title.home"),
        tono: "danger",
      },
      rifiuta: {
        id: "rifiuta",
        onClick: () =>
          void agisci(
            `rifiuta:${istanza.publicKey}`,
            t("network.row.refuse.working"),
            () => api.forgetInstance(token, istanza.publicKey),
            t("network.row.refuse.done"),
          ),
        title: t("network.row.refuse.title"),
        tono: "danger",
      },
      rimanda: {
        icon: "send",
        id: "rimanda",
        note: t("network.row.resend.note"),
        onClick: () =>
          void agisci(
            `di-nuovo:${istanza.publicKey}`,
            t("network.row.resend.working"),
            () => api.connectInstance(token, istanza.publicKey),
            t("network.row.resend.done"),
          ),
        title: t("network.row.resend.title"),
      },
      verifica: {
        icon: "check",
        id: "verifica",
        note: t("network.row.check.note"),
        onClick: () => void eseguiPing(istanza.publicKey),
        title: t("network.row.check.title"),
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
                  azione === "accetta"
                    ? t("network.row.accept.busy")
                    : t("network.row.refuse.busy"),
                )}
              </Button>
            ))}
            <MenuAzioni
              etichetta={t("network.row.menu", { name: nomeDi(istanza) })}
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
      scopo={t("network.purpose")}
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
              <h2 className="gruppo">{t("network.power.on.title")}</h2>
              {/* Frase dell'istanza: si mostra com'è finché non manda una chiave. */}
              <p className="muted">{rete.detail}</p>

              {rete.editable ? (
                <>
                  <div className="cluster">
                    <Button
                      aria-busy={lavoro?.id === "accendi:local"}
                      disabled={occupato}
                      onClick={() => void accendi("local")}
                    >
                      {etichetta(
                        "accendi:local",
                        t("network.power.local.button"),
                        t("network.power.on.busy"),
                      )}
                    </Button>
                    <Button
                      aria-busy={lavoro?.id === "accendi:internet"}
                      disabled={occupato}
                      onClick={() => void accendi("internet")}
                      variant="secondary"
                    >
                      {etichetta(
                        "accendi:internet",
                        t("network.power.internet.button"),
                        t("network.power.on.busy"),
                      )}
                    </Button>
                  </div>
                  <p className="muted">{t("network.power.modes")}</p>
                </>
              ) : (
                <p className="muted">
                  <T
                    k="network.fixed_by_config"
                    params={{ variable: "ESTIA_NETWORK_PROBE" }}
                    tags={{ code: codice }}
                  />
                </p>
              )}
            </div>
          )}

          {accesa && (
            <div className="card">
              <h2 className="gruppo">{t("network.key.title")}</h2>
              <p className="muted">
                <T k="network.key.help" />
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
                      {copiati["chiave_propria"] ? t("network.key.copied") : t("network.key.copy")}
                    </Button>
                    <Button onClick={() => setMostraQr(!mostraQr)} variant="secondary">
                      {mostraQr ? t("network.key.qr.hide") : t("network.key.qr.show")}
                    </Button>
                  </>
                )}
              </div>

              {mostraQr && rete.endpointId !== undefined && rete.endpointId !== "" && (
                <div className="qr-riquadro">
                  <QrCode
                    size={220}
                    title={t("network.key.qr.title")}
                    value={rete.reachableByKey ? (rete.endpointId ?? "") : (rete.ticket ?? "")}
                  />
                  <p className="muted qr-riquadro__nota">{t("network.key.qr.note")}</p>
                </div>
              )}

              {rete.reachableByKey !== true && (
                <>
                  <p className="muted">
                    <T
                      k="network.key.ticket.help"
                      params={{ mode: "local" }}
                      tags={{ code: codice }}
                    />
                  </p>
                  <TextAreaField
                    label={t("network.key.ticket.label")}
                    readOnly
                    rows={2}
                    value={rete.ticket ?? ""}
                  />
                  {rete.ticket !== undefined && rete.ticket !== "" && (
                    <Button
                      onClick={() => void copiaNegliAppunti(rete.ticket ?? "", "ticket_proprio")}
                      variant="secondary"
                    >
                      {copiati["ticket_proprio"]
                        ? t("network.key.ticket.copied")
                        : t("network.key.ticket.copy")}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {accesa && (
            <div className="card">
              <h2 className="gruppo">{t("network.connect.title")}</h2>
              <p className="muted">
                {federazione.reachableByKey ? (
                  <T k="network.connect.help.key" />
                ) : (
                  <T k="network.connect.help.ticket" />
                )}
              </p>

              {!federazione.reachableByKey && <Alert>{t("network.connect.no_discovery")}</Alert>}

              <TextField
                label={
                  federazione.reachableByKey
                    ? t("network.connect.field.key")
                    : t("network.connect.field.ticket")
                }
                onChange={(event) => setChiave(event.target.value)}
                placeholder={t("network.connect.field.placeholder")}
                value={chiave}
              />

              <Button
                aria-busy={lavoro?.id === "chiedi"}
                disabled={occupato || chiave.trim() === ""}
                onClick={() => void chiediCollegamento()}
              >
                {etichetta("chiedi", t("network.connect.button"), t("network.connect.busy"))}
              </Button>
            </div>
          )}

          {accesa && (
            <div className="card card--flush">
              <h2 className="gruppo">{t("network.homes.title")}</h2>
              <p className="empty-inline muted">
                <T k="network.homes.help" />
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
                      <p className="empty-inline">{t("network.homes.empty")}</p>
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
              <h2 className="gruppo">{t("network.power.off.title")}</h2>
              {rete.editable ? (
                <>
                  <p className="muted">{t("network.power.off.help")}</p>
                  <Button
                    aria-busy={lavoro?.id === "accendi:off"}
                    disabled={occupato}
                    onClick={() => void accendi("off")}
                    variant="danger"
                  >
                    {etichetta(
                      "accendi:off",
                      t("network.power.off.button"),
                      t("network.power.off.busy"),
                    )}
                  </Button>
                </>
              ) : (
                <p className="muted">
                  <T
                    k="network.fixed_by_config"
                    params={{ variable: "ESTIA_NETWORK_PROBE" }}
                    tags={{ code: codice }}
                  />
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Sezione>
  );
}
