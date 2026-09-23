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
import { t } from "../i18n/index.js";
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
    <Sheet
      anchorRef={anchorRef}
      onClose={onClose}
      open={open}
      title={t("nav.more.title")}
      variant="piccolo"
    >
      <nav aria-label={t("nav.more.title")} className="menu-altro">
        <ListRow
          chevron={false}
          icon="settings"
          note={t("nav.more.settings_note")}
          onClick={onClose}
          title={t("nav.destination.settings")}
          to="/impostazioni"
        />
      </nav>

      <div className="menu-altro__sezione">
        <h3 className="gruppo">{t("nav.more.appearance.title")}</h3>
        <Live>{lavoro !== undefined ? t("nav.more.appearance.saving") : ""}</Live>
        <Choice
          checked={prefs.aspetto === "sistema"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={
            lavoro === "aspetto-sistema"
              ? t("nav.more.appearance.saving_short")
              : t("nav.more.appearance.system_note")
          }
          onChoose={() => scegli("sistema")}
          title={t("nav.more.appearance.system")}
        />
        <Choice
          checked={prefs.aspetto === "chiaro"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={
            lavoro === "aspetto-chiaro"
              ? t("nav.more.appearance.saving_short")
              : t("nav.more.appearance.light_note")
          }
          onChoose={() => scegli("chiaro")}
          title={t("nav.more.appearance.light")}
        />
        <Choice
          checked={prefs.aspetto === "scuro"}
          disabled={lavoro !== undefined}
          name="aspetto"
          note={
            lavoro === "aspetto-scuro"
              ? t("nav.more.appearance.saving_short")
              : t("nav.more.appearance.dark_note")
          }
          onChoose={() => scegli("scuro")}
          title={t("nav.more.appearance.dark")}
        />
        <ListRow
          chevron={false}
          icon="settings"
          note={t("nav.more.appearance.more_note")}
          onClick={onClose}
          title={t("nav.more.appearance.more")}
          to="/impostazioni/aspetto"
        />
      </div>

      <div className="menu-altro__sezione">
        <ListRow
          chevron={false}
          icon="logout"
          onClick={() => void esci()}
          title={t("nav.more.sign_out")}
        />
      </div>
    </Sheet>
  );
}
