import type { ConversazioneView, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api.js";
import { restoreKeyBackup } from "../dispositivo.js";
import {
  deriveKeyForDevice,
  encryptMessageBody,
  getOrCreateConversationKey,
  rederiveConversationKey,
  tryDecryptMessageBody,
  type MessagePayload,
} from "../mls/crypto.js";
import { useSignedIn } from "../state.js";
import { useAvvisi } from "../avvisi.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Sheet,
  SplitLayout,
  TextField,
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
  consegnatoAt?: string | null | undefined;
  unreadable?: boolean;
}

function SwipeableBubble({
  message,
  isMe,
  onReply,
  onRestoreKeys,
  replyMessage,
}: {
  message: DecryptedMessage;
  isMe: boolean;
  onReply: (id: string) => void;
  onRestoreKeys: () => void;
  replyMessage?: DecryptedMessage | undefined;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStart = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (message.unreadable) return;
    touchStart.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (message.unreadable || touchStart.current === null) return;
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
    if (!message.unreadable && Math.abs(swipeOffset) > 40) {
      onReply(message.id);
    }
    setSwipeOffset(0);
    touchStart.current = null;
  };

  return (
    <div className={`chat-row cluster ${isMe ? "cluster--end" : "cluster--start"}`}>
      {isMe && !message.unreadable && (
        <div className="chat-row__actions">
          <IconButton icon="reply" label="Rispondi" onClick={() => onReply(message.id)} />
        </div>
      )}
      <div
        className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--them"} ${
          message.unreadable ? "chat-bubble--unreadable" : ""
        }`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: touchStart.current === null ? "transform 0.2s ease" : "none",
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {replyMessage && !message.unreadable && (
          <div className="chat-bubble__reply">
            <p
              className="truncate muted"
              style={{ fontSize: "var(--t-sm)", margin: 0, opacity: 0.9 }}
            >
              {replyMessage.text}
            </p>
          </div>
        )}
        {message.unreadable ? (
          <div className="stack stack--tight" style={{ gap: "var(--s-1)", padding: "var(--s-1)" }}>
            <div className="cluster" style={{ gap: "var(--s-1)", color: "var(--accent-text)" }}>
              <Icon name="key" size={16} />
              <strong style={{ fontSize: "var(--t-sm)" }}>Messaggio cifrato</strong>
            </div>
            <p style={{ fontSize: "var(--t-sm)", margin: 0 }}>
              {isMe
                ? "Inviato da un'altra tua sessione o dispositivo. Per leggerlo qui, ripristina il backup delle tue chiavi personali."
                : "Cifrato con una chiave o sessione precedente. Per visualizzarlo, ripristina il backup delle chiavi personali."}
            </p>
            <div style={{ marginBlockStart: "var(--s-1)" }}>
              <Button icon="key" onClick={onRestoreKeys} variant="secondary">
                Ripristina chiavi di sicurezza
              </Button>
            </div>
          </div>
        ) : (
          <p>{message.text}</p>
        )}
        <span className="chat-time">
          {ora(message.createdAt)}
          {isMe && !message.unreadable && (
            <span
              style={{ marginInlineStart: "var(--s-1)", opacity: 0.8 }}
              title={message.consegnatoAt ? "Consegnato all'interlocutore" : "Inviato all'istanza"}
            >
              {message.consegnatoAt ? " ✓✓" : " ✓"}
            </span>
          )}
        </span>
      </div>
      {!isMe && !message.unreadable && (
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
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();

  const [conversazioni, setConversazioni] = useState<ConversazioneView[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [selezionataId, setSelezionataId] = useState<string | undefined>();
  const [messaggi, setMessaggi] = useState<DecryptedMessage[]>([]);
  const [inInvio, setInInvio] = useState(false);
  const [testo, setTesto] = useState("");
  const [replyToId, setReplyToId] = useState<string | undefined>();

  // Search state
  const [termine, setTermine] = useState("");
  const [cercando, setCercando] = useState(false);
  const [risultati, setRisultati] = useState<ProfileView[] | undefined>();

  // Ripristino chiavi di sicurezza E2E
  const [sheetRipristinoAperto, setSheetRipristinoAperto] = useState(false);
  const [passphraseRipristino, setPassphraseRipristino] = useState("");
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);

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
        let chiave: CryptoKey | undefined;
        try {
          chiave = await getOrCreateConversationKey(id, peerUserId, token);
        } catch (e) {
          console.warn("Impossibile ottenere la chiave di conversazione", e);
        }

        const deviceKeyCache = new Map<string, CryptoKey>();
        let triedRederive = false;

        const decifrati: DecryptedMessage[] = [];
        for (const m of resp.messaggi) {
          let payload: MessagePayload | null = null;

          if (chiave) {
            payload = await tryDecryptMessageBody(m.busta, chiave);
          }

          // Se la decifratura fallisce con la chiave attuale, proviamo a ri-derivare
          // la chiave attiva (es. il peer ha registrato un nuovo dispositivo)
          if (!payload && !triedRederive) {
            triedRederive = true;
            try {
              const nuovaChiave = await rederiveConversationKey(id, peerUserId, token);
              chiave = nuovaChiave;
              payload = await tryDecryptMessageBody(m.busta, chiave);
            } catch {
              // Ignore
            }
          }

          // Se fallisce ancora, proviamo con la chiave specifica del dispositivo mittente
          if (!payload && m.senderDeviceId) {
            try {
              let devKey = deviceKeyCache.get(m.senderDeviceId);
              if (!devKey) {
                devKey = await deriveKeyForDevice(m.senderDeviceId, token);
                deviceKeyCache.set(m.senderDeviceId, devKey);
              }
              payload = await tryDecryptMessageBody(m.busta, devKey);
            } catch {
              // Ignore
            }
          }

          if (payload) {
            decifrati.push({
              id: m.id,
              senderUserId: m.senderUserId,
              text: payload.text,
              replyTo: payload.replyTo,
              createdAt: m.createdAt,
              consegnatoAt: m.consegnatoAt,
            });
          } else {
            decifrati.push({
              id: m.id,
              senderUserId: m.senderUserId,
              text: "",
              replyTo: undefined,
              createdAt: m.createdAt,
              consegnatoAt: m.consegnatoAt,
              unreadable: true,
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

  const eseguiRipristinoChiavi = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (passphraseRipristino.trim().length === 0) return;
    setRipristinoInCorso(true);
    try {
      await restoreKeyBackup(token, passphraseRipristino);
      mostraSuccesso("Chiavi ripristinate con successo! Decifratura in corso…");
      setPassphraseRipristino("");
      setSheetRipristinoAperto(false);
      if (selezionataId && altroMembro) {
        await caricaMessaggi(selezionataId, altroMembro.id);
      }
    } catch (err: unknown) {
      mostraErrore(err, "Passphrase non corretta o backup non trovato.");
    } finally {
      setRipristinoInCorso(false);
    }
  };

  // Menu opzioni conversazione
  const [menuAperto, setMenuAperto] = useState(false);
  const [statoMenu, setStatoMenu] = useState<"principale" | "conferma-elimina">("principale");
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const eseguiEliminazioneConversazione = async (): Promise<void> => {
    if (!selezionataId) return;
    setEliminazioneInCorso(true);
    try {
      await api.deleteConversazione(token, selezionataId);
      mostraSuccesso("Conversazione eliminata.");
      setMenuAperto(false);
      setStatoMenu("principale");
      setSelezionataId(undefined);
      setMessaggi([]);
      await caricaConversazioni();
    } catch (err: unknown) {
      mostraErrore(err, "Impossibile eliminare la conversazione.");
    } finally {
      setEliminazioneInCorso(false);
    }
  };

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
  }, [caricaConversazioni, caricaMessaggi, selezionataId, altroMembro?.id]);

  useEffect(() => {
    if (selezionataId) {
      if (altroMembro) void caricaMessaggi(selezionataId, altroMembro.id);
    }
  }, [caricaMessaggi, selezionataId, altroMembro?.id]);

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
      mostraErrore(err, "Impossibile inviare il messaggio.");
    } finally {
      setInInvio(false);
    }
  };

  const avviaChat = async (username: string): Promise<void> => {
    setTermine("");
    try {
      const convRes = await api.createConversazione(token, {
        recipientUsername: username,
      });

      await caricaConversazioni();
      setSelezionataId(convRes.conversazione.id);
    } catch (err: unknown) {
      mostraErrore(err, "Errore nell'avvio della conversazione.");
    }
  };

  const abbastanza = termine.trim().length >= MINIMO;

  const inChat = selezionataId !== undefined;

  return (
    <>
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
              <div className="cluster" style={{ gap: "var(--s-2)" }}>
                <Badge tone="on">E2E Cifrato</Badge>
                <IconButton
                  icon="more"
                  label="Opzioni conversazione"
                  onClick={() => {
                    setStatoMenu("principale");
                    setMenuAperto(true);
                  }}
                  ref={menuAnchorRef}
                />
              </div>
            </header>

            {messaggi.some((m) => m.unreadable) && (
              <div style={{ padding: "var(--s-2) var(--s-4)", background: "var(--surface)" }}>
                <Alert tone="neutral">
                  <div className="stack" style={{ gap: "var(--s-2)" }}>
                    <p style={{ margin: 0, fontSize: "var(--t-sm)" }}>
                      Alcuni messaggi sono stati cifrati con una sessione precedente e non possono
                      essere letti senza le chiavi di sicurezza.
                    </p>
                    <div className="cluster">
                      <Button
                        icon="key"
                        onClick={() => {
                          setSheetRipristinoAperto(true);
                        }}
                        variant="secondary"
                      >
                        Inserisci passphrase di ripristino
                      </Button>
                      <Link
                        to="/impostazioni/dispositivi"
                        className="btn btn--subtle"
                        style={{ fontSize: "var(--t-sm)" }}
                      >
                        Gestisci dispositivi
                      </Link>
                    </div>
                  </div>
                </Alert>
              </div>
            )}

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
                    onRestoreKeys={() => {
                      setSheetRipristinoAperto(true);
                    }}
                    replyMessage={repMsg}
                  />
                );
              })}
              <div ref={fineMessaggiRef} />
            </div>

            <div className="chat-composer-container">
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
                      <span className="muted">
                        {messaggi.find((m) => m.id === replyToId)?.text}
                      </span>
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
                        Cerca un utente nella barra in alto per iniziare una chat cifrata
                        end-to-end.
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
      <Sheet
        open={sheetRipristinoAperto}
        onClose={() => {
          setSheetRipristinoAperto(false);
        }}
        title="Ripristina chiavi di sicurezza"
        variant="centrato"
      >
        <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
          <p className="muted" style={{ margin: 0, fontSize: "var(--t-sm)" }}>
            Inserisci la passphrase personale che avevi impostato per il backup delle chiavi. Tutte
            le chiavi di crittografia verranno sbloccate e le chat passate verranno decifrate.
          </p>

          <form onSubmit={(e) => void eseguiRipristinoChiavi(e)} className="stack">
            <TextField
              autoFocus
              label="Passphrase di sicurezza"
              onChange={(e) => setPassphraseRipristino(e.target.value)}
              required
              type="password"
              value={passphraseRipristino}
            />
            <div className="cluster cluster--end" style={{ marginBlockStart: "var(--s-2)" }}>
              <Button
                disabled={ripristinoInCorso}
                onClick={() => setSheetRipristinoAperto(false)}
                type="button"
                variant="secondary"
              >
                Annulla
              </Button>
              <Button
                disabled={ripristinoInCorso || passphraseRipristino.trim().length === 0}
                type="submit"
                variant="primary"
              >
                {ripristinoInCorso ? "..." : "Sblocca"}
              </Button>
            </div>
          </form>
        </div>
      </Sheet>

      {/* Menu opzioni della conversazione */}
      <Sheet
        anchorRef={menuAnchorRef}
        onClose={() => {
          setMenuAperto(false);
          setStatoMenu("principale");
        }}
        open={menuAperto}
        title="Opzioni conversazione"
        variant="piccolo"
      >
        {statoMenu === "principale" && (
          <div className="list-block">
            {altroMembro && (
              <Link
                className="row row--interactive"
                onClick={() => setMenuAperto(false)}
                to={`/@${altroMembro.username}`}
              >
                <span className="row__body">
                  <span className="row__title">Vedi profilo</span>
                  <span className="row__note">@{altroMembro.username}</span>
                </span>
              </Link>
            )}
            <Link
              className="row row--interactive"
              onClick={() => setMenuAperto(false)}
              to="/impostazioni/dispositivi"
            >
              <span className="row__body">
                <span className="row__title">Dispositivi e backup</span>
                <span className="row__note">Gestione chiavi personali</span>
              </span>
            </Link>
            <button
              className="row row--interactive"
              onClick={() => {
                setMenuAperto(false);
                setSheetRipristinoAperto(true);
              }}
              type="button"
            >
              <span className="row__body">
                <span className="row__title">Ripristina chiavi di sicurezza</span>
                <span className="row__note">Inserisci passphrase di backup</span>
              </span>
            </button>
            <button
              className="row row--interactive"
              onClick={() => setStatoMenu("conferma-elimina")}
              type="button"
            >
              <span className="row__body">
                <span className="row__title" style={{ color: "var(--danger, #e53e3e)" }}>
                  Elimina conversazione
                </span>
                <span className="row__note">Cancella tutti i messaggi</span>
              </span>
            </button>
          </div>
        )}

        {statoMenu === "conferma-elimina" && (
          <div className="stack--tight">
            <p className="muted" style={{ margin: 0, fontSize: "var(--t-sm)" }}>
              Sei sicuro di voler eliminare questa conversazione? Tutti i messaggi verranno rimossi
              definitivamente dall'istanza.
            </p>
            <Button
              block
              disabled={eliminazioneInCorso}
              onClick={() => void eseguiEliminazioneConversazione()}
              variant="danger"
            >
              {eliminazioneInCorso ? "Eliminazione…" : "Sì, elimina conversazione"}
            </Button>
            <Button
              block
              disabled={eliminazioneInCorso}
              onClick={() => setStatoMenu("principale")}
              variant="secondary"
            >
              Annulla
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
