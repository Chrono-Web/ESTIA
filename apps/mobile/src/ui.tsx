import type { ReactElement } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import type { Palette } from "./tema";

const TOUCH = 48;

export function Campo({
  colori,
  etichetta,
  valore,
  onChange,
  ...rest
}: {
  colori: Palette;
  etichetta: string;
  valore: string;
  onChange: (testo: string) => void;
} & Omit<TextInputProps, "value" | "onChangeText" | "onChange" | "style">): ReactElement {
  return (
    <View style={styles.campo}>
      <Text style={[styles.etichetta, { color: colori.testo }]}>{etichetta}</Text>
      <TextInput
        accessibilityLabel={etichetta}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        placeholderTextColor={colori.testoMorbido}
        style={[
          styles.input,
          {
            backgroundColor: colori.fondo,
            borderColor: colori.bordoForte,
            color: colori.testo,
          },
        ]}
        value={valore}
        {...rest}
      />
    </View>
  );
}

export function Pulsante({
  colori,
  titolo,
  onPress,
  disabilitato = false,
  occupato = false,
  titoloOccupato,
  secondario = false,
  pericolo = false,
}: {
  colori: Palette;
  titolo: string;
  onPress?: () => void;
  disabilitato?: boolean;
  occupato?: boolean;
  titoloOccupato?: string;
  secondario?: boolean;
  pericolo?: boolean;
}): ReactElement {
  const spento = disabilitato || occupato;
  const etichetta = occupato ? (titoloOccupato ?? titolo) : titolo;
  const fondo = pericolo ? colori.pericolo : secondario ? colori.superficie : colori.accento;
  const testo = pericolo || !secondario ? colori.suAccento : colori.testo;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: occupato, disabled: spento }}
      disabled={spento}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pulsante,
        {
          backgroundColor: fondo,
          borderColor: secondario ? colori.bordoForte : fondo,
          borderWidth: secondario ? 1 : 0,
          opacity: spento ? 0.55 : pressed ? 0.88 : 1,
        },
      ]}
    >
      {occupato ? (
        <ActivityIndicator color={testo} />
      ) : (
        <Text style={[styles.pulsanteTesto, { color: testo }]}>{etichetta}</Text>
      )}
      {occupato ? <Text style={[styles.pulsanteTesto, { color: testo }]}>{etichetta}</Text> : null}
    </Pressable>
  );
}

export function Avviso({
  colori,
  tono = "errore",
  children,
}: {
  colori: Palette;
  tono?: "errore" | "info";
  children: string;
}): ReactElement {
  const fondo = tono === "errore" ? colori.pericoloFondo : colori.superficie;
  const testo = tono === "errore" ? colori.pericolo : colori.testo;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tono === "errore" ? "alert" : "summary"}
      style={[styles.avviso, { backgroundColor: fondo, borderColor: colori.bordo }]}
    >
      <Text style={[styles.avvisoTesto, { color: testo }]}>{children}</Text>
    </View>
  );
}

export function Live({ children }: { children: string }): ReactElement {
  return (
    <Text accessibilityLiveRegion="polite" style={styles.live}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  avviso: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  avvisoTesto: {
    fontSize: 16,
    lineHeight: 22,
  },
  campo: {
    gap: 6,
  },
  etichetta: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 17,
    minHeight: TOUCH,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  live: {
    height: 0,
    opacity: 0,
  },
  pulsante: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: TOUCH,
    paddingHorizontal: 16,
  },
  pulsanteTesto: {
    fontSize: 17,
    fontWeight: "600",
  },
});
