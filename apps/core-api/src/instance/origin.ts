/**
 * Where a connection is arriving from, as the instance can actually tell.
 *
 * The whole security model rests on one sentence in SECURITY_BASELINE §5:
 * «l'istanza non è raggiungibile da Internet — coperto per costruzione». That is
 * an assumption about how somebody set up their router, and assumptions about
 * other people's routers are exactly the kind that break quietly. From M4 the
 * instance also becomes reachable through a transport (ADR 0004), so «not the
 * local network» stops meaning «impossible» and starts meaning «tell me which».
 *
 * What is classified is the **peer address of the socket**, never a header: a
 * header is something the caller writes, and would let anyone claim to be
 * local.
 *
 * And what `public` means is narrower than it looks. Measured 2026-08-17: a
 * request published through a port on Docker Desktop arrives from a genuinely
 * public address, with nothing exposed to anybody — the runtime's own
 * forwarding produces it. So a public peer means «not from the home network and
 * not from the transport», which *may* be exposure and may be a proxy in
 * between. The instance says which of the two it cannot tell, rather than
 * announcing a breach it has not established.
 */

export type ConnectionOrigin = "loopback" | "local" | "overlay" | "public";

/** No address is ever stored — only which of the four kinds it was. */
export interface OriginSighting {
  origin: ConnectionOrigin;
  count: number;
  lastAt: string;
}

function ipv4Parts(address: string): number[] | undefined {
  // `::ffff:192.168.1.5` is how an IPv4 peer looks on a dual-stack socket.
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = plain.split(".");

  if (parts.length !== 4) {
    return undefined;
  }

  const numbers = parts.map((part) => Number(part));

  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? numbers : undefined;
}

export function classifyAddress(address: string): ConnectionOrigin {
  const normalised = address.trim().toLowerCase();
  const v4 = ipv4Parts(normalised);

  if (v4 === undefined) {
    if (normalised === "::1" || normalised === "::") {
      return "loopback";
    }

    // Unique local (fc00::/7) and link-local (fe80::/10): a home network.
    if (/^f[cd]/.test(normalised) || normalised.startsWith("fe8") || normalised.startsWith("fe9")) {
      return "local";
    }

    return "public";
  }

  const [a = 0, b = 0] = v4;

  if (a === 127) {
    return "loopback";
  }

  // 100.64.0.0/10 — the shared address space a mesh VPN hands out, and also
  // what an ISP uses for carrier-grade NAT. Called `overlay` rather than
  // `tailscale` because from here the two look identical, and claiming to know
  // which would be claiming more than the socket says.
  if (a === 100 && b >= 64 && b <= 127) {
    return "overlay";
  }

  if (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  ) {
    return "local";
  }

  return "public";
}

/**
 * What the instance has seen since it started.
 *
 * Deliberately forgetful: it keeps four counters and four timestamps, and no
 * addresses at all. Knowing that somebody connected from outside is the
 * administrator's business; knowing from which address, and therefore roughly
 * from where, is nobody's — SECURITY_BASELINE §7 keeps this kind of thing out
 * of the logs and there is no reason to build it a home in the database.
 */
export class ConnectionOriginLog {
  readonly #seen = new Map<ConnectionOrigin, { count: number; lastAt: Date }>();

  public record(address: string, at: Date): ConnectionOrigin {
    const origin = classifyAddress(address);
    const previous = this.#seen.get(origin);

    this.#seen.set(origin, { count: (previous?.count ?? 0) + 1, lastAt: at });

    return origin;
  }

  /** True the first time a kind is seen, so a caller can say it once. */
  public isFirst(origin: ConnectionOrigin): boolean {
    return this.#seen.get(origin)?.count === 1;
  }

  public summary(): OriginSighting[] {
    return [...this.#seen.entries()]
      .map(([origin, seen]) => ({
        count: seen.count,
        lastAt: seen.lastAt.toISOString(),
        origin,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
