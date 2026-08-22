import type {
  AdminDiagnostics,
  BackupArchiveView,
  ConnectedInstanceView,
  ConnectionView,
  BackupKeyPairResponse,
  BackupSettingsView,
  UpdateBackupSettings,
  CommentView,
  CreateCommentRequest,
  CreatePostRequest,
  FeedKind,
  LikeResponse,
  MediaView,
  PersonView,
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
  NotificaFiltro,
  NotificaLente,
  NotifichePage,
  NotificheNuove,
  FederationPingResult,
  FederationView,
  FollowRequest,
  FollowsView,
  ProfileSearchResult,
  ProfileView,
  UpdateProfileRequest,
  NetworkProbeResult,
  JoinRequestStatus,
  JoinRequestSubmission,
  JoinRequestView,
  LoginRequest,
  LoginResponse,
  RecoveryRequest,
  UiPreferences,
  RecoveryResponse,
  SearchScope,
  SessionView,
  UpdateCheckResult,
  ClaimKeyPackageResponse,
  DeviceKeyView,
  DevicePublicKeyResponse,
  KeyBackupView,
  PublishKeyPackagesRequest,
  RegisterDeviceKeyRequest,
  RegisterDeviceKeyResponse,
  SaveKeyBackupRequest,
  ConversazioneView,
  CreateConversazioneRequest,
  InviaMessaggioRequest,
  MessaggioBustaView,
  ConversazioneMessaggiPage,
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
  /** Per annullare una richiesta superata da una più recente. */
  signal?: AbortSignal;
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
    ...(options.signal === undefined ? {} : { signal: options.signal }),
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

  /** Dice solo se il codice è quello giusto. Non configura e non concede niente. */
  verifySetupToken: (setupToken: string): Promise<void> =>
    request("/api/v1/instance/setup/verify", { body: { setupToken }, method: "POST" }),

  setup: (body: InstanceSetupRequest): Promise<InstanceSetupResponse> =>
    request("/api/v1/instance/setup", { body, method: "POST" }),

  login: (body: LoginRequest): Promise<LoginResponse> =>
    request("/api/v1/auth/login", { body, method: "POST" }),

  recover: (body: RecoveryRequest): Promise<RecoveryResponse> =>
    request("/api/v1/auth/recover", { body, method: "POST" }),

  me: (token: string): Promise<AuthenticatedUser> => request("/api/v1/auth/me", { token }),

  updateAppearance: (token: string, body: UiPreferences): Promise<UiPreferences> =>
    request("/api/v1/me/appearance", { body, method: "PUT", token }),

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

  /**
   * Uno dei due feed. Non un filtro sopra un elenco unico: un post sta
   * nell'istanza oppure nella rete, mai in tutti e due (ADR 0018).
   */
  timeline: (
    token: string,
    options: { feed: FeedKind; cursor?: string },
  ): Promise<TimelinePage> => {
    const query = new URLSearchParams({ feed: options.feed });

    if (options.cursor !== undefined) {
      query.set("cursor", options.cursor);
    }

    return request(`/api/v1/posts?${query.toString()}`, { token });
  },

  createPost: (token: string, body: CreatePostRequest): Promise<PostView> =>
    request("/api/v1/posts", { body, method: "POST", token }),

  deletePost: (token: string, id: string): Promise<void> =>
    request(`/api/v1/posts/${id}`, { method: "DELETE", token }),

  setPostHidden: (token: string, id: string, hidden: boolean): Promise<PostView> =>
    request(`/api/v1/posts/${id}/hidden`, { body: { hidden }, method: "POST", token }),

  setLike: (token: string, id: string, liked: boolean): Promise<LikeResponse> =>
    request(`/api/v1/posts/${id}/like`, { method: liked ? "PUT" : "DELETE", token }),

  getPost: (token: string, id: string): Promise<PostView> =>
    request(`/api/v1/posts/${id}`, { token }),

  comments: (token: string, id: string): Promise<{ comments: CommentView[] }> =>
    request(`/api/v1/posts/${id}/comments`, { token }),

  addComment: (token: string, id: string, body: CreateCommentRequest): Promise<CommentView> =>
    request(`/api/v1/posts/${id}/comments`, { body, method: "POST", token }),

  updateComment: (token: string, id: string, body: string): Promise<CommentView> =>
    request(`/api/v1/comments/${id}`, { body: { body }, method: "PATCH", token }),

  setCommentHidden: (token: string, id: string, hidden: boolean): Promise<CommentView> =>
    request(`/api/v1/comments/${id}/hidden`, { body: { hidden }, method: "POST", token }),

  setCommentLike: (token: string, id: string, liked: boolean): Promise<LikeResponse> =>
    request(`/api/v1/comments/${id}/like`, { method: liked ? "PUT" : "DELETE", token }),

  deleteComment: (token: string, id: string): Promise<void> =>
    request(`/api/v1/comments/${id}`, { method: "DELETE", token }),

  diagnostics: (token: string): Promise<AdminDiagnostics> =>
    request("/api/v1/admin/diagnostics", { token }),

  checkUpdates: (token: string): Promise<UpdateCheckResult> =>
    request("/api/v1/admin/updates/check", { method: "POST", token }),

  setNetworkProbe: (
    token: string,
    mode: "off" | "local" | "internet",
  ): Promise<NetworkProbeReport> =>
    request("/api/v1/admin/network/settings", { body: { mode }, method: "PUT", token }),

  probeNetwork: (token: string, ticket: string): Promise<NetworkProbeResult> =>
    request("/api/v1/admin/network/probe", { body: { ticket }, method: "POST", token }),

  // Le connessioni fra istanze (ADR 0021). Ogni azione restituisce la vista
  // intera invece di una riga: lo stato di un collegamento cambia anche
  // dall'altra parte, e una risposta parziale mostrerebbe metà verità.
  profile: (token: string): Promise<ProfileView> => request("/api/v1/profile", { token }),

  updateProfile: (token: string, body: UpdateProfileRequest): Promise<ProfileView> =>
    request("/api/v1/profile", { body, method: "PUT", token }),

  // Una ricerca chiede in casa e alle istanze collegate, e aspetta la più
  // lenta. Non c'è nessun indice: ADR 0018 l'ha tolto il 2026-08-20 perché una
  // riga d'indice è una copia che sopravvive a chi nomina.
  searchProfiles: (
    token: string,
    term: string,
    ambito: SearchScope,
    signal?: AbortSignal,
  ): Promise<ProfileSearchResult> =>
    request(`/api/v1/profiles?q=${encodeURIComponent(term)}&ambito=${ambito}`, {
      token,
      ...(signal === undefined ? {} : { signal }),
    }),

  /** Dove si sta cercando, quando si cerca nella rete. Solo i nomi dichiarati. */
  connectedInstances: (token: string): Promise<{ instances: ConnectedInstanceView[] }> =>
    request("/api/v1/instances", { token }),

  /** La pagina di una persona: chi è, e che rapporto hai con lei. */
  person: (token: string, username: string): Promise<PersonView> =>
    request(`/api/v1/profiles/${encodeURIComponent(username)}`, { token }),

  /** Una persona di un'altra istanza: visita `profilo` sul protocollo. */
  remotePerson: (token: string, instanceKey: string, username: string): Promise<PersonView> =>
    request(`/api/v1/remote/${encodeURIComponent(instanceKey)}/${encodeURIComponent(username)}`, {
      token,
    }),

  /** I suoi post, nella lente in cui si sta guardando. */
  personPosts: (
    token: string,
    username: string,
    options: { feed: FeedKind; cursor?: string },
  ): Promise<TimelinePage> => {
    const query = new URLSearchParams({ feed: options.feed });

    if (options.cursor !== undefined) {
      query.set("cursor", options.cursor);
    }

    return request(`/api/v1/profiles/${encodeURIComponent(username)}/posts?${query.toString()}`, {
      token,
    });
  },

  /** I post di una persona remota: la stessa bacheca, per un nome solo. */
  remotePersonPosts: (
    token: string,
    instanceKey: string,
    username: string,
    options: { cursor?: string } = {},
  ): Promise<TimelinePage> => {
    const query = new URLSearchParams();

    if (options.cursor !== undefined) {
      query.set("cursor", options.cursor);
    }

    const coda = query.size === 0 ? "" : `?${query.toString()}`;

    return request(
      `/api/v1/remote/${encodeURIComponent(instanceKey)}/${encodeURIComponent(username)}/posts${coda}`,
      { token },
    );
  },

  /**
   * Un cuore su un post di un'altra casa ([ADR 0025]).
   *
   * Separato da `setLike` e non un suo parametro: l'indirizzo è diverso, la
   * cosa che può andare storta è diversa — quella casa può essere spenta — e
   * chi chiama deve trattare il fallimento invece di ignorarlo.
   */
  setRemoteLike: (
    token: string,
    origine: { instanceKey: string; username: string },
    id: string,
    liked: boolean,
  ): Promise<LikeResponse> =>
    request(
      `/api/v1/remote/${encodeURIComponent(origine.instanceKey)}/${encodeURIComponent(
        origine.username,
      )}/posts/${encodeURIComponent(id)}/cuore`,
      { method: liked ? "PUT" : "DELETE", token },
    ),

  addRemoteComment: (
    token: string,
    origine: { instanceKey: string; username: string },
    postId: string,
    body: CreateCommentRequest,
  ): Promise<CommentView> =>
    request(
      `/api/v1/remote/${encodeURIComponent(origine.instanceKey)}/${encodeURIComponent(
        origine.username,
      )}/posts/${encodeURIComponent(postId)}/comments`,
      { method: "POST", body, token },
    ),

  getRemotePost: (
    token: string,
    origine: { instanceKey: string; username: string },
    id: string,
  ): Promise<PostView> =>
    request(
      `/api/v1/remote/${encodeURIComponent(origine.instanceKey)}/${encodeURIComponent(
        origine.username,
      )}/posts/${encodeURIComponent(id)}`,
      { token },
    ),

  remoteComments: (
    token: string,
    origine: { instanceKey: string; username: string },
    id: string,
  ): Promise<{ comments: CommentView[] }> =>
    request(
      `/api/v1/remote/${encodeURIComponent(origine.instanceKey)}/${encodeURIComponent(
        origine.username,
      )}/posts/${encodeURIComponent(id)}/comments`,
      { token },
    ),

  getPublicComment: async (instanceKey: string, commentId: string): Promise<{ body: string }> => {
    // Determiniamo il protocollo corrente (http/https)
    const protocol = window.location.protocol;
    const url = `${protocol}//${instanceKey}/api/v1/public/comments/${commentId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Errore nel caricamento del commento remoto: ${response.statusText}`);
    }
    return response.json();
  },

  notifiche: (
    token: string,
    options: { filtro: NotificaFiltro; lente: NotificaLente; cursor?: string },
  ): Promise<NotifichePage> => {
    const query = new URLSearchParams({ filtro: options.filtro, lente: options.lente });

    if (options.cursor !== undefined) {
      query.set("cursor", options.cursor);
    }

    return request(`/api/v1/notifiche?${query.toString()}`, { token });
  },

  notificheNuove: (token: string, signal?: AbortSignal): Promise<NotificheNuove> =>
    request("/api/v1/notifiche/nuove", { token, ...(signal === undefined ? {} : { signal }) }),

  segnaNotificheViste: (token: string, lente: NotificaLente): Promise<NotificheNuove> =>
    request("/api/v1/notifiche/viste", { body: { lente }, method: "POST", token }),

  follows: (token: string): Promise<FollowsView> => request("/api/v1/profile/follows", { token }),

  follow: (token: string, body: FollowRequest): Promise<void> =>
    request("/api/v1/profile/follows", { body, method: "POST", token }),

  unfollow: (token: string, id: string): Promise<void> =>
    request(`/api/v1/profile/follows/${id}`, { method: "DELETE", token }),

  acceptFollower: (token: string, id: string): Promise<void> =>
    request(`/api/v1/profile/followers/${id}/accetta`, { method: "POST", token }),

  removeFollower: (token: string, id: string): Promise<void> =>
    request(`/api/v1/profile/followers/${id}`, { method: "DELETE", token }),

  federation: (token: string): Promise<FederationView> => request("/api/v1/federation", { token }),

  connectInstance: (token: string, publicKey: string): Promise<FederationView> =>
    request("/api/v1/federation/connections", { body: { publicKey }, method: "POST", token }),

  acceptInstance: (token: string, publicKey: string): Promise<FederationView> =>
    request("/api/v1/federation/connections/accept", {
      body: { publicKey },
      method: "POST",
      token,
    }),

  blockInstance: (token: string, publicKey: string): Promise<FederationView> =>
    request("/api/v1/federation/connections/block", { body: { publicKey }, method: "POST", token }),

  forgetInstance: (token: string, publicKey: string): Promise<FederationView> =>
    request("/api/v1/federation/connections/forget", {
      body: { publicKey },
      method: "POST",
      token,
    }),

  pingInstance: (token: string, publicKey: string): Promise<FederationPingResult> =>
    request("/api/v1/federation/connections/ping", { body: { publicKey }, method: "POST", token }),

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

  registerDeviceKey: (
    token: string,
    body: RegisterDeviceKeyRequest,
  ): Promise<RegisterDeviceKeyResponse> =>
    request("/api/v1/dispositivi/chiave", { body, method: "POST", token }),

  getMyDeviceKey: (token: string): Promise<{ device: DeviceKeyView | null }> =>
    request("/api/v1/dispositivi/chiave/me", { token }),

  publishKeyPackages: (
    token: string,
    body: PublishKeyPackagesRequest,
  ): Promise<{ count: number }> =>
    request("/api/v1/dispositivi/key-packages", { body, method: "POST", token }),

  claimKeyPackage: (token: string, userId: string): Promise<ClaimKeyPackageResponse> =>
    request(`/api/v1/dispositivi/key-packages/claim/${encodeURIComponent(userId)}`, { token }),

  getDevicePublicKey: (token: string, deviceId: string): Promise<DevicePublicKeyResponse> =>
    request(`/api/v1/dispositivi/${encodeURIComponent(deviceId)}/chiave-pubblica`, { token }),

  saveKeyBackup: (token: string, body: SaveKeyBackupRequest): Promise<KeyBackupView> =>
    request("/api/v1/dispositivi/backup", { body, method: "PUT", token }),

  getKeyBackup: async (token: string): Promise<KeyBackupView | undefined> => {
    try {
      return await request("/api/v1/dispositivi/backup", { token });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return undefined;
      }
      throw e;
    }
  },

  conversazioni: (token: string): Promise<{ conversazioni: ConversazioneView[] }> =>
    request("/api/v1/conversazioni", { token }),

  createConversazione: (
    token: string,
    body: CreateConversazioneRequest,
  ): Promise<{ conversazione: ConversazioneView; initialMessaggio?: MessaggioBustaView }> =>
    request("/api/v1/conversazioni", { body, method: "POST", token }),

  getConversazione: (token: string, id: string): Promise<{ conversazione: ConversazioneView }> =>
    request(`/api/v1/conversazioni/${encodeURIComponent(id)}`, { token }),

  getMessaggi: (
    token: string,
    id: string,
    query?: { limit?: number; before?: string },
  ): Promise<ConversazioneMessaggiPage> => {
    const q = new URLSearchParams();
    if (query?.limit !== undefined) q.set("limit", String(query.limit));
    if (query?.before !== undefined) q.set("before", query.before);
    const coda = q.size === 0 ? "" : `?${q.toString()}`;
    return request(`/api/v1/conversazioni/${encodeURIComponent(id)}/messaggi${coda}`, { token });
  },

  inviaMessaggio: (
    token: string,
    id: string,
    body: InviaMessaggioRequest,
  ): Promise<{ messaggio: MessaggioBustaView }> =>
    request(`/api/v1/conversazioni/${encodeURIComponent(id)}/messaggi`, {
      body,
      method: "POST",
      token,
    }),

  segnaConversazioneLetta: (token: string, id: string, finoA: string): Promise<{ ok: true }> =>
    request(`/api/v1/conversazioni/${encodeURIComponent(id)}/visto`, {
      body: { finoA },
      method: "POST",
      token,
    }),

  deleteConversazione: (token: string, id: string): Promise<{ ok: true }> =>
    request(`/api/v1/conversazioni/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
    }),
};
