import type { PostView } from "@estia/contracts";
import type { ReactElement } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "./Avatar";
import { IconaCuore } from "./Icone";
import { quandoBreve, quandoPerEsteso } from "./quando";
import type { Palette } from "./tema";

export function CartaPost({
  colori,
  post,
  onAutore,
  onCuore,
  cuoreOccupato,
  urlIstanza,
  token,
}: {
  colori: Palette;
  post: PostView;
  onAutore: (username: string, instanceKey: string | undefined) => void;
  onCuore: (post: PostView) => void;
  cuoreOccupato: boolean;
  urlIstanza?: string;
  token?: string;
}): ReactElement {
  const remoto = post.remoto;
  const cuoreNascosto = remoto !== undefined && !remoto.cuoriDisponibili;
  const casa =
    remoto === undefined ? undefined : remoto.istanza === "" ? "un'altra casa" : remoto.istanza;

  return (
    <View style={[styles.carta, { borderBottomColor: colori.bordo }]}>
      {/* Colonna Sinistra: Avatar e Rail Threads */}
      <View style={styles.colonnaSinistra}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Profilo di ${post.author.displayName}`}
          onPress={() => onAutore(post.author.username, remoto?.instanceKey)}
        >
          <Avatar misura="m" nome={post.author.displayName} username={post.author.username} />
        </Pressable>
        <View style={[styles.rail, { backgroundColor: colori.rail }]} />
      </View>

      {/* Colonna Destra: Contenuto del Post */}
      <View style={styles.colonnaDestra}>
        {/* Intestazione autore */}
        <Pressable
          accessibilityRole="link"
          onPress={() => onAutore(post.author.username, remoto?.instanceKey)}
          style={styles.headerAutore}
        >
          <View style={styles.rigaNome}>
            <Text numberOfLines={1} style={[styles.displayName, { color: colori.testo }]}>
              {post.author.displayName}
            </Text>
            <Text numberOfLines={1} style={[styles.username, { color: colori.testoMorbido }]}>
              @{post.author.username}
            </Text>
          </View>
          <Text
            accessibilityLabel={quandoPerEsteso(post.createdAt)}
            style={[styles.tempo, { color: colori.testoMorbido }]}
          >
            {quandoBreve(post.createdAt)}
          </Text>
        </Pressable>

        {casa !== undefined ? (
          <View
            style={[
              styles.badgeCasa,
              { backgroundColor: colori.superficie, borderColor: colori.bordo },
            ]}
          >
            <Text style={[styles.badgeCasaTesto, { color: colori.rete }]}>da {casa}</Text>
          </View>
        ) : null}

        {/* Testo del post */}
        {post.body !== "" ? (
          <Text style={[styles.corpo, { color: colori.testo }]}>{post.body}</Text>
        ) : null}

        {/* Foto allegate */}
        {post.images.length > 0 ? (
          <View style={styles.grigliaImmagini}>
            {post.images.map((img) => {
              const imageUrl = urlIstanza
                ? `${urlIstanza.replace(/\/$/, "")}/api/v1/media/${img.id}`
                : undefined;
              return (
                <View
                  key={img.id}
                  style={[
                    styles.contenitoreImmagine,
                    {
                      backgroundColor: colori.superficie,
                      borderColor: colori.bordo,
                    },
                  ]}
                >
                  {imageUrl ? (
                    <Image
                      accessibilityLabel={img.altText || "Immagine allegata al post"}
                      resizeMode="cover"
                      source={{
                        headers: token ? { authorization: `Bearer ${token}` } : undefined,
                        uri: imageUrl,
                      }}
                      style={styles.immagine}
                    />
                  ) : (
                    <Text style={{ color: colori.testoMorbido, fontSize: 13, padding: 12 }}>
                      {img.altText || "Foto"}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Barra Azioni (Cuore compatto in stile nativo) */}
        <View style={styles.rigaAzioni}>
          {!cuoreNascosto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                post.liked
                  ? `Rimuovi mi piace. Attualmente ${String(post.likeCount)} mi piace.`
                  : `Metti mi piace. Attualmente ${String(post.likeCount)} mi piace.`
              }
              accessibilityState={{ busy: cuoreOccupato }}
              disabled={cuoreOccupato}
              hitSlop={{ bottom: 10, left: 10, right: 10, top: 10 }}
              onPress={() => onCuore(post)}
              style={({ pressed }) => [
                styles.bottoneCuore,
                {
                  opacity: cuoreOccupato ? 0.6 : pressed ? 0.7 : 1,
                },
              ]}
            >
              {cuoreOccupato ? (
                <ActivityIndicator
                  size="small"
                  color={post.liked ? colori.accento : colori.testoMorbido}
                />
              ) : (
                <IconaCuore
                  colore={post.liked ? colori.accento : colori.testoMorbido}
                  pieno={post.liked}
                  size={20}
                />
              )}
              <Text
                style={[
                  styles.conteggioCuori,
                  {
                    color: post.liked ? colori.accento : colori.testoMorbido,
                    fontWeight: post.liked ? "600" : "400",
                  },
                ]}
              >
                {post.likeCount > 0 ? String(post.likeCount) : ""}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: colori.testoMorbido, fontSize: 14 }}>
              {post.likeCount === 1 ? "1 mi piace" : `${String(post.likeCount)} mi piace`}
            </Text>
          )}

          {post.commentCount > 0 ? (
            <Text style={[styles.commentiCount, { color: colori.testoMorbido }]}>
              {post.commentCount === 1 ? "1 risposta" : `${String(post.commentCount)} risposte`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeCasa: {
    alignSelf: "flex-start",
    borderRadius: 6,
    borderWidth: 0.5,
    marginVertical: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeCasaTesto: {
    fontSize: 12,
    fontWeight: "600",
  },
  bottoneCuore: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 32,
    minWidth: 44,
  },
  carta: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  colonnaDestra: {
    flex: 1,
    paddingLeft: 12,
  },
  colonnaSinistra: {
    alignItems: "center",
    width: 44,
  },
  commentiCount: {
    fontSize: 13,
  },
  conteggioCuori: {
    fontSize: 14,
  },
  corpo: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
  },
  displayName: {
    fontSize: 15,
    fontWeight: "700",
    maxWidth: 160,
  },
  grigliaImmagini: {
    gap: 8,
    marginTop: 10,
  },
  headerAutore: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  immagine: {
    borderRadius: 12,
    height: 200,
    width: "100%",
  },
  contenitoreImmagine: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rail: {
    flex: 1,
    marginTop: 8,
    width: 2,
  },
  rigaAzioni: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  rigaNome: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  tempo: {
    fontSize: 13,
  },
  username: {
    fontSize: 14,
    maxWidth: 110,
  },
});
