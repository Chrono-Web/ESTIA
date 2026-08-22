import type { ConversazioneView, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import {
  decryptMessageBody,
  encryptMessageBody,
  getOrCreateConversationKey,
} from "../mls/crypto.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Badge, Button, EmptyState, Icon, IconButton } from "../ui/index.js";

function ora(valore: string): string {
  return new Date(valore).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

interface DecryptedMessage {
  id: string;
  senderUserId: string;
  text: string;
  createdAt: string;
}

const ATTESA_MS = 400;
const MINIMO = 2;

export function Messaggi(): React.ReactElement {
  const { token, user } = useSignedIn();

  const [conversazioni, setConversazioni] = useState<ConversazioneView[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [selezionataId, setSelezionataId] = useState<string | undefined>();
  const [messaggi, setMessaggi] = useState<DecryptedMessage[]>([]);
  const [inInvio, setInInvio] = useState(false);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | undefined>();

  // Search state
  const [termine, setTermine] = useState("");
  const [cercando, setCercando] = useState(false);
  const [risultati, setRisultati] = useState<ProfileView[] | undefined>();

  const fineMessaggiRef = useRef<HTMLDivElement>(null);

  const caricaConversazioni = useCallback(async (): Promise<void> => {
    try {
      const resp = await api.conversazioni(token);
      setConversazioni(resp.conversazioni);
    } catch {
      // Ignora, proverà al prossimo ciclo
    } finally {
      setCaricamento(false);
    }
  }, [token]);

  const caricaMessaggi = useCallback(
    async (id: string): Promise<void> => {
      try {
        const resp = await api.getMessaggi(token, id);
        const chiave = await getOrCreateConversationKey(id);

        const decifrati: DecryptedMessage[] = [];
        for (const m of resp.messaggi) {
          try {
            const chiaro = await decryptMessageBody(m.busta, chiave);
            decifrati.push({
              id: m.id,
              senderUserId: m.senderUserId,
              text: chiaro,
              createdAt: m.createdAt,
            });
          } catch (e) {
            console.error("Impossibile decifrare il messaggio", m.id, e);
          }
        }
        decifrati.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessaggi(decifrati);
      } catch (err) {
        console.error("Errore recupero messaggi", err);
      }
    },
    [token],
  );

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

  // Search logic
  useEffect(() => {
    const cercabile = termine.trim();
    if (cercabile.length < MINIMO) {
      setRisultati(undefined);
      return;
    }

    const annulla = new AbortController();
    const attesa = setTimeout(() => {
      setCercando(true);

      api
        .searchProfiles(token, cercabile, "istanza", annulla.signal)
        .then((res) => {
          setRisultati(res.locali);
        })
        .catch(() => undefined)
        .finally(() => setCercando(false));
    }, ATTESA_MS);

    return () => {
      clearTimeout(attesa);
      annulla.abort();
    };
  }, [termine, token]);

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

  const avviaChat = async (username: string): Promise<void> => {
    setErrore(undefined);
    setTermine("");
    try {
      const convRes = await api.createConversazione(token, {
        recipientUsername: username,
      });

      await caricaConversazioni();
      setSelezionataId(convRes.conversazione.id);
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Errore nell'avvio della conversazione.");
    }
  };

  const selezionata = conversazioni.find((c) => c.id === selezionataId);
  const altroMembro = selezionata?.membri.find((m) => m.id !== user.id);

  const abbastanza = termine.trim().length >= MINIMO;

  if (selezionataId !== undefined) {
    return (
      <main className="column column--feed chat-view">
        <div className="card card--flush chat-header">
          <div className="cluster cluster--spread feed-pad" style={{ paddingBlock: "var(--s-3)" }}>
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
        </div>

        <div className="chat-messages stack">
          {messaggi.length === 0 && (
            <p className="muted center" style={{ marginBlockStart: "var(--s-6)" }}>
              Nessun messaggio. Invia il primo messaggio cifrato!
            </p>
          )}
          {messaggi.map((m) => {
            const isMe = m.senderUserId === user.id;
            return (
              <div className={`cluster ${isMe ? "cluster--end" : "cluster--start"}`} key={m.id}>
                <div className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--them"}`}>
                  <p>{m.text}</p>
                  <span className="chat-time">{ora(m.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={fineMessaggiRef} />
        </div>

        <div className="chat-composer-container feed-pad">
          {errore && <Alert tone="error">{errore}</Alert>}
          <form className="cluster" onSubmit={(e) => void invia(e)}>
            <div className="grow">
              <input
                aria-label="Scrivi un messaggio cifrato"
                className="input"
                disabled={inInvio}
                onChange={(e) => setTesto(e.target.value)}
                placeholder="Scrivi un messaggio cifrato…"
                value={testo}
              />
            </div>
            <Button disabled={inInvio || testo.trim().length === 0} type="submit" variant="primary">
              {inInvio ? "..." : "Invia"}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="column column--feed">
      <div className="feed-pad">
        <div className="cluster cluster--spread" style={{ paddingBlockStart: "var(--s-4)" }}>
          <h1 className="h2">Messaggi</h1>
        </div>
      </div>

      <search className="feed-pad stack--tight cerca-campo">
        <label className="field__label" htmlFor="cerca">
          Cerca persone per iniziare una chat
        </label>
        <input
          autoComplete="off"
          className="input"
          id="cerca"
          onChange={(event) => setTermine(event.target.value)}
          placeholder="Cerca utenti per iniziare una chat..."
          type="search"
          value={termine}
        />
      </search>

      {errore && (
        <div className="feed-pad">
          <Alert tone="error">{errore}</Alert>
        </div>
      )}

      <div className="card card--flush" style={{ marginBlockStart: "var(--s-2)" }}>
        {abbastanza ? (
          <>
            {cercando && risultati === undefined && <p className="muted feed-pad">Cerco…</p>}
            {risultati !== undefined && risultati.length > 0 && (
              <div className="list-block">
                <h2 className="gruppo" style={{ marginInline: "var(--s-4)" }}>
                  Risultati ricerca
                </h2>
                {risultati.map((trovato) => (
                  <button
                    className="row row--interactive"
                    key={trovato.username}
                    onClick={() => void avviaChat(trovato.username)}
                    type="button"
                  >
                    <span className="row__body">
                      <span className="cluster">
                        <Avatar
                          displayName={trovato.displayName}
                          size="md"
                          username={trovato.username}
                        />
                        <span className="stack stack--tight" style={{ gap: 0 }}>
                          <span className="row__title">{trovato.displayName}</span>
                          <span className="row__note">@{trovato.username}</span>
                        </span>
                      </span>
                    </span>
                    <span className="row__end">
                      <Icon name="send" size={20} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {risultati !== undefined && risultati.length === 0 && (
              <p className="muted feed-pad">Nessuno trovato con questo nome sull'istanza.</p>
            )}
          </>
        ) : (
          <>
            {caricamento && <p className="empty-inline">Caricamento messaggi…</p>}
            {!caricamento && conversazioni.length === 0 && (
              <EmptyState icon="send" title="Nessuna conversazione attiva">
                <p className="muted">
                  Cerca un utente nella barra in alto per iniziare una chat cifrata end-to-end.
                </p>
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
                      <span
                        className="stack stack--tight"
                        style={{ gap: 0, alignItems: "flex-start" }}
                      >
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
          </>
        )}
      </div>
    </main>
  );
}
