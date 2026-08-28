import { loadConfig, type AppConfig } from "@estia/config";
import type { FederationView } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { openDatabase } from "../db/database.js";
import { SqliteRemoteInstanceRepository } from "./repository.js";
import type { RemoteState } from "./repository.js";

/**
 * Le connessioni fra istanze viste dal pannello.
 *
 * Vale la stessa lezione di ADR 0016 che ha già corretto i backup e la sonda:
 * una funzione che si raggiunge solo da terminale è una funzione che nessuno
 * usa. Qui si aggiunge la ragione di ADR 0018 — il legame amministrativo è una
 * decisione deliberata di chi amministra — quindi deve esserci un posto dove
 * prenderla, e deve essere lo stesso posto dove si torna indietro.
 */

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string, environment: Record<string, string> = {}): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
    ...environment,
  });
}

async function withAdmin(
  use: (app: FastifyInstance, token: string, dataDir: string) => Promise<void>,
  environment: Record<string, string> = {},
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir, environment), { setupToken: SETUP_TOKEN });

    await withClosable(app, async (instance) => {
      await instance.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const token = (
        await instance.inject({
          method: "POST",
          payload: { password: ADMIN.password, username: ADMIN.username },
          url: "/api/v1/auth/login",
        })
      ).json().token;

      await use(instance, token as string, dataDir);
    });
  });
}

const federation = async (app: FastifyInstance, token: string): Promise<FederationView> =>
  (
    await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/v1/federation",
    })
  ).json() as FederationView;

describe("il pannello delle istanze collegate", () => {
  it("parte vuoto, e dichiara che la rete è spenta", async () => {
    await withAdmin(async (app, token) => {
      const view = await federation(app, token);

      expect(view.instances).toEqual([]);
      expect(view.networkOn).toBe(false);
      expect(view.reachableByKey).toBe(false);
    });
  });

  it("non si lascia guardare da chi non ha una sessione", async () => {
    await withAdmin(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/federation" });

      expect(response.statusCode).toBe(401);
    });
  });

  it("rifiuta di collegarsi mentre la rete è spenta, invece di fallire in silenzio", async () => {
    await withAdmin(async (app, token) => {
      const response = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        payload: { publicKey: "una-chiave-qualunque" },
        url: "/api/v1/federation/connections",
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("rete_spenta");
    });
  });

  it("mostra la propria chiave quando la rete è accesa, perché è quella da mandare", async () => {
    await withAdmin(
      async (app, token) => {
        const view = await federation(app, token);

        expect(view.networkOn).toBe(true);
        expect(view.endpointId).toMatch(/\w{16,}/);
      },
      { ESTIA_NETWORK_PROBE: "local" },
    );
  }, 30_000);

  it("blocca un'istanza che non ha mai visto, e la ricorda bloccata", async () => {
    await withAdmin(
      async (app, token) => {
        // Bloccare non richiede un rapporto: si può decidere di non parlare con
        // qualcuno di cui si conosce solo la chiave.
        const blocked = (
          await app.inject({
            headers: { authorization: `Bearer ${token}` },
            method: "POST",
            payload: { publicKey: "chiave-di-qualcuno" },
            url: "/api/v1/federation/connections/block",
          })
        ).json() as FederationView;

        expect(blocked.instances).toHaveLength(1);
        expect(blocked.instances[0]?.state).toBe("bloccata");

        const after = (
          await app.inject({
            headers: { authorization: `Bearer ${token}` },
            method: "POST",
            payload: { publicKey: "chiave-di-qualcuno" },
            url: "/api/v1/federation/connections/forget",
          })
        ).json() as FederationView;

        expect(after.instances).toEqual([]);
      },
      { ESTIA_NETWORK_PROBE: "local" },
    );
  }, 30_000);
});

/**
 * Le stesse istanze, viste da chi non amministra.
 *
 * Un membro non decide con chi questa istanza parla — quella è la decisione
 * deliberata di ADR 0018 — ma quando cerca nella rete ha diritto di sapere
 * dove sta cercando. Le due viste rispondono a due domande diverse, e per
 * questo mostrano cose diverse.
 */
describe("che cosa il pannello dice del battito", () => {
  /** Lo stesso gesto di sopra: uno stato che servirebbero due istanze vere. */
  function forza(dataDir: string, publicKey: string, state: RemoteState, nome: string): void {
    const database = openDatabase(dataDir);

    try {
      new SqliteRemoteInstanceRepository(database).upsertState({
        at: new Date().toISOString(),
        declaredName: nome,
        publicKey,
        state,
      });
    } finally {
      database.close();
    }
  }

  async function vista(app: FastifyInstance, token: string): Promise<FederationView> {
    const risposta = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/v1/federation",
    });

    return risposta.json() as FederationView;
  }

  it("tace finché il battito non ha chiesto: «non lo so» non è «non risponde»", async () => {
    await withAdmin(async (app, token, dataDir) => {
      forza(dataDir, "chiave-collegata", "collegata", "Via dei Mille");

      const istanza = (await vista(app, token)).instances[0];

      // Il battito non gira nei test — nessun timer parla con la rete — quindi
      // il campo è assente, e chi disegna la schermata deve dire «controllo in
      // arrivo» e non inventare una diagnosi.
      expect(istanza?.state).toBe("collegata");
      expect(istanza?.battito).toBeUndefined();
    });
  });

  it("dice se risponde adesso, e quando riproverà", async () => {
    await withAdmin(async (app, token, dataDir) => {
      forza(dataDir, "chiave-collegata", "collegata", "Via dei Mille");

      // Un giro solo, a mano: è il processo ad avviare il timer, non l'app.
      await app.battito.batti();

      const istanza = (await vista(app, token)).instances[0];

      // Non c'è nessuna istanza dall'altra parte, quindi il giro dice di no —
      // ed è precisamente il caso in cui l'arretramento va mostrato.
      expect(istanza?.battito?.raggiungibile).toBe(false);
      expect(Date.parse(istanza?.battito?.prossimoTentativo ?? "")).toBeGreaterThan(Date.now());
    });
  });

  it("non attribuisce un battito a un'istanza che il battito non guarda", async () => {
    await withAdmin(async (app, token, dataDir) => {
      forza(dataDir, "chiave-in-attesa", "richiesta_inviata", "Via Verdi");
      forza(dataDir, "chiave-bloccata", "bloccata", "Via Neri");

      await app.battito.batti();

      for (const istanza of (await vista(app, token)).instances) {
        expect(istanza.battito).toBeUndefined();
      }
    });
  });
});

describe("le istanze collegate, viste da un membro", () => {
  /** Scrive uno stato che servirebbe due istanze vere per raggiungere. */
  function forza(dataDir: string, publicKey: string, state: RemoteState, nome: string): void {
    const database = openDatabase(dataDir);

    try {
      new SqliteRemoteInstanceRepository(database).upsertState({
        at: new Date().toISOString(),
        declaredName: nome,
        publicKey,
        state,
      });
    } finally {
      database.close();
    }
  }

  async function membro(app: FastifyInstance, adminToken: string): Promise<string> {
    await app.identityService.createUser({
      password: "password-lunga-ok",
      role: "member",
      username: "anna",
    });

    // L'amministratore serve solo a creare l'istanza; la sessione che conta è
    // quella di chi non amministra.
    void adminToken;

    return (
      await app.inject({
        method: "POST",
        payload: { password: "password-lunga-ok", username: "anna" },
        url: "/api/v1/auth/login",
      })
    ).json().token as string;
  }

  it("mostra il nome dichiarato, e non la chiave", async () => {
    await withAdmin(async (app, token, dataDir) => {
      forza(dataDir, "chiave-di-la", "collegata", "Via dei Mille");

      const response = await app.inject({
        headers: { authorization: `Bearer ${await membro(app, token)}` },
        method: "GET",
        url: "/api/v1/instances",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ instances: [{ declaredName: "Via dei Mille" }] });
      expect(response.body).not.toContain("chiave-di-la");
    });
  });

  it("non elenca un collegamento che non c'è: né in attesa, né bloccato", async () => {
    await withAdmin(async (app, token, dataDir) => {
      forza(dataDir, "in-attesa", "richiesta_inviata", "Forse");
      forza(dataDir, "ricevuta", "richiesta_ricevuta", "Ha chiesto");
      forza(dataDir, "bloccata", "bloccata", "No");

      const response = await app.inject({
        headers: { authorization: `Bearer ${await membro(app, token)}` },
        method: "GET",
        url: "/api/v1/instances",
      });

      expect(response.json().instances).toEqual([]);
    });
  });

  it("resta dietro una sessione, come tutto il resto", async () => {
    await withAdmin(async (app) => {
      expect((await app.inject({ method: "GET", url: "/api/v1/instances" })).statusCode).toBe(401);
    });
  });
});
