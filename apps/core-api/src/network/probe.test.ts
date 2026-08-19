import { describe, expect, it } from "vitest";

import { NetworkProbe } from "./probe.js";

/**
 * The first verification of ADR 0018, kept honest by a test: the transport
 * loads inside this instance, two of them find each other **by public key**,
 * and none of it happens to anybody who did not ask.
 */
describe("the network probe", () => {
  it("is off unless asked for, and says so", () => {
    const report = new NetworkProbe({ probe: "off" }).report();

    expect(report.state).toBe("off");
    expect(report.endpointId).toBeUndefined();
    expect(report.ticket).toBeUndefined();
  });

  it("refuses to reach anybody while it is off", async () => {
    const result = await new NetworkProbe({ probe: "off" }).probe("qualunque-cosa");

    expect(result.reached).toBe(false);
    expect(result.detail).toMatch(/ESTIA_NETWORK_PROBE/);
  });

  it("two instances find each other by public key, with nothing in the middle", async () => {
    const casa = new NetworkProbe({ probe: "local" });
    const altrove = new NetworkProbe({ probe: "local" });

    try {
      await casa.start();
      await altrove.start();

      const report = casa.report();

      // `local` is the setting that touches no third party at all.
      expect(report.state).toBe("ready");
      expect(report.usesPublicInfrastructure).toBe(false);
      expect(report.endpointId).toMatch(/\w{16,}/);
      expect(report.ticket).toBeTruthy();

      const result = await altrove.probe(report.ticket ?? "");

      expect(result.reached).toBe(true);
      expect(result.remoteEndpointId).toBe(report.endpointId);
      // On one machine there is nothing to punch through, so a relay would mean
      // something is wrong rather than something is slow.
      expect(result.viaRelay).toBe(false);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    } finally {
      await casa.close();
      await altrove.close();
    }
  }, 30_000);

  it("reports a failure instead of throwing when the other side is not there", async () => {
    const probe = new NetworkProbe({ probe: "local" });

    try {
      await probe.start();

      const result = await probe.probe("questo-non-e-un-ticket");

      expect(result.reached).toBe(false);
      expect(result.detail).toMatch(/Non raggiunta/);
    } finally {
      await probe.close();
    }
  }, 30_000);
});
