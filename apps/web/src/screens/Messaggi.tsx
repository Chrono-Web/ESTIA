import type { ConversazioneView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import { base64InBytes } from "../mls/adattatori.js";
import { apriConversazione, leggi, manda, type Riga } from "../mls/conversazione.js";
import { leggiKeyPackage } from "../mls/gruppo.js";
import { contestoChat, ripristina } from "../mls/motore.js";
import type { Sessione } from "../mls/sessione.js";
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
  MenuAzioni,
  Sheet,
  SplitLayout,
  TextField,
} from "../ui/index.js";
import { PersonLink } from "../components/PersonLink.js";
import { impedimentoDi, siPuoScrivere, spiegazioneDi } from "./chat-impedimento.js";

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
  /** C'è, ma questo dispositivo non ha la chiave per aprirla. */
  unreadable?: boolean;
  /**
   * La casa che la custodisce non risponde: restano chi e quando, e il
   * contenuto torna quando torna lei ([ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) §3).
   */
  nonDisponibile?: boolean;
  pending?: boolean;
}

/** Ogni quanto si rilegge una chat aperta. Ogni giro chiede qualcosa alle case degli autori. */
const RILETTURA_MS = 10_000;

/** Ogni quanto si rilegge l'elenco delle conversazioni: sta tutto in casa. */
const ELENCO_MS = 5_000;

/** Una riga della cronologia, come la disegna la schermata. */
function versoSchermata(
  riga: Riga,
  casa: string,
  io: { id: string; username: string },
  membri: readonly { id: string; username: string }[],
): DecryptedMessage {
  const base = {
    createdAt: riga.createdAt,
    id: riga.id,
    senderUserId: chiHaScritto(riga.mittente, casa, io, membri),
  };

  if (riga.stato === "non-disponibile") {
    return { ...base, nonDisponibile: true, text: "" };
  }

  if (riga.stato === "non-si-apre" || riga.testo === undefined) {
    return { ...base, text: "", unreadable: true };
  }

  return { ...base, replyTo: riga.risponde, text: riga.testo };
}

/**
 * Da `username@casa` all'id con cui la conversazione nomina quel membro: il
 * proprio, uno di questa casa, o `remote:casa:username`.
 */
function chiHaScritto(
  mittente: string | null,
  casa: string,
  io: { id: string; username: string },
  membri: readonly { id: string; username: string }[],
): string {
  if (mittente === null) {
    return "";
  }

  const taglio = mittente.lastIndexOf("@");
  const username = mittente.slice(0, taglio);
  const suaCasa = mittente.slice(taglio + 1);

  if (suaCasa === casa) {
    return username === io.username
      ? io.id
      : (membri.find((m) => !m.id.startsWith("remote:") && m.username === username)?.id ??
          mittente);
  }

  return `remote:${suaCasa}:${username}`;
}

function SwipeableBubble({
  message,
  isMe,
  onReply,
  onInfo,
  replyMessage,
  replyAuthor,
  peerVistoFinoA,
}: {
  message: DecryptedMessage;
  isMe: boolean;
  onReply: (id: string) => void;
  onInfo: (message: DecryptedMessage) => void;
  replyMessage?: DecryptedMessage | undefined;
  replyAuthor?: string | undefined;
  peerVistoFinoA?: string | null;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStart = useRef<number | null>(null);
  /** Una riga senza testo non si risponde e non si guarda nel dettaglio: non c'è niente. */
  const senzaTesto = message.unreadable === true || message.nonDisponibile === true;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (senzaTesto) return;
    touchStart.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (senzaTesto || touchStart.current === null) return;
    const clientX = e.touches[0]?.clientX;
    if (clientX === undefined) return;
    const deltaX = clientX - touchStart.current;

    // Both directions allowed up to [-60, 60]
    setSwipeOffset(Math.max(-60, Math.min(60, deltaX)));
  };

  const handleTouchEnd = () => {
    if (!senzaTesto) {
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
      {isMe && !senzaTesto && (
        <div className="chat-row__actions">
          <IconButton icon="info" label="Info messaggio" onClick={() => onInfo(message)} />
          <IconButton icon="reply" label="Rispondi" onClick={() => onReply(message.id)} />
        </div>
      )}
      <div
        className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--them"} ${
          senzaTesto ? "chat-bubble--unreadable" : ""
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
        {replyMessage && !senzaTesto && (
          <div className="chat-bubble__reply">
            {replyAuthor && <span className="chat-bubble__reply-author">{replyAuthor}</span>}
            <p className="chat-bubble__reply-text truncate">{replyMessage.text}</p>
          </div>
        )}
        {message.nonDisponibile ? (
          <div className="chat-unreadable stack stack--tight">
            <div className="cluster chat-unreadable__head">
              <Icon name="clock" size={16} />
              <strong>Contenuto non disponibile</strong>
            </div>
            <p className="chat-unreadable__desc muted">
              L&apos;istanza di chi l&apos;ha scritto non risponde: il messaggio c&apos;è, e torna
              leggibile quando la sua casa si riaccende.
            </p>
            <time className="chat-time">{ora(message.createdAt)}</time>
          </div>
        ) : message.unreadable ? (
          <div className="chat-unreadable stack stack--tight">
            <div className="cluster chat-unreadable__head">
              <Icon name="key" size={16} />
              <strong>Non si apre</strong>
            </div>
            <p className="chat-unreadable__desc muted">
              Questo dispositivo non ha la chiave per aprirlo. Succede a un dispositivo appena
              entrato nella conversazione, finché un&apos;altra persona non la riapre.
            </p>
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
      {!isMe && !senzaTesto && (
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
  /** Che cosa è tornato provando ad aprire la conversazione: dice perché non si scrive. */
  const [erroreChiave, setErroreChiave] = useState<unknown>();
  /** La conversazione la ordina un'altra casa, e l'invito per noi non è arrivato. */
  const [inAttesa, setInAttesa] = useState(false);
  /** Questo dispositivo è nel gruppo, ma la chiave per leggerlo non gliel'ha ancora riconsegnata nessuno. */
  const [senzaCronologia, setSenzaCronologia] = useState(false);
  /**
   * La conversazione si sta aprendo su questo dispositivo: si crea il gruppo, si
   * entra da un invito o si rientra. Finché dura, il campo è spento e lo dice —
   * un campo acceso che poi rifiuta il messaggio è lo stato «sembra pronto e non
   * lo è» dell'euristica 5.
   */
  const [inApertura, setInApertura] = useState(false);
  /** La sessione MLS della conversazione aperta. Vive in memoria, e si riapre cambiando chat. */
  const sessioneRef = useRef<Sessione | undefined>(undefined);
  /** Le conversazioni dell'ultimo caricamento, per leggerle senza rifare gli effetti a ogni render. */
  const conversazioniRef = useRef<ConversazioneView[]>([]);

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
      conversazioniRef.current = resp.conversazioni;
      setConversazioni(resp.conversazioni);
    } catch {
      // Ignora, proverà al prossimo ciclo
    } finally {
      setCaricamento(false);
    }
  }, [token]);

  /**
   * La chiave d'ingresso di chi si invita, quando si crea il gruppo.
   *
   * Si chiama soltanto se la conversazione la ordina questa casa (ADR 0042 §3),
   * e l'istanza instrada la domanda: dalla propria casa, o da quella di chi si
   * invita. `idDiChiEntra` è l'id con cui **questa** conversazione nomina quel
   * membro, perché è con quello che la casa che ordina consegna il Welcome.
   */
  const invitoPer = useCallback(
    (conv: ConversazioneView, casa: string) => async () => {
      const altro = conv.membri.find((m) => m.id !== user.id);
      if (altro === undefined) {
        throw new Error("In questa conversazione non c'è nessun altro da invitare.");
      }

      const parti = altro.id.startsWith("remote:") ? altro.id.split(":") : undefined;
      const suaCasa = parti?.[1] ?? casa;
      const preso = await api.keyPackageMls(token, suaCasa, altro.username);
      const keyPackage = leggiKeyPackage(base64InBytes(preso.keyPackage));
      if (keyPackage === undefined) {
        throw new Error(
          `Il dispositivo di ${altro.displayName || altro.username} ha pubblicato una chiave d'ingresso che non si legge.`,
        );
      }

      return { idDiChiEntra: altro.id, keyPackage };
    },
    [token, user.id],
  );

  /**
   * Apre (la prima volta) e rilegge la conversazione.
   *
   * La cronologia arriva dall'istanza ricomposta dalle custodie, e si decifra
   * qui, in memoria: niente di quello che si legge viene scritto su questo
   * browser ([ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) §5).
   */
  const caricaMessaggi = useCallback(
    async (id: string): Promise<void> => {
      const conv = conversazioniRef.current.find((c) => c.id === id);
      if (conv === undefined) {
        return;
      }

      try {
        const { casa, ctx } = await contestoChat(token, user.username);

        let sessione =
          sessioneRef.current?.conversazioneId === id ? sessioneRef.current : undefined;
        if (sessione === undefined) {
          const apertura = await apriConversazione(
            ctx,
            { id, ordinataQui: conv.ordinataQui },
            invitoPer(conv, casa),
          );

          if (apertura.kind === "in-attesa") {
            setInAttesa(true);
            setSenzaCronologia(false);
            setErroreChiave(undefined);
            setMessaggi([]);
            return;
          }

          sessione = apertura.sessione;
        }

        const lettura = await leggi(ctx, sessione);
        sessioneRef.current = lettura.sessione;

        const righe = lettura.righe.map((r) =>
          versoSchermata(r, casa, { id: user.id, username: user.username }, conv.membri),
        );
        setMessaggi(righe);
        setInAttesa(false);
        setSenzaCronologia(lettura.sessione.catena === undefined);
        setErroreChiave(undefined);

        // Fin dove l'altra persona ha letto, e fin dove abbiamo letto noi: sono
        // cursori di questa casa, e restano com'erano.
        void api
          .getMessaggi(token, id, { limit: 1 })
          .then((r) => setPeerVistoFinoA(r.peerVistoFinoA ?? null))
          .catch(() => undefined);
        const ultimoRicevuto = [...righe]
          .reverse()
          .find((m) => m.senderUserId !== user.id && !m.nonDisponibile);
        if (ultimoRicevuto) {
          void api.segnaConversazioneLetta(token, id, ultimoRicevuto.createdAt).catch(() => {});
        }
      } catch (err) {
        // Non è rumore da console: è la ragione per cui questa chat non si può
        // usare adesso, e va detta a chi ci sta dentro.
        setErroreChiave(err);
      } finally {
        setInApertura(false);
      }
    },
    [invitoPer, token, user.id, user.username],
  );

  const eseguiRipristinoChiavi = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (passphraseRipristino.trim().length === 0) return;
    setRipristinoInCorso(true);
    try {
      await ripristina(token, user.username, passphraseRipristino);
      mostraSuccesso(
        "Chiave rimessa su questo browser: rientri nelle conversazioni, e la cronologia torna quando le altre persone le riaprono.",
      );
      setPassphraseRipristino("");
      setSheetRipristinoAperto(false);
      sessioneRef.current = undefined;
      if (selezionataId) {
        await caricaMessaggi(selezionataId);
      }
    } catch (err: unknown) {
      mostraErrore(err, "Questa frase segreta non apre la copia, oppure non ne esiste una.");
    } finally {
      setRipristinoInCorso(false);
    }
  };

  // Menu opzioni conversazione
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const eseguiEliminazioneConversazione = async (): Promise<void> => {
    if (!selezionataId) return;
    setEliminazioneInCorso(true);
    try {
      await api.deleteConversazione(token, selezionataId);
      mostraSuccesso("Conversazione eliminata.");
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

    // L'elenco sta tutto in casa, e si rilegge spesso. La chat aperta no: ogni
    // giro chiede qualcosa alle case degli autori, e una domanda ogni tre
    // secondi farebbe scattare il loro limite di frequenza.
    const elenco = setInterval(() => {
      if (document.visibilityState === "visible") {
        void caricaConversazioni();
      }
    }, ELENCO_MS);

    const chat = setInterval(() => {
      if (document.visibilityState === "visible" && selezionataId) {
        void caricaMessaggi(selezionataId);
      }
    }, RILETTURA_MS);

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
      clearInterval(elenco);
      clearInterval(chat);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [caricaConversazioni, caricaMessaggi, selezionataId]);

  useEffect(() => {
    // Cambiando chat la sessione di prima non vale più: si riapre quella nuova.
    sessioneRef.current = undefined;
    setInApertura(selezionataId !== undefined);
    setMessaggi([]);
    setInAttesa(false);
    setSenzaCronologia(false);

    if (selezionataId) {
      setPeerVistoFinoA(null);
      setErroreChiave(undefined);
      void caricaMessaggi(selezionataId);
    }
  }, [caricaMessaggi, selezionataId]);

  /**
   * Aprendo una chat si arriva **già in fondo**, senza scorrimento: l'animazione
   * che scende dall'alto fa vedere per un attimo messaggi vecchi che non si
   * stavano cercando. Da lì in poi i messaggi nuovi arrivano con la transizione,
   * perché lì il movimento è l'informazione (euristica 1).
   */
  const ultimaScrollata = useRef<string | undefined>(undefined);
  useEffect(() => {
    const apertura = ultimaScrollata.current !== selezionataId;
    ultimaScrollata.current = selezionataId;
    fineMessaggiRef.current?.scrollIntoView({ behavior: apertura ? "auto" : "smooth" });
  }, [messaggi, selezionataId]);

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

      // Risultati remoti di rete in parallelo. Da qui si prendono **solo** le
      // persone di altre case: i `locali` di questo ambito sono soltanto chi è
      // presente in rete, e sostituire con loro quelli della ricerca in casa
      // faceva sparire chi abita qui ma non si mostra fuori — cioè proprio
      // qualcuno a cui si può scrivere.
      api
        .searchProfiles(token, cercabile, "rete", annulla.signal)
        .then((res) => {
          const remoti: RisultatoRicercaMessaggi[] = res.remoti.map((r) => ({
            username: r.username,
            displayName: r.displayName,
            instanceKey: r.instanceKey,
            tramite: r.tramite,
            isRemote: true,
          }));
          setRisultati((prev) => [...(prev?.filter((p) => !p.isRemote) ?? []), ...remoti]);
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
    // L'id del messaggio lo sceglie chi scrive, **a caso**: diventa l'id del
    // segnaposto nelle altre case, e un id derivato dal testo sarebbe
    // un'impronta del contenuto scritta in casa d'altri (ADR 0042 §4.1).
    const idMessaggio = crypto.randomUUID();
    const quando = new Date().toISOString();
    const optimisticMsg: DecryptedMessage = {
      createdAt: quando,
      id: idMessaggio,
      pending: true,
      replyTo: repId,
      senderUserId: user.id,
      text: testoDaInviare,
    };

    setMessaggi((prev) => [...prev, optimisticMsg]);
    setTesto("");
    setReplyToId(undefined);
    setInInvio(true);

    try {
      const sessione = sessioneRef.current;
      if (sessione === undefined || sessione.conversazioneId !== selezionataId) {
        throw new Error("La conversazione non è ancora aperta su questo dispositivo. Riprova.");
      }

      const { ctx } = await contestoChat(token, user.username);
      await manda(
        ctx,
        sessione,
        { testo: testoDaInviare, ...(repId === undefined ? {} : { risponde: repId }) },
        idMessaggio,
        quando,
      );
      await caricaMessaggi(selezionataId);
      await caricaConversazioni();
    } catch (err: unknown) {
      setMessaggi((prev) => prev.filter((m) => m.id !== idMessaggio));
      // Il testo torna nel campo: chi ha scritto non deve riscriverlo (euristica 3).
      setTesto(testoDaInviare);
      setReplyToId(repId);
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

  /** Perché questa chat non si può usare, se non si può usare. */
  const impedimento = impedimentoDi({
    crittografiaDisponibile: isCryptoAvailable,
    erroreChiave,
    inAttesa,
    nomeDestinatario: altroMembro?.displayName ?? altroMembro?.username ?? "Questa persona",
    senzaCronologia,
  });
  const spiegazione = spiegazioneDi(impedimento);
  const puoScrivere = siPuoScrivere(impedimento) && !inApertura;

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
                <Badge tone="on">Cifrata</Badge>
                <MenuAzioni
                  etichetta="Opzioni conversazione"
                  occupato={eliminazioneInCorso}
                  titolo="Opzioni conversazione"
                  voci={[
                    ...(altroMembro
                      ? [
                          {
                            icon: "user" as const,
                            id: "profilo",
                            note: `@${altroMembro.username}`,
                            title: "Vedi profilo",
                            to: `/@${altroMembro.username}`,
                          },
                        ]
                      : []),
                    {
                      icon: "key" as const,
                      id: "chiavi",
                      note: "Lo stato, e la copia di sicurezza",
                      title: "Le chiavi delle chat",
                      to: "/impostazioni/chat",
                    },
                    {
                      icon: "download" as const,
                      id: "ripristina",
                      note: "Serve la tua frase segreta",
                      onClick: () => setSheetRipristinoAperto(true),
                      title: "Rimetti le chiavi qui",
                    },
                    {
                      conferma: {
                        etichetta: "Sì, elimina conversazione",
                        testo: "Tutti i messaggi verranno rimossi definitivamente dall'istanza.",
                        titolo: "Eliminare questa conversazione?",
                      },
                      icon: "close" as const,
                      id: "elimina",
                      note: "Cancella tutti i messaggi",
                      onClick: () => void eseguiEliminazioneConversazione(),
                      title: "Elimina conversazione",
                      tono: "danger" as const,
                    },
                  ]}
                />
              </div>
            </header>

            {messaggi.some((m) => m.nonDisponibile) && (
              <div className="chat-detail-alert">
                <Alert tone="neutral">
                  <p className="chiavi__testo">
                    Alcuni messaggi sono custoditi da una casa che adesso non risponde. Restano chi
                    li ha scritti e quando; il contenuto torna appena quella casa si riaccende.
                  </p>
                </Alert>
              </div>
            )}

            <div className="chat-messages">
              {inApertura && (
                <p
                  aria-live="polite"
                  className="muted center"
                  style={{ marginBlockStart: "var(--s-6)" }}
                >
                  Apro la conversazione su questo dispositivo…
                </p>
              )}
              {!inApertura && messaggi.length === 0 && spiegazione === undefined && (
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
                    peerVistoFinoA={peerVistoFinoA}
                    replyAuthor={repAuthor}
                    replyMessage={repMsg}
                  />
                );
              })}
              {spiegazione !== undefined && (
                <div className="chat-impedimento">
                  <EmptyState icon="key" title={spiegazione.titolo}>
                    <p className="muted">{spiegazione.testo}</p>
                    <p className="muted">{spiegazione.cosaFare}</p>
                  </EmptyState>
                </div>
              )}
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
                  disabled={!puoScrivere || inInvio}
                  onChange={(e) => setTesto(e.target.value)}
                  placeholder={
                    inApertura
                      ? "Un momento: la conversazione si sta aprendo…"
                      : (spiegazione?.segnaposto ?? "Scrivi un messaggio cifrato…")
                  }
                  value={testo}
                />
                <Button
                  disabled={!puoScrivere || inInvio || testo.trim().length === 0}
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
                  Da questa connessione i messaggi privati non funzionano: il browser tiene spenta
                  la crittografia quando l&apos;indirizzo non è protetto. Non puoi leggerli né
                  scriverli, e <strong>nessuno può scriverti</strong>. Apri ESTIA da un indirizzo
                  «https://» o da «localhost» sulla macchina dell&apos;istanza.
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
                          className="row"
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
                            className={`row ${isActive ? "row--active" : ""}`}
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
        title="Rimetti le chiavi su questo browser"
        variant="centrato"
      >
        <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
          <p className="muted chiavi__testo">
            Questi messaggi sono stati chiusi con chiavi che questo browser non ha. Se ne hai fatto
            una copia, la tua frase segreta la apre e le rimette qui: da quel momento tornano
            leggibili.
          </p>

          <form onSubmit={(e) => void eseguiRipristinoChiavi(e)} className="stack">
            <TextField
              autoFocus
              label="Frase segreta"
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
                {ripristinoInCorso ? "Un momento…" : "Rimetti le chiavi"}
              </Button>
            </div>
          </form>
        </div>
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
