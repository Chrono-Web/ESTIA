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
