# ADR 0033 — Risoluzione della divergenza delle chiavi e auto-riparazione nella messaggistica E2E

- Stato: **Accepted**
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0027](0027-la-libreria-mls.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0032](0032-payload-messaggi-strutturato-e2e.md)
- Attua: Milestone M6 (Conversazioni E2E e robustezza crittografica)

## Contesto

In M6 Fase 2, la messaggistica 1:1 deriva la chiave di cifratura simmetrica AES-GCM-256 tramite protocollo Diffie-Hellman su curve ellittiche (ECDH P-256) tra la chiave privata del dispositivo locale e la chiave pubblica registrata dell'interlocutore.

Nel modello iniziale:

1. La chiave derivata veniva salvata in IndexedDB per conversazione (`conv_keys`) in modo statico.
2. Quando un membro effettuava un nuovo login o apriva un nuovo browser, veniva generata una nuova coppia di chiavi per il nuovo dispositivo.
3. Se l'interlocutore aveva già in cache la vecchia chiave derivata, continuava a cifrare con quella, mentre il nuovo dispositivo non poteva decifrare tali buste, producendo un `[Errore di decifrazione]` irreversibile per entrambi gli utenti.
4. Mancava un meccanismo per recuperare la chiave pubblica di uno specifico dispositivo associato all'ID `senderDeviceId` presente nei metadati del messaggio.

## Decisione

1. **Endpoint per chiave pubblica di uno specifico dispositivo**:
   - Viene aggiunta la rotta `GET /api/v1/dispositivi/:deviceId/chiave-pubblica` che restituisce la chiave pubblica associata al `deviceId` registrato.
   - Questo consente a qualsiasi membro della conversazione di derivare la chiave per un messaggio storico inviato da uno specifico dispositivo.

2. **Cache con metadati del dispositivo e auto-riparazione sul client**:
   - La memorizzazione locale in IndexedDB (`conv_keys`) viene estesa per includere `{ jwk, peerDeviceId, updatedAt }`, mantenendo compatibilità retroattiva con i record precedenti.
   - Quando `tryDecryptMessageBody` fallisce:
     a. Il client tenta la **ri-derivazione automatica** (`rederiveConversationKey`) contattando il server per ottenere la chiave attiva più recente del peer.
     b. Se fallisce, tenta la derivazione puntuale (`deriveKeyForDevice`) usando il `senderDeviceId` del messaggio.
     c. Se la decifratura ha successo, aggiorna la chiave attiva della conversazione.

3. **Trattamento esplicito dei messaggi storici non decifrabili**:
   - I fallimenti di decifratura non vengono più mascherati con stringhe generiche.
   - L'interfaccia spiega chiaramente all'utente che il messaggio è stato cifrato con una chiave precedente o da un'altra sessione e che per visualizzarlo è necessario ripristinare il backup delle chiavi con passphrase (ADR 0028).

## Conseguenze

### Positive

- La comunicazione riprende automaticamente anche se uno degli utenti cambia sessione, browser o dispositivo, senza bloccare la chat.
- Risolve completamente il blocco sistematico di decifratura senza indebolire il modello zero-knowledge del server.

### Negative / Vincoli

- I singoli messaggi scambiati prima di un cambio chiave, in assenza di ripristino da backup, rimangono indecifrabili per costruzione crittografica (zero plaintext sul server).
