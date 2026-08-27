/**
 * Il codice che si confronta per autorizzare un dispositivo.
 *
 * [ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)
 * ha scelto che a dire di sì a un dispositivo nuovo sia un dispositivo che già
 * possiedi. Perché quel sì valga qualcosa, chi approva deve sapere **che cosa**
 * sta approvando: il dispositivo che aspetta mostra un codice, chi approva ne
 * vede uno, e la persona guarda se coincidono.
 *
 * **Lo calcola il client, e non è un dettaglio implementativo.** Se il codice
 * arrivasse già scritto dall'istanza, l'istanza potrebbe mostrarne uno che
 * coincide anche dopo aver sostituito la chiave — che è precisamente l'attacco
 * che [S4](../../../../docs/spike/S4-autenticare-chi-entra.md) §3 ha misurato.
 * Derivandolo qui dalla chiave pubblica, un codice che coincide dice che la
 * chiave è quella, e un codice diverso dice che non lo è.
 *
 * **Non è un segreto.** Non protegge da chi lo indovina: serve a distinguere il
 * proprio dispositivo da un altro che stesse aspettando nello stesso momento, e
 * a smascherare una chiave sostituita. Per quello otto cifre bastano, e sono
 * poche abbastanza da leggersi a voce da una stanza all'altra.
 */
import { sha256 } from "@noble/hashes/sha2.js";

const CIFRE = 8;

/**
 * Le otto cifre di questa chiave pubblica, in due gruppi da quattro.
 *
 * Sei byte di digest sono circa 2,8·10¹⁴: ridotti a otto cifre lo squilibrio
 * fra un valore e l'altro è sotto il milionesimo, e qui nemmeno conterebbe —
 * il codice si confronta, non si indovina.
 */
export function codiceDi(publicKey: string): string {
  const digest = sha256(new TextEncoder().encode(publicKey));

  let valore = 0n;
  for (let i = 0; i < 6; i++) {
    valore = (valore << 8n) | BigInt(digest[i] ?? 0);
  }

  const cifre = (valore % 10n ** BigInt(CIFRE)).toString().padStart(CIFRE, "0");
  return `${cifre.slice(0, 4)} ${cifre.slice(4)}`;
}
