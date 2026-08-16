import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";

import { loadConfig, ConfigurationError } from "@estia/config";
import type { AdminDiagnostics } from "@estia/contracts";
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { buildAtRestReport, detectAtRestEncryption, findMountFor } from "./atrest.js";
import type { SystemRoots } from "./atrest.js";

/**
 * The tests build small fake machines rather than mocking the module: the
 * thing under test is precisely whether we read a real Linux correctly, so
 * feeding it real file shapes is the only verification that means anything.
 */
interface FakeDevice {
  /** major:minor, as `/sys/dev/block` names its entries. */
  id: string;
  /** Present on a dm device; `CRYPT-LUKS2-...` is what dm-crypt writes. */
  dmUuid?: string;
  /** Devices this one sits on, by id. */
  slaves?: string[];
}

function machine(root: string, mounts: string, devices: FakeDevice[]): SystemRoots {
  const sysBlock = path.join(root, "sys-dev-block");
  const mountInfo = path.join(root, "mountinfo");

  writeFileSync(mountInfo, mounts);

  for (const device of devices) {
    const base = path.join(sysBlock, device.id);

    mkdirSync(base, { recursive: true });
    writeFileSync(path.join(base, "dev"), `${device.id}\n`);

    if (device.dmUuid !== undefined) {
      mkdirSync(path.join(base, "dm"), { recursive: true });
      writeFileSync(path.join(base, "dm", "uuid"), `${device.dmUuid}\n`);
    }

    for (const slave of device.slaves ?? []) {
      const link = path.join(base, "slaves", slave);

      mkdirSync(link, { recursive: true });
      writeFileSync(path.join(link, "dev"), `${slave}\n`);
    }
  }

  return { mountInfo, sysBlock };
}

const MOUNTS = [
  "25 30 0:24 / / rw,relatime - overlay overlay rw",
  "141 132 254:1 /volumes/estia /data rw,relatime - ext4 /dev/mapper/pool-estia rw",
  "150 25 0:44 / /tmp rw,relatime - tmpfs tmpfs rw",
].join("\n");

describe("finding the volume that carries the data", () => {
  it("picks the mount that actually covers the path, not the root", () => {
    const mount = findMountFor(MOUNTS, "/data/media/ab");

    expect(mount).toMatchObject({ device: "254:1", fsType: "ext4", mountPoint: "/data" });
  });

  it("falls back to the root when nothing else covers it", () => {
    expect(findMountFor(MOUNTS, "/srv/altrove")).toMatchObject({ mountPoint: "/" });
  });

  it("is not fooled by a mount point that is only a string prefix", () => {
    // `/database` must not match the mount at `/data`.
    expect(findMountFor(MOUNTS, "/database/estia.db")).toMatchObject({ mountPoint: "/" });
  });
});

describe("what the instance can observe", () => {
  it("sees a LUKS volume under the data directory", async () => {
    await withTempDataDir(async (root) => {
      const roots = machine(root, MOUNTS, [{ dmUuid: "CRYPT-LUKS2-abc123-estia", id: "254:1" }]);

      expect(detectAtRestEncryption("/data", roots)).toMatchObject({ state: "active" });
      expect(detectAtRestEncryption("/data", roots).detail).toMatch(/CRYPT-LUKS2/);
    });
  });

  /** The setup that a naive check would miss: the filesystem is on LVM, and the
      encryption is one layer further down. */
  it("finds encryption further down the stack, under LVM", async () => {
    await withTempDataDir(async (root) => {
      const roots = machine(root, MOUNTS, [
        { id: "254:1", slaves: ["253:0"] },
        { dmUuid: "CRYPT-LUKS2-xyz-cryptdisk", id: "253:0" },
        { id: "8:2" },
      ]);

      expect(detectAtRestEncryption("/data", roots).state).toBe("active");
    });
  });

  it("says «not encrypted» when it can see the whole stack and there is none", async () => {
    await withTempDataDir(async (root) => {
      const roots = machine(root, MOUNTS, [{ id: "254:1", slaves: ["8:2"] }, { id: "8:2" }]);
      const detection = detectAtRestEncryption("/data", roots);

      expect(detection.state).toBe("inactive");
      // And it admits what it still cannot see, instead of sounding certain.
      expect(detection.detail).toMatch(/firmware|hardware/i);
    });
  });

  it("refuses to guess on ZFS, where encryption is a dataset property", async () => {
    await withTempDataDir(async (root) => {
      const mounts = "141 132 0:99 / /data rw,relatime - zfs pool/estia rw";
      const roots = machine(root, mounts, [{ id: "0:99" }]);
      const detection = detectAtRestEncryption("/data", roots);

      expect(detection.state).toBe("unknown");
      expect(detection.detail).toMatch(/zfs get encryption/);
    });
  });

  it("says «not verifiable» where there is no mount table at all", () => {
    const detection = detectAtRestEncryption("/data", {
      mountInfo: "/non/esiste/mountinfo",
      sysBlock: "/non/esiste/sys",
    });

    expect(detection.state).toBe("unknown");
  });

  /** On the development machine, which is not Linux, the honest answer is this one. */
  it("does not claim anything on a system it cannot inspect", () => {
    expect(["unknown", "active", "inactive"]).toContain(detectAtRestEncryption("/tmp").state);
  });
});

describe("putting observation and declaration together", () => {
  it("agrees when the declaration matches what is there", () => {
    const report = buildAtRestReport(
      { detail: "Il volume è cifrato.", state: "active" },
      "passphrase",
    );

    expect(report).toMatchObject({ consistent: true, declared: "passphrase", detected: "active" });
  });

  /** The case ADR 0007 exists for: a claimed protection that is not there. */
  it("contradicts a declaration the instance cannot see, and says what to assume", () => {
    const report = buildAtRestReport(
      { detail: "Nessuna cifratura rilevata.", state: "inactive" },
      "passphrase",
    );

    expect(report.consistent).toBe(false);
    expect(report.detail).toMatch(/NON protetti/);
  });

  it("does not contradict a declaration it merely cannot verify", () => {
    const report = buildAtRestReport(
      { detail: "Non verificabile.", state: "unknown" },
      "automatic",
    );

    expect(report.consistent).toBe(true);
  });

  it("leaves «none» alone: declaring no encryption is never a false claim", () => {
    expect(
      buildAtRestReport({ detail: "Nessuna cifratura rilevata.", state: "inactive" }, "none")
        .consistent,
    ).toBe(true);
  });
});

describe("what an administrator actually sees", () => {
  const SETUP_TOKEN = "token-di-prova";

  async function withAdmin(
    declared: "passphrase" | "none" | "unspecified",
    detection: { state: "active" | "inactive" | "unknown"; detail: string },
    use: (diagnostics: AdminDiagnostics, logs: string) => void,
  ): Promise<void> {
    await withTempDataDir(async (dataDir) => {
      const captured: string[] = [];
      const app = await buildApp(
        {
          ...loadConfig({
            ESTIA_AT_REST_ENCRYPTION: declared,
            ESTIA_DATA_DIR: dataDir,
            ESTIA_LOG_LEVEL: "warn",
          }),
        },
        {
          atRest: detection,
          logDestination: new Writable({
            write(chunk, _encoding, done) {
              captured.push(String(chunk));
              done();
            },
          }),
          setupToken: SETUP_TOKEN,
        },
      );

      try {
        await app.inject({
          method: "POST",
          payload: {
            adminPassword: "una-password-lunga",
            adminUsername: "palu",
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });

        const token = (
          await app.inject({
            method: "POST",
            payload: { password: "una-password-lunga", username: "palu" },
            url: "/api/v1/auth/login",
          })
        ).json().token;

        const diagnostics = await app.inject({
          headers: { authorization: `Bearer ${token}` },
          method: "GET",
          url: "/api/v1/admin/diagnostics",
        });

        use(diagnostics.json() as AdminDiagnostics, captured.join(""));
      } finally {
        await app.close();
      }
    });
  }

  it("reports an encrypted volume, and does not pretend to know how it unlocks", async () => {
    await withAdmin(
      "passphrase",
      { detail: "Il volume che contiene i dati è cifrato (CRYPT-LUKS2).", state: "active" },
      (diagnostics) => {
        expect(diagnostics.atRest).toMatchObject({
          consistent: true,
          declared: "passphrase",
          detected: "active",
        });
      },
    );
  });

  /** The whole reason ADR 0007 requirement 2 exists. */
  it("contradicts a declared protection it cannot see, in the answer and in the logs", async () => {
    await withAdmin(
      "passphrase",
      { detail: "Nessuna cifratura rilevata sul volume dei dati (ext4).", state: "inactive" },
      (diagnostics, logs) => {
        expect(diagnostics.atRest.consistent).toBe(false);
        expect(diagnostics.atRest.detail).toMatch(/NON protetti/);
        expect(logs).toContain("at_rest_mismatch");
      },
    );
  });

  it("stays quiet when nothing was declared and nothing was found", async () => {
    await withAdmin(
      "unspecified",
      { detail: "Nessuna cifratura rilevata.", state: "inactive" },
      (diagnostics, logs) => {
        expect(diagnostics.atRest.consistent).toBe(true);
        expect(logs).not.toContain("at_rest_mismatch");
      },
    );
  });
});

describe("declaring the level in the configuration", () => {
  it("treats an unset value as «unspecified», never as «none»", () => {
    expect(loadConfig({}).atRestEncryption).toBe("unspecified");
  });

  it("accepts the three real levels", () => {
    for (const level of ["passphrase", "automatic", "none"] as const) {
      expect(loadConfig({ ESTIA_AT_REST_ENCRYPTION: level }).atRestEncryption).toBe(level);
    }
  });

  it("refuses a level it does not understand", () => {
    expect(() => loadConfig({ ESTIA_AT_REST_ENCRYPTION: "forse" })).toThrow(ConfigurationError);
  });
});
