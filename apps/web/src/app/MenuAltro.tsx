import { useEffect, useState } from "react";
import type { RefObject } from "react";

import {
  applicaPreferenze,
  leggiPreferenze,
  scriviPreferenzeLocali,
  type Aspetto,
  type UiPreferences,
} from "../aspetto.js";
import { api } from "../api.js";
import { useApp } from "../state.js";
import { Choice, ListRow, Live, Sheet } from "../ui/index.js";

/**
 * Il menù «altro»: impostazioni, aspetto rapido, esci.
 *
 * Sta dietro il burger in alto a sinistra sul telefono, e dietro «Altro» in
 * fondo alla sidebar sul desktop. Non è un cassetto di navigazione primaria:
 * è ciò che non ha bisogno di un posto fisso nella barra.
 */
export function MenuAltro({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}): React.ReactElement {
  const { signOut, token, user, refreshUser } = useApp();
  const [prefs, setPrefs] = useState<UiPreferences>(() => user?.appearance ?? leggiPreferenze());
  const [lavoro, setLavoro] = useState<string | undefined>();

  useEffect(() => {
    if (user?.appearance !== undefined) {
      setPrefs(user.appearance);
      applicaPreferenze(user.appearance);
    }
  }, [user?.appearance]);

  const scegli = (prossimo: Aspetto): void => {
    const aggiornato = { ...prefs, aspetto: prossimo };
    setPrefs(aggiornato);
    scriviPreferenzeLocali(aggiornato);
    setLavoro(`aspetto-${prossimo}`);

    if (token === undefined) {
      setLavoro(undefined);
      return;
    }

    void (async () => {
      try {
        const salvato = await api.updateAppearance(token, aggiornato);
        setPrefs(salvato);
        scriviPreferenzeLocali(salvato);
        await refreshUser();
      } catch {
        const ripristino = user?.appearance ?? leggiPreferenze();
        setPrefs(ripristino);
        applicaPreferenze(ripristino);
        scriviPreferenzeLocali(ripristino);
      } finally {
        setLavoro(undefined);
      }
    })();
  };

  const esci = async (): Promise<void> => {
    onClose();

    if (token !== undefined) {
      try {
        await api.logout(token);
      } catch {
        // La sessione può essere già finita.
      }
    }

    signOut();
  };

  return (
    /*
     * `title` non è una rifinitura: senza, questo `<dialog>` non ha nome
     * accessibile, e chi lo apre con lo schermo spento sente aprirsi qualcosa
     * che non si presenta. È stato così finché nessuno l'ha ascoltato.
     */
    <Sheet anchorRef={anchorRef} onClose={onClose} open={open} title="Altro" variant="piccolo">
      <nav aria-label="Altro" className="menu-altro">
        <ListRow
          chevron={false}
          icon="settings"
          note="Presenza, dispositivi, amministrazione"
          onClick={onClose}
          title="Impostazioni"
          to="/impostazioni"
        />
      </nav>

      <div className="menu-altro__sezione">
        <h3 className="gruppo">Aspetto</h3>
        <Live>{lavoro !== undefined ? "Salvo l'aspetto…" : ""}</Live>
        <Choice
          checked={prefs.aspetto === "sistema"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={
            lavoro === "aspetto-sistema" ? "Salvo…" : "Come è impostato il telefono o il computer."
          }
          onChoose={() => scegli("sistema")}
          title="Come il sistema"
        />
        <Choice
          checked={prefs.aspetto === "chiaro"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={lavoro === "aspetto-chiaro" ? "Salvo…" : "Sfondo chiaro, anche di notte."}
          onChoose={() => scegli("chiaro")}
          title="Chiaro"
        />
        <Choice
          checked={prefs.aspetto === "scuro"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={lavoro === "aspetto-scuro" ? "Salvo…" : "Sfondo scuro, anche di giorno."}
          onChoose={() => scegli("scuro")}
          title="Scuro"
        />
        <ListRow
          chevron={false}
          icon="settings"
          note="Contrasto alto e palette"
          onClick={onClose}
          title="Altro aspetto"
          to="/impostazioni/aspetto"
        />
      </div>

      <div className="menu-altro__sezione">
        <ListRow chevron={false} icon="logout" onClick={() => void esci()} title="Esci" />
      </div>
    </Sheet>
  );
}
