/**
 * Quello che la schermata chiede.
 *
 * Il caso che conta di più è il secondo: un dispositivo che **non ha niente in
 * locale** e trova solo un Welcome sul canale. È la situazione di chiunque apra
 * una conversazione per la prima volta, e finché il Welcome non portava l'albero
 * con sé non funzionava — nei test glielo passavo io, che è il modo migliore per
 * non accorgersene.
 */
import { describe, expect, it } from "vitest";

import { nuovaIdentita, type IdentitaDispositivo } from "./gruppo.js";
import { aggiorna, apriEsistente, apriNuova, manda } from "./conversazione.js";
import type { BustaHandshake, Contesto, Deposito, Istanza, VoceArchivio } from "./sessione.js";

function istanzaFinta(): Istanza & {
  ammetti: (username: string, chi: IdentitaDispositivo) => void;
} {
  const chiavi = new Map<string, Uint8Array[]>();
  const handshake: (BustaHandshake & { destinatario?: string })[] = [];
  const mazzi = new Map<string, { mazzo: string; epoch: number }>();
  const archivio = new Map<string, VoceArchivio[]>();
  let seq = 0;

  return {
    ammetti(username, chi) {
      chiavi.set(username, [
        ...(chiavi.get(username) ?? []),
        chi.publicPackage.leafNode.signaturePublicKey,
      ]);
    },
    archivio: (id) => Promise.resolve({ voci: [...(archivio.get(id) ?? [])] }),
    chiaviDiFirmaDi: (username) => Promise.resolve(chiavi.get(username) ?? []),
    depositaArchivio(id, voci) {
      const attuali = archivio.get(id) ?? [];
      for (const voce of voci) {
        if (!attuali.some((v) => v.id === voce.id)) {
          attuali.push(voce);
        }
      }
      archivio.set(id, attuali);
      return Promise.resolve();
    },
    depositaHandshake(_id, busta) {
      seq += 1;
      handshake.push({ ...busta, id: String(seq) });
      return Promise.resolve();
    },
    handshakeDopo(_id, dopo) {
      const da = dopo === undefined ? 0 : Number(dopo);
      return Promise.resolve({ handshake: handshake.filter((h) => Number(h.id) > da) });
    },
    mazzo: (id) => Promise.resolve(mazzi.get(id)),
    salvaMazzo(id, dati) {
      const attuale = mazzi.get(id);
      if (attuale === undefined || attuale.epoch <= dati.epoch) {
        mazzi.set(id, dati);
      }
      return Promise.resolve();
    },
  };
}

function depositoFinto(): Deposito {
  const stati = new Map<string, Uint8Array>();
  const cursori = new Map<string, string>();

  return {
    leggi: (id) => Promise.resolve(stati.get(id)),
    leggiCursore: (id) => Promise.resolve(cursori.get(id)),
    scrivi(id, stato) {
      stati.set(id, stato);
      return Promise.resolve();
    },
    scriviCursore(id, cursore) {
      cursori.set(id, cursore);
      return Promise.resolve();
    },
  };
}

describe("aprire una conversazione", () => {
  it("un dispositivo senza niente in locale entra dal solo Welcome", async () => {
    const istanza = istanzaFinta();
    const idAnna = await nuovaIdentita("anna");
    const idBruno = await nuovaIdentita("bruno");
    istanza.ammetti("anna", idAnna);
    istanza.ammetti("bruno", idBruno);

    const anna: Contesto = { deposito: depositoFinto(), io: idAnna, istanza };
    await apriNuova(anna, "conv-1", idBruno.publicPackage, "bruno");

    // Bruno non ha MAI aperto questa conversazione: deposito vuoto, e nessuno
    // gli passa l'albero. Deve bastargli il Welcome.
    const bruno: Contesto = { deposito: depositoFinto(), io: idBruno, istanza };
    const sessione = await apriEsistente(bruno, "conv-1");

    expect(sessione).toBeDefined();
  });

  it("riaprendo si riprende quella di prima, senza rientrare", async () => {
    const istanza = istanzaFinta();
    const idAnna = await nuovaIdentita("anna");
    const idBruno = await nuovaIdentita("bruno");
    istanza.ammetti("anna", idAnna);
    istanza.ammetti("bruno", idBruno);

    const anna: Contesto = { deposito: depositoFinto(), io: idAnna, istanza };
    const prima = await apriNuova(anna, "conv-1", idBruno.publicPackage, "bruno");
    const dopo = await apriEsistente(anna, "conv-1");

    expect(dopo?.stato.groupContext.epoch).toBe(prima.stato.groupContext.epoch);
  });

  it("una conversazione che non è MLS non ha sessione, e lo dice", async () => {
    const istanza = istanzaFinta();
    const idAnna = await nuovaIdentita("anna");
    istanza.ammetti("anna", idAnna);
    const anna: Contesto = { deposito: depositoFinto(), io: idAnna, istanza };

    // Dopo la ritirata di ESTIA-E2E-v1 questo vuol dire: più vecchia del passaggio.
    expect(await apriEsistente(anna, "conv-mai-vista")).toBeUndefined();
  });
});

describe("il giro completo che la schermata fa", () => {
  it("porta una riga da Anna a Bruno, e la cronologia viene dall'archivio", async () => {
    const istanza = istanzaFinta();
    const idAnna = await nuovaIdentita("anna");
    const idBruno = await nuovaIdentita("bruno");
    istanza.ammetti("anna", idAnna);
    istanza.ammetti("bruno", idBruno);

    const anna: Contesto = { deposito: depositoFinto(), io: idAnna, istanza };
    const bruno: Contesto = { deposito: depositoFinto(), io: idBruno, istanza };

    const sessioneAnna = await apriNuova(anna, "conv-1", idBruno.publicPackage, "bruno");
    const sessioneBruno = (await apriEsistente(bruno, "conv-1"))!;

    const mandata = await manda(
      anna,
      sessioneAnna,
      "ci vediamo alle 8",
      "m1",
      "2026-08-26T10:00:00.000Z",
    );

    const giro = await aggiorna(
      bruno,
      sessioneBruno,
      [
        {
          busta: mandata.busta,
          consegnatoAt: null,
          conversazioneId: "conv-1",
          createdAt: "2026-08-26T10:00:00.000Z",
          id: "m1",
          senderDeviceId: "d",
          senderUserId: "anna",
        },
      ],
      new Set(),
    );

    expect(giro.righe.map((r) => r.testo)).toEqual(["ci vediamo alle 8"]);
  });

  it("non ridecifra ciò che ha già visto", async () => {
    // Una busta di un'epoch superata non si riapre più: ritentarla produrrebbe
    // solo righe illeggibili, non una copia.
    const istanza = istanzaFinta();
    const idAnna = await nuovaIdentita("anna");
    const idBruno = await nuovaIdentita("bruno");
    istanza.ammetti("anna", idAnna);
    istanza.ammetti("bruno", idBruno);

    const anna: Contesto = { deposito: depositoFinto(), io: idAnna, istanza };
    const bruno: Contesto = { deposito: depositoFinto(), io: idBruno, istanza };
    const sessioneAnna = await apriNuova(anna, "conv-1", idBruno.publicPackage, "bruno");
    const sessioneBruno = (await apriEsistente(bruno, "conv-1"))!;

    const mandata = await manda(anna, sessioneAnna, "una sola", "m1", "2026-08-26T10:00:00.000Z");
    const busta = {
      busta: mandata.busta,
      consegnatoAt: null,
      conversazioneId: "conv-1",
      createdAt: "2026-08-26T10:00:00.000Z",
      id: "m1",
      senderDeviceId: "d",
      senderUserId: "anna",
    };

    const primo = await aggiorna(bruno, sessioneBruno, [busta], new Set());
    const secondo = await aggiorna(bruno, primo.sessione, [busta], new Set(["m1"]));

    expect(secondo.righe).toHaveLength(1);
    expect(secondo.righe[0]?.testo).toBe("una sola");
  });
});
