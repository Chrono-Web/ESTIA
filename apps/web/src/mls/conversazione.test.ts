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

import { depositoFinto, istanzaFinta, portachiaviFinto } from "./finte.js";
import { aggiorna, apriEsistente, apriNuova, manda } from "./conversazione.js";
import type { Contesto } from "./sessione.js";
import type { KeyPackage } from "ts-mls";

const ID_ANNA = "u-anna";
const ID_BRUNO = "u-bruno";

/** Anna e Bruno su un'istanza sola, ciascuno con il suo deposito e le sue chiavi. */
async function dueCase(): Promise<{
  anna: Contesto;
  bruno: Contesto;
  pacchettoBruno: KeyPackage;
}> {
  const istanza = istanzaFinta();
  const chiaviAnna = await portachiaviFinto("anna");
  const chiaviBruno = await portachiaviFinto("bruno");
  istanza.ammetti("anna", chiaviAnna.chiaveDiFirma);
  istanza.ammetti("bruno", chiaviBruno.chiaveDiFirma);

  return {
    anna: { deposito: depositoFinto(), io: chiaviAnna, istanza: istanza.per(ID_ANNA) },
    bruno: { deposito: depositoFinto(), io: chiaviBruno, istanza: istanza.per(ID_BRUNO) },
    pacchettoBruno: await chiaviBruno.pubblica(),
  };
}

/** La forma con cui le buste arrivano dall'API dei messaggi. */
const bustaDi = (id: string, busta: string, quando: string) => ({
  busta,
  consegnatoAt: null,
  conversazioneId: "conv-1",
  createdAt: quando,
  id,
  senderDeviceId: "d",
  senderUserId: ID_ANNA,
});

describe("aprire una conversazione", () => {
  it("un dispositivo senza niente in locale entra dal solo Welcome", async () => {
    const { anna, bruno, pacchettoBruno } = await dueCase();
    await apriNuova(anna, "conv-1", pacchettoBruno, ID_BRUNO);

    // Bruno non ha MAI aperto questa conversazione: deposito vuoto, e nessuno
    // gli passa l'albero. Deve bastargli il Welcome.
    expect(await apriEsistente(bruno, "conv-1")).toBeDefined();
  });

  it("riaprendo si riprende quella di prima, senza rientrare", async () => {
    const { anna, pacchettoBruno } = await dueCase();

    const prima = await apriNuova(anna, "conv-1", pacchettoBruno, ID_BRUNO);
    const dopo = await apriEsistente(anna, "conv-1");

    expect(dopo?.stato.groupContext.epoch).toBe(prima.stato.groupContext.epoch);
  });

  it("una conversazione che non è MLS non ha sessione, e lo dice", async () => {
    const { anna } = await dueCase();

    // Dopo la ritirata di ESTIA-E2E-v1 questo vuol dire: più vecchia del passaggio.
    expect(await apriEsistente(anna, "conv-mai-vista")).toBeUndefined();
  });
});

describe("il giro completo che la schermata fa", () => {
  it("porta una riga da Anna a Bruno, e la cronologia viene dall'archivio", async () => {
    const { anna, bruno, pacchettoBruno } = await dueCase();

    const sessioneAnna = await apriNuova(anna, "conv-1", pacchettoBruno, ID_BRUNO);
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
      [bustaDi("m1", mandata.busta, "2026-08-26T10:00:00.000Z")],
      new Set(),
    );

    expect(giro.righe.map((r) => r.testo)).toEqual(["ci vediamo alle 8"]);
  });

  it("non ridecifra ciò che ha già visto", async () => {
    // Una busta di un'epoch superata non si riapre più: ritentarla produrrebbe
    // solo righe illeggibili, non una copia.
    const { anna, bruno, pacchettoBruno } = await dueCase();

    const sessioneAnna = await apriNuova(anna, "conv-1", pacchettoBruno, ID_BRUNO);
    const sessioneBruno = (await apriEsistente(bruno, "conv-1"))!;

    const mandata = await manda(anna, sessioneAnna, "una sola", "m1", "2026-08-26T10:00:00.000Z");
    const busta = bustaDi("m1", mandata.busta, "2026-08-26T10:00:00.000Z");

    const primo = await aggiorna(bruno, sessioneBruno, [busta], new Set());
    const secondo = await aggiorna(bruno, primo.sessione, [busta], new Set(["m1"]));

    expect(secondo.righe).toHaveLength(1);
    expect(secondo.righe[0]?.testo).toBe("una sola");
  });
});
