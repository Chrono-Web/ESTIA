import { describe, expect, it } from "vitest";

import {
  checkForUpdate,
  DEFAULT_UPDATE_CHANNEL,
  parseChannel,
  sameRevision,
  shortRevision,
  type FetchLike,
} from "./check.js";

const CURRENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LATEST = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockRegistry(revision: string): FetchLike {
  return async (input) => {
    const url = String(input);

    if (url.includes("/token?")) {
      return jsonResponse({ token: "test-token" });
    }

    if (url.endsWith("/manifests/latest")) {
      return jsonResponse({
        manifests: [
          {
            digest: "sha256:amd64",
            platform: { architecture: "amd64", os: "linux" },
          },
          {
            digest: "sha256:arm64",
            platform: { architecture: "arm64", os: "linux" },
          },
        ],
      });
    }

    if (url.endsWith("/manifests/sha256:amd64") || url.endsWith("/manifests/sha256:arm64")) {
      return jsonResponse({ config: { digest: "sha256:config" } });
    }

    if (url.endsWith("/blobs/sha256:config")) {
      return jsonResponse({
        config: { Labels: { "org.opencontainers.image.revision": revision } },
      });
    }

    throw new Error(`URL inatteso: ${url}`);
  };
}

describe("parseChannel", () => {
  it("splits registry, repository and tag", () => {
    expect(parseChannel(DEFAULT_UPDATE_CHANNEL)).toEqual({
      registry: "ghcr.io",
      repository: "chrono-web/estia",
      tag: "latest",
    });
  });
});

describe("sameRevision", () => {
  it("matches full and short forms", () => {
    expect(sameRevision(CURRENT, CURRENT.slice(0, 7))).toBe(true);
    expect(sameRevision(CURRENT, LATEST)).toBe(false);
  });

  // Il confronto è per prefisso, e ogni stringa comincia con quella vuota: senza
  // questo controllo un valore assente direbbe «sei aggiornato» a chiunque.
  it("refuses to match anything that is not a revision", () => {
    expect(sameRevision(CURRENT, "")).toBe(false);
    expect(sameRevision("", CURRENT)).toBe(false);
    expect(sameRevision(CURRENT, "abc")).toBe(false);
    expect(sameRevision(CURRENT, "non-uno-sha")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("says unknown when the baked revision is not a revision at all", async () => {
    const result = await checkForUpdate({
      currentRevision: "sconosciuta",
      fetch: () => {
        throw new Error("il registry non va nemmeno interrogato");
      },
    });

    expect(result.status).toBe("unknown");
  });

  it("says unknown when this install has no baked revision", async () => {
    const result = await checkForUpdate({
      currentRevision: undefined,
      fetch: mockRegistry(LATEST),
      now: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    expect(result.status).toBe("unknown");
    expect(result.currentRevision).toBeUndefined();
    expect(result.detail).toMatch(/non dichiara/i);
  });

  it("says up_to_date when the registry matches", async () => {
    const result = await checkForUpdate({
      architecture: "amd64",
      currentRevision: CURRENT,
      fetch: mockRegistry(CURRENT),
      now: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "up_to_date",
      channel: DEFAULT_UPDATE_CHANNEL,
      currentRevision: CURRENT,
      latestRevision: CURRENT,
      checkedAt: "2026-08-21T12:00:00.000Z",
    });
    expect(result.detail).toContain(shortRevision(CURRENT));
  });

  it("says available when the registry is ahead", async () => {
    const result = await checkForUpdate({
      architecture: "amd64",
      currentRevision: CURRENT,
      fetch: mockRegistry(LATEST),
      now: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    expect(result.status).toBe("available");
    expect(result.latestRevision).toBe(LATEST);
    expect(result.detail).toContain(shortRevision(LATEST));
  });

  it("says unknown when the registry is unreachable", async () => {
    const result = await checkForUpdate({
      currentRevision: CURRENT,
      fetch: async () => {
        throw new Error("ENOTFOUND");
      },
      now: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    expect(result.status).toBe("unknown");
    expect(result.detail).toMatch(/registry/i);
    expect(result.currentRevision).toBe(CURRENT);
  });
});
