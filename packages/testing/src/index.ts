import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface Closable {
  close: () => Promise<unknown>;
}

export async function withClosable<T extends Closable, Result>(
  resource: T,
  use: (resource: T) => Promise<Result>,
): Promise<Result> {
  try {
    return await use(resource);
  } finally {
    await resource.close();
  }
}

/**
 * Runs `use` against a throwaway data directory, removed afterwards even on
 * failure. Lets tests exercise the real persistence path instead of a mock.
 */
export async function withTempDataDir<Result>(
  use: (dataDir: string) => Promise<Result>,
): Promise<Result> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "estia-test-"));

  try {
    return await use(dataDir);
  } finally {
    rmSync(dataDir, { force: true, recursive: true });
  }
}
