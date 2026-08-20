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
 * The image declares `VOLUME /data`, which is what `jellyfin/jellyfin` does for
 * `/config`. Measured the 2026-08-17: with the declaration a `docker compose up
 * -d --force-recreate` keeps everything; without it the same command returns an
 * unconfigured instance. What was written next to that measurement — that it
 * only fails to help under a bare `docker run`, «which no update path does» —
 * was a generalisation from the one path that had been measured, and it was
 * wrong.
 *
 * It cost the same instance its configuration again, repeatedly, on
 * 2026-08-20. An anonymous volume survives only when whoever recreates the
 * container copies the old container's mounts over. Compose does. A NAS panel
 * updating a container that was created by hand does not: it deletes the
 * container and builds a new one from the image, and Docker attaches a fresh
 * empty volume. Same for Portainer's recreate, for Watchtower, and for
 * `docker rm` followed by `docker run` — the path dismissed as nobody's.
 *
 * So `anonymous` is reported as its own answer, distinct from `persistent`,
 * and ADR 0019 makes the instance refuse to be configured on it. Detection is
 * the net underneath; the fix is that the data has a name and a place.
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

  // Docker names an anonymous volume with 64 hex characters, and that name is
  // the whole problem: nobody asked for this volume, so nobody carries it over.
  const anonymous = /\/volumes\/[0-9a-f]{64}\//.test(mount.root);

  if (anonymous) {
    return {
      detail: `I dati stanno su un volume Docker **anonimo** (\`${volumeNameIn(mount.root)}\`), montato in ${mount.mountPoint}: nessuno l'ha chiesto, quindi nessuno se lo porta dietro. **Sopravvive solo se aggiorni con \`docker compose\`**; se ricrei il container dal pannello del NAS, da Portainer, con Watchtower o a mano, Docker ne attacca uno nuovo e vuoto e l'istanza riparte da zero — account, contenuti, fotografie e la chiave privata, che non è sostituibile. Monta una cartella tua o un volume con un nome su ${mount.mountPoint}.`,
      durability: "anonymous",
    };
  }

  return {
    detail: `I dati stanno su un volume montato in ${mount.mountPoint}, quindi sopravvivono agli aggiornamenti dell'immagine.`,
    durability: "persistent",
  };
}

/**
 * The volume's own name, as seen from inside: the `root` field of the mount is
 * the only place it appears. Worth printing, because it is what an
 * administrator needs to type to get the data back out of an orphaned volume.
 */
function volumeNameIn(root: string): string {
  return /\/volumes\/([^/]+)\//.exec(root)?.[1] ?? "senza nome";
}
