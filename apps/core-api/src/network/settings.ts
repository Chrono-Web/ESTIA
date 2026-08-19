import type { NetworkConfig } from "@estia/config";

import type { SettingsRepository } from "../backup/settings.js";

/**
 * Where the network probe's on/off switch lives (ADR 0018, ADR 0016 §rule).
 *
 * The same rule as the backups, and for the same reason: **the environment
 * wins.** Where `ESTIA_NETWORK_PROBE` is set, the panel shows the value and
 * says where it comes from, rather than offering a change the next restart
 * would undo.
 *
 * The switch is in the panel at all — rather than only in a file — because of
 * what ADR 0016 learned about backups: a protection that requires opening a
 * terminal on the NAS is a protection nobody turns on. A measurement nobody can
 * run is worth as little.
 */

export type ProbeMode = "off" | "local" | "internet";

const KEY = "network.probe";

export interface EffectiveProbe {
  mode: ProbeMode;
  fromEnvironment: boolean;
}

export function readStoredProbe(repository: SettingsRepository): ProbeMode {
  const stored = repository.read(KEY);

  return stored === "local" || stored === "internet" ? stored : "off";
}

export function writeStoredProbe(
  repository: SettingsRepository,
  mode: ProbeMode,
  updatedAt: string,
): void {
  if (mode === "off") {
    repository.clear(KEY);

    return;
  }

  repository.write(KEY, mode, updatedAt);
}

export function effectiveProbe(options: {
  environment: NetworkConfig;
  stored: ProbeMode;
}): EffectiveProbe {
  if (options.environment.probe !== "off") {
    return { fromEnvironment: true, mode: options.environment.probe };
  }

  return { fromEnvironment: false, mode: options.stored };
}
