import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("uses the safe bootstrap defaults", () => {
    expect(loadConfig({})).toEqual({
      dataDir: "./.data",
      host: "0.0.0.0",
      logLevel: "info",
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
});
