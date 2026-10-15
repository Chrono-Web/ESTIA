import type { Aspetto as AspettoValore, Contrasto, Palette, UiPreferences } from "@estia/contracts";
import { lingue } from "@estia/lingue";
import { useEffect, useRef, useState } from "react";

import { api } from "../../api.js";
import { CATALOGO_PALETTE, applicaPreferenze, scriviPreferenzeLocali } from "../../aspetto.js";
import { spiega } from "../../errori.js";
import { LINGUA_DELLA_CASA, useT } from "../../lingua.js";
import { useSignedIn } from "../../state.js";
import { Alert, Choice, Live } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * Come vedi ESTIA: lingua (ADR 0046), chiaro/scuro, contrasto, palette a
 * catalogo (ADR 0024).
 *
 * Stessa cornice delle altre impostazioni: una card per sezione. Ogni scelta
 * dice lo stato mentre lavora e l'esito a fine (euristica 1 e 9).
 *
 * **Niente controlli disabilitati mentre salva.** Disabilitare l'elemento che
 * ha il fuoco lo fa perdere a chi naviga da tastiera, e qui non serve: la
 * richiesta scrive l'oggetto intero, quindi due scelte rapide non si mescolano
 * — vince la più recente, e ci pensa il contatore qui sotto.
 */
export function Aspetto(): React.ReactElement {
  const { token, user, refreshUser } = useSignedIn();
  const { t } = useT();
  const [prefs, setPrefs] = useState<UiPreferences>(user.appearance);
  const [lavoro, setLavoro] = useState<string | undefined>();
  const [nota, setNota] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  /** Quale richiesta è l'ultima partita: le risposte in ritardo si scartano. */
  const ultima = useRef(0);
  const bottoni = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setPrefs(user.appearance);
    applicaPreferenze(user.appearance);
  }, [user.appearance]);

  const salva = async (prossimo: UiPreferences, id: string): Promise<void> => {
    const mia = ultima.current + 1;
    ultima.current = mia;

    setErrore(undefined);
    setNota(undefined);
    setLavoro(id);
    setPrefs(prossimo);
    applicaPreferenze(prossimo);
    scriviPreferenzeLocali(prossimo);

    try {
      const salvato = await api.updateAppearance(token, prossimo);

      if (ultima.current !== mia) {
        return;
      }

      setPrefs(salvato);
      scriviPreferenzeLocali(salvato);
      await refreshUser();
      setNota(t("aspetto.salvato"));
    } catch (causa) {
      if (ultima.current !== mia) {
        return;
      }

      setErrore(spiega(causa, t("aspetto.errore")));
      const ripristino = user.appearance;
      setPrefs(ripristino);
      applicaPreferenze(ripristino);
      scriviPreferenzeLocali(ripristino);
    } finally {
      if (ultima.current === mia) {
        setLavoro(undefined);
      }
    }
  };

  // La lingua della Casa è l'assenza di una scelta, non una lingua scelta che
  // per caso coincide: se la Casa cambia lingua, chi non ha scelto la segue.
  const scegliLingua = (lingua: string | undefined): void => {
    const resto = { aspetto: prefs.aspetto, contrasto: prefs.contrasto, palette: prefs.palette };
    void salva(lingua === undefined ? resto : { ...resto, lingua }, `lingua-${lingua ?? "casa"}`);
  };

  const scegliAspetto = (aspetto: AspettoValore): void => {
    void salva({ ...prefs, aspetto }, `aspetto-${aspetto}`);
  };

  const scegliContrasto = (contrasto: Contrasto): void => {
    void salva({ ...prefs, contrasto }, `contrasto-${contrasto}`);
  };

  const scegliPalette = (palette: Palette): void => {
    void salva({ ...prefs, palette }, `palette-${palette}`);
  };

  const seleziona = CATALOGO_PALETTE.indexOf(prefs.palette);
  const corrente = seleziona === -1 ? 0 : seleziona;

  /**
   * Le frecce spostano fuoco e selezione, Home ed End vanno agli estremi.
   *
   * Un gruppo che si dichiara `radiogroup` deve comportarsi da radiogroup: è
   * la stessa regola per cui `Tabs` implementa le frecce invece di limitarsi a
   * dire `role="tab"`.
   */
  const daTastiera = (event: React.KeyboardEvent, indice: number): void => {
    const n = CATALOGO_PALETTE.length;
    const dove =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (indice + 1) % n
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (indice - 1 + n) % n
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? n - 1
              : -1;

    if (dove === -1) {
      return;
    }

    event.preventDefault();
    const voce = CATALOGO_PALETTE[dove];

    if (voce !== undefined) {
      bottoni.current[dove]?.focus();
      scegliPalette(voce);
    }
  };

  const durante =
    lavoro === undefined
      ? undefined
      : lavoro.startsWith("palette-")
        ? t("aspetto.salvo_palette")
        : lavoro.startsWith("lingua-")
          ? t("aspetto.salvo_lingua")
          : t("aspetto.salvo_aspetto");
  const salvo = t("comune.salvo");
  const nomeDellaCasa =
    lingue().find((voce) => voce.codice === LINGUA_DELLA_CASA)?.nome ?? LINGUA_DELLA_CASA;

  return (
    <Sezione titolo={t("aspetto.titolo")}>
      {errore !== undefined ? <Alert tone="error">{errore}</Alert> : null}
      <Live>{durante ?? nota ?? ""}</Live>

      <div className="card">
        <p className="muted">{t("aspetto.intro")}</p>
        {nota !== undefined && errore === undefined && lavoro === undefined ? (
          <p className="muted">{nota}</p>
        ) : null}
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">{t("aspetto.lingua.gruppo")}</h2>
        <p className="muted">{t("aspetto.lingua.intro")}</p>
        <Choice
          checked={prefs.lingua === undefined}
          name="lingua"
          note={
            lavoro === "lingua-casa"
              ? salvo
              : t("aspetto.lingua.casa.nota", { lingua: nomeDellaCasa })
          }
          onChoose={() => scegliLingua(undefined)}
          title={t("aspetto.lingua.casa.titolo")}
        />
        {lingue().map((voce) => (
          // Ogni lingua col proprio nome: chi cerca la sua non deve saperla
          // leggere in quella che ha davanti.
          <Choice
            checked={prefs.lingua === voce.codice}
            key={voce.codice}
            name="lingua"
            {...(lavoro === `lingua-${voce.codice}` ? { note: salvo } : {})}
            onChoose={() => scegliLingua(voce.codice)}
            title={voce.nome}
          />
        ))}
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">{t("aspetto.chiaro_scuro.gruppo")}</h2>
        <Choice
          checked={prefs.aspetto === "sistema"}
          name="aspetto"
          note={lavoro === "aspetto-sistema" ? salvo : t("aspetto.sistema.nota")}
          onChoose={() => scegliAspetto("sistema")}
          title={t("aspetto.sistema.titolo")}
        />
        <Choice
          checked={prefs.aspetto === "chiaro"}
          name="aspetto"
          note={lavoro === "aspetto-chiaro" ? salvo : t("aspetto.chiaro.nota")}
          onChoose={() => scegliAspetto("chiaro")}
          title={t("aspetto.chiaro.titolo")}
        />
        <Choice
          checked={prefs.aspetto === "scuro"}
          name="aspetto"
          note={lavoro === "aspetto-scuro" ? salvo : t("aspetto.scuro.nota")}
          onChoose={() => scegliAspetto("scuro")}
          title={t("aspetto.scuro.titolo")}
        />
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">{t("aspetto.contrasto.gruppo")}</h2>
        <Choice
          checked={prefs.contrasto === "normale"}
          name="contrasto"
          note={lavoro === "contrasto-normale" ? salvo : t("aspetto.contrasto.normale.nota")}
          onChoose={() => scegliContrasto("normale")}
          title={t("aspetto.contrasto.normale.titolo")}
        />
        <Choice
          checked={prefs.contrasto === "alto"}
          name="contrasto"
          note={lavoro === "contrasto-alto" ? salvo : t("aspetto.contrasto.alto.nota")}
          onChoose={() => scegliContrasto("alto")}
          title={t("aspetto.contrasto.alto.titolo")}
        />
      </div>

      <div className="card">
        <h2 className="gruppo">{t("aspetto.palette.gruppo")}</h2>
        <p className="muted">{t("aspetto.palette.intro")}</p>
        <div className="palette-grid" role="radiogroup" aria-label={t("aspetto.palette.gruppo")}>
          {CATALOGO_PALETTE.map((voce, indice) => {
            const selezionata = prefs.palette === voce;
            const inCorso = lavoro === `palette-${voce}`;

            return (
              <button
                aria-checked={selezionata}
                className={`palette-card${selezionata ? " palette-card--on" : ""}`}
                data-palette-id={voce}
                key={voce}
                onClick={() => scegliPalette(voce)}
                onKeyDown={(event) => daTastiera(event, indice)}
                ref={(elemento) => {
                  bottoni.current[indice] = elemento;
                }}
                role="radio"
                tabIndex={indice === corrente ? 0 : -1}
                type="button"
              >
                <span className="palette-card__swatches" aria-hidden="true">
                  <span className="palette-card__swatch palette-card__swatch--istanza" />
                  <span className="palette-card__swatch palette-card__swatch--rete" />
                </span>
                <span className="palette-card__title">
                  {inCorso ? salvo : t(`aspetto.palette.${voce}.titolo`)}
                </span>
                <span className="palette-card__note">{t(`aspetto.palette.${voce}.nota`)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sezione>
  );
}
