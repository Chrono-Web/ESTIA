# Client mobile nativo (M7, fase 1)

React Native con **development client** locale. Non si usa Expo Go: da M4 in poi
serviranno moduli nativi, e Go non li carica.

In questa fase l'app **si collega a un'istanza in LAN**, si entra, si legge la
bacheca (istanza / rete) e si aprono i profili. I messaggi E2E arrivano dopo,
con un ADR. Iroh, push e Android restano fuori.

## Requisiti

- macOS con **Xcode 26.4 o successivo** (Swift 6.3). 26.0 e 26.1 non bastano:
  Expo SDK 57 usa `weak let` in `expo-modules-jsi`, valido solo da Swift 6.3.
  Con un Xcode più vecchio la compilazione fallisce su quel pacchetto, e
  rattoppare il sorgente non è una strada — Expo spedisce altri moduli già
  compilati con 26.4, e collegarli con un toolchain precedente può crashare
  a runtime.
- un iPhone collegato via cavo
- dal root del repository: Node e pnpm come nel resto del progetto
- CocoaPods (`pod --version`). Se manca: `brew install cocoapods`

Per vedere quale Xcode sta usando la build: `xcodebuild -version`. Deve dire **26.4 o più**.
Se Xcode in App Store è nuovo ma la build fallisce ancora su `weak let`, di solito
manca la licenza o i Command Line Tools sono quelli vecchi:

```sh
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
xcrun swift --version
```

`xcrun swift --version` deve essere **Swift 6.3** (o 6.3.x), non 6.2. Poi, dopo
un aggiornamento di Xcode, va accettata la licenza **prima** di ricompilare.

Aggiornamento: App Store, oppure [developer.apple.com/download](https://developer.apple.com/download/all/).

Non serve l'account Apple Developer a pagamento. Serve un Apple ID: Xcode firma
con un certificato **gratuito**, che **scade dopo 7 giorni**.

## Installare sul telefono

Dal root del repository:

```sh
pnpm install
pnpm --filter @estia/mobile prebuild
pnpm --filter @estia/mobile ios
```

`prebuild` genera `apps/mobile/ios/` (non è nel git: si rigenera). `ios`
compila, installa sul dispositivo collegato e avvia Metro.

Questa fase aggiunge `expo-secure-store` (Keychain). Se l'app era già sul
telefono dalla fase 0, **rifare prebuild e ios**: un modulo nativo nuovo non
entra con un reload di Metro.

Per aprirla da Xcode, dopo il prebuild:

```sh
open apps/mobile/ios/ESTIA.xcworkspace
```

In Xcode:

1. Seleziona il target **ESTIA** e il tuo iPhone, non un simulatore.
2. Signing: **Team** = il tuo Apple ID personale (Add Account se non c'è).
3. Run (▶).
4. Sul telefono, la prima volta: Impostazioni → Generale → Gestione VPN e
   dispositivi → sviluppatore → **Autorizza**.

Se il telefono non compare, sbloccalo e conferma «Considera questo computer
attendibile». Deve risultare **collegato**, non «offline»: `expo run:ios`
senza `--device` può riattaccarsi a un simulatore vecchio (destinazione
inesistente, errore 70). Lo script `ios` passa già `--device`. Se Expo
chiede quale dispositivo (più iPhone in elenco, anche «offline»), indica
l'UDID del tuo:

```sh
pnpm --filter @estia/mobile exec expo run:ios --device <UDID>
```

L'UDID si legge da `xcrun xctrace list devices`.

Dopo un aggiornamento di Xcode, se dice «iOS 26.x is not installed»:
non basta l'SDK già in Xcode, manca il **pacchetto piattaforma** (e, sul
telefono nuovo, il Device Support). Da Terminale, con Xcode 26.4+:

```sh
xcodebuild -downloadPlatform iOS
xcodebuild -prepareDeviceSupport -platform iOS -osVersion 26.6
```

(sostituisci `26.6` con la versione del telefono, da `xctrace list devices`).
In alternativa: Xcode → Impostazioni → Components. Poi di nuovo
`pnpm --filter @estia/mobile ios`.

Se invece compila e poi dice che **non c'è un profilo** per
`org.estia.mobile`: Expo, quando il team è già nel progetto, non passa
`-allowProvisioningUpdates`, e Xcode non può creare il profilo da solo.
Apri il workspace in Xcode e fai Run una volta, oppure:

```sh
xcodebuild -workspace apps/mobile/ios/ESTIA.xcworkspace \
  -scheme ESTIA -configuration Debug \
  -destination "id=<UDID>" \
  DEVELOPMENT_TEAM=<il tuo Team ID> \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration
```

Poi `pnpm --filter @estia/mobile ios` di nuovo, o installa
`ESTIA.app` da DerivedData con `xcrun devicectl device install app`.

## Reinstallare allo scadere dei 7 giorni

L'app smette di aprirsi con un avviso di certificato. Non è un bug di ESTIA:
è il limite della firma gratuita.

Stesso progetto, stesso telefono:

```sh
pnpm --filter @estia/mobile ios
```

oppure Run da Xcode. Non serve rifare il prebuild se `ios/` c'è già **e** non
sono cambiate dipendenze native. Questa fase ha aggiunto il Keychain: la prima
volta dopo l'aggiornamento il prebuild serve.

## Puntare a un'istanza in LAN

Sull'app, alla prima apertura (o dopo «Scegli un'altra istanza»):

1. Scrivi l'indirizzo come lo apri dal browser, per esempio
   `http://192.168.1.12:3000` oppure `nas.local:3000`.
2. **Collega**. L'app chiede `/api/v1/instance` — niente mDNS, [ADR 0017](../../docs/adr/0017-niente-mdns-nostro.md).
3. Entra con nome utente e password. Il dispositivo si presenta come
   **Telefono** ([ADR 0034](../../docs/adr/0034-distinzione-tra-dispositivo-fisico-e-sessione-di-login.md)).
4. Bacheca: lenti Istanza e Rete. Dal post si apre il profilo di chi ha scritto;
   da **Io** il proprio, con esci e cambio istanza.

Sessione e indirizzo stanno nel Keychain, non in chiaro sul disco. Su iOS il
traffico verso la LAN è già consentito (`NSAllowsLocalNetworking`).

Chiedere di entrare la prima volta, o recuperare la password, per ora si fa
dal web sullo stesso indirizzo. I messaggi privati non ci sono ancora.

## Che cosa non fare

- Non aprire il progetto in **Expo Go**.
- Non pubblicare sullo store.
- Non aggiungere iroh, push o Android in questo taglio.

## Dipendenze (licenze)

Verificate il 2026-08-24, compatibili con AGPL-3.0 ([ADR 0015](../../docs/adr/0015-licenza-agpl.md)):

| Pacchetto           | Versione | Licenza |
| ------------------- | -------- | ------- |
| `expo`              | 57.0.15  | MIT     |
| `expo-dev-client`   | 57.0.14  | MIT     |
| `expo-secure-store` | 15.0.8   | MIT     |
| `expo-status-bar`   | 57.0.1   | MIT     |
| `react`             | 19.2.3   | MIT     |
| `react-native`      | 0.86.2   | MIT     |

Nessuna copyleft incompatibile. Le transitive si controllano di nuovo se se ne
aggiunge una diretta.
