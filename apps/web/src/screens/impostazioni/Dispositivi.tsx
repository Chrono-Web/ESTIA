import type { KeyBackupView, SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { useAvvisi } from "../../avvisi.js";
import {
  createAndSaveKeyBackup,
  hasLocalDeviceIdentity,
  restoreKeyBackup,
} from "../../dispositivo.js";
import { useSignedIn } from "../../state.js";
import { Alert, Badge, Button, Sheet, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { avvisoDiUscita, COME_FUNZIONANO, raccontoDi, statoChiaviDi } from "./chiavi-stato.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Accesso, dispositivi e chiavi.
 *
 * L'ordine della pagina è l'ordine della storia: **prima che cosa vive in questo
 * browser**, poi come se ne fa una copia, poi da dove sei entrato, e per ultimo
 * l'uscita — che è l'unica azione qui dentro che distrugge qualcosa.
 *
 * Le parole stanno in [`chiavi-stato.ts`](./chiavi-stato.ts) e non qui, perché
 * sono la cosa che vale la pena provare con un test: sono le stesse tre righe
 * che tre schermate diverse raccontavano in tre modi diversi.
 */
export function Dispositivi(): React.ReactElement {
  const { signOut, token } = useSignedIn();
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();
  const [sessioni, setSessioni] = useState<SessionView[]>([]);
  const [haChiavi, setHaChiavi] = useState<boolean>(false);
  const [copia, setCopia] = useState<KeyBackupView | null>(null);
  const [fraseSegreta, setFraseSegreta] = useState<string>("");
  const [inLavorazione, setInLavorazione] = useState<boolean>(false);
  const [confermaUscita, setConfermaUscita] = useState(false);

  const carica = useCallback(async () => {
    try {
      const [sessRes, devRes, inLocale] = await Promise.all([
        api.sessions(token),
        api.getMyDeviceKey(token).catch(() => ({ device: null })),
        hasLocalDeviceIdentity().catch(() => false),
      ]);
      setSessioni(sessRes.sessions);
      // Servono **entrambe**: la riga sull'istanza dice che qualcuno può
      // scriverti, la chiave qui dice che sapresti aprirlo. Una sola delle due
      // è uno stato che sembra a posto e non lo è.
      setHaChiavi(devRes.device !== null && inLocale);

      try {
        setCopia((await api.getKeyBackup(token)) ?? null);
      } catch {
        setCopia(null);
      }
    } catch (err: unknown) {
      mostraErrore(err, "Non riesco a leggere le informazioni sui dispositivi.");
    }
  }, [mostraErrore, token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const stato = statoChiaviDi({
    haChiavi,
    ...(copia === null ? {} : { copiaDel: quando(copia.updatedAt) }),
  });
  const racconto = raccontoDi(stato);
  const avviso = avvisoDiUscita(stato);

  const revoca = async (sessione: SessionView): Promise<void> => {
    // Uscire da qui porta via le chiavi: si passa dalla stessa conferma.
    if (sessione.current && avviso !== undefined) {
      setConfermaUscita(true);
      return;
    }

    await api.revokeSession(token, sessione.id);

    if (sessione.current) {
      signOut();
      return;
    }

    await carica();
  };

  const esci = async (): Promise<void> => {
    setConfermaUscita(false);
    try {
      await api.logout(token);
    } catch {
      // La sessione può essere già finita: lo stato locale si pulisce comunque.
    }

    signOut();
  };

  const chiediDiUscire = (): void => {
    if (avviso === undefined) {
      void esci();
      return;
    }
    setConfermaUscita(true);
  };

  const salvaCopia = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (fraseSegreta.trim().length < 8) {
      mostraErrore(null, "La frase segreta deve essere di almeno 8 caratteri.");
      return;
    }
    setInLavorazione(true);
    try {
      setCopia(await createAndSaveKeyBackup(token, fraseSegreta));
      setFraseSegreta("");
      mostraSuccesso("Copia creata. Adesso puoi rientrare da un altro browser.");
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
      await carica();
    } catch (err: unknown) {
      mostraErrore(err, "La frase segreta non apre questa copia.");
    } finally {
      setInLavorazione(false);
    }
  };

  return (
    <Sezione titolo="Accesso e dispositivi">
      <div className="card stack">
        <h2 className="gruppo">Le chiavi dei tuoi messaggi privati</h2>
        <Alert tone={racconto.tono}>
          <div className="stack stack--tight">
            <strong>{racconto.titolo}</strong>
            <p className="chiavi__testo">{racconto.testo}</p>
            {racconto.cosaFare !== undefined && (
              <p className="chiavi__testo">{racconto.cosaFare}</p>
            )}
          </div>
        </Alert>
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
              {inLavorazione
                ? "Un momento…"
                : copia !== null
                  ? "Aggiorna la copia"
                  : "Crea la copia"}
            </Button>
            {copia !== null && (
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

      <div className="card card--flush">
        <h2 className="gruppo">Da dove sei entrato</h2>
        {sessioni.length === 0 && <p className="empty-inline">Nessun dispositivo collegato.</p>}
        {sessioni.map((sessione) => (
          <div className="row" key={sessione.id}>
            <span className="row__body">
              <span className="row__title">
                {sessione.deviceLabel === "" ? "Dispositivo" : sessione.deviceLabel}{" "}
                {sessione.current && <Badge tone="on">questo</Badge>}
              </span>
              <span className="row__note">
                Collegato il {quando(sessione.createdAt)} · visto {quando(sessione.lastSeenAt)}
              </span>
            </span>
            <span className="row__end">
              <Button onClick={() => void revoca(sessione)} variant="danger">
                {sessione.current ? "Esci da qui" : "Disconnetti"}
              </Button>
            </span>
          </div>
        ))}
        <p className="muted chiavi__testo" style={{ padding: "var(--s-3) var(--s-4)" }}>
          Disconnettere un dispositivo lo butta fuori subito, ovunque si trovi: nessuna attesa e
          nessuna scadenza da aspettare.
        </p>
      </div>

      <div className="card">
        <h2 className="gruppo">Uscire</h2>
        <p className="muted chiavi__testo">
          {avviso ??
            "Uscendo, le chiavi spariscono da questo browser. Ne esiste una copia, quindi potrai rimetterle rientrando con la tua frase segreta."}
        </p>
        <Button block onClick={chiediDiUscire} variant="secondary">
          Esci da questo dispositivo
        </Button>
      </div>

      <Sheet
        onClose={() => setConfermaUscita(false)}
        open={confermaUscita}
        title="Uscire senza una copia?"
        variant="centrato"
      >
        <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
          <p className="chiavi__testo">{avviso}</p>
          <Button
            block
            onClick={() => {
              setConfermaUscita(false);
            }}
            variant="primary"
          >
            Resto, e creo la copia
          </Button>
          <Button block onClick={() => void esci()} variant="danger">
            Esci lo stesso, e perdi i messaggi
          </Button>
        </div>
      </Sheet>
    </Sezione>
  );
}
