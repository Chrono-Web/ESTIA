/**
 * Where invite links should point.
 *
 * Prefer the URL built by the instance from the Host it saw. If that is still
 * loopback (or missing on an older build), fall back to the Vite-injected
 * API origin in development — typically the NAS on the LAN.
 */

export function isLocalOnlyHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function inviteLinkFor(code: string, joinUrl?: string): string {
  const path = `/entra?codice=${encodeURIComponent(code)}`;

  if (joinUrl !== undefined && joinUrl !== "" && !isLocalOnlyHost(hostnameOf(joinUrl))) {
    return joinUrl;
  }

  const injected =
    typeof __ESTIA_INSTANCE_ORIGIN__ === "string" ? __ESTIA_INSTANCE_ORIGIN__.trim() : "";

  if (injected !== "" && !isLocalOnlyHost(hostnameOf(injected))) {
    return `${injected.replace(/\/$/, "")}${path}`;
  }

  if (joinUrl !== undefined && joinUrl !== "") {
    return joinUrl;
  }

  return `${globalThis.location.origin}${path}`;
}
