import { describe, expect, it } from "vitest";

import { NetworkProbe } from "./probe.js";

/**
 * The first verification of ADR 0018, kept honest by a test: the transport
 * loads inside this instance, two of them find each other **by public key**,
 * and none of it happens to anybody who did not ask.
 */
describe("the network probe", () => {
  it("is off unless asked for, and says so", () => {
    const report = new NetworkProbe().report();

    expect(report.state).toBe("off");
    expect(report.mode).toBe("off");
    expect(report.editable).toBe(true);
    expect(report.endpointId).toBeUndefined();
    expect(report.ticket).toBeUndefined();
  });

  it("refuses to reach anybody while it is off", async () => {
    const result = await new NetworkProbe().probe("qualunque-cosa");

    expect(result.reached).toBe(false);
    expect(result.detail).toMatch(/ESTIA_NETWORK_PROBE/);
  });

  it("turns on and off again without a restart, which is the point of the switch", async () => {
    const probe = new NetworkProbe();

    try {
      await probe.apply("local");
      expect(probe.report().state).toBe("ready");

      await probe.apply("off");
      const off = probe.report();

      expect(off.state).toBe("off");
      expect(off.endpointId).toBeUndefined();

      // And back on, because an administrator who changed their mind twice is
      // not a case worth breaking on.
      await probe.apply("local");
      expect(probe.report().state).toBe("ready");
    } finally {
      await probe.close();
    }
  }, 30_000);

  it("says it cannot be edited when the environment carries the setting", async () => {
    const probe = new NetworkProbe();

    try {
      await probe.apply("local", { editable: false });
      expect(probe.report().editable).toBe(false);
    } finally {
      await probe.close();
    }
  }, 30_000);

  it("two instances find each other by public key, with nothing in the middle", async () => {
    const casa = new NetworkProbe();
    const altrove = new NetworkProbe();

    try {
      await casa.apply("local");
      await altrove.apply("local");

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
    const probe = new NetworkProbe();

    try {
      await probe.apply("local");

      const result = await probe.probe("questo-non-e-un-ticket");

      expect(result.reached).toBe(false);
      expect(result.detail).toMatch(/Non raggiunta/);
    } finally {
      await probe.close();
    }
  }, 30_000);
});
