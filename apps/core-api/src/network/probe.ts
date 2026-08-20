import type { ProbeMode } from "./settings.js";

/**
 * The measurement rig of [ADR 0018], and deliberately nothing else.
 *
 * That decision says instances will find each other by public key rather than
 * by address, and puts four verifications before any code. This is the first
 * one: does the transport work inside the instance's own image, and can two
 * real homes behind two routers actually reach each other. It carries a nonce
 * and echoes it back — no posts, no profiles, no content of any kind.
 *
 * Two properties matter more than the feature itself:
 *
 * - **it cannot break the instance.** The library is a compiled module, and a
 *   compiled module that fails to load on an architecture would otherwise take
 *   the whole instance down at the next update. It is imported lazily, inside a
 *   guard, and a failure becomes a sentence in the diagnostics.
 * - **it is off unless asked for**, because binding a socket changes the
 *   network posture of a machine sitting in somebody's home.
 * - **its identity does not move.** The endpoint is bound to a key derived from
 *   the instance's own (`deriveNetworkSecretKey`), not to one iroh draws at
 *   `bind()`. Addressing by public key means the key *is* the address: a probe
 *   that generated a fresh one every start would hand out a ticket that stopped
 *   working the first time somebody power-cycled the NAS.
 */

const ALPN = Array.from(Buffer.from("estia/prova-rete/0"));
const NONCE_BYTES = 16;

export type NetworkProbeState = "off" | "unavailable" | "ready";

export interface NetworkProbeReport {
  state: NetworkProbeState;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
  /** What it is set to, which is not the same as how it ended up. */
  mode: ProbeMode;
  /** False while the environment carries the setting: then the panel only shows it. */
  editable: boolean;
  /**
   * This instance's network identity: an ed25519 public key. Absent when off.
   *
   * Fixed for the life of the instance — see `deriveNetworkSecretKey`. Another
   * instance saves this and nothing else, so a restart may not change it.
   */
  endpointId?: string;
  /** What another instance needs to reach this one. Absent when off. */
  ticket?: string;
  /** Whether public infrastructure is in use to be found. */
  usesPublicInfrastructure?: boolean;
  /**
   * Whether the key alone is enough for another instance to get here.
   *
   * True only where discovery is running, which is `internet`. `local` binds a
   * socket and nothing else — nobody is publishing where this key lives — so
   * there the other side still needs the addresses inside the ticket.
   */
  reachableByKey?: boolean;
}

export interface ProbeResult {
  reached: boolean;
  detail: string;
  /** Round trip of the echo, application to application. */
  elapsedMs?: number;
  /** False when the packets went straight there, true when a relay carried them. */
  viaRelay?: boolean;
  /** Round trip the transport measured on the selected path. */
  pathRttMs?: number;
  remoteEndpointId?: string;
}

interface IrohModule {
  Endpoint: {
    builder: () => {
      applyMinimal: () => void;
      applyN0: () => void;
      alpns: (alpns: number[][]) => void;
      secretKey: (bytes: number[]) => void;
      bind: () => Promise<IrohEndpoint>;
    };
  };
  EndpointTicket: {
    fromAddr: (addr: unknown) => { toString: () => string };
    fromString: (value: string) => { endpointAddr: () => unknown };
  };
  EndpointId: {
    fromString: (value: string) => unknown;
  };
  EndpointAddr: new (id: unknown) => unknown;
}

interface IrohEndpoint {
  id: () => { toString: () => string };
  addr: () => unknown;
  acceptNext: () => Promise<IrohIncoming | null>;
  connect: (addr: unknown, alpn: number[]) => Promise<IrohConnection>;
  close: () => Promise<void>;
}

interface IrohIncoming {
  accept: () => Promise<{ connect: () => Promise<IrohConnection> }>;
}

interface IrohConnection {
  acceptBi: () => Promise<IrohStream>;
  openBi: () => Promise<IrohStream>;
  remoteId: () => { toString: () => string };
  paths: () => { isSelected: boolean; isRelay: boolean; rttMs: number }[];
}

interface IrohStream {
  send: { writeAll: (data: number[]) => Promise<void>; finish: () => Promise<void> };
  recv: { readToEnd: (limit: number) => Promise<number[]> };
}

/** Loads the compiled module without letting its absence stop the instance. */
async function loadIroh(): Promise<{ module?: IrohModule; reason?: string }> {
  try {
    return { module: (await import("@number0/iroh")) as unknown as IrohModule };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

export class NetworkProbe {
  /**
   * The endpoint's ed25519 secret key, 32 bytes, and the reason this class
   * cannot be constructed without one.
   *
   * iroh happily generates a key when none is given, and that default is the
   * bug: it makes the instance's identity on the network last exactly as long
   * as the process. Requiring it here means no caller can fall into it by
   * omission — the identity is decided before the socket exists.
   */
  readonly #secretKey: number[];

  #endpoint: IrohEndpoint | undefined;
  #iroh: IrohModule | undefined;
  #ticket: string | undefined;
  #endpointId: string | undefined;
  #reason: string | undefined;
  #accepting = false;

  #mode: ProbeMode = "off";
  #editable = true;

  public constructor(secretKey: Uint8Array) {
    if (secretKey.length !== 32) {
      throw new Error("The network identity must be a 32-byte ed25519 secret key.");
    }

    this.#secretKey = Array.from(secretKey);
  }

  /** Starts, stops or restarts the probe to match `mode`. Never throws. */
  public async apply(mode: ProbeMode, options?: { editable?: boolean }): Promise<void> {
    this.#editable = options?.editable ?? this.#editable;

    if (mode === this.#mode && (mode === "off" || this.#endpoint !== undefined)) {
      return;
    }

    await this.close();
    this.#mode = mode;
    this.#reason = undefined;

    if (mode === "off") {
      return;
    }

    const { module, reason } = await loadIroh();

    if (module === undefined) {
      this.#reason = reason;
      return;
    }

    try {
      const builder = module.Endpoint.builder();

      // `local` touches nothing outside the machine's own network; `internet`
      // accepts the public servers of n0 as the price of being found from
      // another house, and says so in the report.
      if (mode === "internet") {
        builder.applyN0();
      } else {
        builder.applyMinimal();
      }

      builder.alpns([ALPN]);

      // After the preset, which replays a whole configuration and would
      // otherwise be free to put a generated key back.
      builder.secretKey(this.#secretKey);

      const endpoint = await builder.bind();

      this.#iroh = module;
      this.#endpoint = endpoint;
      this.#endpointId = endpoint.id().toString();
      this.#ticket = module.EndpointTicket.fromAddr(endpoint.addr()).toString();
      this.#accepting = true;

      void this.#acceptLoop(endpoint);
    } catch (error) {
      this.#reason = error instanceof Error ? error.message : String(error);
    }
  }

  /** Echoes whatever it is sent, so the other side can measure a round trip. */
  async #acceptLoop(endpoint: IrohEndpoint): Promise<void> {
    while (this.#accepting) {
      try {
        const incoming = await endpoint.acceptNext();

        if (incoming === null) {
          return;
        }

        const connection = await (await incoming.accept()).connect();
        const stream = await connection.acceptBi();
        const received = await stream.recv.readToEnd(NONCE_BYTES);

        await stream.send.writeAll(received);
        await stream.send.finish();
      } catch {
        // A single failed handshake is not a reason to stop listening: the
        // other side may simply have gone away mid-probe.
      }
    }
  }

  public report(): NetworkProbeReport {
    if (this.#mode === "off") {
      return {
        detail:
          "La prova di rete è spenta, ed è il default: accenderla rende questa istanza raggiungibile da un'altra istanza che conosca la sua chiave pubblica, e non è una cosa che un aggiornamento debba decidere al posto di chi amministra. Serve a misurare se due istanze si trovano davvero (ADR 0018); non trasporta contenuti.",
        editable: this.#editable,
        mode: "off",
        state: "off",
      };
    }

    if (this.#endpoint === undefined) {
      return {
        detail: `La prova di rete è accesa ma il componente non è disponibile su questa macchina: ${this.#reason ?? "motivo non riportato"}. L'istanza funziona normalmente in tutto il resto.`,
        editable: this.#editable,
        mode: this.#mode,
        state: "unavailable",
      };
    }

    return {
      detail:
        this.#mode === "internet"
          ? "Questa istanza è raggiungibile **dalla sola chiave pubblica**: è l'unica cosa da dare a un'altra istanza, e non scade. Per farsi trovare usa i server pubblici di iroh, che vedono chi cerca chi ma non trasportano alcun contenuto: qui non passano contenuti affatto."
          : "Questa istanza è raggiungibile per chiave pubblica sulla rete locale, senza alcuna infrastruttura di terzi. Qui non c'è nessuna scoperta, quindi la sola chiave non basta: all'altra istanza serve il codice qui sotto, che contiene anche gli indirizzi.",
      editable: this.#editable,
      endpointId: this.#endpointId ?? "",
      mode: this.#mode,
      reachableByKey: this.#mode === "internet",
      state: "ready",
      ticket: this.#ticket ?? "",
      usesPublicInfrastructure: this.#mode === "internet",
    };
  }

  /**
   * What the other instance has to be given, and the reason there are two
   * answers instead of one.
   *
   * **The key is the answer that counts.** It is the whole of what ADR 0018
   * asks a person to exchange — it does not expire, it does not say where
   * anybody lives, and it is the same key tomorrow. Resolving it into a route
   * is discovery's job, and discovery only runs on `internet`.
   *
   * The ticket stays for `local`, which binds a socket and publishes nothing:
   * there nobody can look a key up, so the addresses have to travel with it.
   * Offering the ticket everywhere would be simpler and would teach the wrong
   * habit — a code that goes stale is exactly what the fixed key replaced.
   */
  #resolve(iroh: IrohModule, target: string): { addr?: unknown; error?: string } {
    try {
      const id = iroh.EndpointId.fromString(target);

      if (this.#mode !== "internet") {
        return {
          error:
            "Questa è una chiave pubblica, ma la prova di rete è su «local», dove non esiste alcuna scoperta: nessuno può dire dove abiti quella chiave. Passa a «internet», oppure fatti dare il codice lungo dell'altra istanza, che porta con sé anche gli indirizzi.",
        };
      }

      return { addr: new iroh.EndpointAddr(id) };
    } catch {
      // Not a key. The only other thing worth trying is a ticket.
    }

    try {
      return { addr: iroh.EndpointTicket.fromString(target).endpointAddr() };
    } catch {
      return {
        error:
          "Non è né una chiave pubblica né un codice di un'altra istanza. La chiave è la riga corta che l'altra istanza mostra nel proprio pannello.",
      };
    }
  }

  /**
   * Reaches another instance and reports how, or why not.
   *
   * `target` is the other instance's **public key**; a ticket is also accepted,
   * for `local` where there is nothing to look a key up with.
   */
  public async probe(target: string, now: () => number = Date.now): Promise<ProbeResult> {
    const endpoint = this.#endpoint;
    const iroh = this.#iroh;

    if (endpoint === undefined || iroh === undefined) {
      return {
        detail:
          "La prova di rete non è attiva su questa istanza: si accende con ESTIA_NETWORK_PROBE.",
        reached: false,
      };
    }

    const resolved = this.#resolve(iroh, target.trim());

    if (resolved.error !== undefined) {
      return { detail: resolved.error, reached: false };
    }

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
    const startedAt = now();

    try {
      const connection = await endpoint.connect(resolved.addr, ALPN);
      const stream = await connection.openBi();

      await stream.send.writeAll(nonce);
      await stream.send.finish();

      const echoed = await stream.recv.readToEnd(NONCE_BYTES);
      const elapsedMs = now() - startedAt;

      if (echoed.length !== nonce.length || echoed.some((byte, index) => byte !== nonce[index])) {
        return {
          detail: "L'altra istanza ha risposto qualcosa di diverso da ciò che le è stato mandato.",
          elapsedMs,
          reached: false,
        };
      }

      const selected = connection.paths().find((path) => path.isSelected);

      return {
        detail:
          selected?.isRelay === true
            ? "Raggiunta, ma attraverso un relay: il collegamento diretto non è riuscito."
            : "Raggiunta per collegamento diretto, senza intermediari.",
        elapsedMs,
        reached: true,
        remoteEndpointId: connection.remoteId().toString(),
        ...(selected === undefined
          ? {}
          : { pathRttMs: selected.rttMs, viaRelay: selected.isRelay }),
      };
    } catch (error) {
      return {
        detail: `Non raggiunta: ${error instanceof Error ? error.message : String(error)}`,
        reached: false,
      };
    }
  }

  public async close(): Promise<void> {
    this.#accepting = false;

    if (this.#endpoint !== undefined) {
      await this.#endpoint.close();
      this.#endpoint = undefined;
    }
  }
}
