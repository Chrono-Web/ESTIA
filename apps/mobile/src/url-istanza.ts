/**
 * L'indirizzo dell'istanza, come lo scrive una persona e come lo usa fetch.
 *
 * Niente mDNS: si scrive l'URL (ADR 0017). Accettiamo l'IP, il nome del NAS
 * (`qualcosa.local`) o un hostname, con o senza `http://`. Togliamo il
 * percorso: l'API sta all'origine.
 */

export type EsitoUrl = { ok: true; url: string } | { ok: false; motivo: string };

const SCHEMI_VIETATI = new Set(["javascript:", "data:", "file:", "about:", "blob:"]);

export function normalizzaUrlIstanza(grezzo: string): EsitoUrl {
  const trimmed = grezzo.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      motivo: "Scrivi l'indirizzo dell'istanza, per esempio http://192.168.1.12:3000",
    };
  }

  const conSchema = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;

  try {
    parsed = new URL(conSchema);
  } catch {
    return {
      ok: false,
      motivo: "Questo non sembra un indirizzo. Serve qualcosa come 192.168.1.12:3000",
    };
  }

  if (SCHEMI_VIETATI.has(parsed.protocol)) {
    return { ok: false, motivo: "Questo non è l'indirizzo di un'istanza ESTIA." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      motivo: "L'indirizzo deve iniziare con http:// (in casa) oppure https://",
    };
  }

  if (parsed.hostname.length === 0) {
    return { ok: false, motivo: "Manca il nome o l'indirizzo del computer che ospita ESTIA." };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return {
      ok: false,
      motivo:
        "Non mettere nome utente e password nell'indirizzo: si inseriscono dopo, all'accesso.",
    };
  }

  return { ok: true, url: `${parsed.protocol}//${parsed.host}` };
}
