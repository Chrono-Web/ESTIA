/**
 * Lo stato delle chiavi di questo browser, letto una volta e usato in due posti.
 *
 * Le chiavi vivono nella sezione **Chat**, che è dove si gestiscono; ma anche
 * **Accesso e dispositivi** deve saperlo, perché uscire da lì le cancella e il
 * pulsante deve poterlo dire. Sono la stessa domanda fatta da due schermate, e
 * una domanda sola non si scrive due volte.
 */
import { useCallback, useEffect, useState } from "react";

import type { DeviceKeyView } from "@estia/contracts";

import { api } from "../../api.js";
import { hasLocalDeviceIdentity } from "../../dispositivo.js";
import { statoChiaviDi, type StatoChiavi } from "./chiavi-stato.js";
import { codiceDi } from "./codice-dispositivo.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export interface Chiavi {
  stato: StatoChiavi;
  /** `true` finché non si sa: evita di allarmare prima di aver guardato. */
  inLettura: boolean;
  /** Se esiste una copia sull'istanza. Serve a decidere che cosa mostrare. */
  copiaEsiste: boolean;
  /** Il codice di **questo** dispositivo, da far confrontare a chi lo autorizza. */
  ilMioCodice: string | undefined;
  /** Gli **altri** dispositivi che aspettano un sì. */
  daAutorizzare: readonly DeviceKeyView[];
  ricarica: () => Promise<void>;
}

export function useChiavi(token: string): Chiavi {
  const [stato, setStato] = useState<StatoChiavi>({ kind: "senza-copia" });
  const [copiaEsiste, setCopiaEsiste] = useState(false);
  const [inLettura, setInLettura] = useState(true);
  const [ilMioCodice, setIlMioCodice] = useState<string | undefined>();
  const [daAutorizzare, setDaAutorizzare] = useState<readonly DeviceKeyView[]>([]);

  const ricarica = useCallback(async () => {
    // Servono **entrambe**: la riga sull'istanza dice che qualcuno può
    // scriverti, la chiave qui dice che sapresti aprirlo. Una sola delle due è
    // uno stato che sembra a posto e non lo è.
    const [mio, inLocale, copia, elenco] = await Promise.all([
      api.getMyDeviceKey(token).catch(() => ({ device: null })),
      hasLocalDeviceIdentity().catch(() => false),
      api.getKeyBackup(token).catch(() => undefined),
      api.dispositivi(token).catch(() => ({ dispositivi: [] })),
    ]);

    const inAttesa = mio.device !== null && mio.device.approvatoIl === null;

    setCopiaEsiste(copia !== undefined);
    // Il codice lo calcola questo browser dalla chiave pubblica, mai l'istanza:
    // un codice fornito da chi conserva le chiavi non proverebbe niente.
    setIlMioCodice(inAttesa && mio.device !== null ? codiceDi(mio.device.publicKey) : undefined);
    setDaAutorizzare(
      elenco.dispositivi.filter((d) => d.approvatoIl === null && d.id !== mio.device?.id),
    );
    setStato(
      statoChiaviDi({
        haChiavi: mio.device !== null && inLocale,
        inAttesa,
        ...(copia === undefined ? {} : { copiaDel: quando(copia.updatedAt) }),
      }),
    );
    setInLettura(false);
  }, [token]);

  useEffect(() => {
    void ricarica();
  }, [ricarica]);

  return { copiaEsiste, daAutorizzare, ilMioCodice, inLettura, ricarica, stato };
}
