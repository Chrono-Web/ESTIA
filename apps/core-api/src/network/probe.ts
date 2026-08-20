import type { AlpnService, InstanceEndpoint, IrohConnection } from "../federation/endpoint.js";

import type { ProbeMode } from "./settings.js";

/**
 * The measurement rig of [ADR 0018], and deliberately nothing else.
 *
 * It answered the question that decision put before any code — can two real
 * homes behind two routers reach each other by public key — and the answer
 * arrived on 2026-08-20: yes, five times, always through a relay. It carries a
 * nonce and echoes it back. No posts, no profiles, no content of any kind.
 *
 * **It no longer owns the socket.** Since the protocol of [ADR 0021] exists,
 * the instance binds one endpoint for its one key and both live on it, each on
 * its own ALPN — see `InstanceEndpoint`. The probe kept a separate ALPN because
 * a measurement and a protocol must not be mistakable for one another, least of
 * all by a remote instance.
 *
 * Two properties still hold, and are why it can ship turned on in `latest`:
 *
 * - **it cannot break the instance.** The library is a compiled module, loaded
 *   inside a guard; a failure becomes a sentence in the diagnostics.
 * - **it is off unless asked for**, because binding a socket changes the
 *   network posture of a machine sitting in somebody's home.
 */

export const PROBE_ALPN = "estia/prova-rete/0";

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
  /** Whether the key alone is enough for another instance to get here. */
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

export class NetworkProbe implements AlpnService {
  public readonly alpn = PROBE_ALPN;

  readonly #endpoint: InstanceEndpoint;

  #mode: ProbeMode = "off";
  #editable = true;

  public constructor(endpoint: InstanceEndpoint) {
    this.#endpoint = endpoint;
  }

  /** Starts, stops or restarts the shared endpoint to match `mode`. Never throws. */
  public async apply(mode: ProbeMode, options?: { editable?: boolean }): Promise<void> {
    this.#editable = options?.editable ?? this.#editable;
    this.#mode = mode;

    if (mode === "off") {
      await this.#endpoint.close();

      return;
    }

    await this.#endpoint.open(mode);
  }

  /** Echoes whatever it is sent, so the other side can measure a round trip. */
  public async serve(connection: IrohConnection): Promise<void> {
    const stream = await connection.acceptBi();
    const received = await stream.recv.readToEnd(NONCE_BYTES);

    await stream.send.writeAll(received);
    await stream.send.finish();
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

    if (!this.#endpoint.isOpen) {
      return {
        detail: `La prova di rete è accesa ma il componente non è disponibile su questa macchina: ${this.#endpoint.unavailableReason ?? "motivo non riportato"}. L'istanza funziona normalmente in tutto il resto.`,
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
      endpointId: this.#endpoint.endpointId ?? "",
      mode: this.#mode,
      reachableByKey: this.#endpoint.reachableByKey,
      state: "ready",
      ticket: this.#endpoint.ticket ?? "",
      usesPublicInfrastructure: this.#mode === "internet",
    };
  }

  /**
   * Reaches another instance and reports how, or why not.
   *
   * `target` is the other instance's **public key**; a ticket is also accepted,
   * for `local` where there is nothing to look a key up with.
   */
  public async probe(target: string, now: () => number = Date.now): Promise<ProbeResult> {
    if (this.#mode === "off" || !this.#endpoint.isOpen) {
      return {
        detail:
          "La prova di rete non è attiva su questa istanza: si accende con ESTIA_NETWORK_PROBE.",
        reached: false,
      };
    }

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
    const startedAt = now();

    try {
      const connection = await this.#endpoint.connect(target, PROBE_ALPN);
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
    await this.#endpoint.close();
  }
}
