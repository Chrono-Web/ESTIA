import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useMatch, useNavigate } from "react-router-dom";

import { Icon, IconButton } from "../ui/index.js";
import { MenuAltro } from "./MenuAltro.js";
import { ModeSwitch } from "./ModeSwitch.js";
import { useThreadBack } from "./thread-nav.js";

/**
 * La barra in alto.
 *
 * Sul feed: menu · lente · cerca.
 * Sulla pagina di un post: indietro · lente bloccata · menu (niente cerca).
 * Nelle impostazioni: menu · (niente lente) · cerca — la lente non decide
 * niente qui, e un colore di modalità confonderebbe.
 * Indietro sale nel thread (commento → padre → post → feed), non nella storia.
 */
export function TopBar(): React.ReactElement {
  const [menu, setMenu] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const matchPost = useMatch("/p/:id");
  const matchCommento = useMatch("/p/:id/c/:commentId");
  const suPost = matchPost !== null || matchCommento !== null;
  const { pathname } = useLocation();
  const inImpostazioni = pathname.startsWith("/impostazioni");
  const navigate = useNavigate();
  const threadBack = useThreadBack();

  const indietro = useCallback(() => {
    if (threadBack !== null) {
      threadBack();
      return;
    }

    void navigate("/");
  }, [navigate, threadBack]);

  return (
    <>
      <header
        className={
          suPost ? "topbar topbar--post" : inImpostazioni ? "topbar topbar--impostazioni" : "topbar"
        }
      >
        <div className="topbar__lato topbar__lato--start">
          {suPost ? (
            <IconButton
              icon="arrow-left"
              label={matchCommento !== null ? "Commento precedente" : "Torna al feed"}
              onClick={indietro}
            />
          ) : (
            <IconButton icon="menu" label="Menu" onClick={() => setMenu(true)} ref={menuAnchor} />
          )}
        </div>

        <div className="topbar__centro">
          {!inImpostazioni && <ModeSwitch bloccato={suPost} compatto />}
        </div>

        <div className="topbar__lato topbar__lato--end">
          {suPost ? (
            <IconButton icon="menu" label="Menu" onClick={() => setMenu(true)} ref={menuAnchor} />
          ) : (
            <Link aria-label="Cerca" className="btn btn--icon" to="/cerca">
              <Icon name="search" size={22} />
            </Link>
          )}
        </div>
      </header>

      <MenuAltro anchorRef={menuAnchor} onClose={() => setMenu(false)} open={menu} />
    </>
  );
}
