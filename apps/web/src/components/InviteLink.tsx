import { useState } from "react";

import { inviteLinkFor, isLocalOnlyHost } from "../invite-link.js";
import { useT } from "../lingua.js";
import { Alert, Button } from "../ui/index.js";

/**
 * The link an administrator actually sends to somebody.
 *
 * Prefer `joinUrl` from the API (Host seen by the instance). In Vite against a
 * remote NAS, fall back to the proxied instance origin so the link is usable
 * on the LAN even when the admin UI is on 127.0.0.1.
 */

export interface InviteLinkProps {
  code: string;
  /** Full URL from the instance; preferred over the browser origin. */
  joinUrl?: string;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function InviteLink({ code, joinUrl }: InviteLinkProps): React.ReactElement {
  const { t, tc } = useT();
  const [copied, setCopied] = useState(false);
  const link = inviteLinkFor(code, joinUrl);
  const host = hostnameOf(link);
  const localOnly = isLocalOnlyHost(host);

  const copy = async (): Promise<void> => {
    try {
      // Only available in a secure context, which plain HTTP on a LAN is not —
      // hence the fallback, and hence the field being selectable anyway.
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      const field = document.getElementById("invito-link");

      if (field instanceof HTMLInputElement) {
        field.select();
      }
    }
  };

  return (
    <>
      <Alert tone="ok">
        <p>
          {tc("invito.link.testo", {
            solo_adesso: <strong>{t("invito.link.solo_adesso")}</strong>,
          })}
        </p>
        <div className="cluster">
          <input className="input grow" id="invito-link" readOnly value={link} />
          <Button onClick={() => void copy()}>
            {copied ? t("comune.copiato_breve") : t("comune.copia")}
          </Button>
        </div>
        <p className="field__hint">{t("invito.link.poi")}</p>
      </Alert>

      {/* Detto qui perché è qui che si scopre: un link a localhost sembra
          funzionare a chi lo manda e non si apre a nessun altro. */}
      {localOnly && (
        <Alert tone="error">
          {tc("invito.link.locale", {
            host: <strong>{host || t("invito.link.questo_computer")}</strong>,
          })}
        </Alert>
      )}
    </>
  );
}
