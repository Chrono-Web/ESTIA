import { useState } from "react";

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
    <div className="alert ok">
      Ecco il link da mandare. Compare <strong>solo adesso</strong>: l'istanza ne conserva
      un'impronta, non il codice.
      <div className="actions spaced">
        <input className="grow-input" id="invito-link" readOnly value={link} />
        <button onClick={() => void copy()} type="button">
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
      <span className="hint">
        Chi lo riceve apre il link, sceglie un nome e chiede di entrare. Poi tocca a te aprirgli la
        porta: avere un invito non fa entrare nessuno da solo.
      </span>
      {/* Detto qui perché è qui che si scopre: un link a localhost sembra
          funzionare a chi lo manda e non si apre a nessun altro. */}
      {localOnly && (
        <div className="alert error">
          Stai guardando l'istanza da <strong>{globalThis.location.hostname}</strong>, che vuol dire
          «questo computer». Questo link non si aprirà a nessun altro. Raggiungi l'istanza
          dall'indirizzo che ha sulla rete di casa — quello che vedi nel pannello del NAS — e crea
          l'invito da lì.
        </div>
      )}
    </div>
  );
}
