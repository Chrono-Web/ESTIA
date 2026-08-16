import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";

import type { AtRestDeclaredLevel, AtRestEncryptionState, AtRestReport } from "@estia/contracts";

/**
 * What the instance can actually observe about encryption at rest (ADR 0007).
 *
 * ESTIA does not encrypt anything: the host does — LUKS, the NAS's own volume
 * encryption, a ZFS dataset — because that covers database, media, identity and
 * temporary files in one move, and because writing cryptography here is
 * forbidden.
 *
 * What ESTIA owes is requirement 2 of that decision: **know and declare its own
 * real state**, and say «not verifiable» where it cannot verify, never
 * «active» by assumption. The direction of every uncertainty here is therefore
 * to under-claim: a false «inactive» costs an administrator a needless check, a
 * false «active» costs them the belief that their neighbours' photographs are
 * protected when they are not.
 */

/** Injectable so the tests can present a whole machine instead of mocking one. */
export interface SystemRoots {
  mountInfo: string;
  sysBlock: string;
}

const LINUX_ROOTS: SystemRoots = {
  mountInfo: "/proc/self/mountinfo",
  sysBlock: "/sys/dev/block",
};

interface Mount {
  mountPoint: string;
  device: string;
  fsType: string;
  source: string;
}

/**
 * Parses the mount table and returns the mount that actually carries `target`:
 * the one with the longest matching prefix, since `/` always matches too.
 */
export function findMountFor(mountInfo: string, target: string): Mount | undefined {
  let best: Mount | undefined;

  for (const line of mountInfo.split("\n")) {
    // 36 35 98:0 /mnt1 /mnt2 rw,noatime master:1 - ext3 /dev/root rw,errors=continue
    const [fields, rest] = line.split(" - ");

    if (fields === undefined || rest === undefined) {
      continue;
    }

    const parts = fields.split(" ");
    const after = rest.split(" ");
    const mountPoint = parts[4];
    const device = parts[2];
    const fsType = after[0];
    const source = after[1];

    if (mountPoint === undefined || device === undefined || fsType === undefined) {
      continue;
    }

    const covers = target === mountPoint || target.startsWith(mountPoint.replace(/\/$/, "") + "/");

    if (!covers) {
      continue;
    }

    if (best === undefined || mountPoint.length > best.mountPoint.length) {
      best = { device, fsType, mountPoint, source: source ?? "" };
    }
  }

  return best;
}

function readTrimmed(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return undefined;
  }
}

/**
 * Walks down the device stack looking for a dm-crypt layer.
 *
 * The walk matters: a filesystem often sits on an LVM volume that sits on the
 * encrypted device, so looking only at the device the mount names would miss a
 * perfectly encrypted setup.
 */
function findCryptoLayer(
  sysBlock: string,
  device: string,
  seen = new Set<string>(),
): string | undefined {
  if (seen.has(device) || seen.size > 16) {
    return undefined;
  }

  seen.add(device);

  const base = path.join(sysBlock, device);
  const uuid = readTrimmed(path.join(base, "dm", "uuid"));

  // dm-crypt announces itself here: `CRYPT-LUKS2-<...>-<name>`.
  if (uuid !== undefined && uuid.startsWith("CRYPT-")) {
    return uuid.split("-").slice(0, 2).join("-");
  }

  const slaves = path.join(base, "slaves");

  if (!existsSync(slaves)) {
    return undefined;
  }

  for (const slave of readdirSync(slaves)) {
    // A slave is a symlink to /sys/devices/...; its major:minor is in `dev`.
    const dev = readTrimmed(path.join(slaves, slave, "dev"));

    if (dev !== undefined) {
      const found = findCryptoLayer(sysBlock, dev, seen);

      if (found !== undefined) {
        return found;
      }
    }
  }

  return undefined;
}

export interface Detection {
  state: AtRestEncryptionState;
  detail: string;
}

/**
 * Looks at the volume carrying `dataDir` and reports what it finds.
 *
 * Deliberately conservative in one direction only: where the platform cannot be
 * inspected — not Linux, `/sys` not mounted, a filesystem whose encryption is a
 * property the kernel does not expose — the answer is «not verifiable», never a
 * reassuring guess.
 */
export function detectAtRestEncryption(
  dataDir: string,
  roots: SystemRoots = LINUX_ROOTS,
): Detection {
  const mountInfo = readTrimmed(roots.mountInfo);

  if (mountInfo === undefined) {
    return {
      detail:
        "Questo sistema non espone la tabella dei mount: l'istanza non può stabilire se il volume dei dati è cifrato.",
      state: "unknown",
    };
  }

  let target = dataDir;

  try {
    target = realpathSync(dataDir);
  } catch {
    // Keep the path as given: a missing directory is not a detection failure.
  }

  const mount = findMountFor(mountInfo, target);

  if (mount === undefined) {
    return {
      detail: `Non ho trovato quale volume contiene ${target}: lo stato della cifratura non è verificabile.`,
      state: "unknown",
    };
  }

  const crypto = findCryptoLayer(roots.sysBlock, mount.device);

  if (crypto !== undefined) {
    return {
      detail: `Il volume che contiene i dati è cifrato (${crypto}). L'istanza non può però sapere come viene sbloccato all'avvio: quella parte la dichiara chi amministra.`,
      state: "active",
    };
  }

  // ZFS keeps encryption as a dataset property, invisible from the block layer.
  if (mount.fsType === "zfs") {
    return {
      detail:
        "I dati sono su ZFS, dove la cifratura è una proprietà del dataset che non si legge dai dispositivi a blocchi. Verificala con `zfs get encryption`.",
      state: "unknown",
    };
  }

  if (!existsSync(roots.sysBlock)) {
    return {
      detail:
        "Questo sistema non espone le informazioni sui dispositivi a blocchi: lo stato della cifratura non è verificabile.",
      state: "unknown",
    };
  }

  return {
    detail: `Nessuna cifratura rilevata sul volume dei dati (${mount.fsType}). Se il disco è cifrato dal firmware o dall'hardware, l'istanza non può vederlo: la protezione da verificare resta quella del NAS.`,
    state: "inactive",
  };
}

/**
 * Puts together what the instance sees and what the administrator declared.
 *
 * The interesting case is the third one: chi amministra dichiara una protezione
 * che l'istanza non vede. Segnalarlo è tutto il senso del requisito 2 di
 * ADR 0007 — nessuna interfaccia deve mostrare una protezione che non c'è.
 */
export function buildAtRestReport(
  detection: Detection,
  declared: AtRestDeclaredLevel,
): AtRestReport {
  const claimsEncryption = declared === "passphrase" || declared === "automatic";
  const contradicted = claimsEncryption && detection.state === "inactive";

  return {
    consistent: !contradicted,
    declared,
    detail: contradicted
      ? `${detection.detail} Ma la configurazione dichiara una cifratura ${declared === "passphrase" ? "con passphrase all'avvio" : "con sblocco automatico"}: una delle due cose è sbagliata, e finché non lo chiarisci considera i dati NON protetti.`
      : detection.detail,
    detected: detection.state,
  };
}
