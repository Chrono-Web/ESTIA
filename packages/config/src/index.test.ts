import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("uses the safe bootstrap defaults", () => {
    expect(loadConfig({})).toEqual({
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
});
