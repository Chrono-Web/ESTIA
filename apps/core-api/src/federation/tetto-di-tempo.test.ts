import { randomBytes } from "node:crypto";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

import { InstanceEndpoint, type AlpnService, type IrohConnection } from "./endpoint.js";
import { PROTOCOL_ALPN } from "./protocol.js";
import { SqliteRemoteInstanceRepository } from "./repository.js";
import { FederationService } from "./service.js";

/**
 * Il tetto di tempo di [ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md) §6,
 * provato sul filo vero e non su un finto.
 *
 * Il caso che conta non è la casa spenta — quella la connessione la rifiuta —
 * ma quella **che accetta e poi tace**: un'istanza a metà avvio, un processo
 * bloccato, una linea che si è aperta e non porta più niente. Prima di questo
 * tetto la lettura di una bacheca non ne aveva alcuno, quindi l'attesa la
 * decideva il trasporto, e con lei la durata di una schermata.
 *
 * Che sia `undefined` e non un errore è la stessa regola di sempre: chi legge
 * il feed distingue «non c'è niente» da «non è arrivato» guardando `mancanti`,
 * non catturando eccezioni.
 */

/** Accetta la connessione, apre lo stream, e non risponde mai. */
class CasaMuta implements AlpnService {
  public readonly alpn = PROTOCOL_ALPN;
  public contattata = 0;

  public async serve(connection: IrohConnection): Promise<void> {
    this.contattata += 1;

    await connection.acceptBi();

    // Nessuna risposta, di proposito: è il caso che il tetto deve chiudere.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 60_000);
      timer.unref?.();
    });
  }
}

describe("una casa che accetta e poi tace", () => {
  it("non tiene ferma una lettura oltre il tetto di tempo", async () => {
    await withTempDataDir(async (primo) => {
      const database = openDatabase(primo);
      const endpointA = new InstanceEndpoint(new Uint8Array(randomBytes(32)));
      const remotes = new SqliteRemoteInstanceRepository(database);
      const federation = new FederationService({
        endpoint: endpointA,
        instanceName: () => "Via Roma",
        remotes,
        timeoutMs: 700,
      });

      endpointA.register(federation);
      await endpointA.open("local");

      const muta = new CasaMuta();
      const endpointB = new InstanceEndpoint(new Uint8Array(randomBytes(32)));

      endpointB.register(muta);
      await endpointB.open("local");

      try {
        // Si dichiara collegata a mano: il punto del test è la lettura, non la
        // stretta di mano, e la casa muta non risponderebbe nemmeno a quella.
        remotes.upsertState({
          at: new Date().toISOString(),
          declaredName: "Via Milano",
          publicKey: endpointB.endpointId ?? "",
          state: "collegata",
        });

        const iniziato = Date.now();
        const post = await federation.fetchBacheca(
          endpointB.ticket ?? "",
          [{ nome: "anna", prova: "prova-qualunque" }],
          { da: "bruno", quanti: 10 },
        );
        const durata = Date.now() - iniziato;

        // «Non è arrivata» è `undefined`, come per una casa spenta: chi legge il
        // feed la mette fra le `mancanti` e dice il suo nome.
        expect(post).toBeUndefined();

        // E ci mette il tetto, non il tempo che decide l'altra.
        expect(durata).toBeLessThan(5_000);
        expect(muta.contattata).toBe(1);
      } finally {
        await endpointA.close();
        await endpointB.close();
        database.close();
      }
    });
  }, 30_000);
});
