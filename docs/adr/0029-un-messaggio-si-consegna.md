# ADR 0029 — Un messaggio si consegna: deroga controllata alla visita dei contenuti

- Stato: **Accepted** — decisa dal proprietario il 2026-08-22
- Nota del 2026-08-28: [ADR 0043](0043-custodia-lato-mittente.md) ribalta la deroga del punto 1 per i messaggi privati. La busta continua a essere **consegnata** — è l'unico modo di rispettare la forward secrecy — ma sul server di chi riceve **si cancella appena il suo dispositivo l'ha presa**, e la cronologia non si replica: si **visita** a casa di chi ha scritto. Il segnaposto non si conserva, si deduce
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)
- Attua: Milestone M6 (Federazione dei messaggi privati)

## Contesto

L'[ADR 0018](0018-federazione-fra-istanze-estia.md) ha fissato come principio cardine per i post pubblici e la bacheca: **«i contenuti si visitano, non si replicano»**. Questo approccio garantisce la cancellazione reale e immediata dei post (spegnendo il server o togliendo il follow, il post sparisce ovunque).

Per la messaggistica privata asincrona diretta (1:1 o gruppi), questo modello non può funzionare:
Se un messaggio vivesse solo sul server del mittente, nel momento in cui il mittente spegne il proprio computer o perde connettività, il destinatario non riceverebbe e non potrebbe leggere la risposta. Un messaggio inviato deve poter essere recapitato alla casella postale (istanza) del destinatario.

## Decisione

1. **Deroga esplicita ad ADR 0018 per i messaggi privati**:
   - I messaggi privati non si visitano: **si consegnano**.
   - Il server del mittente recapita una **busta chiusa cifrata (BLOB)** al server del destinatario, che la conserva nel proprio database per i dispositivi del destinatario.
2. **Cosa vede chi ospita (I confini di ADR 0006 resi concreti)**:
   - L'amministratore dell'istanza del mittente e del destinatario vedono i metadati di trasporto: chi ha inviato la busta, a chi è destinata, quando è stata recapitata e la dimensione in byte.
   - **Nessuno dei due server può leggere il testo o gli allegati del messaggio**, perché il contenuto è cifrato con la chiave del gruppo MLS tra i soli dispositivi dei partecipanti.
3. **Cancellazione e revoca ("Elimina per tutti")**:
   - Poiché la busta è stata consegnata e duplicata sull'istanza del destinatario, **una busta consegnata non può essere richiamata forzatamente a livello fisico**.
   - L'azione "elimina per tutti" invia un messaggio di protocollo che richiede cortesemente all'istanza del destinatario di contrassegnare o rimuovere la busta, ma non può offrire la garanzia matematica della visita remota di ADR 0018.

## Conseguenze

### Positive

- I messaggi privati sono sempre disponibili e consultabili dal destinatario anche quando il mittente è offline.
- Piena coerenza con la cifratura E2E (l'host agisce da casella postale cieca).

### Negative / Vincoli

- Si accetta che una busta consegnata risieda fisicamente sull'istanza del destinatario fino a quando non viene eliminata.
