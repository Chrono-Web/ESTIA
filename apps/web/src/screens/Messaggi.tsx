import type { ConversazioneView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import {
  decryptMessageBody,
  encryptMessageBody,
  getOrCreateConversationKey,
} from "../mls/crypto.js";
import { useSignedIn } from "../state.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Sheet,
  TextField,
} from "../ui/index.js";

function ora(valore: string): string {
  return new Date(valore).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

interface DecryptedMessage {
  id: string;
  senderUserId: string;
  text: string;
  createdAt: string;
}

export function Messaggi(): React.ReactElement {
  const { token, user } = useSignedIn();
  const [conversazioni, setConversazioni] = useState<ConversazioneView[]>([]);
  const [selezionataId, setSelezionataId] = useState<string | undefined>();
  const [messaggi, setMessaggi] = useState<DecryptedMessage[]>([]);
  const [testo, setTesto] = useState<string>("");
  const [inInvio, setInInvio] = useState<boolean>(false);
  const [nuovaAperta, setNuovaAperta] = useState<boolean>(false);
  const [targetUsername, setTargetUsername] = useState<string>("");
  const [errore, setErrore] = useState<string | undefined>();
  const [caricamento, setCaricamento] = useState<boolean>(true);

  const fineMessaggiRef = useRef<HTMLDivElement>(null);

  const caricaConversazioni = useCallback(async () => {
    try {
      const res = await api.conversazioni(token);
      setConversazioni(res.conversazioni);
    } catch {
      // Ignora errori di polling
    } finally {
      setCaricamento(false);
    }
  }, [token]);

  const caricaMessaggi = useCallback(
    async (convId: string) => {
      try {
        const key = await getOrCreateConversationKey(convId);
        const res = await api.getMessaggi(token, convId);
        const dec: DecryptedMessage[] = [];
        for (const m of res.messaggi) {
          const plain = await decryptMessageBody(m.busta, key);
          dec.push({
            id: m.id,
            senderUserId: m.senderUserId,
            text: plain,
            createdAt: m.createdAt,
          });
        }
        setMessaggi(dec);

        // Segna come letta
        if (res.messaggi.length > 0) {
          const ultimo = res.messaggi[res.messaggi.length - 1];
          if (ultimo) {
            void api.segnaConversazioneLetta(token, convId, ultimo.createdAt);
          }
        }
      } catch (err: unknown) {
        setErrore(err instanceof Error ? err.message : "Errore nel caricamento dei messaggi.");
      }
    },
    [token],
  );

  // Polling per conversazioni e messaggi attivi
  useEffect(() => {
    void caricaConversazioni();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void caricaConversazioni();
        if (selezionataId) {
          void caricaMessaggi(selezionataId);
        }
      }
    }, 3000);

    const onVisChange = (): void => {
      if (document.visibilityState === "visible") {
        void caricaConversazioni();
        if (selezionataId) {
          void caricaMessaggi(selezionataId);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [caricaConversazioni, caricaMessaggi, selezionataId]);

  useEffect(() => {
    if (selezionataId) {
      void caricaMessaggi(selezionataId);
    }
  }, [caricaMessaggi, selezionataId]);

  useEffect(() => {
    fineMessaggiRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  const invia = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selezionataId || testo.trim().length === 0 || inInvio) return;

    setInInvio(true);
    setErrore(undefined);
    try {
      const key = await getOrCreateConversationKey(selezionataId);
      const busta = await encryptMessageBody(testo.trim(), key);
      await api.inviaMessaggio(token, selezionataId, { busta });
      setTesto("");
      await caricaMessaggi(selezionataId);
      await caricaConversazioni();
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Impossibile inviare il messaggio.");
    } finally {
      setInInvio(false);
    }
  };

  const avviaNuovaConversazione = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (targetUsername.trim().length === 0) return;

    setErrore(undefined);
    try {
      const convRes = await api.createConversazione(token, {
        recipientUsername: targetUsername.trim(),
      });

      setNuovaAperta(false);
      setTargetUsername("");
      await caricaConversazioni();
      setSelezionataId(convRes.conversazione.id);
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Errore nell'avvio della conversazione.");
    }
  };

  const selezionata = conversazioni.find((c) => c.id === selezionataId);
  const altroMembro = selezionata?.membri.find((m) => m.id !== user.id);

  return (
    <main className="column column--feed">
      <div className="feed-pad">
        {errore && <Alert tone="error">{errore}</Alert>}

        <div className="cluster cluster--spread">
          <h1 className="h2">Messaggi privati</h1>
          <Button onClick={() => setNuovaAperta(true)} variant="primary">
            Nuova chat
          </Button>
        </div>

        {selezionataId === undefined ? (
          <div className="card card--flush">
            {caricamento && <p className="empty-inline">Caricamento messaggi…</p>}
            {!caricamento && conversazioni.length === 0 && (
              <EmptyState icon="send" title="Nessuna conversazione attiva">
                <p className="muted">
                  I tuoi messaggi sono protetti da cifratura end-to-end (E2E). Solo tu e i tuoi
                  destinatari potete leggerli.
                </p>
                <Button onClick={() => setNuovaAperta(true)} variant="primary">
                  Inizia una conversazione
                </Button>
              </EmptyState>
            )}
            {conversazioni.map((c) => {
              const altro = c.membri.find((m) => m.id !== user.id) ?? c.membri[0];
              const nome = altro?.displayName ?? altro?.username ?? "Utente";
              const userHandle = altro?.username ?? "anon";
              return (
                <button
                  className="row row--interactive"
                  key={c.id}
                  onClick={() => setSelezionataId(c.id)}
                  type="button"
                >
                  <span className="row__body">
                    <span className="cluster">
                      <Avatar displayName={nome} size="md" username={userHandle} />
                      <span>
                        <span className="row__title">{nome}</span>
                        <span className="row__note">
                          @{userHandle} ·{" "}
                          {c.ultimoMessaggio ? ora(c.ultimoMessaggio.createdAt) : ora(c.createdAt)}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="row__end">
                    {c.nonLetti > 0 && <Badge tone="on">{c.nonLetti}</Badge>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card stack">
            <div className="cluster cluster--spread">
              <div className="cluster">
                <IconButton
                  icon="arrow-left"
                  label="Torna alle conversazioni"
                  onClick={() => setSelezionataId(undefined)}
                />
                <Avatar
                  displayName={altroMembro?.displayName ?? altroMembro?.username ?? "Utente"}
                  size="sm"
                  username={altroMembro?.username ?? "utente"}
                />
                <div>
                  <strong>{altroMembro?.displayName ?? altroMembro?.username}</strong>
                  <span className="muted"> (@{altroMembro?.username})</span>
                </div>
              </div>
              <Badge tone="on">E2E Cifrato</Badge>
            </div>

            <div className="chat-messages stack">
              {messaggi.length === 0 && (
                <p className="muted center">Nessun messaggio. Invia il primo messaggio cifrato!</p>
              )}
              {messaggi.map((m) => {
                const isMe = m.senderUserId === user.id;
                return (
                  <div className={`cluster ${isMe ? "cluster--end" : "cluster--start"}`} key={m.id}>
                    <div
                      className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--them"}`}
                    >
                      <p>{m.text}</p>
                      <span className="chat-time">{ora(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={fineMessaggiRef} />
            </div>

            <form className="cluster" onSubmit={(e) => void invia(e)}>
              <div className="grow">
                <TextField
                  disabled={inInvio}
                  label="Scrivi un messaggio"
                  onChange={(e) => setTesto(e.target.value)}
                  placeholder="Scrivi un messaggio cifrato…"
                  value={testo}
                />
              </div>
              <Button
                disabled={inInvio || testo.trim().length === 0}
                type="submit"
                variant="primary"
              >
                {inInvio ? "Invio…" : "Invia"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <Sheet
        onClose={() => setNuovaAperta(false)}
        open={nuovaAperta}
        title="Nuova conversazione privata"
        variant="centrato"
      >
        <form className="stack" onSubmit={(e) => void avviaNuovaConversazione(e)}>
          <TextField
            hint="Inserisci il nome utente esatto della persona con cui vuoi parlare."
            label="Username del destinatario"
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder="es. marco"
            value={targetUsername}
          />
          <div className="button-group">
            <Button disabled={targetUsername.trim().length === 0} type="submit" variant="primary">
              Avvia chat
            </Button>
            <Button onClick={() => setNuovaAperta(false)} type="button" variant="secondary">
              Annulla
            </Button>
          </div>
        </form>
      </Sheet>
    </main>
  );
}
