import { writeFileSync } from "node:fs";
import path from "node:path";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { backupMemoryWarning, readMemoryLimit, type CgroupFiles } from "./memory.js";

/**
 * Measured, not assumed: an archive is encrypted whole in memory (ADR 0013), and
 * the smallest container limit that completed three runs out of three was
 * 1,25 GB for 200 MB of data and 2,5 GB for 400 MB. Below that band the kernel
 * kills the process without a log line, which is why this is worth predicting.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** The two shapes a real Linux publishes the limit in. */
function cgroup(root: string, files: { v2?: string; v1?: string }): CgroupFiles {
  const paths = { v1: path.join(root, "limit_in_bytes"), v2: path.join(root, "memory.max") };

  if (files.v2 !== undefined) {
    writeFileSync(paths.v2, `${files.v2}\n`);
  }

  if (files.v1 !== undefined) {
    writeFileSync(paths.v1, `${files.v1}\n`);
  }

  return paths;
}

describe("reading the container's memory limit", () => {
  it("reads a cgroup v2 limit", async () => {
    await withTempDataDir(async (root) => {
      expect(readMemoryLimit(cgroup(root, { v2: String(512 * MB) }))).toBe(512 * MB);
    });
  });

  it("treats the v2 word «max» as no limit at all", async () => {
    await withTempDataDir(async (root) => {
      expect(readMemoryLimit(cgroup(root, { v2: "max" }))).toBeUndefined();
    });
  });

  it("falls back to cgroup v1 where v2 is not there", async () => {
    await withTempDataDir(async (root) => {
      expect(readMemoryLimit(cgroup(root, { v1: String(768 * MB) }))).toBe(768 * MB);
    });
  });

  /** v1 says «unlimited» with a number near the word size, not with a word. */
  it("does not mistake the v1 unlimited sentinel for a limit", async () => {
    await withTempDataDir(async (root) => {
      expect(readMemoryLimit(cgroup(root, { v1: "9223372036854771712" }))).toBeUndefined();
    });
  });

  it("claims nothing on a system that publishes neither", () => {
    expect(readMemoryLimit({ v1: "/non/esiste/v1", v2: "/non/esiste/v2" })).toBeUndefined();
  });
});

describe("predicting a backup that the memory limit would kill", () => {
  it("says nothing when there is no limit", () => {
    expect(backupMemoryWarning(2 * GB, undefined)).toBeUndefined();
  });

  it("says nothing on an instance that is holding nothing yet", () => {
    expect(backupMemoryWarning(0, 256 * MB)).toBeUndefined();
  });

  /** Healthy instances must stay quiet, or the notice becomes scenery. */
  it("says nothing when the limit has room for the measured need", () => {
    expect(backupMemoryWarning(200 * MB, 2 * GB)).toBeUndefined();
  });

  it("warns when the limit is below what the measurements require", () => {
    const warning = backupMemoryWarning(400 * MB, 1 * GB);

    expect(warning).toMatch(/limite di memoria/);
    // The number it names is the one that was measured, not a round guess.
    expect(warning).toMatch(/2\.3 GB|2,3 GB/);
    expect(warning).toMatch(/senza scrivere niente nei log/);
  });

  it("sits exactly on the boundary without crying wolf", () => {
    expect(backupMemoryWarning(100 * MB, 600 * MB)).toBeUndefined();
    expect(backupMemoryWarning(100 * MB, 600 * MB - 1)).toBeDefined();
  });
});
