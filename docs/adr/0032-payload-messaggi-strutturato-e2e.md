# ADR 0032 — Payload strutturato per i messaggi privati E2E

- Stato: **Accepted**
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0029](0029-un-messaggio-si-consegna.md)
- Attua: Milestone M6 (Federazione dei messaggi privati)

## Contesto

In Fase 0 della Milestone M6, il contenuto cifrato (`chiaro`) all'interno della busta E2E scambiata tra i dispositivi era una semplice stringa UTF-8.
Con l'introduzione della funzionalità di risposta (_reply_) ai messaggi, è necessario che il messaggio trasporti non solo il testo scritto dall'utente, ma anche un riferimento inequivocabile al messaggio a cui si sta rispondendo.

Inserire il riferimento (`replyTo`) in chiaro fuori dalla busta violerebbe il principio che i metadati sociali delle conversazioni private non debbano essere analizzabili dai server intermedi.

## Decisione

1. **Il payload crittografico passa a JSON**: Il contenuto cifrato e autenticato (tramite AES-GCM) non sarà più una stringa grezza, ma la rappresentazione testuale di un oggetto JSON.
2. **Schema Base del Payload**:
   ```json
   {
     "v": 1,
     "text": "Il testo del messaggio",
     "replyTo": "id-del-messaggio-opzionale"
   }
   ```
3. **Retrocompatibilità Tollerante**: Durante la decifrazione (Fase 1), se il testo in chiaro non inizia per `{` e non può essere parsato come JSON, verrà considerato testualmente come una stringa. Questo garantisce che i primissimi messaggi generati nella Fase 0 continuino a essere leggibili senza errori.
4. **Sicurezza**: Il server non può né leggere né alterare il campo `replyTo`, garantendo l'integrità del contesto conversazionale.

## Conseguenze

### Positive

- Piena coerenza con il modello E2E: i server non conoscono la topologia o i legami interni ai messaggi di una chat.
- L'utilizzo di un payload JSON estensibile (`v: 1`) preparerà agevolmente la strada a futuri arricchimenti, come le menzioni e gli allegati.

### Negative

- Leggero overhead nel peso della busta dovuto alla formattazione JSON.
