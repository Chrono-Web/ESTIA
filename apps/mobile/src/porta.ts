/**
 * Porta di rete dell'app: stati espliciti, niente SDK di trasporto
 * (`ARCHITECTURE.md` §8). In questo taglio «connected» è HTTP in LAN.
 */

export const STATI_PORTA = [
  "unconfigured",
  "connecting",
  "connected",
  "degraded",
  "revoked",
  "error",
] as const;

export type StatoPorta = (typeof STATI_PORTA)[number];

export interface FattiPorta {
  /** URL dell'istanza, se qualcuno l'ha scelto. */
  url: string | undefined;
  inCorso: boolean;
  raggiungibile: boolean;
  sessioneRevocata: boolean;
  /** L'istanza risponde, ma il feed è incompleto (case spente). */
  feedIncompleto: boolean;
  erroreRete: boolean;
}

export function valutaPorta(fatti: FattiPorta): StatoPorta {
  if (fatti.url === undefined) {
    return "unconfigured";
  }

  if (fatti.inCorso) {
    return "connecting";
  }

  if (fatti.sessioneRevocata) {
    return "revoked";
  }

  if (fatti.erroreRete || !fatti.raggiungibile) {
    return "error";
  }

  if (fatti.feedIncompleto) {
    return "degraded";
  }

  return "connected";
}

export function etichettaPorta(stato: StatoPorta): string {
  switch (stato) {
    case "unconfigured":
      return "Nessuna istanza";
    case "connecting":
      return "Sto raggiungendo l'istanza…";
    case "connected":
      return "Rete locale, HTTP";
    case "degraded":
      return "Qualche casa non ha risposto";
    case "revoked":
      return "La sessione non vale più";
    case "error":
      return "Non raggiungo l'istanza";
  }
}

export function dettaglioPorta(stato: StatoPorta): string {
  switch (stato) {
    case "unconfigured":
      return "Per entrare serve l'indirizzo dell'istanza in casa, quello che si apre anche dal browser.";
    case "connecting":
      return "Un momento: sto chiedendo all'istanza se è lei.";
    case "connected":
      return "Sei sulla rete di casa. I messaggi privati cifrati arriveranno dopo: qui per ora si legge e si entra.";
    case "degraded":
      return "Questa casa risponde; altre no. Quello che manca sta sulle loro macchine, non è sparito.";
    case "revoked":
      return "Questo telefono non è più autorizzato, o la sessione è scaduta. Entra di nuovo.";
    case "error":
      return "Controlla il Wi-Fi, che il NAS sia acceso, e che l'indirizzo sia quello giusto.";
  }
}
