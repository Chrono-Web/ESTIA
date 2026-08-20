import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { NetworkProbe } from "./probe.js";

/**
 * The first verification of ADR 0018, kept honest by a test: the transport
 * loads inside this instance, two of them find each other **by public key**,
 * and none of it happens to anybody who did not ask.
 */

/** Stands in for `deriveNetworkSecretKey`, which is tested where it lives. */
function aKey(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

describe("the network probe", () => {
  it("is off unless asked for, and says so", () => {
    const report = new NetworkProbe(aKey()).report();

    expect(report.state).toBe("off");
    expect(report.mode).toBe("off");
    expect(report.editable).toBe(true);
    expect(report.endpointId).toBeUndefined();
    expect(report.ticket).toBeUndefined();
  });

  it("refuses to reach anybody while it is off", async () => {
    const result = await new NetworkProbe(aKey()).probe("qualunque-cosa");

    expect(result.reached).toBe(false);
    expect(result.detail).toMatch(/ESTIA_NETWORK_PROBE/);
  });

  it("turns on and off again without a restart, which is the point of the switch", async () => {
    const probe = new NetworkProbe(aKey());

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
    const probe = new NetworkProbe(aKey());

    try {
      await probe.apply("local", { editable: false });
      expect(probe.report().editable).toBe(false);
    } finally {
      await probe.close();
    }
  }, 30_000);

  it("two instances find each other by public key, with nothing in the middle", async () => {
    const casa = new NetworkProbe(aKey());
    const altrove = new NetworkProbe(aKey());

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

  it("keeps the same identity across a restart, which is the whole point of a key", async () => {
    // The bug this replaces: the endpoint drew its own key at `bind()`, so
    // stopping and starting the container made the instance a stranger to
    // everyone who had saved its address. Addressing by public key means a key
    // that moves is an address that moves.
    const key = aKey();
    const before = new NetworkProbe(key);
    let endpointId: string | undefined;

    try {
      await before.apply("local");
      endpointId = before.report().endpointId;
      expect(endpointId).toMatch(/\w{16,}/);
    } finally {
      await before.close();
    }

    // A different object with the same key is what a restart looks like from
    // the outside: same instance, new process.
    const after = new NetworkProbe(key);

    try {
      await after.apply("local");
      expect(after.report().endpointId).toBe(endpointId);
    } finally {
      await after.close();
    }
  }, 30_000);

  it("refuses a key that is not one, instead of binding something unusable", () => {
    expect(() => new NetworkProbe(new Uint8Array(16))).toThrow(/32/);
  });

  it("reports a failure instead of throwing when it is handed nonsense", async () => {
    const probe = new NetworkProbe(aKey());

    try {
      await probe.apply("local");

      const result = await probe.probe("questo-non-e-ne-una-chiave-ne-un-codice");

      expect(result.reached).toBe(false);
      expect(result.detail).toMatch(/né una chiave pubblica né un codice/);
    } finally {
      await probe.close();
    }
  }, 30_000);

  it("takes a public key, and says why that is not enough on local", async () => {
    // The key is the thing two administrators exchange (ADR 0018). On `local`
    // nothing publishes where a key lives, so the honest answer is to say so
    // and name the two ways out — not to fail with whatever iroh said.
    const casa = new NetworkProbe(aKey());
    const altrove = new NetworkProbe(aKey());

    try {
      await casa.apply("local");
      await altrove.apply("local");

      const key = casa.report().endpointId ?? "";
      expect(key).toMatch(/\w{16,}/);

      const result = await altrove.probe(key);

      expect(result.reached).toBe(false);
      expect(result.detail).toMatch(/alcuna scoperta/);
      expect(result.detail).toMatch(/internet/);
    } finally {
      await casa.close();
      await altrove.close();
    }
  }, 30_000);

  it("says on local that the key alone will not do, and hands over the code instead", async () => {
    const probe = new NetworkProbe(aKey());

    try {
      await probe.apply("local");
      const report = probe.report();

      expect(report.reachableByKey).toBe(false);
      expect(report.ticket).toBeTruthy();
      expect(report.endpointId).toBeTruthy();
    } finally {
      await probe.close();
    }
  }, 30_000);
});
