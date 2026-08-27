/**
 * Il risveglio della coda ([ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §4).
 *
 * L'arretramento di [ADR 0029](../../../../docs/adr/0029-un-messaggio-si-consegna.md)
 * era giusto e monco: la data del prossimo tentativo sopravviveva al motivo che
 * l'aveva prodotta, quindi un messaggio scritto mentre l'altra casa era spenta
 * poteva restare fermo **un'ora** dopo che era tornata.
 *
 * Qui si fissano le due metà della regola, e la seconda conta quanto la prima:
 * si rimette in partenza ciò che aspetta nel futuro, e **non** si tocca ciò che
 * è già scaduto — riscriverlo sarebbe rimetterlo in fondo alla fila.
 */
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

import { SqliteMessaggiRepository } from "./repository.js";

const CASA = "chiave-della-casa-remota";
const ALTRA = "chiave-di-un-altra-casa";

interface InUscita {
  id: string;
  chiave: string;
  prossimoInvio: string;
  tentativi?: number;
}

/**
 * Chi scrive, da dove, e a chi: il minimo che le chiavi esterne pretendono.
 *
 * In SQL grezzo di proposito. Passare dalle rotte darebbe le stesse righe più
 * un'istanza intera da tenere in piedi, e questo test non parla di rotte.
 */
function fondamenta(database: ReturnType<typeof openDatabase>): void {
  const quando = "2026-08-27T09:00:00.000Z";

  database
    .prepare(
      `INSERT INTO users (id, username, display_name, password_hash, role, created_at)
       VALUES ('u-anna', 'anna', 'Anna', 'hash', 'member', ?)`,
    )
    .run(quando);

  database
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, device_label, created_at, last_seen_at, expires_at)
       VALUES ('s-anna', 'u-anna', 'hash', 'portatile', ?, ?, '2027-08-27T09:00:00.000Z')`,
    )
    .run(quando, quando);

  database
    .prepare(
      `INSERT INTO device_keys (id, session_id, user_id, public_key, algorithm, created_at)
       VALUES ('d-anna', 's-anna', 'u-anna', 'chiave-pubblica', 'ECDH-P256', ?)`,
    )
    .run(quando);
}

async function conCoda(
  righe: readonly InUscita[],
  use: (repo: SqliteMessaggiRepository) => void,
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const database = openDatabase(dataDir);

    try {
      fondamenta(database);

      const repo = new SqliteMessaggiRepository(database);

      repo.createConversazione({
        createdAt: "2026-08-27T09:30:00.000Z",
        id: "c-anna",
        membri: ["u-anna"],
        tipo: "diretta",
      });

      for (const riga of righe) {
        repo.insertMessaggio({
          busta: "busta-opaca",
          conversazioneId: "c-anna",
          createdAt: "2026-08-27T10:00:00.000Z",
          id: `messaggio-${riga.id}`,
          senderDeviceId: "d-anna",
          senderUserId: "u-anna",
        });

        repo.insertMessaggioInUscita({
          busta: "busta-opaca",
          createdAt: "2026-08-27T10:00:00.000Z",
          destinatarioChiave: riga.chiave,
          id: riga.id,
          messaggioId: `messaggio-${riga.id}`,
          prossimoInvio: riga.prossimoInvio,
        });

        for (let tentativo = 0; tentativo < (riga.tentativi ?? 0); tentativo += 1) {
          repo.incrementaTentativiMessaggioInUscita(riga.id, riga.prossimoInvio);
        }
      }

      use(repo);
    } finally {
      database.close();
    }
  });
}

describe("il risveglio della coda verso una casa tornata raggiungibile", () => {
  it("rimette in partenza ciò che aspettava, e azzera l'arretramento ereditato", async () => {
    const adesso = "2026-08-27T12:00:00.000Z";

    await conCoda(
      [{ chiave: CASA, id: "uno", prossimoInvio: "2026-08-27T12:45:00.000Z", tentativi: 6 }],
      (repo) => {
        expect(repo.listMessaggiInUscitaPending(adesso)).toHaveLength(0);

        expect(repo.risvegliaMessaggiInUscitaPer(CASA, adesso)).toBe(1);

        const pronti = repo.listMessaggiInUscitaPending(adesso);

        expect(pronti).toHaveLength(1);
        expect(pronti[0]?.id).toBe("uno");
        expect(pronti[0]?.tentativi).toBe(0);
      },
    );
  });

  it("non tocca ciò che è già scaduto: quello è del drenaggio", async () => {
    const adesso = "2026-08-27T12:00:00.000Z";

    await conCoda(
      [{ chiave: CASA, id: "scaduto", prossimoInvio: "2026-08-27T11:00:00.000Z", tentativi: 3 }],
      (repo) => {
        expect(repo.risvegliaMessaggiInUscitaPer(CASA, adesso)).toBe(0);

        const pronti = repo.listMessaggiInUscitaPending(adesso);

        expect(pronti).toHaveLength(1);
        expect(pronti[0]?.tentativi).toBe(3);
        expect(pronti[0]?.prossimoInvio).toBe("2026-08-27T11:00:00.000Z");
      },
    );
  });

  it("sveglia una casa sola: le altre code restano dove sono", async () => {
    const adesso = "2026-08-27T12:00:00.000Z";

    await conCoda(
      [
        { chiave: CASA, id: "mia", prossimoInvio: "2026-08-27T13:00:00.000Z" },
        { chiave: ALTRA, id: "altrui", prossimoInvio: "2026-08-27T13:00:00.000Z" },
      ],
      (repo) => {
        expect(repo.risvegliaMessaggiInUscitaPer(CASA, adesso)).toBe(1);

        const pronti = repo.listMessaggiInUscitaPending(adesso);

        expect(pronti.map((riga) => riga.id)).toEqual(["mia"]);
      },
    );
  });
});
