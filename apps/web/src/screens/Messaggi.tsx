import type { ConversazioneView } from "@estia/contracts";
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
  pending?: boolean;
}

function SwipeableBubble({
  message,
  isMe,
  onReply,
  onInfo,
  onRestoreKeys,
  replyMessage,
  replyAuthor,
  peerVistoFinoA,
}: {
  message: DecryptedMessage;
  isMe: boolean;
  onReply: (id: string) => void;
  onInfo: (message: DecryptedMessage) => void;
  onRestoreKeys: () => void;
  replyMessage?: DecryptedMessage | undefined;
  replyAuthor?: string | undefined;
  peerVistoFinoA?: string | null;
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

    // Both directions allowed up to [-60, 60]
    setSwipeOffset(Math.max(-60, Math.min(60, deltaX)));
  };

  const handleTouchEnd = () => {
    if (!message.unreadable) {
      if (isMe) {
        // Messaggi inviati:
        // Swipe da sinistra verso destra (deltaX > 40) -> Info
        // Swipe da destra verso sinistra (deltaX < -40) -> Rispondi
        if (swipeOffset > 40) {
          onInfo(message);
        } else if (swipeOffset < -40) {
          onReply(message.id);
        }
      } else {
        // Messaggi ricevuti:
        // Swipe da destra verso sinistra (deltaX < -40) -> Info
        // Swipe da sinistra verso destra (deltaX > 40) -> Rispondi
        if (swipeOffset < -40) {
          onInfo(message);
        } else if (swipeOffset > 40) {
          onReply(message.id);
        }
      }
    }
    setSwipeOffset(0);
    touchStart.current = null;
  };

  return (
    <div className={`chat-row ${isMe ? "chat-row--me" : "chat-row--them"}`}>
      {isMe && !message.unreadable && (
        <div className="chat-row__actions">
          <IconButton icon="info" label="Info messaggio" onClick={() => onInfo(message)} />
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
            {replyAuthor && <span className="chat-bubble__reply-author">{replyAuthor}</span>}
            <p className="chat-bubble__reply-text truncate">{replyMessage.text}</p>
          </div>
        )}
        {message.unreadable ? (
          <div className="chat-unreadable stack stack--tight">
            <div className="cluster chat-unreadable__head">
              <Icon name="key" size={16} />
              <strong>Messaggio cifrato</strong>
            </div>
            <p className="chat-unreadable__desc muted">
              {isMe
                ? "Inviato da un'altra tua sessione o dispositivo. Per leggerlo qui, ripristina il backup delle tue chiavi personali."
                : "Cifrato con una chiave o sessione precedente. Per visualizzarlo, ripristina il backup delle chiavi personali."}
            </p>
            <div className="chat-unreadable__action">
              <Button icon="key" onClick={onRestoreKeys} variant="secondary">
                Ripristina chiavi di sicurezza
              </Button>
            </div>
          </div>
        ) : (
          <div className="chat-bubble__body">
            <p className="chat-bubble__text">{message.text}</p>
            <div className="chat-bubble__meta">
              <time className="chat-time">{ora(message.createdAt)}</time>
              {isMe &&
                (() => {
                  const isRead =
                    !message.pending &&
                    message.consegnatoAt &&
                    peerVistoFinoA &&
                    message.createdAt <= peerVistoFinoA;
                  const isDelivered = !message.pending && message.consegnatoAt && !isRead;
                  const isPending = message.pending;

                  const statusClass = isPending
                    ? "chat-status--pending"
                    : isRead
                      ? "chat-status--read"
                      : isDelivered
                        ? "chat-status--delivered"
                        : "chat-status--sent";

                  const title = isPending
                    ? "In invio…"
                    : isRead
                      ? "Letto"
                      : isDelivered
                        ? "Consegnato"
                        : "Inviato all'istanza";

                  return (
                    <span className={`chat-status ${statusClass}`} title={title}>
                      {isPending ? (
                        <Icon name="clock" size={13} />
                      ) : isRead ? (
                        <Icon name="eye" size={15} />
                      ) : isDelivered ? (
                        <Icon name="check-check" size={15} />
                      ) : (
                        <Icon name="check" size={15} />
                      )}
                    </span>
                  );
                })()}
            </div>
          </div>
        )}
      </div>
      {!isMe && !message.unreadable && (
        <div className="chat-row__actions">
          <IconButton icon="reply" label="Rispondi" onClick={() => onReply(message.id)} />
          <IconButton icon="info" label="Info messaggio" onClick={() => onInfo(message)} />
        </div>
      )}
    </div>
  );
}

const ATTESA_MS = 120;
const MINIMO = 2;

export function Messaggi(): React.ReactElement {
  const { token, user } = useSignedIn();
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();

  const isCryptoAvailable = typeof window !== "undefined" && Boolean(window.crypto?.subtle);

  const [conversazioni, setConversazioni] = useState<ConversazioneView[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [selezionataId, setSelezionataId] = useState<string | undefined>();
  const [messaggi, setMessaggi] = useState<DecryptedMessage[]>([]);
  const [inInvio, setInInvio] = useState(false);
  const [testo, setTesto] = useState("");
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const [peerVistoFinoA, setPeerVistoFinoA] = useState<string | null>(null);

  interface RisultatoRicercaMessaggi {
    username: string;
    displayName: string;
    instanceKey?: string | undefined;
    tramite?: string | undefined;
    isRemote: boolean;
  }

  // Search state
  const [termine, setTermine] = useState("");
  const [cercando, setCercando] = useState(false);
  const [risultati, setRisultati] = useState<RisultatoRicercaMessaggi[] | undefined>();

  // Ripristino chiavi di sicurezza E2E
  const [sheetRipristinoAperto, setSheetRipristinoAperto] = useState(false);
  const [passphraseRipristino, setPassphraseRipristino] = useState("");
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);

  // Info dettagli messaggio
  const [messaggioInfo, setMessaggioInfo] = useState<DecryptedMessage | undefined>();

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

        // Salva il cursore di lettura dell'interlocutore
        setPeerVistoFinoA(resp.peerVistoFinoA ?? null);

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

        // Ricevuta di lettura: segna come letti i messaggi ricevuti dagli altri
        const ultimoRicevuto = [...decifrati].reverse().find((m) => m.senderUserId !== user.id);
        if (ultimoRicevuto) {
          void api.segnaConversazioneLetta(token, id, ultimoRicevuto.createdAt).catch(() => {});
        }
      } catch (err) {
        console.error("Errore recupero messaggi", err);
      }
    },
    [token, user.id],
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
      setPeerVistoFinoA(null);
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
      setCercando(false);
      return;
    }

    const annulla = new AbortController();
    const attesa = setTimeout(() => {
      setCercando(true);

      // Risultati locali immediati
      api
        .searchProfiles(token, cercabile, "istanza", annulla.signal)
        .then((res) => {
          const localiList: RisultatoRicercaMessaggi[] = res.locali.map((l) => ({
            username: l.username,
            displayName: l.displayName,
            isRemote: false,
          }));
          setRisultati((prev) => {
            const remoti = prev?.filter((p) => p.isRemote) ?? [];
            return [...localiList, ...remoti];
          });
        })
        .catch(() => undefined);

      // Risultati remoti di rete in parallelo
      api
        .searchProfiles(token, cercabile, "rete", annulla.signal)
        .then((res) => {
          const list: RisultatoRicercaMessaggi[] = [
            ...res.locali.map((l) => ({
              username: l.username,
              displayName: l.displayName,
              isRemote: false,
            })),
            ...res.remoti.map((r) => ({
              username: r.username,
              displayName: r.displayName,
              instanceKey: r.instanceKey,
              tramite: r.tramite,
              isRemote: true,
            })),
          ];
          setRisultati(list);
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

    const testoDaInviare = testo.trim();
    const repId = replyToId;
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: DecryptedMessage = {
      id: tempId,
      senderUserId: user.id,
      text: testoDaInviare,
      replyTo: repId,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessaggi((prev) => [...prev, optimisticMsg]);
    setTesto("");
    setReplyToId(undefined);
    setInInvio(true);

    try {
      if (!altroMembro) throw new Error("Membro non trovato");
      const key = await getOrCreateConversationKey(selezionataId, altroMembro.id, token);

      const payload: MessagePayload = {
        v: 1,
        text: testoDaInviare,
      };
      if (repId) {
        payload.replyTo = repId;
      }

      const busta = await encryptMessageBody(payload, key);
      await api.inviaMessaggio(token, selezionataId, { busta });
      if (altroMembro) await caricaMessaggi(selezionataId, altroMembro.id);
      await caricaConversazioni();
    } catch (err: unknown) {
      setMessaggi((prev) => prev.filter((m) => m.id !== tempId));
      mostraErrore(err, "Impossibile inviare il messaggio.");
    } finally {
      setInInvio(false);
    }
  };

  const avviaChat = async (trovato: RisultatoRicercaMessaggi): Promise<void> => {
    setTermine("");
    try {
      const convRes = await api.createConversazione(token, {
        recipientUsername: trovato.username,
        ...(trovato.instanceKey ? { remoteInstanceKey: trovato.instanceKey } : {}),
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
          <div className="chat-view">
            <header className="screen-head split-layout__detail-head chat-header">
              <div className="chat-header__left">
                <IconButton
                  className="split-layout__back"
                  icon="arrow-left"
                  label="Torna alle conversazioni"
                  onClick={() => setSelezionataId(undefined)}
                />
                {(() => {
                  const remoteKey = altroMembro?.id.startsWith("remote:")
                    ? altroMembro.id.split(":")[1]
                    : undefined;
                  return (
                    <PersonLink
                      className="chat-header-link"
                      instanceKey={remoteKey}
                      username={altroMembro?.username ?? "utente"}
                    >
                      <Avatar
                        displayName={altroMembro?.displayName ?? altroMembro?.username ?? "Utente"}
                        size="sm"
                        username={altroMembro?.username ?? "utente"}
                      />
                      <span className="chat-header__name">
                        <strong>{altroMembro?.displayName ?? altroMembro?.username}</strong>
                        <span className="muted">
                          (@{altroMembro?.username}
                          {remoteKey ? " · remota" : ""})
                        </span>
                      </span>
                    </PersonLink>
                  );
                })()}
              </div>
              <div className="chat-header__right">
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

            {!isCryptoAvailable && (
              <div className="chat-detail-alert">
                <Alert tone="neutral">
                  Le API crittografiche non sono disponibili su questa connessione HTTP non
                  protetta. Per inviare o leggere messaggi cifrati end-to-end, usa localhost, HTTPS
                  o l'app mobile nativa.
                </Alert>
              </div>
            )}

            {isCryptoAvailable && messaggi.some((m) => m.unreadable) && (
              <div className="chat-detail-alert">
                <Alert tone="neutral">
                  <div className="stack stack--tight">
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
                const repAuthor = repMsg
                  ? repMsg.senderUserId === user.id
                    ? "Tu"
                    : altroMembro?.displayName || altroMembro?.username || "Interlocutore"
                  : undefined;
                return (
                  <SwipeableBubble
                    key={m.id}
                    isMe={isMe}
                    message={m}
                    onInfo={setMessaggioInfo}
                    onReply={setReplyToId}
                    onRestoreKeys={() => {
                      setSheetRipristinoAperto(true);
                    }}
                    peerVistoFinoA={peerVistoFinoA}
                    replyAuthor={repAuthor}
                    replyMessage={repMsg}
                  />
                );
              })}
              <div ref={fineMessaggiRef} />
            </div>

            <div className="chat-composer-container">
              {replyToId && (
                <div className="chat-composer__reply-bar">
                  <div className="chat-composer__reply-bar-content">
                    <span className="chat-composer__reply-bar-title">
                      Risposta a{" "}
                      {(() => {
                        const targetMsg = messaggi.find((m) => m.id === replyToId);
                        if (!targetMsg) return "";
                        return targetMsg.senderUserId === user.id
                          ? "te stesso"
                          : altroMembro?.displayName || altroMembro?.username || "interlocutore";
                      })()}
                    </span>
                    <p className="chat-composer__reply-bar-text">
                      {messaggi.find((m) => m.id === replyToId)?.text}
                    </p>
                  </div>
                  <IconButton
                    icon="close"
                    label="Annulla risposta"
                    onClick={() => setReplyToId(undefined)}
                  />
                </div>
              )}

              <form className="chat-composer" onSubmit={(e) => void invia(e)}>
                <input
                  aria-label="Scrivi un messaggio cifrato"
                  className="input"
                  disabled={!isCryptoAvailable || inInvio}
                  onChange={(e) => setTesto(e.target.value)}
                  placeholder={
                    !isCryptoAvailable
                      ? "Crittografia non disponibile su HTTP non protetto…"
                      : "Scrivi un messaggio cifrato…"
                  }
                  value={testo}
                />
                <Button
                  disabled={!isCryptoAvailable || inInvio || testo.trim().length === 0}
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
          <>
            <header className="screen-head">
              <h1 className="screen-head__title">Messaggi</h1>
            </header>

            {!isCryptoAvailable && (
              <div className="chat-nav-alert">
                <Alert tone="neutral">
                  I messaggi privati E2E richiedono un contesto sicuro (HTTPS, localhost o app
                  mobile). Su HTTP in rete locale le API crittografiche del browser sono
                  disabilitate.
                </Alert>
              </div>
            )}

            <search className="split-layout__search">
              <label className="only-screen-reader" htmlFor="cerca-messaggi">
                Cerca persone o conversazioni
              </label>
              <div className="cluster" style={{ flexWrap: "nowrap", gap: "var(--s-2)" }}>
                <Icon name="search" size={18} />
                <input
                  autoComplete="off"
                  className="input grow"
                  id="cerca-messaggi"
                  onChange={(event) => setTermine(event.target.value)}
                  placeholder="Cerca persone…"
                  type="search"
                  value={termine}
                />
              </div>
            </search>

            <div className="stack">
              {abbastanza ? (
                <>
                  {cercando && risultati === undefined && <p className="muted feed-pad">Cerco…</p>}
                  {risultati !== undefined && risultati.length > 0 && (
                    <div className="list-block">
                      <h2 className="gruppo">Risultati ricerca</h2>
                      {risultati.map((trovato) => (
                        <button
                          className="row row--interactive"
                          key={
                            trovato.isRemote
                              ? `${trovato.instanceKey}:${trovato.username}`
                              : trovato.username
                          }
                          onClick={() => void avviaChat(trovato)}
                          type="button"
                        >
                          <span className="row__body">
                            <span
                              className="cluster"
                              style={{ gap: "var(--s-3)", flexWrap: "nowrap" }}
                            >
                              <Avatar
                                displayName={trovato.displayName}
                                size="md"
                                username={trovato.username}
                              />
                              <span
                                className="stack stack--tight"
                                style={{ gap: 0, minWidth: 0, alignItems: "flex-start" }}
                              >
                                <span className="row__title truncate">
                                  {trovato.displayName}
                                  {trovato.isRemote && (
                                    <span
                                      className="badge badge--subtle"
                                      style={{
                                        marginInlineStart: "var(--s-2)",
                                        fontSize: "var(--t-xs)",
                                      }}
                                    >
                                      {trovato.tramite || "rete"}
                                    </span>
                                  )}
                                </span>
                                <span className="row__note truncate">
                                  @{trovato.username}
                                  {trovato.isRemote && trovato.tramite && ` · ${trovato.tramite}`}
                                </span>
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
                    <p className="muted feed-pad">
                      Nessuno trovato con questo nome in casa o nella rete.
                    </p>
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
                            className={`row row--interactive ${isActive ? "row--active" : ""}`}
                            key={c.id}
                            onClick={() => setSelezionataId(c.id)}
                            type="button"
                          >
                            <span className="row__body">
                              <span
                                className="cluster"
                                style={{ gap: "var(--s-3)", flexWrap: "nowrap" }}
                              >
                                <Avatar displayName={nome} size="md" username={userHandle} />
                                <span
                                  className="stack stack--tight"
                                  style={{ gap: 0, minWidth: 0, alignItems: "flex-start" }}
                                >
                                  <span className="row__title truncate">{nome}</span>
                                  <span className="row__note truncate">
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
          </>
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
                <span className="row__title row__title--danger">Elimina conversazione</span>
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

      {/* Dettagli messaggio */}
      <Sheet
        onClose={() => setMessaggioInfo(undefined)}
        open={Boolean(messaggioInfo)}
        title="Dettagli messaggio"
        variant="centrato"
      >
        {messaggioInfo && (
          <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
            <div
              className={`chat-bubble ${
                messaggioInfo.senderUserId === user.id ? "chat-bubble--me" : "chat-bubble--them"
              }`}
              style={{ margin: "0 auto", width: "100%" }}
            >
              <p className="chat-bubble__text">{messaggioInfo.text}</p>
            </div>

            <div
              className="stack stack--tight"
              style={{
                borderBlockStart: "1px solid var(--border)",
                paddingBlockStart: "var(--s-3)",
                marginBlockStart: "var(--s-2)",
              }}
            >
              <div
                className="cluster"
                style={{ justifyContent: "space-between", fontSize: "var(--t-sm)" }}
              >
                <span className="muted">Mittente:</span>
                <strong>
                  {messaggioInfo.senderUserId === user.id
                    ? `Tu (@${user.username})`
                    : `${altroMembro?.displayName ?? "Utente"} (@${altroMembro?.username ?? ""})`}
                </strong>
              </div>

              <div
                className="cluster"
                style={{ justifyContent: "space-between", fontSize: "var(--t-sm)" }}
              >
                <span className="muted">Orario invio:</span>
                <span>
                  {new Date(messaggioInfo.createdAt).toLocaleString("it-IT", {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  })}
                </span>
              </div>

              <div
                className="cluster"
                style={{ justifyContent: "space-between", fontSize: "var(--t-sm)" }}
              >
                <span className="muted">Stato consegna:</span>
                <span className="cluster" style={{ gap: "var(--s-1)", alignItems: "center" }}>
                  {messaggioInfo.pending ? (
                    <>
                      <Icon name="clock" size={15} /> In invio…
                    </>
                  ) : messaggioInfo.consegnatoAt &&
                    peerVistoFinoA &&
                    messaggioInfo.createdAt <= peerVistoFinoA ? (
                    <>
                      <Icon name="eye" size={15} /> Letto
                    </>
                  ) : messaggioInfo.consegnatoAt ? (
                    <>
                      <Icon name="check-check" size={15} /> Consegnato (
                      {new Date(messaggioInfo.consegnatoAt).toLocaleString("it-IT", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                      )
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={15} /> Inviato all&apos;istanza
                    </>
                  )}
                </span>
              </div>

              <div
                className="cluster"
                style={{ justifyContent: "space-between", fontSize: "var(--t-sm)" }}
              >
                <span className="muted">Crittografia:</span>
                <span className="cluster" style={{ gap: "var(--s-1)", alignItems: "center" }}>
                  <Icon name="key" size={15} /> End-to-End (WebCrypto ECDH + AES-GCM)
                </span>
              </div>
            </div>

            <div className="cluster cluster--end" style={{ marginBlockStart: "var(--s-2)" }}>
              <Button onClick={() => setMessaggioInfo(undefined)} type="button" variant="secondary">
                Chiudi
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
