import type { AuthenticatedUser, ConversazioneView, MessaggioBustaView } from "@estia/contracts";
import { GlassView } from "expo-glass-effect";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { EstiaApi } from "./api";
import { Avatar } from "./Avatar";
import {
  decryptMessageBody,
  encryptMessageBody,
  getOrCreateConversationKey,
  type MessagePayload,
} from "./crypto";
import { IconaFrecciaIndietro, IconaInvia, IconaLucchetto } from "./Icone";
import { quandoBreve } from "./quando";
import type { Palette } from "./tema";
import { Avviso } from "./ui";

interface MessaggioDecifrato {
  id: string;
  senderUserId: string;
  createdAt: string;
  payload: MessagePayload;
}

export function SchermataConversazione({
  colori,
  token,
  user,
  conversazione,
  api,
  onIndietro,
}: {
  colori: Palette;
  token: string;
  user: AuthenticatedUser;
  conversazione: ConversazioneView;
  api: EstiaApi;
  onIndietro: () => void;
}): ReactElement {
  const [messaggi, setMessaggi] = useState<MessaggioDecifrato[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | undefined>(undefined);
  const [testoInput, setTestoInput] = useState("");
  const [invioInCorso, setInvioInCorso] = useState(false);
  const chiaveConversazioneRef = useRef<Uint8Array | null>(null);

  const altroMembro =
    conversazione.membri.find((m) => m.username.toLowerCase() !== user.username.toLowerCase()) ??
    conversazione.membri[0];
  const peerUserId = altroMembro?.id ?? "";
  const peerDisplayName = altroMembro?.displayName ?? "Membro";
  const peerUsername = altroMembro?.username ?? "utente";

  const caricaEMostraMessaggi = async (): Promise<void> => {
    try {
      if (!chiaveConversazioneRef.current) {
        chiaveConversazioneRef.current = await getOrCreateConversationKey(
          api,
          token,
          conversazione.id,
          peerUserId,
        );
      }

      const key = chiaveConversazioneRef.current;
      const res = await api.getMessaggi(token, conversazione.id);

      const decifrati: MessaggioDecifrato[] = res.messaggi.map((m: MessaggioBustaView) => {
        const payload = decryptMessageBody(m.busta, key);
        return {
          createdAt: m.createdAt,
          id: m.id,
          payload,
          senderUserId: m.senderUserId,
        };
      });

      setMessaggi(decifrati);

      if (decifrati.length > 0) {
        const ultimoId = decifrati[decifrati.length - 1]!.id;
        void api.segnaConversazioneLetta(token, conversazione.id, ultimoId).catch(() => {});
      }
      setErrore(undefined);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel caricamento dei messaggi.");
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    void caricaEMostraMessaggi();
    const interval = setInterval(() => {
      void caricaEMostraMessaggi();
    }, 4000);
    return () => clearInterval(interval);
  }, [conversazione.id]);

  const inviaMessaggio = async (): Promise<void> => {
    const testo = testoInput.trim();
    if (!testo || invioInCorso) return;

    setInvioInCorso(true);
    try {
      if (!chiaveConversazioneRef.current) {
        chiaveConversazioneRef.current = await getOrCreateConversationKey(
          api,
          token,
          conversazione.id,
          peerUserId,
        );
      }

      const key = chiaveConversazioneRef.current;
      const payload: MessagePayload = { text: testo, v: 1 };
      const busta = encryptMessageBody(payload, key);

      const res = await api.inviaMessaggio(token, conversazione.id, { busta });

      const nuovo: MessaggioDecifrato = {
        createdAt: res.messaggio.createdAt,
        id: res.messaggio.id,
        payload,
        senderUserId: user.id,
      };

      setMessaggi((prev) => [...prev, nuovo]);
      setTestoInput("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non sono riuscito a inviare il messaggio.");
    } finally {
      setInvioInCorso(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
      style={[styles.contenitore, { backgroundColor: colori.fondo }]}
    >
      {/* Barra Superiore Chat Nativa Apple Liquid Glass */}
      <GlassView
        colorScheme={colori.testo === "#ffffff" ? "dark" : "light"}
        glassEffectStyle="regular"
        style={styles.topBar}
      >
        <Pressable
          accessibilityLabel="Torna all'elenco dei messaggi"
          accessibilityRole="button"
          onPress={onIndietro}
          style={styles.bottoneIndietro}
        >
          <IconaFrecciaIndietro colore={colori.accento} size={24} />
        </Pressable>

        <Avatar misura="s" nome={peerDisplayName} username={peerUsername} />

        <View style={styles.topBarInfo}>
          <Text numberOfLines={1} style={[styles.topBarNome, { color: colori.testo }]}>
            {peerDisplayName}
          </Text>
          <View style={styles.topBarSub}>
            <IconaLucchetto colore={colori.accento} size={11} />
            <Text style={[styles.topBarE2E, { color: colori.testoMorbido }]}>Cifrata E2E</Text>
          </View>
        </View>
      </GlassView>

      {errore !== undefined ? (
        <View style={styles.bloccoAvviso}>
          <Avviso colori={colori}>{errore}</Avviso>
        </View>
      ) : null}

      {/* Flusso dei Messaggi */}
      {caricamento && messaggi.length === 0 ? (
        <View style={styles.centroCaricamento}>
          <ActivityIndicator color={colori.accento} size="large" />
          <Text style={[styles.testoCaricamento, { color: colori.testoMorbido }]}>
            Decifro la conversazione…
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listaMessaggi}
          data={messaggi}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const mio = item.senderUserId === user.id;
            return (
              <View style={[styles.rigaMessaggio, mio ? styles.rigaMio : styles.rigaAltro]}>
                <View
                  style={[
                    styles.bollaMessaggio,
                    mio
                      ? [styles.bollaMio, { backgroundColor: colori.accento }]
                      : [
                          styles.bollaAltro,
                          {
                            backgroundColor: colori.superficieCard,
                            borderColor: colori.vetroBordo,
                            shadowColor: colori.ombraVetro,
                          },
                        ],
                  ]}
                >
                  <Text
                    style={[
                      styles.testoMessaggio,
                      { color: mio ? colori.suAccento : colori.testo },
                    ]}
                  >
                    {item.payload.text}
                  </Text>
                  <Text
                    style={[
                      styles.orarioMessaggio,
                      { color: mio ? colori.suAccento : colori.testoMorbido, opacity: 0.8 },
                    ]}
                  >
                    {quandoBreve(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Floating Composer Nativo Apple Liquid Glass */}
      <GlassView
        colorScheme={colori.testo === "#ffffff" ? "dark" : "light"}
        glassEffectStyle="regular"
        style={styles.barraInput}
      >
        <TextInput
          accessibilityLabel="Scrivi messaggio"
          autoCorrect
          multiline
          onChangeText={setTestoInput}
          placeholder="Messaggio privato…"
          placeholderTextColor={colori.testoMorbido}
          style={[
            styles.input,
            {
              backgroundColor: colori.superficieCard,
              borderColor: colori.vetroBordo,
              color: colori.testo,
            },
          ]}
          value={testoInput}
        />
        <Pressable
          accessibilityLabel="Invia messaggio privato"
          accessibilityRole="button"
          accessibilityState={{ busy: invioInCorso, disabled: !testoInput.trim() }}
          disabled={!testoInput.trim() || invioInCorso}
          onPress={inviaMessaggio}
          style={({ pressed }) => [
            styles.bottoneInvia,
            {
              backgroundColor: colori.accento,
              opacity: !testoInput.trim() || invioInCorso ? 0.35 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {invioInCorso ? (
            <ActivityIndicator color={colori.suAccento} size="small" />
          ) : (
            <IconaInvia colore={colori.suAccento} size={18} />
          )}
        </Pressable>
      </GlassView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  barraInput: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    paddingBottom: 24, // Home indicator safe area
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bloccoAvviso: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bollaAltro: {
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  bollaMessaggio: {
    borderRadius: 20,
    maxWidth: "80%",
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  bollaMio: {
    borderBottomRightRadius: 4,
  },
  bottoneIndietro: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    marginLeft: -8,
    width: 40,
  },
  bottoneInvia: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  centroCaricamento: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  contenitore: {
    flex: 1,
  },
  input: {
    borderRadius: 20,
    borderWidth: 0.5,
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    minHeight: 40,
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listaMessaggi: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  orarioMessaggio: {
    alignSelf: "flex-end",
    fontSize: 11,
    marginTop: 4,
  },
  rigaAltro: {
    alignItems: "flex-start",
  },
  rigaMessaggio: {
    marginVertical: 4,
    width: "100%",
  },
  rigaMio: {
    alignItems: "flex-end",
  },
  testoCaricamento: {
    fontSize: 14,
    marginTop: 10,
  },
  testoMessaggio: {
    fontSize: 16,
    lineHeight: 22,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 54, // Safe area Dynamic Island
  },
  topBarE2E: {
    fontSize: 12,
  },
  topBarInfo: {
    flex: 1,
  },
  topBarNome: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  topBarSub: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
});
