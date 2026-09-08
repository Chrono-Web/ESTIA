import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase, runMigrations } from "../db/database.js";
import { migrations } from "../db/migrations.js";
import { SqliteMessaggiRepository } from "./repository.js";

const quando = "2026-09-07T10:00:00.000Z";
const vecchia = { id: "vecchia", chiaveN: 1, busta: "CIFRATO_PREGRESSO", createdAt: quando };

describe("la provenienza dell'archivio", () => {
  it("migra senza inventare autori, conserva i byte e non permette di reclamare il pregresso", async () => {
    await withTempDataDir(async (dataDir) => {
      const prima = openDatabase(
        dataDir,
        migrations.filter((m) => m.version <= 27),
      );
      try {
        prima
          .prepare(
            `INSERT INTO users (id, username, display_name, password_hash, role, created_at)
          VALUES ('anna', 'anna', 'Anna', 'hash-di-prova', 'member', ?)`,
          )
          .run(quando);
        prima
          .prepare("INSERT INTO conversazioni (id, tipo, created_at) VALUES ('conv', 'diretta', ?)")
          .run(quando);
        prima
          .prepare(
            "INSERT INTO conversazione_membri (conversazione_id, user_id, joined_at) VALUES ('conv', 'anna', ?)",
          )
          .run(quando);
        prima
          .prepare(
            `INSERT INTO archivio_voci (conversazione_id, id, chiave_n, busta, created_at)
          VALUES ('conv', ?, ?, ?, ?)`,
          )
          .run(vecchia.id, vecchia.chiaveN, vecchia.busta, vecchia.createdAt);
      } finally {
        prima.close();
      }

      const dopo = openDatabase(dataDir);
      try {
        const repo = new SqliteMessaggiRepository(dopo);
        expect(runMigrations(dopo)).toEqual([]);
        expect(repo.listVociArchivio("conv")).toEqual([{ ...vecchia, autoreId: null }]);
        expect(repo.insertVociArchivio("conv", "anna", [vecchia])).toBeUndefined();
        expect(repo.insertVociArchivio("conv", "anna", [{ ...vecchia, id: "nuova" }])).toBe(1);
      } finally {
        dopo.close();
      }

      const riaperto = openDatabase(dataDir);
      try {
        expect(new SqliteMessaggiRepository(riaperto).listVociArchivio("conv")).toEqual([
          { ...vecchia, id: "nuova", autoreId: "anna" },
          { ...vecchia, autoreId: null },
        ]);
      } finally {
        riaperto.close();
      }
    });
  });

  it("il database rifiuta nuovi depositi senza autore locale membro, anche aggirando il servizio", async () => {
    await withTempDataDir(async (dataDir) => {
      const db = openDatabase(dataDir);
      try {
        db.prepare(
          `INSERT INTO users (id, username, display_name, password_hash, role, created_at)
          VALUES ('anna', 'anna', 'Anna', 'hash-di-prova', 'member', ?)`,
        ).run(quando);
        db.prepare(
          "INSERT INTO conversazioni (id, tipo, created_at) VALUES ('conv', 'diretta', ?)",
        ).run(quando);
        // Un membro remoto non e' un autore locale, neppure se nella conversazione.
        db.prepare(
          "INSERT INTO conversazione_membri (conversazione_id, user_id, joined_at) VALUES ('conv', 'remote:casa:matteo', ?)",
        ).run(quando);
        const inserisci = db.prepare(`INSERT INTO archivio_voci
          (conversazione_id, id, chiave_n, busta, created_at, autore_id)
          VALUES ('conv', 'x', 1, 'CIFRATO', ?, ?)`);
        for (const autore of [null, "remote:casa:matteo", "anna"]) {
          expect(() => inserisci.run(quando, autore)).toThrow("archivio_autore_locale");
        }
        expect(db.prepare("SELECT * FROM archivio_voci").all()).toEqual([]);
      } finally {
        db.close();
      }
    });
  });
});
