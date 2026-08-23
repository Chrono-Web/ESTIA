import type {
  AuthenticatedUser,
  ClaimKeyPackageResponse,
  ConversazioneMessaggiPage,
  ConversazioneView,
  CreateConversazioneRequest,
  DeviceKeyView,
  DevicePublicKeyResponse,
  FeedKind,
  FollowRequest,
  FollowsView,
  InstancePublicView,
  InviaMessaggioRequest,
  KeyBackupView,
  LikeResponse,
  LoginRequest,
  LoginResponse,
  MessaggioBustaView,
  PersonView,
  PublishKeyPackagesRequest,
  RegisterDeviceKeyRequest,
  RegisterDeviceKeyResponse,
  SaveKeyBackupRequest,
  TimelinePage,
} from "@estia/contracts";

import { ApiError } from "./errori";

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | undefined;
  signal?: AbortSignal;
}

export interface EstiaApi {
  instance: (signal?: AbortSignal) => Promise<InstancePublicView>;
  login: (body: LoginRequest) => Promise<LoginResponse>;
  me: (token: string) => Promise<AuthenticatedUser>;
  logout: (token: string) => Promise<void>;
  timeline: (
    token: string,
    options: { feed: FeedKind; cursor?: string },
    signal?: AbortSignal,
  ) => Promise<TimelinePage>;
  setLike: (token: string, id: string, liked: boolean) => Promise<LikeResponse>;
  setRemoteLike: (
    token: string,
    origine: { instanceKey: string; username: string },
    id: string,
    liked: boolean,
  ) => Promise<LikeResponse>;
  person: (token: string, username: string) => Promise<PersonView>;
  remotePerson: (token: string, instanceKey: string, username: string) => Promise<PersonView>;
  personPosts: (
    token: string,
    username: string,
    options: { feed: FeedKind; cursor?: string },
  ) => Promise<TimelinePage>;
  remotePersonPosts: (
    token: string,
    instanceKey: string,
    username: string,
    options?: { cursor?: string },
  ) => Promise<TimelinePage>;
  follows: (token: string) => Promise<FollowsView>;
  follow: (token: string, body: FollowRequest) => Promise<void>;
  unfollow: (token: string, id: string) => Promise<void>;
  acceptFollower: (token: string, id: string) => Promise<void>;
  removeFollower: (token: string, id: string) => Promise<void>;

  // Dispositivi e Crittografia E2E
  registerDeviceKey: (
    token: string,
    body: RegisterDeviceKeyRequest,
  ) => Promise<RegisterDeviceKeyResponse>;
  getMyDeviceKey: (token: string) => Promise<{ device: DeviceKeyView | null }>;
  publishKeyPackages: (
    token: string,
    body: PublishKeyPackagesRequest,
  ) => Promise<{ count: number }>;
  claimKeyPackage: (token: string, userId: string) => Promise<ClaimKeyPackageResponse>;
  getDevicePublicKey: (token: string, deviceId: string) => Promise<DevicePublicKeyResponse>;
  saveKeyBackup: (token: string, body: SaveKeyBackupRequest) => Promise<KeyBackupView>;
  getKeyBackup: (token: string) => Promise<KeyBackupView | undefined>;

  // Conversazioni e Messaggi E2E
  conversazioni: (token: string) => Promise<{ conversazioni: ConversazioneView[] }>;
  createConversazione: (
    token: string,
    body: CreateConversazioneRequest,
  ) => Promise<{ conversazione: ConversazioneView; initialMessaggio?: MessaggioBustaView }>;
  getConversazione: (token: string, id: string) => Promise<{ conversazione: ConversazioneView }>;
  getMessaggi: (
    token: string,
    id: string,
    query?: { limit?: number; before?: string },
  ) => Promise<ConversazioneMessaggiPage>;
  inviaMessaggio: (
    token: string,
    id: string,
    body: InviaMessaggioRequest,
  ) => Promise<{ messaggio: MessaggioBustaView }>;
  segnaConversazioneLetta: (token: string, id: string, finoA: string) => Promise<{ ok: true }>;
  deleteConversazione: (token: string, id: string) => Promise<{ ok: true }>;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(joinUrl(baseUrl, path), {
    headers,
    method: options.method ?? "GET",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    payload = undefined;
  }

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

export function createApi(baseUrl: string): EstiaApi {
  const call = <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(baseUrl, path, options);

  return {
    instance: (signal) => call("/api/v1/instance", signal === undefined ? {} : { signal }),

    login: (body) => call("/api/v1/auth/login", { body, method: "POST" }),

    me: (token) => call("/api/v1/auth/me", { token }),

    logout: (token) => call("/api/v1/auth/logout", { method: "POST", token }),

    timeline: (token, options, signal) => {
      const query = new URLSearchParams({ feed: options.feed });
      if (options.cursor !== undefined) {
        query.set("cursor", options.cursor);
      }
      return call(`/api/v1/posts?${query.toString()}`, {
        token,
        ...(signal === undefined ? {} : { signal }),
      });
    },

    setLike: (token, id, liked) =>
      call(`/api/v1/posts/${id}/like`, { method: liked ? "PUT" : "DELETE", token }),

    setRemoteLike: (token, origine, id, liked) =>
      call(
        `/api/v1/remote/${encodeURIComponent(origine.instanceKey)}/${encodeURIComponent(
          origine.username,
        )}/posts/${encodeURIComponent(id)}/cuore`,
        { method: liked ? "PUT" : "DELETE", token },
      ),

    person: (token, username) =>
      call(`/api/v1/profiles/${encodeURIComponent(username)}`, { token }),

    remotePerson: (token, instanceKey, username) =>
      call(`/api/v1/remote/${encodeURIComponent(instanceKey)}/${encodeURIComponent(username)}`, {
        token,
      }),

    personPosts: (token, username, options) => {
      const query = new URLSearchParams({ feed: options.feed });
      if (options.cursor !== undefined) {
        query.set("cursor", options.cursor);
      }
      return call(`/api/v1/profiles/${encodeURIComponent(username)}/posts?${query.toString()}`, {
        token,
      });
    },

    remotePersonPosts: (token, instanceKey, username, options = {}) => {
      const query = new URLSearchParams();
      if (options.cursor !== undefined) {
        query.set("cursor", options.cursor);
      }
      const coda = query.size === 0 ? "" : `?${query.toString()}`;
      return call(
        `/api/v1/remote/${encodeURIComponent(instanceKey)}/${encodeURIComponent(username)}/posts${coda}`,
        { token },
      );
    },

    follows: (token) => call("/api/v1/profile/follows", { token }),

    follow: (token, body) => call("/api/v1/profile/follows", { body, method: "POST", token }),

    unfollow: (token, id) => call(`/api/v1/profile/follows/${id}`, { method: "DELETE", token }),

    acceptFollower: (token, id) =>
      call(`/api/v1/profile/followers/${id}/accetta`, { method: "POST", token }),

    removeFollower: (token, id) =>
      call(`/api/v1/profile/followers/${id}`, { method: "DELETE", token }),

    // Dispositivi e Crittografia E2E
    registerDeviceKey: (token, body) =>
      call("/api/v1/dispositivi/chiave", { body, method: "POST", token }),

    getMyDeviceKey: (token) => call("/api/v1/dispositivi/chiave/me", { token }),

    publishKeyPackages: (token, body) =>
      call("/api/v1/dispositivi/key-packages", { body, method: "POST", token }),

    claimKeyPackage: (token, userId) =>
      call(`/api/v1/dispositivi/key-packages/claim/${encodeURIComponent(userId)}`, { token }),

    getDevicePublicKey: (token, deviceId) =>
      call(`/api/v1/dispositivi/${encodeURIComponent(deviceId)}/chiave-pubblica`, { token }),

    saveKeyBackup: (token, body) =>
      call("/api/v1/dispositivi/backup", { body, method: "PUT", token }),

    getKeyBackup: async (token) => {
      try {
        return await call<KeyBackupView>("/api/v1/dispositivi/backup", { token });
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 404) {
          return undefined;
        }
        throw e;
      }
    },

    // Conversazioni e Messaggi E2E
    conversazioni: (token) => call("/api/v1/conversazioni", { token }),

    createConversazione: (token, body) =>
      call("/api/v1/conversazioni", { body, method: "POST", token }),

    getConversazione: (token, id) =>
      call(`/api/v1/conversazioni/${encodeURIComponent(id)}`, { token }),

    getMessaggi: (token, id, query = {}) => {
      const q = new URLSearchParams();
      if (query.limit !== undefined) q.set("limit", String(query.limit));
      if (query.before !== undefined) q.set("before", query.before);
      const coda = q.size === 0 ? "" : `?${q.toString()}`;
      return call(`/api/v1/conversazioni/${encodeURIComponent(id)}/messaggi${coda}`, { token });
    },

    inviaMessaggio: (token, id, body) =>
      call(`/api/v1/conversazioni/${encodeURIComponent(id)}/messaggi`, {
        body,
        method: "POST",
        token,
      }),

    segnaConversazioneLetta: (token, id, finoA) =>
      call(`/api/v1/conversazioni/${encodeURIComponent(id)}/visto`, {
        body: { finoA },
        method: "POST",
        token,
      }),

    deleteConversazione: (token, id) =>
      call(`/api/v1/conversazioni/${encodeURIComponent(id)}`, {
        method: "DELETE",
        token,
      }),
  };
}
