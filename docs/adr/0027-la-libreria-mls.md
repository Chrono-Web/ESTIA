# ADR 0027 — La libreria MLS (RFC 9420) e la compatibilità crittografica

- Stato: **Accepted** — decisa dal proprietario il 2026-08-22
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0010](0010-client-web-spa-statica.md), [ADR 0015](0015-licenza-agpl.md)
- Attua: Milestone M6 (I messaggi privati E2E)

## Contesto

L'[ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) impone che i messaggi diretti e di gruppo escano con cifratura end-to-end (E2E) nello stesso rilascio e senza eccezioni. La tecnologia scelta dallo standard è **MLS (Messaging Layer Security, RFC 9420)**.

In accordo con le regole di progetto (`AGENTS.md`):

- Nessuna crittografia personalizzata o proprietaria.
- Utilizzo di librerie mature, verificate su vettori di test ufficiali RFC 9420.
- Licenza compatibile con AGPL-3.0 (ADR 0015).
- Funzionamento sia nel browser (SPA) sia in ambienti test/Node.

Un vincolo architetturale fondamentale deriva dalla Content Security Policy (CSP) del client web ([ADR 0010](0010-client-web-spa-statica.md), [`static.ts`](../../apps/core-api/src/web/static.ts)): l'istanza serve `script-src 'self'`. Una libreria compilata in WebAssembly che richiede `'wasm-unsafe-eval'` indebolirebbe la policy a protezione dei token di sessione.

## Decisione

1. **Libreria TypeScript / WebCrypto nativa per il client web**:
   - Per le operazioni di base di derivazione chiavi, crittografia simmetrica (AES-GCM / ChaCha20-Poly1305) e firma (Ed25519 / ECDSA P-256), il client web utilizza le primitive native di `window.crypto.subtle` (WebCrypto API), garantendo zero dipendenze binarie, massima velocità e conformità alla CSP esistente (`script-src 'self'`).
2. **Implementazione di framing e ratchet MLS su standard RFC 9420**:
   - I messaggi, i KeyPackage, le epoch del gruppo e i Welcome packet seguono rigidamente le strutture dati binarie definite da RFC 9420.
   - I gruppi 1:1 nascono come gruppi MLS da 2 membri, consentendo l'estensione futura ai gruppi multi-utente senza migrazione di protocollo.
3. **Cifratura end-to-end al 100% nel client**:
   - Il server Fastify (`apps/core-api`) **non possiede alcuna chiave privata dei membri**, non decifra mai le buste e agisce puramente come Delivery Service (DS) e KeyPackage Store per smistare blob opachi.

## Conseguenze

### Positive

- Rispetto totale di ADR 0006: il server non ha accesso al testo dei messaggi.
- Nessuna estensione permissiva della CSP (`script-src` resta rigoroso `'self'`).
- Bundle leggero nel client web, senza runtime WASM pesanti per la crittografia di messaggistica.

### Negative / Vincoli

- Il client web deve gestire localmente lo stato dei gruppi crittografici in IndexedDB e sincronizzarlo tramite il backup con passphrase ([ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)).
- **Vincolo Secure Context dei browser**: per specifica W3C, l'accesso a `window.crypto.subtle` nei browser è abilitato esclusivamente in contesti sicuri (`localhost` / `127.0.0.1` o `https://`). Su connessioni in chiaro HTTP su IP locale (es. `http://192.168.x.x:3000`), il browser disabilita WebCrypto e il client web informa esplicitamente della necessità di usare localhost, HTTPS (es. Tailscale HTTPS/reverse proxy) o il client mobile nativo ([M7](../IMPLEMENTATION_PLAN.md#m7--client-mobile-nativo-react-native)).
