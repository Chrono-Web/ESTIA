import type { Aspetto, Contrasto, Palette, UiPreferences } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import {
  CATALOGO_PALETTE,
  applicaPreferenze,
  leggiPreferenze,
  scriviPreferenzeLocali,
} from "../../aspetto.js";
import { useSignedIn } from "../../state.js";
import { Alert, Choice } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * Come vedi ESTIA: chiaro/scuro, contrasto, palette a catalogo (ADR 0024).
 *
 * Non è il profilo pubblico e non è un'impostazione dell'istanza. Ogni scelta
 * dice lo stato mentre lavora e l'esito a fine (euristica 1 e 9).
 */
export function Aspetto(): React.ReactElement {
  const { token, user, refreshUser } = useSignedIn();
  const [prefs, setPrefs] = useState<UiPreferences>(() => user.appearance ?? leggiPreferenze());
  const [lavoro, setLavoro] = useState<string | undefined>();
  const [nota, setNota] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  useEffect(() => {
    setPrefs(user.appearance);
    applicaPreferenze(user.appearance);
  }, [user.appearance]);

  const salva = async (prossimo: UiPreferences, id: string): Promise<void> => {
    setErrore(undefined);
    setNota(undefined);
    setLavoro(id);
    setPrefs(prossimo);
    applicaPreferenze(prossimo);
    scriviPreferenzeLocali(prossimo);

    try {
      const salvato = await api.updateAppearance(token, prossimo);
      setPrefs(salvato);
      scriviPreferenzeLocali(salvato);
      await refreshUser();
      setNota("Salvato.");
    } catch {
      setErrore("Non sono riuscito a salvare l'aspetto. Riprova.");
      const ripristino = user.appearance;
      setPrefs(ripristino);
      applicaPreferenze(ripristino);
      scriviPreferenzeLocali(ripristino);
    } finally {
      setLavoro(undefined);
    }
  };

  const scegliAspetto = (aspetto: Aspetto): void => {
    void salva({ ...prefs, aspetto }, `aspetto-${aspetto}`);
  };

  const scegliContrasto = (contrasto: Contrasto): void => {
    void salva({ ...prefs, contrasto }, `contrasto-${contrasto}`);
  };

  const scegliPalette = (palette: Palette): void => {
    void salva({ ...prefs, palette }, `palette-${palette}`);
  };

  const busy = lavoro !== undefined;

  return (
    <Sezione titolo="Aspetto">
      <p className="muted">
        Solo per te, su ogni dispositivo in cui entri. Non cambia come ti vedono gli altri e non è
        un tema dell&apos;istanza.
      </p>

      {errore !== undefined ? <Alert tone="error">{errore}</Alert> : null}
      <p aria-live="polite" className="only-screen-reader">
        {busy ? "Salvo l'aspetto…" : (nota ?? "")}
      </p>
      {nota !== undefined && errore === undefined && !busy ? <p className="muted">{nota}</p> : null}

      <h3 className="gruppo">Chiaro o scuro</h3>
      <Choice
        checked={prefs.aspetto === "sistema"}
        disabled={busy}
        name="aspetto"
        note={
          lavoro === "aspetto-sistema" ? "Salvo…" : "Come è impostato il telefono o il computer."
        }
        onChoose={() => scegliAspetto("sistema")}
        title="Come il sistema"
      />
      <Choice
        checked={prefs.aspetto === "chiaro"}
        disabled={busy}
        name="aspetto"
        note={lavoro === "aspetto-chiaro" ? "Salvo…" : "Sfondo chiaro, anche di notte."}
        onChoose={() => scegliAspetto("chiaro")}
        title="Chiaro"
      />
      <Choice
        checked={prefs.aspetto === "scuro"}
        disabled={busy}
        name="aspetto"
        note={lavoro === "aspetto-scuro" ? "Salvo…" : "Sfondo scuro, anche di giorno."}
        onChoose={() => scegliAspetto("scuro")}
        title="Scuro"
      />

      <h3 className="gruppo">Contrasto</h3>
      <Choice
        checked={prefs.contrasto === "normale"}
        disabled={busy}
        name="contrasto"
        note={lavoro === "contrasto-normale" ? "Salvo…" : "Bordi e testo come di consueto."}
        onChoose={() => scegliContrasto("normale")}
        title="Normale"
      />
      <Choice
        checked={prefs.contrasto === "alto"}
        disabled={busy}
        name="contrasto"
        note={
          lavoro === "contrasto-alto"
            ? "Salvo…"
            : "Bordi più forti, testo più netto — come nelle app accessibili."
        }
        onChoose={() => scegliContrasto("alto")}
        title="Alto"
      />

      <h3 className="gruppo">Palette</h3>
      <p className="muted">
        Ogni scelta è una coppia già contrastata: un colore per l&apos;istanza e uno per la rete.
        Non si mischiano.
      </p>
      <div className="palette-grid" role="radiogroup" aria-label="Palette">
        {CATALOGO_PALETTE.map((voce) => {
          const selezionata = prefs.palette === voce.id;
          const inCorso = lavoro === `palette-${voce.id}`;

          return (
            <button
              aria-checked={selezionata}
              className={`palette-card${selezionata ? " palette-card--on" : ""}`}
              disabled={busy}
              key={voce.id}
              onClick={() => scegliPalette(voce.id)}
              role="radio"
              type="button"
            >
              <span className="palette-card__swatches" aria-hidden="true">
                <span className="palette-card__swatch" style={{ background: voce.istanza }} />
                <span className="palette-card__swatch" style={{ background: voce.rete }} />
              </span>
              <span className="palette-card__title">{inCorso ? "Salvo…" : voce.titolo}</span>
              <span className="palette-card__note">{voce.nota}</span>
            </button>
          );
        })}
      </div>
    </Sezione>
  );
}
