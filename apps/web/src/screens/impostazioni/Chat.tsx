import { useState } from "react";

import { api } from "../../api.js";
import { useAvvisi } from "../../avvisi.js";
import { createAndSaveKeyBackup, restoreKeyBackup } from "../../dispositivo.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { codiceDi } from "./codice-dispositivo.js";
import { COME_FUNZIONANO, raccontoDi, UN_DISPOSITIVO_ALLA_VOLTA } from "./chiavi-stato.js";
import { useChiavi } from "./useChiavi.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Le chat: le chiavi, la copia che le riporta altrove, e chi può leggerle.
 *
 * Sta separata da «Accesso e dispositivi» perché sono due lavori diversi — là
 * si guarda da dove si è entrati e si esce, qui si governa che cosa può leggere
 * i propri messaggi (euristica 8: una sezione, un lavoro).
 *
 * **Qui arrivano le richieste di autorizzazione di un dispositivo nuovo**
 * ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md),
 * strada B): a dire di sì è un dispositivo che già possiedi, e il codice da
 * confrontare lo calcola **questo browser** dalla chiave pubblica — se lo
 * fornisse l'istanza, l'istanza potrebbe mostrarne uno che coincide anche dopo
 * aver sostituito la chiave.
 *
 * Che cosa il sì fa oggi, e che cosa non fa ancora: mette il dispositivo nel
 * registro, quindi da lì in poi chi scrive può cifrare per lui. **Non** lo
 * aggiunge alle conversazioni già in corso: quello è un commit MLS per
 * conversazione, e sta dietro il passaggio dell'interfaccia a MLS. Finché non
 * c'è, l'avviso in cima dice che le chat funzionano su un dispositivo alla
 * volta — ed è vero.
 */
export function Chat(): React.ReactElement {
  const { token } = useSignedIn();
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();
  const { copiaEsiste, daAutorizzare, ilMioCodice, inLettura, ricarica, stato } = useChiavi(token);
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

  const decidi = async (deviceId: string, si: boolean): Promise<void> => {
    setInLavorazione(true);
    try {
      if (si) {
        await api.approvaDispositivo(token, deviceId);
        mostraSuccesso("Autorizzato. Da adesso i messaggi arrivano anche lì.");
      } else {
        await api.rifiutaDispositivo(token, deviceId);
        mostraSuccesso("Rifiutato: quel dispositivo è stato disconnesso.");
      }
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, "Non sono riuscito a rispondere a questa richiesta.");
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
    <Sezione
      chiave="chat"
      scopo="Qui governi chi può leggere i tuoi messaggi privati: le chiavi di questo dispositivo, la copia che le riporta altrove, e i dispositivi che chiedono di entrare."
    >
      <Alert tone="neutral">
        <p className="chiavi__testo">{UN_DISPOSITIVO_ALLA_VOLTA}</p>
      </Alert>

      {daAutorizzare.length > 0 && (
        <div className="card stack">
          <h2 className="gruppo">
            {daAutorizzare.length === 1
              ? "Un dispositivo chiede di entrare"
              : `${String(daAutorizzare.length)} dispositivi chiedono di entrare`}
          </h2>
          <p className="muted chiavi__testo">
            Prima di dire di sì, <strong>guarda il codice su quel dispositivo</strong> e controlla
            che sia lo stesso che vedi qui. Se non coincide, non è il tuo: rifiuta.
          </p>
          {daAutorizzare.map((dispositivo) => (
            <div className="richiesta" key={dispositivo.id}>
              <p className="richiesta__codice">{codiceDi(dispositivo.publicKey)}</p>
              <p className="muted chiavi__testo">
                Chiede di entrare dal {quando(dispositivo.createdAt)}. Autorizzandolo, potrà leggere
                i messaggi che riceverai da qui in avanti.
              </p>
              <div className="cluster">
                <Button
                  disabled={inLavorazione}
                  onClick={() => void decidi(dispositivo.id, true)}
                  variant="primary"
                >
                  Sì, sono io
                </Button>
                <Button
                  disabled={inLavorazione}
                  onClick={() => void decidi(dispositivo.id, false)}
                  variant="danger"
                >
                  No, rifiuta
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ilMioCodice !== undefined && (
        <div className="card stack">
          <h2 className="gruppo">Il codice di questo dispositivo</h2>
          <p className="richiesta__codice">{ilMioCodice}</p>
          <p className="muted chiavi__testo">
            Confrontalo con quello che vedi sul dispositivo dove sei già dentro. Coincidono? Allora
            di&apos; di sì da lì.
          </p>
        </div>
      )}

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
