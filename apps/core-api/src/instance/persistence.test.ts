import { writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "@estia/config";
import type { AdminDiagnostics, InstancePublicView } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { inspectDataDurability, type ContainerMarkers } from "./persistence.js";

/**
 * The failure this exists for was reproduced on the published image the
 * 2026-08-17: an instance run without a volume works perfectly, and comes back
 * `unconfigured` with a brand new public key the moment the container is
 * recreated — which is exactly what updating does.
 *
 * It happened a second time on 2026-08-20, through the door left open by the
 * first fix: an anonymous volume. See ADR 0019.
 *
 * Worth knowing before debugging a red suite: since that ADR, the setup route
 * refuses an instance whose data will not survive an update, and the other test
 * files build their apps without saying what durability to assume — so they
 * inherit whatever the machine running them reports. On a laptop or a CI runner
 * that is `persistent` or `unknown` and nothing changes. **Inside a container
 * without a volume it is `ephemeral`**, and every test that configures an
 * instance fails with `data_not_durable`. That is the guard working, not a bug.
 */

/** A container root plus, optionally, a volume mounted on the data directory. */
function machine(
  root: string,
  mounts: string,
  markers: { container: boolean },
): {
  roots: { mountInfo: string; sysBlock: string };
  markers: ContainerMarkers;
} {
  const mountInfo = path.join(root, "mountinfo");
  const marker = path.join(root, "dockerenv");

  writeFileSync(mountInfo, mounts);

  if (markers.container) {
    writeFileSync(marker, "");
  }

  return {
    markers: { docker: marker, podman: path.join(root, "non-esiste") },
    roots: { mountInfo, sysBlock: path.join(root, "sys") },
  };
}

const CONTAINER_ROOT = "25 30 0:24 / / rw,relatime - overlay overlay rw";
const HOST_ROOT = "25 30 8:1 / / rw,relatime - ext4 /dev/sda1 rw";
const DATA_VOLUME =
  "141 25 254:1 /docker/volumes/estia-data/_data /data rw,relatime - ext4 /dev/sdb1 rw";
/** Docker names a volume nobody asked for with 64 hex characters. */
const ANONYMOUS_VOLUME =
  "141 25 254:1 /docker/volumes/681ee294d25bfb06184de4a1375bb95764e0ef437e9715eb8dbac2937af2bff2/_data /data rw,relatime - ext4 /dev/sdb1 rw";

describe("whether the data survives the next update", () => {
  /** The reported bug, in one assertion. */
  it("calls out a container whose data directory is not a mount at all", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, CONTAINER_ROOT, { container: true });
      const report = inspectDataDurability("/data", roots, markers);

      expect(report.durability).toBe("ephemeral");
      expect(report.detail).toMatch(/spariranno/);
      // And it names the part that cannot be recovered by any means.
      expect(report.detail).toMatch(/chiave privata/);
    });
  });

  it("is content when a volume carries the data directory", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, `${CONTAINER_ROOT}\n${DATA_VOLUME}`, {
        container: true,
      });

      expect(inspectDataDurability("/data", roots, markers).durability).toBe("persistent");
    });
  });

  /**
   * What an instance started without any mapping actually gets, and the second
   * incident of this file: `VOLUME /data` produces a volume nobody named, and
   * only `docker compose` carries one of those over to the new container. A
   * NAS panel does not, so this is not «persistent with a caveat» — it is its
   * own answer, and ADR 0019 refuses a setup on it.
   */
  it("does not call a nameless volume persistent", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, `${CONTAINER_ROOT}\n${ANONYMOUS_VOLUME}`, {
        container: true,
      });
      const report = inspectDataDurability("/data", roots, markers);

      expect(report.durability).toBe("anonymous");
      expect(report.detail).toMatch(/anonimo/);
      // Says where the data is lost, not merely that it might be.
      expect(report.detail).toMatch(/pannello del NAS/);
      // And names the volume, which is what recovering an orphaned one takes.
      expect(report.detail).toMatch(
        /681ee294d25bfb06184de4a1375bb95764e0ef437e9715eb8dbac2937af2bff2/,
      );
    });
  });

  it("is content with a volume somebody named", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, `${CONTAINER_ROOT}\n${DATA_VOLUME}`, {
        container: true,
      });

      expect(inspectDataDurability("/data", roots, markers).detail).not.toMatch(/anonimo/);
    });
  });

  /** A bind mount one level up is still a bind mount. */
  it("accepts a data directory inside a mounted parent", async () => {
    await withTempDataDir(async (root) => {
      const mounts = `${CONTAINER_ROOT}\n150 25 254:1 / /srv rw,relatime - ext4 /dev/sdb1 rw`;
      const { markers, roots } = machine(root, mounts, { container: true });

      expect(inspectDataDurability("/srv/estia", roots, markers).durability).toBe("persistent");
    });
  });

  /**
   * The false positive that would matter most: a plain install on a laptop or a
   * mini-PC keeps its data under the root filesystem, and that is fine.
   */
  it("says nothing alarming outside a container", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, HOST_ROOT, { container: false });

      expect(inspectDataDurability("/srv/estia/.data", roots, markers).durability).toBe(
        "persistent",
      );
    });
  });

  /** An overlay root is a container even where no marker file was left behind. */
  it("recognises a container from its overlay root alone", async () => {
    await withTempDataDir(async (root) => {
      const { markers, roots } = machine(root, CONTAINER_ROOT, { container: false });

      expect(inspectDataDurability("/data", roots, markers).durability).toBe("ephemeral");
    });
  });

  it("claims nothing where there is no mount table to read", () => {
    const report = inspectDataDurability("/data", {
      mountInfo: "/non/esiste/mountinfo",
      sysBlock: "/non/esiste/sys",
    });

    expect(report.durability).toBe("unknown");
  });
});

describe("what the person about to trust it is told", () => {
  const SETUP_TOKEN = "token-di-prova";
  const EPHEMERAL = {
    detail: "I dati stanno dentro il container e spariranno al prossimo aggiornamento.",
    durability: "ephemeral",
  } as const;
  const ANONYMOUS = {
    detail: "I dati stanno su un volume anonimo, e il pannello del NAS non se lo porta dietro.",
    durability: "anonymous",
  } as const;
  const PERSISTENT = {
    detail: "I dati stanno su un volume montato in /data.",
    durability: "persistent",
  } as const;

  const VALID_SETUP = {
    adminPassword: "una-password-lunga",
    adminUsername: "palu",
    name: "Via Roma",
    setupToken: SETUP_TOKEN,
  };

  function configFor(dataDir: string, allowEphemeral = false): AppConfig {
    return loadConfig({
      ESTIA_DATA_DIR: dataDir,
      ESTIA_LOG_LEVEL: "silent",
      ...(allowEphemeral ? { ESTIA_ALLOW_EPHEMERAL_DATA: "true" } : {}),
    });
  }

  /**
   * Before the data goes in, not after it is lost: while an instance is
   * unconfigured the only person looking is whoever is setting it up.
   */
  it("warns on the setup screen, before there is anything to lose", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), {
        durability: EPHEMERAL,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        const view = (
          await instance.inject({ method: "GET", url: "/api/v1/instance" })
        ).json() as InstancePublicView;

        expect(view).toMatchObject({ dataDurability: "ephemeral", state: "unconfigured" });
      });
    });
  });

  it("says which of the two it is, so the screen can say what to do", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), {
        durability: ANONYMOUS,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        const view = (
          await instance.inject({ method: "GET", url: "/api/v1/instance" })
        ).json() as InstancePublicView;

        expect(view.dataDurability).toBe("anonymous");
      });
    });
  });

  /**
   * The decision of ADR 0019, in one assertion for each way of losing the data.
   * A warning above the form was shown, read, and reasonably disbelieved —
   * the guide said the volume was not needed — so the form is not there at all.
   */
  it.each([
    ["dentro il container", EPHEMERAL],
    ["su un volume anonimo", ANONYMOUS],
  ])("refuses to be configured with the data %s", async (_case, durability) => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), {
        durability,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        const response = await instance.inject({
          method: "POST",
          payload: VALID_SETUP,
          url: "/api/v1/instance/setup",
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().code).toBe("data_not_durable");

        // And it stayed unconfigured: no administrator, no key anybody pinned.
        const view = (
          await instance.inject({ method: "GET", url: "/api/v1/instance" })
        ).json() as InstancePublicView;

        expect(view.state).toBe("unconfigured");
      });
    });
  });

  /** The refusal must not become a reason to disable the thing entirely. */
  it("configures normally when the data has somewhere to live", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), {
        durability: PERSISTENT,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        const response = await instance.inject({
          method: "POST",
          payload: VALID_SETUP,
          url: "/api/v1/instance/setup",
        });

        expect(response.statusCode).toBe(201);
      });
    });
  });

  /** For ten minutes of curiosity with `docker run`, and for nothing else. */
  it("lets a deliberate throwaway through", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir, true), {
        durability: EPHEMERAL,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        const response = await instance.inject({
          method: "POST",
          payload: VALID_SETUP,
          url: "/api/v1/instance/setup",
        });

        expect(response.statusCode).toBe(201);
      });
    });
  });

  /** Once configured the same fact belongs to the administrator alone. */
  it("keeps it out of the public view once there are members", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir, true), {
        durability: EPHEMERAL,
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        await instance.inject({
          method: "POST",
          payload: VALID_SETUP,
          url: "/api/v1/instance/setup",
        });

        const view = (
          await instance.inject({ method: "GET", url: "/api/v1/instance" })
        ).json() as InstancePublicView;

        expect(view.state).toBe("configured");
        expect(view.dataDurability).toBeUndefined();

        const token = (
          await instance.inject({
            method: "POST",
            payload: { password: "una-password-lunga", username: "palu" },
            url: "/api/v1/auth/login",
          })
        ).json().token;

        const diagnostics = (
          await instance.inject({
            headers: { authorization: `Bearer ${token as string}` },
            method: "GET",
            url: "/api/v1/admin/diagnostics",
          })
        ).json() as AdminDiagnostics;

        expect(diagnostics.dataDurability).toBe("ephemeral");
        expect(diagnostics.dataDurabilityDetail).toMatch(/spariranno/);
      });
    });
  });
});
