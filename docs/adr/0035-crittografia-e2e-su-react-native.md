# ADR 0035 — Crittografia E2E / MLS su React Native

- Stato: **Accepted** — decisa dal proprietario il 2026-08-24
- Data: 2026-08-24
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0015](0015-licenza-agpl.md), [ADR 0027](0027-la-libreria-mls.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0032](0032-payload-messaggi-strutturato-e2e.md), [ADR 0033](0033-ri-derivazione-chiavi-messaggi-e2e.md), [ADR 0034](0034-distinzione-tra-dispositivo-fisico-e-sessione-di-login.md)
- Attua: Milestone M7 (Client mobile nativo React Native)

## Contesto

L'[ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) impone la cifratura end-to-end (E2E) per tutti i messaggi diretti e di gruppo, mentre l'[ADR 0027](0027-la-libreria-mls.md) e l'[ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) hanno definito l'architettura crittografica `ESTIA-E2E-v1` (NIST P-256 ECDSA/ECDH, AES-GCM-256, PBKDF2 e KeyPackage).

Nel client web (`apps/web`), la crittografia si appoggia all'API standard del browser `window.crypto.subtle` (WebCrypto API). Tuttavia, in ambiente mobile React Native (motore JavaScript Hermes su iOS):

1. `window.crypto.subtle` non è disponibile nativamente nel runtime JavaScript.
2. I browser impongono il blocco "Secure Context" su connessioni HTTP in LAN (es. `http://192.168.1.x:3000`), mentre il client mobile nativo deve poter comunicare e cifrare su HTTP in LAN senza certificati TLS o domini esterni.
3. Le chiavi private del dispositivo e le chiavi di conversazione non devono risiedere in file di testo in chiaro (`AsyncStorage`), ma nel **Keychain hardware protetto** del sistema operativo.

## Decisione

1. **Librerie crittografiche auditate in TypeScript puro (`@noble`)**:
   - Per le curve ellittiche NIST P-256 (ECDSA per le firme e ECDH per lo scambio chiavi): `@noble/curves/p256`.
   - Per la cifratura simmetrica autenticata (AES-GCM-256): `@noble/ciphers/aes` (o `@noble/ciphers/webcrypto`).
   - Per la derivazione chiavi (PBKDF2, SHA-256): `@noble/hashes`.
   - Tutte le librerie sono distribuite sotto licenza permissiva **MIT**, pienamente compatibile con AGPL-3.0 ([ADR 0015](0015-licenza-agpl.md)), prive di codice nativo binario instabile o dipendenze C++, e testate formalmente contro i vettori di test NIST/RFC.

2. **Interoperabilità al 100% con `ESTIA-E2E-v1`**:
   - I formati delle chiavi pubbliche (SPKI Base64 contenente `{ sig: string, kx: string }`), dei KeyPackage monouso e delle buste cifrate (IV 12 byte + Ciphertext + Tag 16 byte) sono identici a quelli prodotti e consumati dal client web.
   - Un messaggio inviato da iPhone viene decifrato senza alcuna conversione dal client web, e viceversa.

3. **Custodia sicura nel Keychain di iOS**:
   - L'identità crittografica del dispositivo (`publicKey`, `privateKey`, `ecdhPrivateKey`) e la cache delle chiavi di conversazione derivate vengono memorizzate esclusivamente nel Keychain di iOS tramite `expo-secure-store`.
   - Il backup e ripristino delle chiavi personali avviene mediante cifratura con passphrase (PBKDF2 con 600.000 iterazioni + AES-GCM-256) caricata su richiesta sul server, conformemente ad [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md).

## Conseguenze

### Positive

- Cifratura E2E completa e reale su iPhone, anche su connessione locale in chiaro `http://` verso l'istanza.
- Zero codice nativo C/C++ da compilare per la crittografia: bundle leggero, riproducibile e stabile.
- Massima sicurezza a riposo: le chiavi private risiedono nel Keychain crittografato dal Secure Enclave del dispositivo.

### Negative / Vincoli

- La derivazione PBKDF2 per il ripristino del backup con 600.000 iterazioni impiega ~500ms su CPU mobile durante l'operazione di ripristino, costo ampiamente accettabile per un'operazione una-tantum.
