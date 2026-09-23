import { describe, expect, it } from "vitest";

import { plan, stale } from "./genera.js";

describe("the files generated from the catalogues", () => {
  it("are up to date — if this fails, run `pnpm i18n`", async () => {
    expect(stale(await plan())).toEqual([]);
  }, 30_000);
});
