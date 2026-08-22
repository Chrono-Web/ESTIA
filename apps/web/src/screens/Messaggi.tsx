import type { ConversazioneView, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import {
  decryptMessageBody,
  encryptMessageBody,
  getOrCreateConversationKey,
  type MessagePayload,
} from "../mls/crypto.js";
import { useSignedIn } from "../state.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  SplitLayout,
} from "../ui/index.js";
import { PersonLink } from "../components/PersonLink.js";

function ora(valore: string): string {
  return new Date(valore).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

interface DecryptedMessage {
  id: string;
  senderUserId: string;
  text: string;
  replyTo?: string | undefined;
  createdAt: string;
}

function SwipeableBubble({
  message,
  isMe,
  onReply,
  replyMessage,
}: {
  message: DecryptedMessage;
  isMe: boolean;
  onReply: (id: string) => void;
  replyMessage?: DecryptedMessage | undefined;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStart = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const clientX = e.touches[0]?.clientX;
    if (clientX === undefined) return;
    const deltaX = clientX - touchStart.current;

    // Swipe left for my messages, right for their messages
    if (isMe && deltaX < 0) {
      setSwipeOffset(Math.max(deltaX, -60));
    } else if (!isMe && deltaX > 0) {
      setSwipeOffset(Math.min(deltaX, 60));
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(swipeOffset) > 40) {
      onReply(message.id);
    }
    setSwipeOffset(0);
    touchStart.current = null;
  };

  return (
    <div className={`chat-row cluster ${isMe ? "cluster--end" : "cluster--start"}`}>
      {isMe && (
        <div className="chat-row__actions">
          <IconButton icon="reply" label="Rispondi" onClick={() => onReply(message.id)} />
        </div>
      )}
      <div
        className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--them"}`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: touchStart.current === null ? "transform 0.2s ease" : "none",
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {replyMessage && (
          <div className="chat-bubble__reply">
            <p
              className="truncate muted"
              style={{ fontSize: "var(--t-sm)", margin: 0, opacity: 0.9 }}
            >
              {replyMessage.text}
            </p>
          </div>
        )}
        <p>{message.text}</p>
        <span className="chat-time">{ora(message.createdAt)}</span>
      </div>
      {!isMe && (
        <div className="chat-row__actions">
          <IconButton icon="reply" label="Rispondi" onClick={() => onReply(message.id)} />
        </div>
      )}
    </div>
  );
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
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  // Search state
  const [termine, setTermine] = useState("");
  const [cercando, setCercando] = useState(false);
  const [risultati, setRisultati] = useState<ProfileView[] | undefined>();

  const fineMessaggiRef = useRef<HTMLDivElement>(null);
  const selezionata = conversazioni.find((c) => c.id === selezionataId);
  const altroMembro = selezionata?.membri.find((m) => m.id !== user.id);

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
    async (id: string, peerUserId: string): Promise<void> => {
      try {
        const resp = await api.getMessaggi(token, id);
        const chiave = await getOrCreateConversationKey(id, peerUserId, token);

        const decifrati: DecryptedMessage[] = [];
        for (const m of resp.messaggi) {
          try {
            const payload = await decryptMessageBody(m.busta, chiave);
            decifrati.push({
              id: m.id,
              senderUserId: m.senderUserId,
              text: payload.text,
              replyTo: payload.replyTo,
              createdAt: m.createdAt,
            });
          } catch (e) {
            console.error("Errore decifratura", e);
            decifrati.push({
              id: m.id,
              senderUserId: m.senderUserId,
              text: "[Errore di decifrazione E2E]",
              createdAt: m.createdAt,
            });
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
          if (altroMembro) void caricaMessaggi(selezionataId, altroMembro.id);
        }
      }
    }, 3000);

    const onVisChange = (): void => {
      if (document.visibilityState === "visible") {
        void caricaConversazioni();
        if (selezionataId) {
          if (altroMembro) void caricaMessaggi(selezionataId, altroMembro.id);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [caricaConversazioni, caricaMessaggi, selezionataId, altroMembro]);

  useEffect(() => {
    if (selezionataId) {
      if (altroMembro) void caricaMessaggi(selezionataId, altroMembro.id);
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
      if (!altroMembro) throw new Error("Membro non trovato");
      const key = await getOrCreateConversationKey(selezionataId, altroMembro.id, token);

      const payload: MessagePayload = {
        v: 1,
        text: testo.trim(),
      };
      if (replyToId) {
        payload.replyTo = replyToId;
      }

      const busta = await encryptMessageBody(payload, key);
      await api.inviaMessaggio(token, selezionataId, { busta });
      setTesto("");
      setReplyToId(undefined);
      if (altroMembro) await caricaMessaggi(selezionataId, altroMembro.id);
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

  const abbastanza = termine.trim().length >= MINIMO;

  const inChat = selezionataId !== undefined;

  return (
    <SplitLayout
      detail={
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <header
            className="screen-head split-layout__detail-head"
            style={{ justifyContent: "space-between" }}
          >
            <div className="cluster" style={{ gap: "var(--s-3)" }}>
              <IconButton
                className="split-layout__back"
                icon="arrow-left"
                label="Torna alle conversazioni"
                onClick={() => setSelezionataId(undefined)}
              />
              <PersonLink
                className="cluster chat-header-link"
                username={altroMembro?.username ?? "utente"}
              >
                <Avatar
                  displayName={altroMembro?.displayName ?? altroMembro?.username ?? "Utente"}
                  size="sm"
                  username={altroMembro?.username ?? "utente"}
                />
                <span className="screen-head__title" style={{ fontSize: "var(--t-md)" }}>
                  <strong>{altroMembro?.displayName ?? altroMembro?.username}</strong>
                  <span className="muted" style={{ fontWeight: "normal" }}>
                    {" "}
                    (@{altroMembro?.username})
                  </span>
                </span>
              </PersonLink>
            </div>
            <Badge tone="on">E2E Cifrato</Badge>
          </header>

          <div className="chat-messages">
            {messaggi.length === 0 && (
              <p className="muted center" style={{ marginBlockStart: "var(--s-6)" }}>
                Nessun messaggio. Invia il primo messaggio cifrato!
              </p>
            )}
            {messaggi.map((m) => {
              const isMe = m.senderUserId === user.id;
              const repMsg = m.replyTo ? messaggi.find((x) => x.id === m.replyTo) : undefined;
              return (
                <SwipeableBubble
                  key={m.id}
                  isMe={isMe}
                  message={m}
                  onReply={setReplyToId}
                  replyMessage={repMsg}
                />
              );
            })}
            <div ref={fineMessaggiRef} />
          </div>

          <div className="chat-composer-container">
            {errore && (
              <div style={{ marginBlockEnd: "var(--s-2)" }}>
                <Alert tone="error">{errore}</Alert>
              </div>
            )}

            {replyToId && (
              <div
                className="card card--flush"
                style={{
                  padding: "var(--s-2) var(--s-3)",
                  marginBlockEnd: "var(--s-2)",
                  background: "var(--surface-2)",
                  borderLeft: "4px solid var(--accent)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div className="cluster cluster--spread">
                  <div className="truncate" style={{ fontSize: "var(--t-sm)" }}>
                    <strong>Risposta a:</strong>{" "}
                    <span className="muted">{messaggi.find((m) => m.id === replyToId)?.text}</span>
                  </div>
                  <IconButton
                    icon="close"
                    label="Annulla risposta"
                    onClick={() => setReplyToId(undefined)}
                  />
                </div>
              </div>
            )}

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
              <Button
                disabled={inInvio || testo.trim().length === 0}
                type="submit"
                variant="primary"
              >
                {inInvio ? "..." : "Invia"}
              </Button>
            </form>
          </div>
        </div>
      }
      detailClassName={inChat ? "chat-view" : ""}
      detailEmpty={
        <p className="muted split-layout__detail-empty">
          Scegli una conversazione a sinistra per iniziare.
        </p>
      }
      nav={
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <header className="screen-head">
            <h1 className="screen-head__title">Messaggi</h1>
          </header>

          <search className="split-layout__search">
            <label className="only-screen-reader" htmlFor="cerca-messaggi">
              Cerca persone o conversazioni
            </label>
            <div className="cluster">
              <Icon name="search" size={18} />
              <input
                autoComplete="off"
                className="input grow"
                id="cerca-messaggi"
                onChange={(event) => setTermine(event.target.value)}
                placeholder="Cerca persone o conversazioni…"
                type="search"
                value={termine}
              />
            </div>
          </search>

          {errore && (
            <div className="feed-pad" style={{ flexShrink: 0, paddingBlockStart: "var(--s-3)" }}>
              <Alert tone="error">{errore}</Alert>
            </div>
          )}

          <div className="stack" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
                {conversazioni.length > 0 && (
                  <div className="list-block">
                    {conversazioni.map((c) => {
                      const altro = c.membri.find((m) => m.id !== user.id) ?? c.membri[0];
                      const nome = altro?.displayName ?? altro?.username ?? "Utente";
                      const userHandle = altro?.username ?? "anon";
                      const isActive = c.id === selezionataId;
                      return (
                        <button
                          aria-current={isActive ? "page" : undefined}
                          className="row row--interactive"
                          key={c.id}
                          onClick={() => setSelezionataId(c.id)}
                          style={isActive ? { background: "var(--surface-2)" } : undefined}
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
                                  {c.ultimoMessaggio
                                    ? ora(c.ultimoMessaggio.createdAt)
                                    : ora(c.createdAt)}
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
                )}
              </>
            )}
          </div>
        </div>
      }
      navLabel="Elenco delle conversazioni"
      showNav={!inChat}
    />
  );
}
