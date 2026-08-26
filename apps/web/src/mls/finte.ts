/**
 * I doppi su cui girano i test MLS: un'istanza, un deposito, un portachiavi.
 *
 * Non sono una scorciatoia, sono una **riproduzione**, e la fedeltà è il loro
 * unico scopo: il canale di handshake che ordina per arrivo e consegna un
 * Welcome soltanto al suo destinatario, il mazzo con l'epoch che non torna
 * indietro, l'archivio idempotente.
 *
 * Stanno in un file loro perché ce n'è più d'uno che li usa, e tre copie di un
 * doppio sono tre fedeltà diverse. Una l'aveva già pagata: finché l'istanza
 * finta non filtrava il destinatario, il client poteva depositare l'username al
 * posto dell'id e i test passavano lo stesso — il Welcome non sarebbe arrivato
 * a nessuno, e il difetto era nel doppio, non nel codice provato.
 *
 * Questo file non entra nel bundle: nessun modulo dell'applicazione lo importa.
 */
import {
  identitaDaChiave,
  nuovaIdentita,
  sceltaPerWelcome,
  type IdentitaDispositivo,
  type Portachiavi,
} from "./gruppo.js";
import type { BustaHandshake, Deposito, Istanza, VoceArchivio } from "./sessione.js";
import type { KeyPackage } from "ts-mls";

/** Una busta sul canale, destinatario compreso: la rotta vera non lo restituisce. */
export type BustaDepositata = BustaHandshake & { destinatario?: string };

export interface IstanzaFinta {
  /** Registra una chiave di firma come riconosciuta per quel membro. */
  ammetti: (username: string, chiaveDiFirma: Uint8Array) => void;
  /** Ciò che è stato depositato, per guardarlo dai test. */
  depositati: () => readonly BustaDepositata[];
  chiamate: { salvaMazzo: number; depositaArchivio: number };
  /**
   * La vista che l'istanza dà a chi legge.
   *
   * Prende un **id**, non un nome: è con l'id che l'istanza vera decide chi
   * riceve un Welcome, e passare di qui è ciò che rende quel confine visibile.
   */
  per: (idDiChiLegge: string) => Istanza;
}

/** Un'istanza in memoria che si comporta come quella vera. */
export function istanzaFinta(): IstanzaFinta {
  const chiavi = new Map<string, Uint8Array[]>();
  const handshake: BustaDepositata[] = [];
  const mazzi = new Map<string, { mazzo: string; epoch: number }>();
  const archivio = new Map<string, VoceArchivio[]>();
  const chiamate = { depositaArchivio: 0, salvaMazzo: 0 };
  let seq = 0;

  return {
    ammetti(username, chiaveDiFirma) {
      chiavi.set(username, [...(chiavi.get(username) ?? []), chiaveDiFirma]);
    },
    chiamate,
    depositati: () => handshake,

    per: (idDiChiLegge) => ({
      archivio: (conversazioneId) =>
        Promise.resolve({ voci: [...(archivio.get(conversazioneId) ?? [])] }),

      chiaviDiFirmaDi: (username) => Promise.resolve(chiavi.get(username) ?? []),

      depositaArchivio(conversazioneId, voci) {
        chiamate.depositaArchivio += 1;
        const attuali = archivio.get(conversazioneId) ?? [];
        // Idempotente per (conversazione, id), come la tabella vera.
        for (const voce of voci) {
          if (!attuali.some((v) => v.id === voce.id)) {
            attuali.push(voce);
          }
        }
        archivio.set(conversazioneId, attuali);
        return Promise.resolve();
      },

      depositaHandshake(_conversazioneId, busta) {
        seq += 1;
        handshake.push({ ...busta, id: String(seq) });
        return Promise.resolve();
      },

      handshakeDopo(_conversazioneId, dopo) {
        // Ordine di ARRIVO, come `seq` lato istanza. E un Welcome lo vede solo
        // il suo destinatario: un commit non ne ha, e va a tutti.
        const da = dopo === undefined ? 0 : Number(dopo);
        return Promise.resolve({
          handshake: handshake.filter(
            (h) =>
              Number(h.id) > da &&
              (h.destinatario === undefined || h.destinatario === idDiChiLegge),
          ),
        });
      },

      mazzo: (conversazioneId) => Promise.resolve(mazzi.get(conversazioneId)),

      salvaMazzo(conversazioneId, dati) {
        chiamate.salvaMazzo += 1;
        const attuale = mazzi.get(conversazioneId);
        // L'epoch non torna indietro, come lato istanza.
        if (attuale === undefined || attuale.epoch <= dati.epoch) {
          mazzi.set(conversazioneId, dati);
        }
        return Promise.resolve();
      },
    }),
  };
}

export interface DepositoFinto extends Deposito {
  quanteScritture: () => number;
}

export function depositoFinto(): DepositoFinto {
  const stati = new Map<string, Uint8Array>();
  const cursori = new Map<string, string>();
  let scritture = 0;

  return {
    leggi: (id) => Promise.resolve(stati.get(id)),
    leggiCursore: (id) => Promise.resolve(cursori.get(id)),
    quanteScritture: () => scritture,
    scrivi(id, stato) {
      scritture += 1;
      stati.set(id, stato);
      return Promise.resolve();
    },
    scriviCursore(id, cursore) {
      cursori.set(id, cursore);
      return Promise.resolve();
    },
  };
}

export interface PortachiaviFinto extends Portachiavi {
  /** La chiave di firma del dispositivo: quella che l'istanza registra. */
  chiaveDiFirma: Uint8Array;
  /** Mette in scorta un `KeyPackage` e lo restituisce, come farebbe la pubblicazione. */
  pubblica: () => Promise<KeyPackage>;
  /** Butta via la scorta, come un browser svuotato. La chiave di firma resta. */
  dimenticaLaScorta: () => void;
}

/**
 * Il portachiavi di un dispositivo: una chiave di firma, e una scorta.
 *
 * La scorta esiste perché un `KeyPackage` è monouso e l'istanza lo consuma
 * quando qualcuno lo preleva. `perNuovaFoglia` **non** attinge alla scorta: la
 * chiave che finisce nell'albero non dev'essere anche prelevabile da fuori, o
 * verrebbe usata due volte.
 */
export async function portachiaviFinto(username: string): Promise<PortachiaviFinto> {
  const prima = await nuovaIdentita(username);
  const chiavi = {
    publicKey: prima.publicPackage.leafNode.signaturePublicKey,
    signKey: prima.privatePackage.signaturePrivateKey,
  };
  let scorta: IdentitaDispositivo[] = [];

  return {
    chiaveDiFirma: chiavi.publicKey,
    dimenticaLaScorta() {
      scorta = [];
    },
    perNuovaFoglia: () => identitaDaChiave(username, chiavi),
    perWelcome: (welcome) => sceltaPerWelcome(welcome, scorta),
    async pubblica() {
      const pacchetto = await identitaDaChiave(username, chiavi);
      scorta.push(pacchetto);
      return pacchetto.publicPackage;
    },
  };
}
