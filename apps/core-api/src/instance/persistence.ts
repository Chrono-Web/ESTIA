import { existsSync, readFileSync, realpathSync } from "node:fs";

import type { DataDurability } from "@estia/contracts";

import { diagnosi } from "../diagnostics.js";
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
  /** `detail` as a `diagnostics` key, for the reader's language (ADR 0044 §5). */
  detailKey?: string;
  detailParams?: Record<string, string | number>;
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
    return { ...diagnosi("diagnostics.durability.no_mount_table"), durability: "unknown" };
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
      ...diagnosi("diagnostics.durability.volume_not_found", { path: target }),
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
      ...diagnosi("diagnostics.durability.host", { path: target }),
      durability: "persistent",
    };
  }

  // Inside a container, a directory that is not itself a mount point lives in
  // the writable layer, and the writable layer is thrown away on every update.
  if (mount.mountPoint === "/") {
    return {
      ...diagnosi("diagnostics.durability.ephemeral", { path: target }),
      durability: "ephemeral",
    };
  }

  // Docker names an anonymous volume with 64 hex characters, and that name is
  // the whole problem: nobody asked for this volume, so nobody carries it over.
  const anonymous = /\/volumes\/[0-9a-f]{64}\//.test(mount.root);

  if (anonymous) {
    return {
      ...diagnosi("diagnostics.durability.anonymous", {
        mountPoint: mount.mountPoint,
        volume: volumeNameIn(mount.root),
      }),
      durability: "anonymous",
    };
  }

  return {
    ...diagnosi("diagnostics.durability.persistent", { mountPoint: mount.mountPoint }),
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
