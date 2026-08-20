import { useState } from "react";

import { Alert, Button } from "../ui/index.js";

/**
 * The link an administrator actually sends to somebody.
 *
 * The join screen has accepted `?codice=…` since M1.4, but the panel only ever
 * showed the bare code — so sharing an invite meant knowing the instance's
 * address and assembling a URL by hand. That is a technical step standing
 * between two people, which is what PRODUCT_VISION §4 budgets at zero.
 *
 * The address comes from the page itself: whatever the administrator typed to
 * get here is, by construction, an address that works on this network.
 */

export interface InviteLinkProps {
  code: string;
}

/** Reachable only from the machine it runs on, so useless to send to anybody. */
function isLocalOnly(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function InviteLink({ code }: InviteLinkProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const link = `${globalThis.location.origin}/entra?codice=${encodeURIComponent(code)}`;
  const localOnly = isLocalOnly(globalThis.location.hostname);

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
          Stai guardando l&apos;istanza da <strong>{globalThis.location.hostname}</strong>, che vuol
          dire «questo computer». Questo link non si aprirà a nessun altro. Raggiungi l&apos;istanza
          dall&apos;indirizzo che ha sulla rete di casa — quello che vedi nel pannello del NAS — e
          crea l&apos;invito da lì.
        </Alert>
      )}
    </>
  );
}
