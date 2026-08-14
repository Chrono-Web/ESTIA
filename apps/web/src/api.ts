import type {
  AdminDiagnostics,
  AuditEventView,
  AuthenticatedUser,
  CreateInviteRequest,
  CreateInviteResponse,
  InstancePublicView,
  InstanceSetupRequest,
  InstanceSetupResponse,
  InviteView,
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

  diagnostics: (token: string): Promise<AdminDiagnostics> =>
    request("/api/v1/admin/diagnostics", { token }),

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
};
