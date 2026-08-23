# Client mobile nativo (M7, fase 0)

React Native con **development client** locale. Non si usa Expo Go: da M4 in poi
serviranno moduli nativi, e Go non li carica.

Questa fase fa una cosa sola: **l'app si apre sull'iPhone**, installata da
Xcode. Non c'è accesso, non c'è bacheca, non ci sono messaggi.

## Requisiti

- macOS con Xcode (già provato: Xcode 26)
- un iPhone collegato via cavo
- dal root del repository: Node e pnpm come nel resto del progetto
- CocoaPods (`pod --version`). Se manca: `brew install cocoapods`

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
attendibile».

## Reinstallare allo scadere dei 7 giorni

L'app smette di aprirsi con un avviso di certificato. Non è un bug di ESTIA:
è il limite della firma gratuita.

Stesso progetto, stesso telefono:

```sh
pnpm --filter @estia/mobile ios
```

oppure Run da Xcode. Non serve rifare il prebuild se `ios/` c'è già.

## Puntare a un'istanza in LAN

Non in questa fase. L'app non parla ancora con il server. Quando arriverà
l'accesso, l'indirizzo sarà un URL `http://` sulla rete di casa (es.
`http://192.168.1.12:3000`), senza HTTPS e senza mDNS — [ADR 0017](../../docs/adr/0017-niente-mdns-nostro.md).
Su iOS il traffico verso la LAN è già consentito (`NSAllowsLocalNetworking`).

## Che cosa non fare

- Non aprire il progetto in **Expo Go**.
- Non pubblicare sullo store.
- Non aggiungere iroh, push o Android in questo taglio.

## Dipendenze (licenze)

Verificate il 2026-08-23, compatibili con AGPL-3.0 ([ADR 0015](../../docs/adr/0015-licenza-agpl.md)):

| Pacchetto         | Versione | Licenza |
| ----------------- | -------- | ------- |
| `expo`            | 57.0.15  | MIT     |
| `expo-dev-client` | 57.0.14  | MIT     |
| `expo-status-bar` | 57.0.1   | MIT     |
| `react`           | 19.2.3   | MIT     |
| `react-native`    | 0.86.2   | MIT     |

Nessuna copyleft incompatibile. Le transitive si controllano di nuovo se se ne
aggiunge una diretta.
