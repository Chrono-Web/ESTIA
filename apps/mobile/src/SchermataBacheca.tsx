import type { FeedKind, MissingSource, PostView } from "@estia/contracts";
import { Host, Picker, Text as SwiftUIText } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { ReactElement } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CartaPost } from "./CartaPost";
import { IconaCasa, IconaMondo } from "./Icone";
import type { Palette } from "./tema";
import { Avviso, Live, Pulsante } from "./ui";

export function SchermataBacheca({
  colori,
  feed,
  onFeed,
  posts,
  mancanti,
  caricato,
  errore,
  statoLive,
  cursor,
  onAncora,
  ancoraOccupato,
  onRicarica,
  ricarica,
  onAutore,
  onCuore,
  cuoreOccupatoId,
  urlIstanza,
  token,
}: {
  colori: Palette;
  feed: FeedKind;
  onFeed: (feed: FeedKind) => void;
  posts: PostView[];
  mancanti: MissingSource[];
  caricato: boolean;
  errore: string | undefined;
  statoLive: string;
  cursor: string | undefined;
  onAncora: () => void;
  ancoraOccupato: boolean;
  onRicarica: () => void;
  ricarica: boolean;
  onAutore: (username: string, instanceKey: string | undefined) => void;
  onCuore: (post: PostView) => void;
  cuoreOccupatoId: string | undefined;
  urlIstanza?: string;
  token?: string;
}): ReactElement {
  return (
    <View style={[styles.contenitore, { backgroundColor: colori.fondo }]}>
      <Live>{statoLive}</Live>

      {/* Selettore Lente Nativo Apple Segmented Control incapsulato in Host SwiftUI */}
      <Host matchContents style={styles.barraLenti}>
        <Picker
          modifiers={[pickerStyle("segmented")]}
          onSelectionChange={(sel) => onFeed(sel as FeedKind)}
          selection={feed}
        >
          <SwiftUIText modifiers={[tag("locale")]}>Istanza</SwiftUIText>
          <SwiftUIText modifiers={[tag("seguiti")]}>Rete</SwiftUIText>
        </Picker>
      </Host>

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

        {mancanti.length > 0 && caricato ? (
          <View style={styles.bloccoAvviso}>
            <Avviso colori={colori} tono="info">
              {mancanti.length === 1
                ? `${nomeCasa(mancanti[0])} non ha risposto: i suoi post stanno là, e questa pagina è incompleta.`
                : `${String(mancanti.length)} case non hanno risposto: i loro post stanno sulle loro macchine.`}
            </Avviso>
          </View>
        ) : null}

        {!caricato && posts.length === 0 ? (
          <View style={styles.centroCaricamento}>
            <ActivityIndicator color={colori.accento} size="large" />
            <Text style={[styles.testoCaricamento, { color: colori.testoMorbido }]}>
              Carico la bacheca…
            </Text>
          </View>
        ) : null}

        {caricato && posts.length === 0 && errore === undefined ? (
          <View style={styles.vuoto}>
            <View
              style={[
                styles.vuotoIconaGuscio,
                {
                  backgroundColor:
                    feed === "locale" ? "rgba(180, 85, 45, 0.12)" : "rgba(43, 107, 122, 0.12)",
                },
              ]}
            >
              {feed === "locale" ? (
                <IconaCasa colore={colori.accentoLocale} size={36} />
              ) : (
                <IconaMondo colore={colori.accentoRete} size={36} />
              )}
            </View>
            <Text style={[styles.vuotoTitolo, { color: colori.testo }]}>
              {feed === "locale" ? "Nessun post locale" : "La rete è silenziosa"}
            </Text>
            <Text style={[styles.vuotoDescrizione, { color: colori.testoMorbido }]}>
              {feed === "locale"
                ? "Qui non c'è ancora niente. Il primo messaggio si scrive dal web."
                : "I post di chi segui su questa istanza e sulle altre case compariranno qui."}
            </Text>
          </View>
        ) : null}

        {posts.map((post) => (
          <CartaPost
            colori={colori}
            cuoreOccupato={cuoreOccupatoId === post.id}
            key={post.id}
            onAutore={onAutore}
            onCuore={onCuore}
            post={post}
            token={token}
            urlIstanza={urlIstanza}
          />
        ))}

        {cursor !== undefined ? (
          <View style={styles.bloccoAltro}>
            <Pulsante
              colori={colori}
              occupato={ancoraOccupato}
              onPress={onAncora}
              secondario
              titolo="Mostra altri messaggi"
              titoloOccupato="Carico…"
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function nomeCasa(casa: MissingSource | undefined): string {
  if (casa === undefined) {
    return "Un'istanza";
  }
  return casa.istanza === "" ? `L'istanza ${casa.instanceKey.slice(0, 12)}…` : casa.istanza;
}

const styles = StyleSheet.create({
  barraLenti: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bloccoAltro: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bloccoAvviso: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  centroCaricamento: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  contenitore: {
    flex: 1,
  },
  pickerNativo: {
    height: 36,
    width: "100%",
  },
  scrollContent: {
    paddingBottom: 110,
  },
  testoCaricamento: {
    fontSize: 15,
    marginTop: 12,
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
