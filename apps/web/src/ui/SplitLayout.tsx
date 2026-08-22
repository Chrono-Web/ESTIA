import type { ReactElement, ReactNode } from "react";

export interface SplitLayoutProps {
  nav: ReactNode;
  detail: ReactNode;
  /** True se siamo sulla vista "nav" (su mobile mostra solo la nav, su desktop non cambia) */
  showNav: boolean;
  navLabel?: string;
  detailEmpty?: ReactNode;
  /** Classi extra per il nav container (es. per togliere padding) */
  navClassName?: string;
  /** Classi extra per il detail container (es. per togliere padding o overflow) */
  detailClassName?: string;
}

/**
 * Guscio modulare: lista a sinistra, dettaglio a destra.
 *
 * Sul telefono una cosa sola è visibile per volta (controllato da showNav).
 * Sul desktop restano tutte e due. L'altezza è quella dello spazio utile:
 * scorre il pannello interno, non la pagina.
 */
export function SplitLayout({
  nav,
  detail,
  showNav,
  navLabel,
  detailEmpty,
  navClassName = "",
  detailClassName = "",
}: SplitLayoutProps): ReactElement {
  return (
    <main className={`split-layout${showNav ? " split-layout--nav" : " split-layout--detail"}`}>
      <div className="split-layout__panel split-layout__shell">
        <aside
          aria-label={navLabel ?? "Navigazione laterale"}
          className={`split-layout__nav ${navClassName}`}
        >
          {nav}
        </aside>
        <div className={`split-layout__detail ${detailClassName}`}>
          {showNav && detailEmpty ? (
            <div className="split-layout__detail-empty">{detailEmpty}</div>
          ) : (
            detail
          )}
        </div>
      </div>
    </main>
  );
}
