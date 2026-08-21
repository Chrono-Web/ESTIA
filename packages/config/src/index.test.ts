import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("uses the safe bootstrap defaults", () => {
    expect(loadConfig({})).toEqual({
      // The instance refuses to be configured where its data would not survive
      // an update, unless somebody says out loud that it is a throwaway
      // (ADR 0019). Unset is «no», because a typo must protect and never expose.
      allowEphemeralData: false,
      // Unset is «unspecified», never «none»: an administrator who has not
      // answered has not told us their data is unprotected (ADR 0007).
      atRestEncryption: "unspecified",
      // Backups are off until an administrator configures them, and the
      // instance says so at startup rather than pretending.
      backup: { scheduled: false },
      dataDir: "./.data",
      host: "0.0.0.0",
      logLevel: "info",
      media: {
        maxBytes: 5 * 1024 * 1024,
        maxPixels: 12_000_000,
        quotaBytesPerUser: 256 * 1024 * 1024,
      },
      // The network probe of ADR 0018 stays off until asked for: turning it on
      // makes the instance reachable by public key, and no update may decide
      // that for somebody's home.
      network: { probe: "off" },
      // Absent outside a published image: without it the panel cannot compare.
      gitSha: undefined,
      port: 3000,
    });
  });

  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["TRUE", true],
    ["false", false],
    ["", false],
    // A value nobody meant is a no: the direction the uncertainty falls in
    // costs a needless check one way and a community's photographs the other.
    ["forse", false],
  ])("reads ESTIA_ALLOW_EPHEMERAL_DATA=%s as %s", (value, expected) => {
    expect(loadConfig({ ESTIA_ALLOW_EPHEMERAL_DATA: value }).allowEphemeralData).toBe(expected);
  });

  it("takes the network probe only in the two shapes that mean something", () => {
    expect(loadConfig({ ESTIA_NETWORK_PROBE: "local" }).network).toEqual({ probe: "local" });
    expect(loadConfig({ ESTIA_NETWORK_PROBE: "internet" }).network).toEqual({ probe: "internet" });
    expect(loadConfig({ ESTIA_NETWORK_PROBE: "off" }).network).toEqual({ probe: "off" });
    expect(() => loadConfig({ ESTIA_NETWORK_PROBE: "si" })).toThrow(ConfigurationError);
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ ESTIA_PORT: "70000" })).toThrow(ConfigurationError);
  });

  it("rejects unsupported log levels", () => {
    expect(() => loadConfig({ ESTIA_LOG_LEVEL: "verbose" })).toThrow(
      "ESTIA_LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, or silent.",
    );
  });

  it("rejects an empty data directory", () => {
    expect(() => loadConfig({ ESTIA_DATA_DIR: "  " })).toThrow(ConfigurationError);
  });

  it("accepts an explicit data directory", () => {
    expect(loadConfig({ ESTIA_DATA_DIR: "/srv/estia" }).dataDir).toBe("/srv/estia");
  });

  it("reads ESTIA_GIT_SHA when present", () => {
    expect(loadConfig({ ESTIA_GIT_SHA: "8a1147c" }).gitSha).toBe("8a1147c");
    expect(() => loadConfig({ ESTIA_GIT_SHA: "not-a-sha" })).toThrow(ConfigurationError);
  });

  it("accepts media limits chosen by the administrator", () => {
    expect(
      loadConfig({
        ESTIA_MEDIA_MAX_BYTES: "1048576",
        ESTIA_MEDIA_MAX_PIXELS: "4000000",
        ESTIA_MEDIA_QUOTA_BYTES: "10485760",
      }).media,
    ).toEqual({ maxBytes: 1_048_576, maxPixels: 4_000_000, quotaBytesPerUser: 10_485_760 });
  });

  it("refuses media limits that are not positive integers", () => {
    for (const environment of [
      { ESTIA_MEDIA_MAX_BYTES: "0" },
      { ESTIA_MEDIA_MAX_BYTES: "molti" },
      { ESTIA_MEDIA_MAX_PIXELS: "-1" },
      { ESTIA_MEDIA_QUOTA_BYTES: "1.5" },
    ]) {
      expect(() => loadConfig(environment)).toThrow(ConfigurationError);
    }
  });
});
