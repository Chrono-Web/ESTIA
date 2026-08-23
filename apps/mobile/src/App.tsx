import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

/**
 * Schermata della fase 0: l'app si installa e si apre.
 * Login, bacheca e messaggi non ci sono ancora — e la schermata lo dice.
 */
export function App() {
  const scuro = useColorScheme() === "dark";
  const colori = scuro ? palette.scuro : palette.chiaro;

  return (
    <View style={[styles.schermo, { backgroundColor: colori.fondo }]} accessibilityRole="summary">
      <StatusBar style={scuro ? "light" : "dark"} />
      <Text accessibilityRole="header" style={[styles.titolo, { color: colori.testo }]}>
        ESTIA
      </Text>
      <Text style={[styles.corpo, { color: colori.testo }]}>
        Questa è l'app nativa, in una build di sviluppo. Accesso, bacheca e messaggi arriveranno
        nelle fasi successive: qui non c'è ancora niente da usare.
      </Text>
      <Text style={[styles.nota, { color: colori.nota }]}>
        Si installa da Xcode sul telefono, non dallo store. Con l'account Apple gratuito la firma
        scade dopo sette giorni: si reinstalla dallo stesso progetto.
      </Text>
    </View>
  );
}

const palette = {
  chiaro: {
    fondo: "#ffffff",
    testo: "#0a0a0a",
    nota: "#5c5c5c",
  },
  scuro: {
    fondo: "#000000",
    testo: "#f5f5f5",
    nota: "#a3a3a3",
  },
} as const;

const styles = StyleSheet.create({
  schermo: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 16,
  },
  titolo: {
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  corpo: {
    fontSize: 17,
    lineHeight: 24,
  },
  nota: {
    fontSize: 15,
    lineHeight: 22,
  },
});
