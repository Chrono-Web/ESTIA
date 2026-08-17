import { loadConfig, type AppConfig } from "@estia/config";
import type { AdminDiagnostics, ConnectionView } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { classifyAddress, ConnectionOriginLog } from "./origin.js";

/**
 * The whole threat model rests on SECURITY_BASELINE §5: this instance is not
 * reachable from the Internet, «coperto per costruzione». From M4 it also
 * becomes reachable through a transport (ADR 0004), so the instance has to be
 * able to tell which of the two is happening.
 */

describe("telling where a connection comes from", () => {
  it("knows the home network in all the shapes it takes", () => {
    for (const address of ["192.168.1.42", "10.0.0.7", "172.16.5.1", "172.31.255.254"]) {
      expect({ address, origin: classifyAddress(address) }).toEqual({ address, origin: "local" });
    }
  });

  /** 172.32 is public; the /12 boundary is the classic place to get this wrong. */
  it("does not stretch the 172.16/12 block", () => {
    expect(classifyAddress("172.15.0.1")).toBe("public");
    expect(classifyAddress("172.32.0.1")).toBe("public");
  });

  it("knows the machine it runs on", () => {
    for (const address of ["127.0.0.1", "127.0.0.53", "::1"]) {
      expect(classifyAddress(address)).toBe("loopback");
    }
  });

  /** What a mesh VPN hands out — and what an ISP uses for CGNAT. */
  it("recognises the shared address space without claiming which one it is", () => {
    expect(classifyAddress("100.64.0.1")).toBe("overlay");
    expect(classifyAddress("100.127.255.254")).toBe("overlay");
    // Just outside: 100.63 and 100.128 are ordinary public space.
    expect(classifyAddress("100.63.255.255")).toBe("public");
    expect(classifyAddress("100.128.0.1")).toBe("public");
  });

  /** A v4 peer on a dual-stack socket arrives wearing a v6 costume. */
  it("sees through an IPv4-mapped IPv6 address", () => {
    expect(classifyAddress("::ffff:192.168.1.42")).toBe("local");
    expect(classifyAddress("::ffff:8.8.8.8")).toBe("public");
  });

  it("treats unique-local and link-local IPv6 as home", () => {
    expect(classifyAddress("fd12:3456::1")).toBe("local");
    expect(classifyAddress("fe80::1")).toBe("local");
    expect(classifyAddress("2001:4860:4860::8888")).toBe("public");
  });
});

describe("what the instance remembers about it", () => {
  /** Four counters and four timestamps: never an address (SECURITY_BASELINE §7). */
  it("counts kinds, and keeps no address anywhere", () => {
    const log = new ConnectionOriginLog();
    const at = new Date("2026-08-17T10:00:00.000Z");

    log.record("192.168.1.42", at);
    log.record("192.168.1.99", at);
    log.record("100.64.0.3", at);

    const summary = log.summary();

    expect(summary).toEqual([
      { count: 2, lastAt: at.toISOString(), origin: "local" },
      { count: 1, lastAt: at.toISOString(), origin: "overlay" },
    ]);
    expect(JSON.stringify(summary)).not.toContain("192.168");
  });

  /** Said once, so that a port scan does not become a log flood. */
  it("reports a kind as new only the first time", () => {
    const log = new ConnectionOriginLog();
    const at = new Date();

    log.record("8.8.8.8", at);
    expect(log.isFirst("public")).toBe(true);

    log.record("9.9.9.9", at);
    expect(log.isFirst("public")).toBe(false);
  });
});

describe("what it tells the person connecting", () => {
  const SETUP_TOKEN = "token-di-prova";

  function configFor(dataDir: string): AppConfig {
    return loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_LOG_LEVEL: "silent" });
  }

  it("says plainly that nobody is in the middle on the local network", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

      await withClosable(app, async (instance) => {
        const view = (
          await instance.inject({
            method: "GET",
            remoteAddress: "192.168.1.50",
            url: "/api/v1/connection",
          })
        ).json() as ConnectionView;

        expect(view.origin).toBe("local");
        expect(view.detail).toMatch(/nessun altro sta in mezzo/);
      });
    });
  });

  /**
   * Trust boundary 4 of SECURITY_BASELINE §1 is «terzo dichiarato e
   * sostituibile». Declaring it means telling the people who cross it.
   */
  it("tells someone arriving from outside that a third party sees the connection", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

      await withClosable(app, async (instance) => {
        const view = (
          await instance.inject({
            method: "GET",
            remoteAddress: "100.100.20.5",
            url: "/api/v1/connection",
          })
        ).json() as ConnectionView;

        expect(view.origin).toBe("overlay");
        expect(view.detail).toMatch(/fuori casa/);
        // What it must not do is promise more than it has.
        expect(view.detail).toMatch(/vede che ti sei collegato/);
      });
    });
  });
});

describe("the assumption the threat model rests on", () => {
  const SETUP_TOKEN = "token-di-prova";

  /**
   * «Coperto per costruzione» is an assumption about somebody's router, and an
   * assumption about a router is the kind that breaks quietly.
   *
   * Said as an observation, not a verdict: measured 2026-08-17, a port published
   * through Docker Desktop arrives from a public address with nothing exposed
   * at all, so the address alone does not establish a breach.
   */
  it("says out loud, once, that something arrived from outside", async () => {
    await withTempDataDir(async (dataDir) => {
      const written: string[] = [];
      const app = await buildApp(loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_LOG_LEVEL: "warn" }), {
        logDestination: {
          write(chunk: string): boolean {
            written.push(String(chunk));
            return true;
          },
        } as unknown as NodeJS.WritableStream,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        for (const address of ["203.0.113.7", "198.51.100.9"]) {
          await instance.inject({ method: "GET", remoteAddress: address, url: "/api/v1/instance" });
        }

        const shouts = written.join("").split("reached_from_outside").length - 1;

        expect(shouts).toBe(1);
      });
    });
  });

  it("shows the administrator which kinds have reached it", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(
        loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_LOG_LEVEL: "silent" }),
        { setupToken: SETUP_TOKEN },
      );

      await withClosable(app, async (instance) => {
        await instance.inject({
          method: "POST",
          payload: {
            adminPassword: "una-password-lunga",
            adminUsername: "palu",
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          remoteAddress: "192.168.1.50",
          url: "/api/v1/instance/setup",
        });

        const token = (
          await instance.inject({
            method: "POST",
            payload: { password: "una-password-lunga", username: "palu" },
            remoteAddress: "192.168.1.50",
            url: "/api/v1/auth/login",
          })
        ).json().token;

        await instance.inject({
          method: "GET",
          remoteAddress: "100.64.9.9",
          url: "/api/v1/instance",
        });

        const diagnostics = (
          await instance.inject({
            headers: { authorization: `Bearer ${token as string}` },
            method: "GET",
            remoteAddress: "192.168.1.50",
            url: "/api/v1/admin/diagnostics",
          })
        ).json() as AdminDiagnostics;

        expect(diagnostics.connections.map((seen) => seen.origin).sort()).toEqual([
          "local",
          "overlay",
        ]);
      });
    });
  });
});

describe("what it refuses to conclude", () => {
  /**
   * The measurement that changed the wording: on Docker Desktop a request
   * through a published port arrives from a real public address — 104.16.8.34
   * in the run of 2026-08-17 — with nothing exposed to anybody. Announcing a
   * breach on that evidence would be crying wolf on every developer's machine.
   */
  it("does not tell the caller that the instance is on the Internet", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(
        loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_LOG_LEVEL: "silent" }),
        { setupToken: "token-di-prova" },
      );

      await withClosable(app, async (instance) => {
        const view = (
          await instance.inject({
            method: "GET",
            remoteAddress: "104.16.8.34",
            url: "/api/v1/connection",
          })
        ).json() as ConnectionView;

        expect(view.origin).toBe("public");
        expect(view.detail).toMatch(/oppure che fra te e lei c'è un proxy/);
        expect(view.detail).not.toMatch(/è raggiungibile da Internet\b(?!.*oppure)/);
      });
    });
  });
});
