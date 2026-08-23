import type { InstancePublicView } from "@estia/contracts";
import type { ReactElement } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { nomeIstanza } from "./SchermataIstanza";
import type { Palette } from "./tema";
import { Avviso, Campo, Live, Pulsante } from "./ui";

export function SchermataAccesso({
  colori,
  instance,
  username,
  password,
  onUsername,
  onPassword,
  onEntra,
  onCambiaIstanza,
  occupato,
  errore,
  statoLive,
}: {
  colori: Palette;
  instance: InstancePublicView;
  username: string;
  password: string;
  onUsername: (testo: string) => void;
  onPassword: (testo: string) => void;
  onEntra: () => void;
  onCambiaIstanza: () => void;
  occupato: boolean;
  errore: string | undefined;
  statoLive: string;
}): ReactElement {
  const puoInviare = username.trim().length > 0 && password.length > 0 && !occupato;
  const nonPronta = instance.state === "unconfigured";

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
          {nomeIstanza(instance)}
        </Text>
        {instance.description !== undefined && instance.description !== "" ? (
          <Text style={{ color: colori.testoMorbido, fontSize: 16, lineHeight: 22 }}>
            {instance.description}
          </Text>
        ) : null}
        {nonPronta ? (
          <Avviso colori={colori} tono="info">
            Questa istanza non è ancora stata configurata. Si fa dal web, da chi la ospita. Da qui
            non si può.
          </Avviso>
        ) : null}
        {errore !== undefined ? <Avviso colori={colori}>{errore}</Avviso> : null}
        <Campo
          autoComplete="username"
          colori={colori}
          etichetta="Nome utente"
          onChange={onUsername}
          returnKeyType="next"
          textContentType="username"
          valore={username}
        />
        <Campo
          autoComplete="password"
          colori={colori}
          etichetta="Password"
          onChange={onPassword}
          onSubmitEditing={() => {
            if (puoInviare) {
              onEntra();
            }
          }}
          returnKeyType="go"
          secureTextEntry
          textContentType="password"
          valore={password}
        />
        <Pulsante
          colori={colori}
          disabilitato={!puoInviare || nonPronta}
          occupato={occupato}
          onPress={onEntra}
          titolo="Entra"
          titoloOccupato="Entro…"
        />
        <Text style={{ color: colori.testoMorbido, fontSize: 15, lineHeight: 22 }}>
          Per chiedere di entrare la prima volta, o per recuperare la password, per ora si usa il
          web sullo stesso indirizzo.
        </Text>
        <View>
          <Pulsante
            colori={colori}
            disabilitato={occupato}
            onPress={onCambiaIstanza}
            secondario
            titolo="Scegli un'altra istanza"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
