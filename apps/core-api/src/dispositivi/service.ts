import { randomUUID } from "node:crypto";

import type {
  ChiaviDiFirmaView,
  ClaimKeyPackageResponse,
  DeviceKeyView,
  DevicePublicKeyResponse,
  KeyBackupView,
  PublishKeyPackagesRequest,
  RegisterDeviceKeyRequest,
  SaveKeyBackupRequest,
} from "@estia/contracts";

import { DomainError } from "../errors.js";
import type { UserRepository } from "../identity/repository.js";
import type { DeviceKeysRepository } from "./repository.js";

export interface DispositiviServiceOptions {
  repository: DeviceKeysRepository;
  users: UserRepository;
  now?: (() => Date) | (() => string);
}

export class DispositiviService {
  private readonly repo: DeviceKeysRepository;
  private readonly users: UserRepository;
  private readonly now: () => string;

  constructor(options: DispositiviServiceOptions) {
    this.repo = options.repository;
    this.users = options.users;
    if (options.now) {
      const fn = options.now;
      this.now = () => {
        const val = fn();
        return typeof val === "string" ? val : val.toISOString();
      };
    } else {
      this.now = () => new Date().toISOString();
    }
  }

  registerKey(userId: string, sessionId: string, req: RegisterDeviceKeyRequest): DeviceKeyView {
    // Check if a device already exists for this session
    const existing = this.repo.getDeviceKeyBySessionId(sessionId);
    const id = existing ? existing.id : randomUUID();
    const createdAt = this.now();

    const record = this.repo.registerDeviceKey({
      id,
      sessionId,
      userId,
      publicKey: req.publicKey,
      algorithm: req.algorithm,
      createdAt,
    });

    if (req.keyPackages && req.keyPackages.length > 0) {
      this.repo.addKeyPackages(
        req.keyPackages.map((kp) => ({
          id: randomUUID(),
          deviceId: id,
          userId,
          keyPackage: kp,
          createdAt,
        })),
      );
    }

    return {
      id: record.id,
      sessionId: record.sessionId,
      userId: record.userId,
      publicKey: record.publicKey,
      algorithm: record.algorithm,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
    };
  }

  getCurrentDevice(sessionId: string): DeviceKeyView | undefined {
    const rec = this.repo.getDeviceKeyBySessionId(sessionId);
    if (!rec) return undefined;
    return {
      id: rec.id,
      sessionId: rec.sessionId,
      userId: rec.userId,
      publicKey: rec.publicKey,
      algorithm: rec.algorithm,
      createdAt: rec.createdAt,
      revokedAt: rec.revokedAt,
    };
  }

  listUserDevices(userId: string): DeviceKeyView[] {
    return this.repo.getDeviceKeysByUserId(userId).map((rec) => ({
      id: rec.id,
      sessionId: rec.sessionId,
      userId: rec.userId,
      publicKey: rec.publicKey,
      algorithm: rec.algorithm,
      createdAt: rec.createdAt,
      revokedAt: rec.revokedAt,
    }));
  }

  publishKeyPackages(
    userId: string,
    sessionId: string,
    req: PublishKeyPackagesRequest,
  ): { count: number } {
    const device = this.repo.getDeviceKeyBySessionId(sessionId);
    if (!device) {
      throw new DomainError("device_not_registered", "Device key must be registered first.", 400);
    }

    const createdAt = this.now();
    this.repo.addKeyPackages(
      req.keyPackages.map((kp) => ({
        id: randomUUID(),
        deviceId: device.id,
        userId,
        keyPackage: kp,
        createdAt,
      })),
    );

    return { count: req.keyPackages.length };
  }

  claimKeyPackage(targetUserId: string): ClaimKeyPackageResponse | null {
    const res = this.repo.claimKeyPackageForUser(targetUserId, this.now());
    if (!res) {
      return null;
    }

    return {
      deviceId: res.device.id,
      publicKey: res.device.publicKey,
      keyPackage: res.keyPackage ? res.keyPackage.keyPackage : null,
    };
  }

  private readonly remoteKeys = new Map<string, DevicePublicKeyResponse>();

  saveRemoteDeviceKey(record: {
    id: string;
    userId: string;
    publicKey: string;
    algorithm?: string | undefined;
  }): void {
    this.remoteKeys.set(record.id, {
      deviceId: record.id,
      userId: record.userId,
      publicKey: record.publicKey,
      algorithm: record.algorithm ?? "ESTIA-E2E-v1",
      createdAt: this.now(),
    });
  }

  getDevicePublicKey(deviceId: string): DevicePublicKeyResponse | undefined {
    const dev = this.repo.getDeviceKeyById(deviceId);
    if (dev) {
      return {
        deviceId: dev.id,
        userId: dev.userId,
        publicKey: dev.publicKey,
        algorithm: dev.algorithm,
        createdAt: dev.createdAt,
      };
    }
    return this.remoteKeys.get(deviceId);
  }

  saveBackup(userId: string, req: SaveKeyBackupRequest): KeyBackupView {
    const updatedAt = this.now();
    this.repo.saveKeyBackup({
      userId,
      encryptedBlob: req.encryptedBlob,
      algorithm: req.algorithm,
      salt: req.salt,
      iterations: req.iterations,
      updatedAt,
    });

    return {
      encryptedBlob: req.encryptedBlob,
      algorithm: req.algorithm,
      salt: req.salt,
      iterations: req.iterations,
      updatedAt,
    };
  }

  getBackup(userId: string): KeyBackupView | undefined {
    const rec = this.repo.getKeyBackup(userId);
    if (!rec) return undefined;
    return {
      encryptedBlob: rec.encryptedBlob,
      algorithm: rec.algorithm,
      salt: rec.salt,
      iterations: rec.iterations,
      updatedAt: rec.updatedAt,
    };
  }

  /**
   * Le chiavi di firma che l'istanza riconosce per un membro.
   *
   * E' il registro su cui poggia l'`AuthenticationService` di MLS: senza,
   * chiunque ottenga un `GroupInfo` entra come chi vuole. Ferma l'estraneo;
   * **non** ferma chi ospita, perche' questo registro e' dell'istanza — quel
   * limite si chiude fuori banda, con il numero di sicurezza.
   *
   * **Le chiavi revocate non ci sono.** Un dispositivo revocato che passasse
   * ancora la validazione renderebbe la revoca una parola.
   *
   * Un nome che non esiste non e' un errore: e' un elenco vuoto, e chi chiede
   * non impara se quella persona c'e'.
   */
  public chiaviDiFirmaDi(username: string): ChiaviDiFirmaView {
    const utente = this.users.findByUsername(username);
    if (utente === undefined) {
      return { chiavi: [] };
    }

    return {
      chiavi: this.repo
        .getActiveDeviceKeysByUserId(utente.id)
        .map((chiave) => ({ algorithm: chiave.algorithm, publicKey: chiave.publicKey })),
    };
  }
}
