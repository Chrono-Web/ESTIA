import { useState } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";

import { Icon, IconButton } from "../ui/index.js";
import { MenuAltro } from "./MenuAltro.js";
import { ModeSwitch } from "./ModeSwitch.js";

/**
 * La barra in alto.
 *
 * Sul feed: menu · lente · cerca.
 * Sulla pagina di un post: indietro · lente bloccata · menu (niente cerca),
 * come Threads scambia i pulsanti quando si apre un thread.
 */
export function TopBar(): React.ReactElement {
  const [menu, setMenu] = useState(false);
  const suPost = useMatch("/p/:id") !== null;
  const navigate = useNavigate();

  return (
    <>
      <header className={suPost ? "topbar topbar--post" : "topbar"}>
        <div className="topbar__lato topbar__lato--start">
          {suPost ? (
            <IconButton
              icon="arrow-left"
              label="Torna al feed"
              onClick={() => {
                if (window.history.length > 1) {
                  void navigate(-1);
                  return;
                }

                void navigate("/");
              }}
            />
          ) : (
            <IconButton icon="menu" label="Menu" onClick={() => setMenu(true)} />
          )}
        </div>

        <div className="topbar__centro">
          <ModeSwitch bloccato={suPost} compatto />
        </div>

        <div className="topbar__lato topbar__lato--end">
          {suPost ? (
            <IconButton icon="menu" label="Menu" onClick={() => setMenu(true)} />
          ) : (
            <Link aria-label="Cerca" className="btn btn--icon" to="/cerca">
              <Icon name="search" size={22} />
            </Link>
          )}
        </div>
      </header>

      <MenuAltro onClose={() => setMenu(false)} open={menu} />
    </>
  );
}
