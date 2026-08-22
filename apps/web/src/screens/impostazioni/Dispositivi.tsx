import type { KeyBackupView, SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { createAndSaveKeyBackup, restoreKeyBackup } from "../../dispositivo.js";
import { useSignedIn } from "../../state.js";
import { Alert, Badge, Button, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Dispositivi(): React.ReactElement {
  const { signOut, token } = useSignedIn();
  const [sessioni, setSessioni] = useState<SessionView[]>([]);
  const [hasDeviceKey, setHasDeviceKey] = useState<boolean>(false);
  const [backupInfo, setBackupInfo] = useState<KeyBackupView | null>(null);
  const [passphrase, setPassphrase] = useState<string>("");
  const [inLavorazione, setInLavorazione] = useState<boolean>(false);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  const carica = useCallback(async () => {
    try {
      const [sessRes, devRes] = await Promise.all([
        api.sessions(token),
        api.getMyDeviceKey(token).catch(() => ({ device: null })),
      ]);
      setSessioni(sessRes.sessions);
      setHasDeviceKey(devRes.device !== null);

      try {
        const b = await api.getKeyBackup(token);
        setBackupInfo(b ?? null);
      } catch {
        setBackupInfo(null);
      }
    } catch {
      setErrore("Non riesco a leggere le informazioni sui dispositivi.");
    }
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const revoca = async (sessione: SessionView): Promise<void> => {
    await api.revokeSession(token, sessione.id);

    // Revocare la propria sessione finisce qui, senza far finta di niente.
    if (sessione.current) {
      signOut();
      return;
    }

    await carica();
  };

  const esci = async (): Promise<void> => {
    try {
      await api.logout(token);
    } catch {
      // La sessione può essere già finita: lo stato locale si pulisce comunque.
    }

    signOut();
  };

  const salvaBackup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (passphrase.trim().length < 8) {
      setErrore("La passphrase deve essere di almeno 8 caratteri.");
      return;
    }
    setErrore(undefined);
    setMessaggioSuccesso(undefined);
    setInLavorazione(true);
    try {
      const b = await createAndSaveKeyBackup(token, passphrase);
      setBackupInfo(b);
      setPassphrase("");
      setMessaggioSuccesso("Backup cifrato delle chiavi salvato con successo sull'istanza.");
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Errore durante il salvataggio del backup.");
    } finally {
      setInLavorazione(false);
    }
  };

  const ripristinaBackup = async (): Promise<void> => {
    if (passphrase.trim().length === 0) {
      setErrore("Inserisci la passphrase per sbloccare il backup.");
      return;
    }
    setErrore(undefined);
    setMessaggioSuccesso(undefined);
    setInLavorazione(true);
    try {
      await restoreKeyBackup(token, passphrase);
      setPassphrase("");
      setHasDeviceKey(true);
      setMessaggioSuccesso("Chiavi crittografiche ripristinate con successo.");
      await carica();
    } catch (err: unknown) {
      setErrore(
        err instanceof Error ? err.message : "Passphrase non corretta o errore di decifratura.",
      );
    } finally {
      setInLavorazione(false);
    }
  };

  return (
    <Sezione titolo="Accesso e dispositivi">
      {errore !== undefined && <Alert tone="error">{errore}</Alert>}
      {messaggioSuccesso !== undefined && <Alert tone="ok">{messaggioSuccesso}</Alert>}

      <div className="card card--flush">
        <h2 className="gruppo">Dispositivi collegati</h2>
        {sessioni.length === 0 && <p className="empty-inline">Nessun dispositivo collegato.</p>}
        {sessioni.map((sessione) => (
          <div className="row" key={sessione.id}>
            <span className="row__body">
              <span className="row__title">
                {sessione.deviceLabel === "" ? "Dispositivo" : sessione.deviceLabel}{" "}
                {sessione.current && <Badge tone="on">questo</Badge>}
                {sessione.current && hasDeviceKey && <Badge tone="on">chiave E2E attiva</Badge>}
              </span>
              <span className="row__note">
                Collegato il {quando(sessione.createdAt)} · visto {quando(sessione.lastSeenAt)}
              </span>
            </span>
            <span className="row__end">
              <Button onClick={() => void revoca(sessione)} variant="danger">
                {sessione.current ? "Esci da qui" : "Revoca"}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="gruppo">Backup delle chat e delle chiavi (E2E)</h2>
        <p className="muted">
          {backupInfo !== null
            ? `Backup attivo sull'istanza (aggiornato il ${quando(backupInfo.updatedAt)}). I messaggi passati potranno essere decifrati su un nuovo dispositivo usando la tua passphrase.`
            : "Nessun backup delle chiavi presente sull'istanza. Crea una passphrase per proteggere e conservare le tue chiavi cifrate sull'istanza."}
        </p>
        <form onSubmit={(e) => void salvaBackup(e)}>
          <TextField
            label="Passphrase di sicurezza chat"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Minimo 8 caratteri"
            hint="Usata dal tuo browser per cifrare e decifrare le chiavi. L'istanza non la conosce mai."
          />
          <div className="button-group">
            <Button
              disabled={inLavorazione || passphrase.length < 8}
              type="submit"
              variant="primary"
            >
              {inLavorazione
                ? "Salvataggio…"
                : backupInfo
                  ? "Aggiorna backup chiavi"
                  : "Crea backup chiavi"}
            </Button>
            {backupInfo !== null && (
              <Button
                disabled={inLavorazione || passphrase.length === 0}
                onClick={() => void ripristinaBackup()}
                type="button"
                variant="secondary"
              >
                Ripristina chiavi
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <p className="muted">
          Revocare un dispositivo lo disconnette subito, ovunque si trovi: non c&apos;è nessuna
          attesa e nessuna scadenza da aspettare.
        </p>
        <Button block onClick={() => void esci()} variant="secondary">
          Esci da questo dispositivo
        </Button>
      </div>
    </Sezione>
  );
}
