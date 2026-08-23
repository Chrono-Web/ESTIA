import type { InstancePublicView } from "@estia/contracts";
import type { ReactElement } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";

import type { Palette } from "./tema";
import { Avviso, Campo, Live, Pulsante } from "./ui";

export function nomeIstanza(instance: InstancePublicView | undefined): string {
  return instance?.name ?? "questa istanza";
}

export function SchermataIstanza({
  colori,
  valore,
  onChange,
  onCollega,
  occupato,
  errore,
  statoLive,
}: {
  colori: Palette;
  valore: string;
  onChange: (testo: string) => void;
  onCollega: () => void;
  occupato: boolean;
  errore: string | undefined;
  statoLive: string;
}): ReactElement {
  const puoInviare = valore.trim().length > 0 && !occupato;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colori.fondo }}
    >
      <ScrollView
        contentContainerStyle={{ gap: 16, padding: 28, paddingTop: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <Live>{statoLive}</Live>
        <Text
          accessibilityRole="header"
          style={{ color: colori.testo, fontSize: 28, fontWeight: "600" }}
        >
          ESTIA
        </Text>
        <Text style={{ color: colori.testo, fontSize: 17, lineHeight: 24 }}>
          Per entrare serve l&apos;indirizzo dell&apos;istanza in casa — lo stesso che apri dal
          browser sulla rete Wi-Fi. Non lo cerchiamo da soli: va scritto qui.
        </Text>
        {errore !== undefined ? <Avviso colori={colori}>{errore}</Avviso> : null}
        <Campo
          autoComplete="off"
          colori={colori}
          etichetta="Indirizzo dell'istanza"
          inputMode="url"
          keyboardType="url"
          onChange={onChange}
          onSubmitEditing={() => {
            if (puoInviare) {
              onCollega();
            }
          }}
          placeholder="http://192.168.1.12:3000"
          returnKeyType="go"
          valore={valore}
        />
        <Text style={{ color: colori.testoMorbido, fontSize: 15, lineHeight: 22 }}>
          Esempi: l&apos;IP del NAS con la porta, oppure il nome tipo nas.local:3000. Senza https,
          in casa.
        </Text>
        <Pulsante
          colori={colori}
          disabilitato={!puoInviare}
          occupato={occupato}
          onPress={onCollega}
          titolo="Collega"
          titoloOccupato="Collego…"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
