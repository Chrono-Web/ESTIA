import type { UpdateCheckResult } from "@estia/contracts";

/**
 * Confronta la revisione cotta nell'immagine con quella di `latest` su GHCR.
 *
 * Non parla con Docker sul NAS: legge solo il registry pubblico, come farebbe
 * un `docker pull` senza scaricare i layer. Il pannello mostra i comandi di
 * aggiornamento soltanto quando il confronto dice `available`.
 */

export const DEFAULT_UPDATE_CHANNEL = "ghcr.io/chrono-web/estia:latest";

const REVISION_LABEL = "org.opencontainers.image.revision";

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
    redirect?: "follow" | "error" | "manual";
    signal?: AbortSignal;
  },
) => Promise<Response>;

export interface CheckForUpdateOptions {
  currentRevision: string | undefined;
  /** Override in tests. Defaults to the public ESTIA image on GHCR. */
  channel?: string;
  fetch?: FetchLike;
  now?: () => Date;
  /** Prefer this OCI arch when the channel is a multi-arch index. */
  architecture?: string;
}

interface ParsedChannel {
  registry: string;
  repository: string;
  tag: string;
}

export function parseChannel(channel: string): ParsedChannel {
  const trimmed = channel.trim();
  const slash = trimmed.indexOf("/");
  const colon = trimmed.lastIndexOf(":");

  if (slash <= 0 || colon <= slash) {
    throw new Error(`Canale di aggiornamento non valido: ${channel}`);
  }

  return {
    registry: trimmed.slice(0, slash),
    repository: trimmed.slice(slash + 1, colon),
    tag: trimmed.slice(colon + 1),
  };
}

/** Un sha di commit, intero o accorciato: è ciò che l'immagine dichiara. */
const REVISION = /^[0-9a-f]{7,40}$/;

export function eRevisione(valore: string): boolean {
  return REVISION.test(valore.trim().toLowerCase());
}

/**
 * Due revisioni sono la stessa se una è il prefisso dell'altra: `latest` porta
 * lo sha intero, l'immagine locale a volte quello corto.
 *
 * Il confronto per prefisso pretende che siano **entrambe** revisioni vere. Un
 * valore vuoto o mendace è prefisso di chiunque, e direbbe «sei aggiornato» a
 * un'istanza che non lo è: meglio non sapere che sapere male.
 */
export function sameRevision(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();

  if (!eRevisione(left) || !eRevisione(right)) {
    return false;
  }

  return left === right || left.startsWith(right) || right.startsWith(left);
}

export function shortRevision(sha: string): string {
  return sha.toLowerCase().slice(0, 7);
}

function dockerArchitecture(nodeArch: string): string {
  switch (nodeArch) {
    case "arm64":
      return "arm64";
    case "x64":
      return "amd64";
    default:
      return "amd64";
  }
}

async function readJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`${url} → HTTP ${String(response.status)}`);
  }

  return (await response.json()) as unknown;
}

async function anonymousToken(
  fetchImpl: FetchLike,
  registry: string,
  repository: string,
): Promise<string> {
  const url = `https://${registry}/token?scope=${encodeURIComponent(`repository:${repository}:pull`)}`;
  const body = (await readJson(fetchImpl, url, {})) as { token?: string };

  if (typeof body.token !== "string" || body.token.length === 0) {
    throw new Error("Il registry non ha rilasciato un token anonimo.");
  }

  return body.token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickManifestDigest(index: unknown, architecture: string): string | undefined {
  if (!isRecord(index) || !Array.isArray(index.manifests)) {
    return undefined;
  }

  const linux = index.manifests.filter((entry): entry is Record<string, unknown> => {
    if (!isRecord(entry) || typeof entry.digest !== "string") {
      return false;
    }

    const platform = entry.platform;
    return (
      isRecord(platform) &&
      platform.os === "linux" &&
      typeof platform.architecture === "string" &&
      platform.architecture !== "unknown"
    );
  });

  const preferred = linux.find((entry) => {
    const platform = entry.platform as Record<string, unknown>;
    return platform.architecture === architecture;
  });

  const chosen = preferred ?? linux[0];
  return typeof chosen?.digest === "string" ? chosen.digest : undefined;
}

async function readRevisionLabel(
  fetchImpl: FetchLike,
  channel: ParsedChannel,
  architecture: string,
): Promise<string> {
  const token = await anonymousToken(fetchImpl, channel.registry, channel.repository);
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://${channel.registry}/v2/${channel.repository}`;

  const top = await readJson(fetchImpl, `${base}/manifests/${encodeURIComponent(channel.tag)}`, {
    ...auth,
    Accept: MANIFEST_ACCEPT,
  });

  let manifest = top;

  if (isRecord(top) && Array.isArray(top.manifests)) {
    const digest = pickManifestDigest(top, architecture);

    if (digest === undefined) {
      throw new Error("L'indice pubblicato non contiene un'immagine linux.");
    }

    manifest = await readJson(fetchImpl, `${base}/manifests/${digest}`, {
      ...auth,
      Accept: MANIFEST_ACCEPT,
    });
  }

  if (
    !isRecord(manifest) ||
    !isRecord(manifest.config) ||
    typeof manifest.config.digest !== "string"
  ) {
    throw new Error("Il manifesto non dichiara un config blob.");
  }

  const config = await readJson(fetchImpl, `${base}/blobs/${manifest.config.digest}`, {
    ...auth,
    Accept:
      "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json",
  });

  if (!isRecord(config) || !isRecord(config.config)) {
    throw new Error("Il config blob non è leggibile.");
  }

  const labels = config.config.Labels;
  const revision =
    isRecord(labels) && typeof labels[REVISION_LABEL] === "string"
      ? labels[REVISION_LABEL].trim().toLowerCase()
      : "";

  if (!eRevisione(revision)) {
    throw new Error("L'immagine pubblicata non dichiara org.opencontainers.image.revision.");
  }

  return revision;
}

export async function checkForUpdate(options: CheckForUpdateOptions): Promise<UpdateCheckResult> {
  const channel = options.channel ?? DEFAULT_UPDATE_CHANNEL;
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const fetchImpl = options.fetch ?? fetch;
  const architecture = options.architecture ?? dockerArchitecture(process.arch);
  const current = options.currentRevision?.toLowerCase();

  if (current === undefined || !eRevisione(current)) {
    return {
      status: "unknown",
      channel,
      checkedAt,
      detail:
        "Questa installazione non dichiara da quale commit è nata — tipico di una prova da sorgente o di un'immagine precedente. Non posso confrontarla con il registry; l'aggiornamento resta quello della guida di installazione.",
    };
  }

  try {
    const parsed = parseChannel(channel);
    const latest = await readRevisionLabel(fetchImpl, parsed, architecture);

    if (sameRevision(current, latest)) {
      return {
        status: "up_to_date",
        channel,
        checkedAt,
        currentRevision: current,
        latestRevision: latest,
        detail: `Sei già su ${shortRevision(current)}, l'ultima pubblicata su ${channel}.`,
      };
    }

    return {
      status: "available",
      channel,
      checkedAt,
      currentRevision: current,
      latestRevision: latest,
      detail: `C'è una versione nuova: sei su ${shortRevision(current)}, sul registry c'è ${shortRevision(latest)}. Si aggiorna da terminale, nello stesso modo in cui hai installato.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "errore sconosciuto";

    return {
      status: "unknown",
      channel,
      checkedAt,
      currentRevision: current,
      detail: `Non riesco a raggiungere il registry (${reason}). Riprova quando la macchina ha rete verso Internet.`,
    };
  }
}
