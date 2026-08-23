import type { AuthenticatedUser, ConversazioneView } from "@estia/contracts";
import { GlassView } from "expo-glass-effect";
import type { ReactElement } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Avatar } from "./Avatar";
import { IconaLucchetto, IconaMessaggi, IconaNuovo } from "./Icone";
import { quandoBreve } from "./quando";
import type { Palette } from "./tema";
import { Avviso, Campo, Pulsante } from "./ui";

export function SchermataMessaggi({
  colori,
  user,
  conversazioni,
  caricato,
  errore,
  ricarica,
  onRicarica,
  onApriConversazione,
  onNuovaConversazione,
  creazioneInCorso,
}: {
  colori: Palette;
  token?: string;
  user: AuthenticatedUser;
  conversazioni: ConversazioneView[];
  caricato: boolean;
  errore: string | undefined;
  ricarica: boolean;
  onRicarica: () => void;
  onApriConversazione: (conv: ConversazioneView) => void;
  onNuovaConversazione: (username: string) => Promise<void>;
  creazioneInCorso: boolean;
}): ReactElement {
  const [modalAperta, setModalAperta] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [erroreNuovo, setErroreNuovo] = useState<string | undefined>(undefined);

  const avviaNuova = async (): Promise<void> => {
    if (!destinatario.trim()) return;
    setErroreNuovo(undefined);
    try {
      await onNuovaConversazione(destinatario.trim());
      setModalAperta(false);
      setDestinatario("");
    } catch (e) {
      setErroreNuovo(e instanceof Error ? e.message : "Impossibile avviare la conversazione.");
    }
  };

  return (
    <View style={[styles.contenitore, { backgroundColor: colori.fondo }]}>
      {/* Intestazione Sezione Nativa Apple Liquid Glass */}
      <GlassView
        colorScheme={colori.testo === "#ffffff" ? "dark" : "light"}
        glassEffectStyle="regular"
        style={styles.header}
      >
        <View style={styles.headerInfo}>
          <Text style={[styles.titolo, { color: colori.testo }]}>Messaggi</Text>
          <View style={styles.badgeE2E}>
            <IconaLucchetto colore={colori.accento} size={13} />
            <Text style={[styles.badgeE2ETesto, { color: colori.testoMorbido }]}>Cifrati E2E</Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Nuova conversazione"
          accessibilityRole="button"
          onPress={() => {
            setErroreNuovo(undefined);
            setModalAperta(true);
          }}
          style={({ pressed }) => [
            styles.bottoneNuovo,
            {
              backgroundColor: colori.accento,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <IconaNuovo colore={colori.suAccento} size={16} />
          <Text style={[styles.bottoneNuovoTesto, { color: colori.suAccento }]}>Nuovo</Text>
        </Pressable>
      </GlassView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl onRefresh={onRicarica} refreshing={ricarica} tintColor={colori.accento} />
        }
      >
        {errore !== undefined ? (
          <View style={styles.bloccoAvviso}>
            <Avviso colori={colori}>{errore}</Avviso>
          </View>
        ) : null}

        {!caricato && conversazioni.length === 0 ? (
          <View style={styles.centroCaricamento}>
            <ActivityIndicator color={colori.accento} size="large" />
            <Text style={[styles.testoCaricamento, { color: colori.testoMorbido }]}>
              Carico i messaggi…
            </Text>
          </View>
        ) : null}

        {caricato && conversazioni.length === 0 && errore === undefined ? (
          <View style={styles.vuoto}>
            <View style={[styles.vuotoIconaGuscio, { backgroundColor: "rgba(180, 85, 45, 0.12)" }]}>
              <IconaMessaggi colore={colori.accento} size={36} />
            </View>
            <Text style={[styles.vuotoTitolo, { color: colori.testo }]}>
              Nessun messaggio privato
            </Text>
            <Text style={[styles.vuotoDescrizione, { color: colori.testoMorbido }]}>
              I messaggi scambiati su ESTIA sono protetti da crittografia end-to-end. Il server non
              può leggerli.
            </Text>
            <View style={{ marginTop: 24, width: "100%", maxWidth: 220 }}>
              <Pulsante
                colori={colori}
                onPress={() => {
                  setErroreNuovo(undefined);
                  setModalAperta(true);
                }}
                titolo="Inizia una chat"
              />
            </View>
          </View>
        ) : null}

        {conversazioni.map((conv) => {
          const altroMembro =
            conv.membri.find((m) => m.username.toLowerCase() !== user.username.toLowerCase()) ??
            conv.membri[0];
          const nomeAltro = altroMembro?.displayName ?? "Membro";
          const usernameAltro = altroMembro?.username ?? "utente";

          return (
            <Pressable
              accessibilityRole="button"
              key={conv.id}
              onPress={() => onApriConversazione(conv)}
              style={({ pressed }) => [
                styles.rigaConversazione,
                {
                  backgroundColor: pressed ? colori.superficie : colori.superficieCard,
                  borderBottomColor: colori.bordo,
                },
              ]}
            >
              <Avatar misura="m" nome={nomeAltro} username={usernameAltro} />

              <View style={styles.infoConversazione}>
                <View style={styles.rigaTitolo}>
                  <Text numberOfLines={1} style={[styles.nomeMembro, { color: colori.testo }]}>
                    {nomeAltro}
                  </Text>
                  {conv.ultimoMessaggio ? (
                    <Text style={[styles.orario, { color: colori.testoMorbido }]}>
                      {quandoBreve(conv.ultimoMessaggio.createdAt)}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rigaAnteprima}>
                  <Text
                    numberOfLines={1}
                    style={[styles.anteprima, { color: colori.testoMorbido }]}
                  >
                    {conv.ultimoMessaggio
                      ? conv.ultimoMessaggio.senderUserId === user.id
                        ? "Tu: [Messaggio cifrato]"
                        : "[Messaggio cifrato]"
                      : "Conversazione avviata"}
                  </Text>

                  {conv.nonLetti > 0 ? (
                    <View style={[styles.badgeNonLetti, { backgroundColor: colori.accento }]}>
                      <Text style={[styles.badgeNonLettiTesto, { color: colori.suAccento }]}>
                        {conv.nonLetti}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Modale Nativo Glass Sheet per Nuova Conversazione */}
      <Modal animationType="slide" transparent visible={modalAperta}>
        <View style={styles.modalOverlay}>
          <GlassView
            colorScheme={colori.testo === "#ffffff" ? "dark" : "light"}
            glassEffectStyle="regular"
            style={styles.modalCard}
          >
            <View style={styles.modalBarraNotch} />
            <Text style={[styles.modalTitolo, { color: colori.testo }]}>
              Nuovo messaggio privato
            </Text>
            <Text style={[styles.modalSottotitolo, { color: colori.testoMorbido }]}>
              Inserisci il nome utente del membro con cui desideri iniziare una conversazione
              cifrata end-to-end.
            </Text>

            {erroreNuovo ? (
              <View style={{ marginBottom: 12 }}>
                <Avviso colori={colori}>{erroreNuovo}</Avviso>
              </View>
            ) : null}

            <Campo
              colori={colori}
              etichetta="Nome utente"
              onChange={setDestinatario}
              placeholder="es. bea"
              valore={destinatario}
            />

            <View style={styles.modalAzioni}>
              <View style={{ flex: 1 }}>
                <Pulsante
                  colori={colori}
                  onPress={() => setModalAperta(false)}
                  secondario
                  titolo="Annulla"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Pulsante
                  colori={colori}
                  disabilitato={!destinatario.trim()}
                  occupato={creazioneInCorso}
                  onPress={avviaNuova}
                  titolo="Avvia"
                  titoloOccupato="Avvio…"
                />
              </View>
            </View>
          </GlassView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  anteprima: {
    flex: 1,
    fontSize: 14,
  },
  badgeE2E: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  badgeE2ETesto: {
    fontSize: 12,
    fontWeight: "500",
  },
  badgeNonLetti: {
    alignItems: "center",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 6,
  },
  badgeNonLettiTesto: {
    fontSize: 11,
    fontWeight: "700",
  },
  bloccoAvviso: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bottoneNuovo: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 14,
  },
  bottoneNuovoTesto: {
    fontSize: 14,
    fontWeight: "600",
  },
  centroCaricamento: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  contenitore: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerInfo: {
    gap: 2,
  },
  infoConversazione: {
    flex: 1,
    gap: 4,
    marginLeft: 12,
  },
  modalAzioni: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalBarraNotch: {
    alignSelf: "center",
    backgroundColor: "rgba(120, 120, 128, 0.3)",
    borderRadius: 3,
    height: 5,
    marginBottom: 16,
    width: 36,
  },
  modalCard: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 22,
    width: "100%",
  },
  modalOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  modalSottotitolo: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalTitolo: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  nomeMembro: {
    fontSize: 16,
    fontWeight: "600",
  },
  orario: {
    fontSize: 12,
  },
  rigaAnteprima: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rigaConversazione: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rigaTitolo: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scrollContent: {
    paddingBottom: 110,
  },
  testoCaricamento: {
    fontSize: 15,
    marginTop: 12,
  },
  titolo: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  vuoto: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  vuotoDescrizione: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  vuotoIconaGuscio: {
    alignItems: "center",
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    marginBottom: 16,
    width: 72,
  },
  vuotoTitolo: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
});
