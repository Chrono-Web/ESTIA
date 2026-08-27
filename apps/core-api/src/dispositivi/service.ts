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
import type { DeviceKeyRecord, DeviceKeysRepository } from "./repository.js";

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

  /**
   * Registra la chiave di questo dispositivo, e decide se e' gia' approvata.
   *
   * [ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)
   * ha scelto che a dire di si' a un dispositivo nuovo sia un dispositivo che la
   * persona possiede gia'. Due casi si approvano da soli, e nessuno dei due e'
   * una scorciatoia:
   *
   * - **il primo dispositivo**, perche' non c'e' ancora niente da proteggere e
   *   non ci sarebbe nessuno a cui chiedere — e' come Signal tratta il primario;
   * - **una chiave gia' approvata che si ripresenta**, cioe' chi ha rimesso le
   *   proprie chiavi con la frase segreta: riprodurre quella chiave pubblica
   *   richiede la privata, quindi ha gia' dimostrato di essere lui. E' la via di
   *   riserva per chi ha un dispositivo solo e lo perde.
   *
   * Tutti gli altri **aspettano**. Non e' una preferenza: e' il modo in cui la
   * strada C di quell'ADR — «basta saper entrare nell'account» — diventa
   * impossibile invece che sconsigliata.
   */
  registerKey(userId: string, sessionId: string, req: RegisterDeviceKeyRequest): DeviceKeyView {
    // Check if a device already exists for this session
    const existing = this.repo.getDeviceKeyBySessionId(sessionId);
    const id = existing ? existing.id : randomUUID();
    const createdAt = this.now();

    const daSolo =
      !this.repo.hasApprovedDeviceKey(userId) ||
      this.repo.isPublicKeyApproved(userId, req.publicKey);

    const record = this.repo.registerDeviceKey({
      id,
      sessionId,
      userId,
      publicKey: req.publicKey,
      algorithm: req.algorithm,
      createdAt,
      approvatoIl: daSolo ? createdAt : null,
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
      approvatoIl: record.approvatoIl,
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
      approvatoIl: rec.approvatoIl,
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
      approvatoIl: rec.approvatoIl,
    }));
  }

  /**
   * Dice di si' a un dispositivo che aspetta ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)).
   *
   * **Solo un dispositivo gia' approvato puo' approvare**, ed e' il vincolo che
   * regge tutta la strada B: senza, quello in attesa direbbe di si' a se stesso
   * e saremmo di nuovo alla strada C, dove basta saper entrare nell'account.
   *
   * Chi non ha nessun dispositivo approvato non e' bloccato: gli resta la frase
   * segreta, che ripresenta una chiave gia' approvata e si fa riconoscere da
   * sola (`registerKey`).
   */
  approva(userId: string, sessionIdDiChiApprova: string, deviceId: string): DeviceKeyView {
    const chiApprova = this.repo.getDeviceKeyBySessionId(sessionIdDiChiApprova);
    if (chiApprova === undefined || chiApprova.approvatoIl === null) {
      throw new DomainError(
        "device_not_approved",
        "Questo dispositivo non puo' autorizzarne altri: prima deve essere autorizzato lui.",
        403,
      );
    }

    const daApprovare = this.suoDispositivo(userId, deviceId);
    if (daApprovare.approvatoIl !== null) {
      return this.vista(daApprovare);
    }

    this.repo.approvaDeviceKey(deviceId, this.now());
    return this.vista(this.repo.getDeviceKeyById(deviceId)!);
  }

  /**
   * Dice di no. Il dispositivo non torna in attesa: esce.
   *
   * Un «no» che lasciasse la richiesta in coda si tradurrebbe in una domanda
   * che ricompare, e chi la vede la seconda volta clicca per farla sparire.
   */
  rifiuta(userId: string, sessionIdDiChiRifiuta: string, deviceId: string): { sessionId: string } {
    const chiRifiuta = this.repo.getDeviceKeyBySessionId(sessionIdDiChiRifiuta);
    if (chiRifiuta === undefined || chiRifiuta.approvatoIl === null) {
      throw new DomainError(
        "device_not_approved",
        "Questo dispositivo non puo' decidere per gli altri: prima deve essere autorizzato lui.",
        403,
      );
    }

    const daRifiutare = this.suoDispositivo(userId, deviceId);
    this.repo.revokeDeviceKey(deviceId, this.now());
    return { sessionId: daRifiutare.sessionId };
  }

  /**
   * Un dispositivo di questa persona, o un 404.
   *
   * Non distingue «non esiste» da «non e' tuo»: dirlo insegnerebbe a un
   * curioso quali identificativi esistono.
   */
  private suoDispositivo(userId: string, deviceId: string): DeviceKeyRecord {
    const record = this.repo.getDeviceKeyById(deviceId);
    if (record === undefined || record.userId !== userId) {
      throw new DomainError("device_not_found", "Questo dispositivo non esiste.", 404);
    }
    return record;
  }

  private vista(rec: DeviceKeyRecord): DeviceKeyView {
    return {
      algorithm: rec.algorithm,
      approvatoIl: rec.approvatoIl,
      createdAt: rec.createdAt,
      id: rec.id,
      publicKey: rec.publicKey,
      revokedAt: rec.revokedAt,
      sessionId: rec.sessionId,
      userId: rec.userId,
    };
  }

  publishKeyPackages(
    userId: string,
    sessionId: string,
    req: PublishKeyPackagesRequest,
  ): { count: number } {
    const device = this.repo.getDeviceKeyBySessionId(sessionId);
    if (!device) {
      throw new DomainError(
        "device_not_registered",
        "Questo dispositivo non ha ancora una chiave: esci e rientra da una connessione protetta.",
        400,
      );
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
