import type { DatabaseSync } from "node:sqlite";

export interface DeviceKeyRecord {
  id: string;
  sessionId: string;
  userId: string;
  publicKey: string;
  algorithm: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface KeyPackageRecord {
  id: string;
  deviceId: string;
  userId: string;
  keyPackage: string;
  createdAt: string;
  consumedAt: string | null;
}

export interface KeyBackupRecord {
  userId: string;
  encryptedBlob: string;
  algorithm: string;
  salt: string;
  iterations: number;
  updatedAt: string;
}

export interface DeviceKeysRepository {
  registerDeviceKey(record: {
    id: string;
    sessionId: string;
    userId: string;
    publicKey: string;
    algorithm: string;
    createdAt: string;
  }): DeviceKeyRecord;
  getDeviceKeyBySessionId(sessionId: string): DeviceKeyRecord | undefined;
  getDeviceKeysByUserId(userId: string): DeviceKeyRecord[];
  getDeviceKeyById(id: string): DeviceKeyRecord | undefined;
  revokeDeviceKey(id: string, revokedAt: string): void;
  addKeyPackages(
    records: Array<{
      id: string;
      deviceId: string;
      userId: string;
      keyPackage: string;
      createdAt: string;
    }>,
  ): void;
  claimKeyPackageForUser(
    userId: string,
    consumedAt: string,
  ): { device: DeviceKeyRecord; keyPackage: KeyPackageRecord | null } | undefined;
  saveKeyBackup(record: {
    userId: string;
    encryptedBlob: string;
    algorithm: string;
    salt: string;
    iterations: number;
    updatedAt: string;
  }): void;
  getKeyBackup(userId: string): KeyBackupRecord | undefined;
}

export class SqliteDeviceKeysRepository implements DeviceKeysRepository {
  constructor(private readonly db: DatabaseSync) {}

  registerDeviceKey(record: {
    id: string;
    sessionId: string;
    userId: string;
    publicKey: string;
    algorithm: string;
    createdAt: string;
  }): DeviceKeyRecord {
    // If a key for this session already exists, update it or insert fresh
    this.db
      .prepare(
        `INSERT INTO device_keys (id, session_id, user_id, public_key, algorithm, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (id) DO UPDATE SET
           public_key = excluded.public_key,
           algorithm = excluded.algorithm,
           created_at = excluded.created_at,
           revoked_at = NULL`,
      )
      .run(
        record.id,
        record.sessionId,
        record.userId,
        record.publicKey,
        record.algorithm,
        record.createdAt,
      );

    return {
      ...record,
      revokedAt: null,
    };
  }

  getDeviceKeyBySessionId(sessionId: string): DeviceKeyRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, session_id, user_id, public_key, algorithm, created_at, revoked_at
         FROM device_keys
         WHERE session_id = ? AND revoked_at IS NULL`,
      )
      .get(sessionId) as
      | {
          id: string;
          session_id: string;
          user_id: string;
          public_key: string;
          algorithm: string;
          created_at: string;
          revoked_at: string | null;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      publicKey: row.public_key,
      algorithm: row.algorithm,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }

  getDeviceKeysByUserId(userId: string): DeviceKeyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, user_id, public_key, algorithm, created_at, revoked_at
         FROM device_keys
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`,
      )
      .all(userId) as Array<{
      id: string;
      session_id: string;
      user_id: string;
      public_key: string;
      algorithm: string;
      created_at: string;
      revoked_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      publicKey: row.public_key,
      algorithm: row.algorithm,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    }));
  }

  getDeviceKeyById(id: string): DeviceKeyRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, session_id, user_id, public_key, algorithm, created_at, revoked_at
         FROM device_keys
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          session_id: string;
          user_id: string;
          public_key: string;
          algorithm: string;
          created_at: string;
          revoked_at: string | null;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      publicKey: row.public_key,
      algorithm: row.algorithm,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }

  revokeDeviceKey(id: string, revokedAt: string): void {
    this.db
      .prepare(
        `UPDATE device_keys
         SET revoked_at = ?
         WHERE id = ?`,
      )
      .run(revokedAt, id);
  }

  addKeyPackages(
    records: Array<{
      id: string;
      deviceId: string;
      userId: string;
      keyPackage: string;
      createdAt: string;
    }>,
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO key_packages (id, device_id, user_id, key_package, created_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    );

    for (const rec of records) {
      stmt.run(rec.id, rec.deviceId, rec.userId, rec.keyPackage, rec.createdAt);
    }
  }

  claimKeyPackageForUser(
    userId: string,
    consumedAt: string,
  ): { device: DeviceKeyRecord; keyPackage: KeyPackageRecord | null } | undefined {
    // Pick the latest active device for the user
    const devices = this.getDeviceKeysByUserId(userId);
    const device = devices[0];
    if (!device) {
      return undefined;
    }

    // Find one unconsumed key package for this device
    const row = this.db
      .prepare(
        `SELECT id, device_id, user_id, key_package, created_at, consumed_at
         FROM key_packages
         WHERE device_id = ? AND consumed_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .get(device.id) as
      | {
          id: string;
          device_id: string;
          user_id: string;
          key_package: string;
          created_at: string;
          consumed_at: string | null;
        }
      | undefined;

    if (row) {
      this.db
        .prepare(
          `UPDATE key_packages
           SET consumed_at = ?
           WHERE id = ?`,
        )
        .run(consumedAt, row.id);

      return {
        device,
        keyPackage: {
          id: row.id,
          deviceId: row.device_id,
          userId: row.user_id,
          keyPackage: row.key_package,
          createdAt: row.created_at,
          consumedAt,
        },
      };
    }

    return {
      device,
      keyPackage: null,
    };
  }

  saveKeyBackup(record: {
    userId: string;
    encryptedBlob: string;
    algorithm: string;
    salt: string;
    iterations: number;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO key_backups (user_id, encrypted_blob, algorithm, salt, iterations, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           encrypted_blob = excluded.encrypted_blob,
           algorithm = excluded.algorithm,
           salt = excluded.salt,
           iterations = excluded.iterations,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.userId,
        record.encryptedBlob,
        record.algorithm,
        record.salt,
        record.iterations,
        record.updatedAt,
      );
  }

  getKeyBackup(userId: string): KeyBackupRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT user_id, encrypted_blob, algorithm, salt, iterations, updated_at
         FROM key_backups
         WHERE user_id = ?`,
      )
      .get(userId) as
      | {
          user_id: string;
          encrypted_blob: string;
          algorithm: string;
          salt: string;
          iterations: number;
          updated_at: string;
        }
      | undefined;

    if (!row) return undefined;

    return {
      userId: row.user_id,
      encryptedBlob: row.encrypted_blob,
      algorithm: row.algorithm,
      salt: row.salt,
      iterations: row.iterations,
      updatedAt: row.updated_at,
    };
  }
}
