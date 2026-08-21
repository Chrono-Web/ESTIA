import { useState } from "react";

import { inviteLinkFor, isLocalOnlyHost } from "../invite-link.js";
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
          Ecco il link da mandare. Compare <strong>solo adesso</strong>: l&apos;istanza ne conserva
          un&apos;impronta, non il codice.
        </p>
        <div className="cluster">
          <input className="input grow" id="invito-link" readOnly value={link} />
          <Button onClick={() => void copy()}>{copied ? "Copiato" : "Copia"}</Button>
        </div>
        <p className="field__hint">
          Chi lo riceve apre il link, sceglie un nome e chiede di entrare. Poi tocca a te aprirgli
          la porta: avere un invito non fa entrare nessuno da solo.
        </p>
      </Alert>

      {/* Detto qui perché è qui che si scopre: un link a localhost sembra
          funzionare a chi lo manda e non si apre a nessun altro. */}
      {localOnly && (
        <Alert tone="error">
          Questo link punta a <strong>{host || "questo computer"}</strong>, raggiungibile solo da
          qui. Raggiungi l&apos;istanza dall&apos;indirizzo che ha sulla rete di casa — quello che
          vedi nel pannello del NAS — e crea di nuovo l&apos;invito da lì.
        </Alert>
      )}
    </>
  );
}
