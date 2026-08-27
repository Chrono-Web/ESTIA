import { useState } from "react";

import { useAvvisi } from "../../avvisi.js";
import { createAndSaveKeyBackup, restoreKeyBackup } from "../../dispositivo.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { COME_FUNZIONANO, raccontoDi, UN_DISPOSITIVO_ALLA_VOLTA } from "./chiavi-stato.js";
import { useChiavi } from "./useChiavi.js";

/**
 * Le chat: le chiavi, e la copia che le riporta altrove.
 *
 * Sta separata da «Accesso e dispositivi» perché sono due lavori diversi — là
 * si guarda da dove si è entrati e si esce, qui si governa che cosa può leggere
 * i propri messaggi (euristica 8: una sezione, un lavoro).
 *
 * **Qui arriveranno le richieste di autorizzazione di un dispositivo nuovo**,
 * quando ci saranno: [ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)
 * ha scelto che a dire di sì sia un dispositivo che già possiedi, e il posto
 * dove quel sì si dà è questo. Il meccanismo — aggiungere la foglia del
 * dispositivo nuovo a ogni conversazione — sta sopra il passaggio a MLS, quindi
 * la sezione oggi non c'è: **non c'è nemmeno un pulsante che non fa niente**.
 */
export function Chat(): React.ReactElement {
  const { token } = useSignedIn();
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();
  const { copiaEsiste, inLettura, ricarica, stato } = useChiavi(token);
  const [fraseSegreta, setFraseSegreta] = useState("");
  const [inLavorazione, setInLavorazione] = useState(false);

  const racconto = raccontoDi(stato);

  const salvaCopia = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (fraseSegreta.trim().length < 8) {
      mostraErrore(null, "La frase segreta deve essere di almeno 8 caratteri.");
      return;
    }
    setInLavorazione(true);
    try {
      await createAndSaveKeyBackup(token, fraseSegreta);
      setFraseSegreta("");
      mostraSuccesso("Copia creata. Adesso puoi rientrare da un altro browser.");
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, "Non sono riuscito a creare la copia delle chiavi.");
    } finally {
      setInLavorazione(false);
    }
  };

  const rimettiLeChiavi = async (): Promise<void> => {
    if (fraseSegreta.trim().length === 0) {
      mostraErrore(null, "Scrivi la frase segreta per aprire la copia.");
      return;
    }
    setInLavorazione(true);
    try {
      await restoreKeyBackup(token, fraseSegreta);
      setFraseSegreta("");
      mostraSuccesso("Chiavi rimesse su questo browser. I messaggi di prima tornano leggibili.");
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, "La frase segreta non apre questa copia.");
    } finally {
      setInLavorazione(false);
    }
  };

  return (
    <Sezione titolo="Chat">
      <Alert tone="neutral">
        <p className="chiavi__testo">{UN_DISPOSITIVO_ALLA_VOLTA}</p>
      </Alert>

      <div className="card stack">
        <h2 className="gruppo">Le chiavi dei tuoi messaggi privati</h2>
        {inLettura ? (
          <p className="empty-inline">Un momento…</p>
        ) : (
          <Alert tone={racconto.tono}>
            <div className="stack stack--tight">
              <strong>{racconto.titolo}</strong>
              <p className="chiavi__testo">{racconto.testo}</p>
              {racconto.cosaFare !== undefined && (
                <p className="chiavi__testo">{racconto.cosaFare}</p>
              )}
            </div>
          </Alert>
        )}
        <p className="muted chiavi__testo">{COME_FUNZIONANO}</p>
      </div>

      <div className="card">
        <h2 className="gruppo">La copia di sicurezza</h2>
        <p className="muted chiavi__testo">
          Una frase segreta che scegli tu chiude le tue chiavi in una copia che l&apos;istanza
          conserva <strong>senza poterla aprire</strong>. Serve a una cosa sola: rimettere le stesse
          chiavi su un browser nuovo, così ritrovi i messaggi di prima.{" "}
          <strong>Non è una copia delle conversazioni</strong> — quelle stanno già sull&apos;istanza
          e ci restano.
        </p>
        <form onSubmit={(e) => void salvaCopia(e)}>
          <TextField
            hint="Se la dimentichi non si recupera, e la copia diventa inservibile. L'istanza non la conosce mai."
            label="Frase segreta"
            onChange={(e) => setFraseSegreta(e.target.value)}
            placeholder="Almeno 8 caratteri"
            type="password"
            value={fraseSegreta}
          />
          <div className="button-group">
            <Button
              disabled={inLavorazione || fraseSegreta.length < 8}
              type="submit"
              variant="primary"
            >
              {inLavorazione ? "Un momento…" : copiaEsiste ? "Aggiorna la copia" : "Crea la copia"}
            </Button>
            {copiaEsiste && (
              <Button
                disabled={inLavorazione || fraseSegreta.length === 0}
                onClick={() => void rimettiLeChiavi()}
                type="button"
                variant="secondary"
              >
                Rimetti le chiavi qui
              </Button>
            )}
          </div>
        </form>
      </div>
    </Sezione>
  );
}
