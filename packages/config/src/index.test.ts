import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("uses the safe bootstrap defaults", () => {
    expect(loadConfig({})).toEqual({
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
      port: 3000,
    });
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
