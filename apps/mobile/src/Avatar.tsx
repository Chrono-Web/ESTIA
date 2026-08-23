import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

const COLORI_AVATAR = [
  "#b4552d", // terracotta
  "#2b6b7a", // petrolio
  "#5b4a8a", // viola
  "#7a5028", // bronzo
  "#386641", // verde bosco
  "#8a3854", // vinaccia
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function Avatar({
  nome,
  username,
  misura = "m",
}: {
  nome: string;
  username: string;
  misura?: "s" | "m" | "l";
}): ReactElement {
  const iniziale = (nome.trim()[0] ?? username.trim()[0] ?? "?").toUpperCase();
  const coloreFondo = COLORI_AVATAR[hashString(username) % COLORI_AVATAR.length]!;

  const dimensioni = {
    s: { diametro: 32, font: 14 },
    m: { diametro: 42, font: 18 },
    l: { diametro: 56, font: 24 },
  }[misura];

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Avatar di ${nome}`}
      style={[
        styles.avatar,
        {
          backgroundColor: coloreFondo,
          borderRadius: dimensioni.diametro / 2,
          height: dimensioni.diametro,
          width: dimensioni.diametro,
        },
      ]}
    >
      <Text style={[styles.testo, { fontSize: dimensioni.font }]}>{iniziale}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  testo: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
