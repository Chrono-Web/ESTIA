/**
 * Il bootstrap MLS del dispositivo.
 *
 * Due proprietà valgono più delle altre, e sono quelle che questa suite difende
 * con più insistenza:
 *
 * - **la scorta**, perché un `KeyPackage` è monouso e l'istanza lo consuma: con
 *   uno solo, la seconda persona che ti scrive non troverebbe niente;
 * - **che cosa c'è nel backup**, perché se ci finisse anche la scorta un
 *   dispositivo nuovo con la sola passphrase riaprirebbe il trasporto delle
 *   epoch precedenti — cioè la verifica 5 di
 *   [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md).
 */
import { describe, expect, it } from "vitest";

import {
  ALGORITMO,
  dimentica,
  esisteIdentita,
  portachiaviSu,
  preparaDispositivo,
  ripristinaDaPassphrase,
  salvaSottoPassphrase,
  type Contesto,
} from "./dispositivo.js";
import {
  anagrafeFinta,
  cassettoFinto,
  depositoFinto,
  istanzaFinta,
  portachiaviFinto,
} from "./finte.js";
import { aggiungi, creaConversazione, leggiKeyPackage } from "./gruppo.js";

function contesto(): Contesto & {
  cassetto: ReturnType<typeof cassettoFinto>;
  anagrafe: ReturnType<typeof anagrafeFinta>;
} {
  return { anagrafe: anagrafeFinta(), cassetto: cassettoFinto() };
}

function daB64(s: string): Uint8Array {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

/**
 * Qualcuno preleva un `KeyPackage` di Anna e le apre una conversazione: il
 * Welcome che ne esce è quello che il suo dispositivo dovrà saper aprire.
 */
async function welcomePer(pacchettoBase64: string): Promise<Uint8Array> {
  const registro = istanzaFinta();
  const suo = await (await portachiaviFinto("chi-scrive")).perNuovaFoglia();
  const pacchetto = leggiKeyPackage(daB64(pacchettoBase64))!;
  const credenziale = pacchetto.leafNode.credential;
  const suoNome =
    credenziale.credentialType === "basic" ? new TextDecoder().decode(credenziale.identity) : "";
  registro.ammetti("chi-scrive", suo.publicPackage.leafNode.signaturePublicKey);
  registro.ammetti(suoNome, pacchetto.leafNode.signaturePublicKey);

  const porta = registro.per("chiunque");
  const stato = await creaConversazione("conv-1", suo, porta);
  return (await aggiungi(stato, pacchetto, porta)).welcome;
}

describe("preparare il dispositivo", () => {
  it("registra la chiave di firma, e la dichiara MLS", async () => {
    const ctx = contesto();
    const dispositivo = await preparaDispositivo(ctx, "anna");

    const registrata = ctx.anagrafe.registrata();
    expect(registrata?.algorithm).toBe(ALGORITMO);
    // È la chiave con cui il dispositivo firma, e quella su cui poggia
    // l'AuthenticationService: un punto P-256 compresso, 33 byte. Non è il JSON
    // `{sig, kx}` che ci depositava `ESTIA-E2E-v1`.
    expect(daB64(registrata!.publicKey)).toHaveLength(33);

    const foglia = await dispositivo.portachiavi.perNuovaFoglia();
    expect(foglia.publicPackage.leafNode.signaturePublicKey).toEqual(daB64(registrata!.publicKey));
  });

  it("pubblica una scorta, perché un KeyPackage è monouso", async () => {
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");

    expect(ctx.anagrafe.scortaDi("dev-1")).toBeGreaterThan(1);
  });

  it("riaprire l'applicazione non rigenera l'identità né raddoppia la scorta", async () => {
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");
    const primaChiave = ctx.anagrafe.registrata()!.publicKey;
    const primaScorta = ctx.anagrafe.scortaDi("dev-1");

    await preparaDispositivo(ctx, "anna");

    expect(ctx.anagrafe.registrata()!.publicKey).toBe(primaChiave);
    expect(ctx.anagrafe.scortaDi("dev-1")).toBe(primaScorta);
  });

  it("un accesso nuovo è una riga nuova, e si porta la sua scorta", async () => {
    // La riga di `device_keys` è per sessione, e nasce senza KeyPackage: se non
    // se ne pubblicassero, a quella sessione nessuno potrebbe scrivere.
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");
    const chiave = ctx.anagrafe.registrata()!.publicKey;

    ctx.anagrafe.nuovoAccesso();
    await preparaDispositivo(ctx, "anna");

    expect(ctx.anagrafe.scortaDi("dev-2")).toBe(ctx.anagrafe.scortaDi("dev-1"));
    // Stessa persona, stesso dispositivo: la chiave di firma non cambia.
    expect(ctx.anagrafe.registrata()!.publicKey).toBe(chiave);
  });

  it("ricarica la scorta quando cala", async () => {
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");

    // Qualcuno preleva e apre una conversazione: quella chiave è spesa.
    const prelevato = ctx.anagrafe.preleva("dev-1")!;
    await portachiaviSu(ctx.cassetto).perWelcome(await welcomePer(prelevato));
    const dopoIlConsumo = ctx.anagrafe.scortaDi("dev-1");

    await preparaDispositivo(ctx, "anna");

    expect(ctx.anagrafe.scortaDi("dev-1")).toBe(dopoIlConsumo + 1);
  });
});

describe("il portachiavi", () => {
  it("apre il Welcome indirizzato alla chiave che era stata prelevata", async () => {
    const ctx = contesto();
    const dispositivo = await preparaDispositivo(ctx, "anna");

    const prelevato = ctx.anagrafe.preleva("dev-1")!;
    const scelta = await dispositivo.portachiavi.perWelcome(await welcomePer(prelevato));

    expect(scelta).toBeDefined();
  });

  it("una chiave d'ingresso si usa una volta sola", async () => {
    // Due gruppi protetti dallo stesso segreto d'ingresso sarebbero due gruppi
    // che cadono insieme.
    const ctx = contesto();
    const dispositivo = await preparaDispositivo(ctx, "anna");

    const prelevato = ctx.anagrafe.preleva("dev-1")!;
    const welcome = await welcomePer(prelevato);

    expect(await dispositivo.portachiavi.perWelcome(welcome)).toBeDefined();
    expect(await dispositivo.portachiavi.perWelcome(welcome)).toBeUndefined();
  });

  it("un Welcome che non ci riguarda non trova niente, e non solleva", async () => {
    const ctx = contesto();
    const dispositivo = await preparaDispositivo(ctx, "anna");

    const altro = contesto();
    await preparaDispositivo(altro, "bruno");
    const suo = altro.anagrafe.preleva("dev-1")!;

    expect(await dispositivo.portachiavi.perWelcome(await welcomePer(suo))).toBeUndefined();
  });
});

describe("il backup con la passphrase", () => {
  it("riporta la chiave di firma su un dispositivo che non ha niente", async () => {
    const ctx = contesto();
    const prima = await preparaDispositivo(ctx, "anna");
    await salvaSottoPassphrase(ctx, "una passphrase lunga abbastanza");

    // Il telefono cade in mare. Resta ciò che vive altrove.
    const nuovo: Contesto = { anagrafe: ctx.anagrafe, cassetto: cassettoFinto() };
    await ripristinaDaPassphrase(nuovo, "una passphrase lunga abbastanza");

    const tornata = await portachiaviSu(nuovo.cassetto).perNuovaFoglia();
    const originale = await prima.portachiavi.perNuovaFoglia();
    expect(tornata.publicPackage.leafNode.signaturePublicKey).toEqual(
      originale.publicPackage.leafNode.signaturePublicKey,
    );
  });

  it("NON riporta la scorta, e quindi non riapre i Welcome vecchi", async () => {
    // È la verifica 5 di ADR 0038 nel punto in cui si decide: se le metà private
    // della scorta stessero nel backup, chi ha la passphrase riaprirebbe il
    // Welcome vecchio e con esso il trasporto di quell'epoch.
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");
    const prelevato = ctx.anagrafe.preleva("dev-1")!;
    const welcome = await welcomePer(prelevato);
    await salvaSottoPassphrase(ctx, "una passphrase lunga abbastanza");

    const nuovo: Contesto = { anagrafe: ctx.anagrafe, cassetto: cassettoFinto() };
    await ripristinaDaPassphrase(nuovo, "una passphrase lunga abbastanza");

    expect(await portachiaviSu(nuovo.cassetto).perWelcome(welcome)).toBeUndefined();
  });

  it("una passphrase sbagliata non apre niente, e lo dice", async () => {
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");
    await salvaSottoPassphrase(ctx, "quella giusta e lunga");

    const nuovo: Contesto = { anagrafe: ctx.anagrafe, cassetto: cassettoFinto() };
    await expect(ripristinaDaPassphrase(nuovo, "un'altra qualunque")).rejects.toThrow(
      /Passphrase non corretta/,
    );
  });

  it("un backup di prima del passaggio a MLS lo dice invece di rompersi", async () => {
    // Il blob c'è, la passphrase è giusta, e dentro ci sono chiavi ECDH/ECDSA
    // che qui non servono a niente. Fallire adesso è meglio che fallire dopo.
    const ctx = contesto();
    await preparaDispositivo(ctx, "anna");
    await salvaSottoPassphrase(ctx, "passphrase di una volta");

    await scriviBackupDiUnaVolta(ctx, "passphrase di una volta");

    const nuovo: Contesto = { anagrafe: ctx.anagrafe, cassetto: cassettoFinto() };
    await expect(ripristinaDaPassphrase(nuovo, "passphrase di una volta")).rejects.toThrow(
      /prima del passaggio a MLS/,
    );
  });
});

describe("il logout", () => {
  it("porta via l'identità e anche lo stato dei gruppi", async () => {
    // La revisione del 2026-08-26 ha trovato sul client mobile che le chiavi E2E
    // sopravvivevano al logout e passavano all'account successivo.
    const ctx = contesto();
    const deposito = depositoFinto();
    await preparaDispositivo(ctx, "anna");
    await deposito.scrivi("conv-1", new Uint8Array([1, 2, 3]));

    await dimentica(ctx.cassetto, deposito);

    expect(await esisteIdentita(ctx.cassetto)).toBe(false);
    expect(await deposito.leggi("conv-1")).toBeUndefined();
  });
});

/** Riscrive il backup sull'anagrafe con la forma che aveva `ESTIA-E2E-v1`. */
async function scriviBackupDiUnaVolta(ctx: Contesto, passphrase: string): Promise<void> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  const chiave = await globalThis.crypto.subtle.deriveKey(
    { hash: "SHA-256", iterations: 600000, name: "PBKDF2", salt },
    base,
    { length: 256, name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const cifrato = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { iv, name: "AES-GCM" },
      chiave,
      new TextEncoder().encode(
        JSON.stringify({ conv_keys: {}, identity: { algorithm: "ESTIA-E2E-v1" } }),
      ),
    ),
  );
  const insieme = new Uint8Array(iv.length + cifrato.length);
  insieme.set(iv, 0);
  insieme.set(cifrato, iv.length);

  await ctx.anagrafe.salvaBackup({
    algorithm: "PBKDF2-AES-GCM-256",
    encryptedBlob: btoa(String.fromCharCode(...insieme)),
    iterations: 600000,
    salt: btoa(String.fromCharCode(...salt)),
  });
}
