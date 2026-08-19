import type {
  AdminDiagnostics,
  BackupArchiveView,
  ConnectionView,
  BackupKeyPairResponse,
  BackupSettingsView,
  UpdateBackupSettings,
  CommentView,
  CreateCommentRequest,
  CreatePostRequest,
  LikeResponse,
  MediaView,
  PostView,
  TimelinePage,
  AuditEventView,
  AuthenticatedUser,
  CreateInviteRequest,
  CreateInviteResponse,
  InstancePublicView,
  InstanceSetupRequest,
  InstanceSetupResponse,
  InviteView,
  NetworkProbeReport,
  NetworkProbeResult,
  JoinRequestStatus,
  JoinRequestSubmission,
  JoinRequestView,
  LoginRequest,
  LoginResponse,
  RecoveryRequest,
  RecoveryResponse,
  SessionView,
} from "@estia/contracts";

/** Carries the machine-readable code, so screens can react to the cause. */
export class ApiError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | undefined;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(path, {
    headers,
    method: options.method ?? "GET",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text.length === 0 ? undefined : JSON.parse(text);

  if (!response.ok) {
    const error = payload as { code?: string; message?: string } | undefined;

    throw new ApiError(
      error?.code ?? "unknown_error",
      error?.message ?? "Qualcosa non ha funzionato.",
      response.status,
    );
  }

  return payload as T;
}

export const api = {
  instance: (): Promise<InstancePublicView> => request("/api/v1/instance"),

  /** What the caller is arriving through. Says nothing about the instance. */
  connection: (): Promise<ConnectionView> => request("/api/v1/connection"),

  setup: (body: InstanceSetupRequest): Promise<InstanceSetupResponse> =>
    request("/api/v1/instance/setup", { body, method: "POST" }),

  login: (body: LoginRequest): Promise<LoginResponse> =>
    request("/api/v1/auth/login", { body, method: "POST" }),

  recover: (body: RecoveryRequest): Promise<RecoveryResponse> =>
    request("/api/v1/auth/recover", { body, method: "POST" }),

  me: (token: string): Promise<AuthenticatedUser> => request("/api/v1/auth/me", { token }),

  logout: (token: string): Promise<void> =>
    request("/api/v1/auth/logout", { method: "POST", token }),

  sessions: (token: string): Promise<{ sessions: SessionView[] }> =>
    request("/api/v1/auth/sessions", { token }),

  revokeSession: (token: string, id: string): Promise<void> =>
    request(`/api/v1/auth/sessions/${id}`, { method: "DELETE", token }),

  join: (body: JoinRequestSubmission): Promise<JoinRequestView> =>
    request("/api/v1/join/request", { body, method: "POST" }),

  /**
   * The image goes up as the body of the request, already compressed by the
   * browser (ADR 0011). No file name is sent, and none would be used: the
   * instance builds the path from an identifier of its own.
   */
  uploadMedia: async (token: string, blob: Blob): Promise<MediaView> => {
    const response = await fetch("/api/v1/media", {
      body: blob,
      headers: { authorization: `Bearer ${token}`, "content-type": blob.type },
      method: "POST",
    });

    const payload: unknown = await response.json();

    if (!response.ok) {
      const error = payload as { code?: string; message?: string };

      throw new ApiError(
        error.code ?? "unknown_error",
        error.message ?? "Non sono riuscito a caricare l'immagine.",
        response.status,
      );
    }

    return payload as MediaView;
  },

  timeline: (token: string, cursor?: string): Promise<TimelinePage> =>
    request(`/api/v1/posts${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`, {
      token,
    }),

  createPost: (token: string, body: CreatePostRequest): Promise<PostView> =>
    request("/api/v1/posts", { body, method: "POST", token }),

  deletePost: (token: string, id: string): Promise<void> =>
    request(`/api/v1/posts/${id}`, { method: "DELETE", token }),

  setPostHidden: (token: string, id: string, hidden: boolean): Promise<PostView> =>
    request(`/api/v1/posts/${id}/hidden`, { body: { hidden }, method: "POST", token }),

  setLike: (token: string, id: string, liked: boolean): Promise<LikeResponse> =>
    request(`/api/v1/posts/${id}/like`, { method: liked ? "PUT" : "DELETE", token }),

  comments: (token: string, id: string): Promise<{ comments: CommentView[] }> =>
    request(`/api/v1/posts/${id}/comments`, { token }),

  addComment: (token: string, id: string, body: CreateCommentRequest): Promise<CommentView> =>
    request(`/api/v1/posts/${id}/comments`, { body, method: "POST", token }),

  deleteComment: (token: string, id: string): Promise<void> =>
    request(`/api/v1/comments/${id}`, { method: "DELETE", token }),

  diagnostics: (token: string): Promise<AdminDiagnostics> =>
    request("/api/v1/admin/diagnostics", { token }),

  setNetworkProbe: (
    token: string,
    mode: "off" | "local" | "internet",
  ): Promise<NetworkProbeReport> =>
    request("/api/v1/admin/network/settings", { body: { mode }, method: "PUT", token }),

  probeNetwork: (token: string, ticket: string): Promise<NetworkProbeResult> =>
    request("/api/v1/admin/network/probe", { body: { ticket }, method: "POST", token }),

  invites: (token: string): Promise<{ invites: InviteView[] }> =>
    request("/api/v1/admin/invites", { token }),

  createInvite: (token: string, body: CreateInviteRequest): Promise<CreateInviteResponse> =>
    request("/api/v1/admin/invites", { body, method: "POST", token }),

  revokeInvite: (token: string, id: string): Promise<void> =>
    request(`/api/v1/admin/invites/${id}`, { method: "DELETE", token }),

  joinRequests: (
    token: string,
    status: JoinRequestStatus = "pending",
  ): Promise<{ requests: JoinRequestView[] }> =>
    request(`/api/v1/admin/join-requests?status=${status}`, { token }),

  approve: (token: string, id: string): Promise<JoinRequestView> =>
    request(`/api/v1/admin/join-requests/${id}/approve`, { method: "POST", token }),

  reject: (token: string, id: string): Promise<JoinRequestView> =>
    request(`/api/v1/admin/join-requests/${id}/reject`, { method: "POST", token }),

  audit: (token: string): Promise<{ events: AuditEventView[] }> =>
    request("/api/v1/admin/audit", { token }),

  backupSettings: (token: string): Promise<BackupSettingsView> =>
    request("/api/v1/admin/backups/settings", { token }),

  saveBackupSettings: (token: string, body: UpdateBackupSettings): Promise<BackupSettingsView> =>
    request("/api/v1/admin/backups/settings", { body, method: "PUT", token }),

  /** The private half comes back once and is never stored (ADR 0016). */
  createBackupKeys: (token: string): Promise<BackupKeyPairResponse> =>
    request("/api/v1/admin/backups/keys", { method: "POST", token }),

  backupArchives: (token: string): Promise<{ archives: BackupArchiveView[] }> =>
    request("/api/v1/admin/backups", { token }),

  runBackup: (token: string): Promise<BackupArchiveView> =>
    request("/api/v1/admin/backups", { method: "POST", token }),

  /**
   * Downloading needs the session header, which a plain link cannot carry — the
   * same reason images are fetched rather than linked (ADR 0012). The bytes
   * become a `blob:` URL that the browser saves.
   */
  downloadBackup: async (token: string, name: string): Promise<Blob> => {
    const response = await fetch(`/api/v1/admin/backups/${encodeURIComponent(name)}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new ApiError(
        "download_failed",
        "Non sono riuscito a scaricare l'archivio.",
        response.status,
      );
    }

    return response.blob();
  },
};
