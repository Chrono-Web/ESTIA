# ADR 0034 — Distinzione tra dispositivo fisico e sessione di login

- Stato: **Accepted** — decisa il 2026-08-23
- Data: 2026-08-23
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0009](0009-recupero-accesso-amministratore.md), [ADR 0010](0010-client-web-spa-statica.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)
- Attua: Milestone M1.2/M6 (Gestione dispositivi e sessioni)

## Contesto

In ESTIA, l'interfaccia delle impostazioni espone una sezione intitolata _«Dispositivi collegati»_.
Fino a questa decisione:

1. Ogni volta che un membro effettuava il login via browser o app (`POST /api/v1/auth/login`), il backend creava un nuovo record nella tabella `sessions`.
2. Se il browser veniva riavviato, o se l'utente effettuava nuovamente il login dopo una pulizia locale o da una nuova scheda, la sessione precedente rimaneva aperta nel database dell'istanza come sessione attiva valida.
3. Di conseguenza, un membro che usava solo due dispositivi fisici (un Computer e un Telefono) si ritrovava con decine di voci duplicate (_«Computer»_, _«Computer»_, _«Telefono»_...) nella lista dei dispositivi collegati.

Questo disallineamento tra il modello mentale dell'utente (che possiede 1 Computer e 1 Telefono) e il modello di archiviazione delle sessioni generava confusione e impediva di comprendere quali dispositivi fisici reali fossero effettivamente attivi.

## Decisione

1. **Associazione della sessione al dispositivo fisico al login**:
   - Al momento del login (`/api/v1/auth/login`), il client invia l'etichetta del dispositivo (`deviceLabel`, es. `Computer` o `Telefono`) e opzionalmente un identificatore di installazione/dispositivo.
   - Quando il server riceve una richiesta di login valida per un utente con una data etichetta di dispositivo, **revoca automaticamente le sessioni precedenti attive appartenenti allo stesso dispositivo/etichetta** (`sessions.revokeByDeviceLabel`) prima di creare la nuova sessione.
2. **Uno stato per dispositivo fisico**:
   - Ogni dispositivo fisico possiede al più una sessione attiva contemporaneamente per lo stesso utente.
   - L'elenco _«Dispositivi collegati»_ riflette così fedelmente l'insieme dei dispositivi fisici autorizzati ad accedere all'istanza.
3. **Rispetto della baseline di sicurezza (SECURITY_BASELINE §3)**:
   - La revoca della vecchia sessione del dispositivo è immediata: il token precedente cessa di essere valido all'istante.
   - I token di sessione rimangono memorizzati esclusivamente sotto forma di hash SHA-256 nel database.

## Conseguenze

### Positive

- L'elenco _«Dispositivi collegati»_ rispecchia esattamente i dispositivi fisici dell'utente (es. 1 Computer e 1 Telefono), senza accumulare righe orfane a ogni login.
- Migliora la sicurezza: vecchie sessioni dimenticate aperte su uno stesso browser non restano attive a tempo indeterminato sul server.
- L'esperienza utente è coerente con le euristiche di usabilità e feedback di sistema.

### Negative / Vincoli

- Se un utente utilizza intenzionalmente due browser diversi sullo stesso computer con la stessa etichetta generica `Computer`, il login sul secondo browser invaliderà la sessione del primo a meno che non assegni un'etichetta o identificativo distinto.
