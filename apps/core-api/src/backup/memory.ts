import { readFileSync } from "node:fs";

/**
 * How much memory a backup needs, and whether this container has it.
 *
 * `age-encryption` 0.3.0 encrypts a whole buffer rather than a stream
 * (ADR 0013), so an archive exists in memory more than once while it is being
 * written. That is a known cost; what was not known is how much, and a
 * container memory limit chosen without it turns «the instance has too many
 * photos» into «the instance is killed every night at three».
 *
 * Measured 2026-08-16, in containers on Node 24, by finding the smallest limit
 * at which three runs out of three completed:
 *
 * | Dati    | Limite affidabile | Rapporto |
 * | ------- | ----------------- | -------- |
 * | 200 MB  | 1,25 GB           | 6,4×     |
 * | 400 MB  | 2,5 GB            | 6,25×    |
 *
 * Below that band the failure is not a clean error: the kernel kills the
 * process, so nothing is logged and — for the scheduled backup, which runs
 * inside the instance — the whole instance goes down with it.
 */

/** From the measurements above, rounded down rather than up: it is a floor, not a target. */
const BYTES_NEEDED_PER_BYTE_STORED = 6;

/** Where the kernel publishes the limit, cgroup v2 first. */
export interface CgroupFiles {
  v2: string;
  v1: string;
}

const LINUX_CGROUP: CgroupFiles = {
  v1: "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  v2: "/sys/fs/cgroup/memory.max",
};

/**
 * The container's memory limit in bytes, or `undefined` where there is none or
 * it cannot be read.
 *
 * Uncertainty goes one way only, as everywhere else in this codebase: a limit
 * that cannot be read produces no claim, never a reassuring one.
 */
export function readMemoryLimit(files: CgroupFiles = LINUX_CGROUP): number | undefined {
  const v2 = read(files.v2);

  // cgroup v2 writes the literal `max` when nothing is capped.
  if (v2 !== undefined) {
    return v2 === "max" ? undefined : positive(Number(v2));
  }

  const v1 = read(files.v1);

  if (v1 === undefined) {
    return undefined;
  }

  const bytes = positive(Number(v1));

  // cgroup v1 says «unlimited» with a number near the word size rather than a
  // word, and that number is not a limit anybody set.
  return bytes !== undefined && bytes < Number.MAX_SAFE_INTEGER / 2 ? bytes : undefined;
}

function read(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return undefined;
  }
}

function positive(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function gigabytes(bytes: number): string {
  return bytes < 1024 * 1024 * 1024
    ? `${String(Math.round(bytes / (1024 * 1024)))} MB`
    : `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Says something only when the limit is measurably too small for the data the
 * instance is holding — never as a general remark about memory.
 *
 * Silent when there is no limit, when nothing has been stored yet, or when
 * there is room: an advisory that appears on healthy instances is one people
 * learn to scroll past.
 */
export function backupMemoryWarning(
  storedBytes: number,
  limitBytes: number | undefined,
): string | undefined {
  if (limitBytes === undefined || storedBytes <= 0) {
    return undefined;
  }

  const needed = storedBytes * BYTES_NEEDED_PER_BYTE_STORED;

  if (limitBytes >= needed) {
    return undefined;
  }

  return `Questa istanza conserva ${gigabytes(storedBytes)} e il container ha un limite di memoria di ${gigabytes(limitBytes)}. Un backup ne chiede circa ${gigabytes(needed)}, perché l'archivio viene cifrato tutto in memoria: sotto quella soglia il sistema uccide il processo senza scrivere niente nei log, e l'istanza si riavvia. Alza il limite di memoria del container, oppure sposta i backup fuori dall'istanza.`;
}
