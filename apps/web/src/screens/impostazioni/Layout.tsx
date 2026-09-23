import { t } from "../../i18n/index.js";
import { SplitLayout } from "../../ui/index.js";

import { Outlet, useLocation } from "react-router-dom";

import { SettingsNav } from "./Hub.js";

/**
 * Guscio delle impostazioni: lista a sinistra, dettaglio a destra.
 *
 * Sul telefono una cosa sola è visibile per volta (lista oppure sezione).
 * Sul desktop restano tutte e due. L'altezza è quella dello spazio utile:
 * scorre il pannello, non la pagina.
 */
export function ImpostazioniLayout(): React.ReactElement {
  const { pathname } = useLocation();
  const hub = pathname === "/impostazioni" || pathname === "/impostazioni/";

  return (
    <SplitLayout
      detail={<Outlet />}
      detailEmpty={t("sections.empty_detail")}
      nav={<SettingsNav />}
      navLabel={t("sections.nav_label")}
      showNav={hub}
    />
  );
}
