import type { Aspetto as AspettoValore, Contrasto, Palette, UiPreferences } from "@estia/contracts";
import { useEffect, useRef, useState } from "react";

import { api } from "../../api.js";
import { CATALOGO_PALETTE, applicaPreferenze, scriviPreferenzeLocali } from "../../aspetto.js";
import { spiega } from "../../errori.js";
import { useSignedIn } from "../../state.js";
import { Alert, Choice, Live } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * Come vedi ESTIA: chiaro/scuro, contrasto, palette a catalogo (ADR 0024).
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
      setNota("Salvato.");
    } catch (causa) {
      if (ultima.current !== mia) {
        return;
      }

      setErrore(spiega(causa, "Non sono riuscito a salvare l'aspetto. Riprova."));
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

  const scegliAspetto = (aspetto: AspettoValore): void => {
    void salva({ ...prefs, aspetto }, `aspetto-${aspetto}`);
  };

  const scegliContrasto = (contrasto: Contrasto): void => {
    void salva({ ...prefs, contrasto }, `contrasto-${contrasto}`);
  };

  const scegliPalette = (palette: Palette): void => {
    void salva({ ...prefs, palette }, `palette-${palette}`);
  };

  const seleziona = CATALOGO_PALETTE.findIndex((voce) => voce.id === prefs.palette);
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
      scegliPalette(voce.id);
    }
  };

  const durante =
    lavoro === undefined
      ? undefined
      : lavoro.startsWith("palette-")
        ? "Salvo la palette…"
        : "Salvo l'aspetto…";

  return (
    <Sezione titolo="Aspetto">
      {errore !== undefined ? <Alert tone="error">{errore}</Alert> : null}
      <Live>{durante ?? nota ?? ""}</Live>

      <div className="card">
        <p className="muted">
          Solo per te, su ogni dispositivo in cui entri. Non cambia come ti vedono gli altri e non è
          un tema dell&apos;istanza.
        </p>
        {nota !== undefined && errore === undefined && lavoro === undefined ? (
          <p className="muted">{nota}</p>
        ) : null}
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Chiaro o scuro</h2>
        <Choice
          checked={prefs.aspetto === "sistema"}
          name="aspetto"
          note={
            lavoro === "aspetto-sistema" ? "Salvo…" : "Come è impostato il telefono o il computer."
          }
          onChoose={() => scegliAspetto("sistema")}
          title="Come il sistema"
        />
        <Choice
          checked={prefs.aspetto === "chiaro"}
          name="aspetto"
          note={lavoro === "aspetto-chiaro" ? "Salvo…" : "Sfondo chiaro, anche di notte."}
          onChoose={() => scegliAspetto("chiaro")}
          title="Chiaro"
        />
        <Choice
          checked={prefs.aspetto === "scuro"}
          name="aspetto"
          note={lavoro === "aspetto-scuro" ? "Salvo…" : "Sfondo scuro, anche di giorno."}
          onChoose={() => scegliAspetto("scuro")}
          title="Scuro"
        />
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Contrasto</h2>
        <Choice
          checked={prefs.contrasto === "normale"}
          name="contrasto"
          note={lavoro === "contrasto-normale" ? "Salvo…" : "Bordi e testo come di consueto."}
          onChoose={() => scegliContrasto("normale")}
          title="Normale"
        />
        <Choice
          checked={prefs.contrasto === "alto"}
          name="contrasto"
          note={
            lavoro === "contrasto-alto"
              ? "Salvo…"
              : "Bordi più forti, testo più netto — come nelle app accessibili."
          }
          onChoose={() => scegliContrasto("alto")}
          title="Alto"
        />
      </div>

      <div className="card">
        <h2 className="gruppo">Palette</h2>
        <p className="muted">
          Ogni scelta è una coppia già contrastata: un colore per l&apos;istanza e uno per la rete.
          Non si mischiano.
        </p>
        <div className="palette-grid" role="radiogroup" aria-label="Palette">
          {CATALOGO_PALETTE.map((voce, indice) => {
            const selezionata = prefs.palette === voce.id;
            const inCorso = lavoro === `palette-${voce.id}`;

            return (
              <button
                aria-checked={selezionata}
                className={`palette-card${selezionata ? " palette-card--on" : ""}`}
                data-palette-id={voce.id}
                key={voce.id}
                onClick={() => scegliPalette(voce.id)}
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
                <span className="palette-card__title">{inCorso ? "Salvo…" : voce.titolo}</span>
                <span className="palette-card__note">{voce.nota}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sezione>
  );
}
