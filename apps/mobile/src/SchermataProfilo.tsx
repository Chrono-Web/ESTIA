import type { FollowerView, FollowingView, PersonView, PostView } from "@estia/contracts";
import type { ReactElement } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar } from "./Avatar";
import { CartaPost } from "./CartaPost";
import type { Palette } from "./tema";
import { Avviso, Live, Pulsante } from "./ui";

export function SchermataProfilo({
  colori,
  persona,
  posts,
  caricato,
  errore,
  statoLive,
  lavoro,
  pending,
  onSegui,
  onSmetti,
  onAccetta,
  onRifiuta,
  onCuore,
  cuoreOccupatoId,
  onAutore,
  onEsci,
  esciOccupato,
  onCambiaIstanza,
  proprio,
  seguito,
}: {
  colori: Palette;
  persona: PersonView | undefined;
  posts: PostView[];
  caricato: boolean;
  errore: string | undefined;
  statoLive: string;
  lavoro: string | undefined;
  pending: FollowerView[];
  onSegui: () => void;
  onSmetti: (riga: FollowingView) => void;
  onAccetta: (riga: FollowerView) => void;
  onRifiuta: (riga: FollowerView) => void;
  onCuore: (post: PostView) => void;
  cuoreOccupatoId: string | undefined;
  onAutore: (username: string, instanceKey: string | undefined) => void;
  onEsci: () => void;
  esciOccupato: boolean;
  onCambiaIstanza: () => void;
  proprio: boolean;
  seguito: FollowingView | undefined;
}): ReactElement {
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { backgroundColor: colori.fondo }]}
      style={{ backgroundColor: colori.fondo, flex: 1 }}
    >
      <Live>{statoLive}</Live>
      {errore !== undefined ? <Avviso colori={colori}>{errore}</Avviso> : null}
      {!caricato && persona === undefined ? <ActivityIndicator color={colori.accento} /> : null}

      {persona !== undefined ? (
        <View
          style={[
            styles.cardProfilo,
            {
              backgroundColor: colori.superficieCard,
              borderColor: colori.vetroBordo,
              shadowColor: colori.ombraVetro,
            },
          ]}
        >
          <View style={styles.headerRiga}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                accessibilityRole="header"
                style={[styles.displayName, { color: colori.testo }]}
              >
                {persona.displayName}
              </Text>
              <Text style={[styles.username, { color: colori.testoMorbido }]}>
                @{persona.username}
              </Text>
            </View>
            <Avatar misura="l" nome={persona.displayName} username={persona.username} />
          </View>

          {persona.remoto !== undefined ? (
            <View
              style={[
                styles.badgeCasa,
                { backgroundColor: colori.superficie, borderColor: colori.bordo },
              ]}
            >
              <Text style={[styles.badgeCasaTesto, { color: colori.rete }]}>
                da {persona.remoto.istanza === "" ? "un'altra istanza" : persona.remoto.istanza}
              </Text>
            </View>
          ) : null}

          {persona.bio !== "" ? (
            <Text style={[styles.bio, { color: colori.testo }]}>{persona.bio}</Text>
          ) : null}

          {persona.remoto === undefined ? (
            <Text style={[styles.statistiche, { color: colori.testoMorbido }]}>
              {persona.followingCount === 1
                ? "1 seguito"
                : `${String(persona.followingCount)} seguiti`}
              {" · "}
              {persona.followerCount === 1
                ? "1 follower"
                : `${String(persona.followerCount)} follower`}
            </Text>
          ) : null}

          <View style={{ marginTop: 8 }}>
            <AzioniProfilo
              colori={colori}
              lavoro={lavoro}
              onSegui={onSegui}
              onSmetti={onSmetti}
              persona={persona}
              seguito={seguito}
            />
          </View>
        </View>
      ) : null}

      {proprio && pending.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={[styles.sezioneTitolo, { color: colori.testo }]}>Vogliono seguirti</Text>
          {pending.map((riga) => (
            <View
              key={riga.id}
              style={[
                styles.rigaPending,
                {
                  backgroundColor: colori.superficieCard,
                  borderColor: colori.vetroBordo,
                  shadowColor: colori.ombraVetro,
                },
              ]}
            >
              <Text style={{ color: colori.testo, fontSize: 16, fontWeight: "600" }}>
                @{riga.username}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Pulsante
                    colori={colori}
                    occupato={lavoro === `accetta:${riga.id}`}
                    onPress={() => onAccetta(riga)}
                    titolo="Accetta"
                    titoloOccupato="Accetto…"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Pulsante
                    colori={colori}
                    occupato={lavoro === `rifiuta:${riga.id}`}
                    onPress={() => onRifiuta(riga)}
                    secondario
                    titolo="Rifiuta"
                    titoloOccupato="Rifiuto…"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {caricato && posts.length === 0 && persona !== undefined ? (
        <View style={styles.bloccoVuoto}>
          <Text style={[styles.testoVuoto, { color: colori.testoMorbido }]}>
            {persona.relazione === "nessuna" && persona.pubblico === false
              ? "Il profilo è privato: i post si vedono dopo che ha accettato la richiesta."
              : "Non ha ancora scritto niente qui."}
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
        />
      ))}

      {proprio ? (
        <View style={styles.bloccoEsci}>
          <Pulsante
            colori={colori}
            occupato={esciOccupato}
            onPress={onEsci}
            secondario
            titolo="Esci"
            titoloOccupato="Esco…"
          />
          <Pulsante
            colori={colori}
            disabilitato={esciOccupato}
            onPress={onCambiaIstanza}
            secondario
            titolo="Scegli un'altra istanza"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function AzioniProfilo({
  colori,
  persona,
  seguito,
  lavoro,
  onSegui,
  onSmetti,
}: {
  colori: Palette;
  persona: PersonView;
  seguito: FollowingView | undefined;
  lavoro: string | undefined;
  onSegui: () => void;
  onSmetti: (riga: FollowingView) => void;
}): ReactElement | null {
  if (persona.relazione === "sei_tu") {
    return (
      <Text style={{ color: colori.testoMorbido, fontSize: 14 }}>
        Questo è quello che gli altri vedono di te.
      </Text>
    );
  }

  if (persona.relazione === "in_attesa") {
    return <Pulsante colori={colori} disabilitato secondario titolo="Richiesta in attesa" />;
  }

  if (persona.relazione === "seguito" && seguito !== undefined) {
    return (
      <Pulsante
        colori={colori}
        occupato={lavoro === "smetti"}
        onPress={() => onSmetti(seguito)}
        secondario
        titolo="Smetti di seguire"
        titoloOccupato="Smetto…"
      />
    );
  }

  if (persona.relazione === "nessuna") {
    return (
      <Pulsante
        colori={colori}
        occupato={lavoro === "segui"}
        onPress={onSegui}
        titolo="Segui"
        titoloOccupato="Mando la richiesta…"
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badgeCasa: {
    alignSelf: "flex-start",
    borderRadius: 6,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeCasaTesto: {
    fontSize: 12,
    fontWeight: "600",
  },
  bio: {
    fontSize: 15,
    lineHeight: 21,
  },
  bloccoEsci: {
    gap: 12,
    marginTop: 12,
    paddingBottom: 40,
  },
  bloccoVuoto: {
    paddingVertical: 20,
  },
  cardProfilo: {
    borderRadius: 20,
    borderWidth: 0.5,
    gap: 10,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  displayName: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerRiga: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rigaPending: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  scrollContent: {
    gap: 16,
    padding: 16,
    paddingBottom: 90,
  },
  sezioneTitolo: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  statistiche: {
    fontSize: 14,
  },
  testoVuoto: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  username: {
    fontSize: 15,
  },
});
