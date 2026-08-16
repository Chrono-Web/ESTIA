import { existsSync, readFileSync, realpathSync } from "node:fs";

import type { DataDurability } from "@estia/contracts";

import { findMountFor, type SystemRoots } from "./atrest.js";

/**
 * Whether the data directory will still be there after the next update.
 *
 * A container's writable layer looks and behaves exactly like a real directory
 * while the container lives, and disappears the moment it is replaced — which
 * is precisely what updating an image does. An instance installed from a NAS
 * panel without mapping a folder is therefore perfectly functional and one
 * click away from losing everything, including the instance private key, which
 * SECURITY_BASELINE §3 classifies as not replaceable.
 *
 * Measured on the published image the 2026-08-17: without a volume, recreating
 * the container returned an instance with `state: unconfigured` and a brand new
 * public key; with a named volume, the same recreate came back configured.
 *
 * Declaring `VOLUME /data` in the image does **not** fix it — tested the same
 * day, `docker run` makes a fresh anonymous volume on every recreate and the
 * data is lost all the same. So the instance says it instead, which is the same
 * rule as ADR 0007: know your own state and never show a protection you do not
 * have.
 */

export interface ContainerMarkers {
  /** Docker writes this file into every container it runs. */
  docker: string;
  /** Podman's equivalent. */
  podman: string;
}

const MARKERS: ContainerMarkers = {
  docker: "/.dockerenv",
  podman: "/run/.containerenv",
};

export interface DurabilityReport {
  durability: DataDurability;
  detail: string;
}

/**
 * Answers only where it can, and under-claims where it cannot: a false
 * «ephemeral» costs an administrator a needless check, a false «persistent»
 * costs them everything their community wrote.
 */
export function inspectDataDurability(
  dataDir: string,
  roots: SystemRoots,
  markers: ContainerMarkers = MARKERS,
): DurabilityReport {
  let mountInfo: string;

  try {
    mountInfo = readFileSync(roots.mountInfo, "utf8");
  } catch {
    return {
      detail:
        "Questo sistema non espone la tabella dei mount: l'istanza non può stabilire se i suoi dati sopravviveranno a un aggiornamento.",
      durability: "unknown",
    };
  }

  let target = dataDir;

  try {
    target = realpathSync(dataDir);
  } catch {
    // A directory that is not there yet is not a detection failure.
  }

  const mount = findMountFor(mountInfo, target);

  if (mount === undefined) {
    return {
      detail: `Non ho trovato quale volume contiene ${target}: la durata dei dati non è verificabile.`,
      durability: "unknown",
    };
  }

  const containerised =
    existsSync(markers.docker) ||
    existsSync(markers.podman) ||
    findMountFor(mountInfo, "/")?.fsType === "overlay";

  // Outside a container the root filesystem is the machine's own disk, and a
  // directory on it is as durable as anything else here.
  if (!containerised) {
    return {
      detail: `I dati stanno in ${target}, su un filesystem di questa macchina.`,
      durability: "persistent",
    };
  }

  // Inside a container, a directory that is not itself a mount point lives in
  // the writable layer, and the writable layer is thrown away on every update.
  if (mount.mountPoint === "/") {
    return {
      detail: `I dati stanno dentro il container, in ${target}, e non su un volume. **Al prossimo aggiornamento dell'immagine spariranno**: account, contenuti, fotografie e la chiave privata dell'istanza, che non è sostituibile. Ferma l'istanza e monta una cartella o un volume su ${target} prima di usarla davvero.`,
      durability: "ephemeral",
    };
  }

  return {
    detail: `I dati stanno su un volume montato in ${mount.mountPoint}, quindi sopravvivono agli aggiornamenti dell'immagine.`,
    durability: "persistent",
  };
}
