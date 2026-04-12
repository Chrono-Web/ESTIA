# Piano di implementazione

## Regole di avanzamento

- È attiva soltanto la prima milestone non completata.
- Una milestone non è completata se il percorso principale dipende da mock.
- Ogni milestone termina con test, documentazione e un comando riproducibile.
- Le caselle vengono aggiornate solo dopo la verifica dei criteri di accettazione.
- Ricerca con utenti e reclutamento del pilot non rientrano in questo piano tecnico.

## M0 — Fondazioni e rischi architetturali

### M0.1 — Bootstrap riproducibile della repository

Stato: **da iniziare**

- [ ] Monorepo `pnpm` inizializzato e versioni fissate.
- [ ] TypeScript strict, formatter, lint, typecheck e test configurati.
- [ ] `apps/core-api` con Fastify e health endpoint.
- [ ] `packages/config`, `packages/contracts`, `packages/testing` minimi.
- [ ] Container multi-stage non-root.
- [ ] Compose minimale con health check.
- [ ] `.env.example`, `.gitignore` e istruzioni locali.
- [ ] Test automatici e smoke test documentati.

Criteri di accettazione:

1. Da un clone pulito, installazione, build, lint, typecheck e test terminano con successo.
2. Il container parte senza privilegi, risponde a liveness/readiness e si arresta correttamente.
3. Nessuna dipendenza frontend, database o rete privata è stata aggiunta prematuramente.

### M0.2 — Spike della rete privata

Stato: **bloccato da M0.1**

- [ ] Ambiente ripetibile in `infra/network-lab`.
- [ ] Inventario delle opzioni dell'ADR 0001 con versioni e licenze.
- [ ] Headscale e client Tailscale provati in una topologia raggiungibile.
- [ ] Primo contatto, registrazione, revoca e rotazione provati.
- [ ] Percorso diretto e percorso relay distinti nei log dell'esperimento.
- [ ] Test su LAN, rete mobile e scenario CGNAT reale o emulato.
- [ ] Misure minime: tempo di connessione, riconnessione, latenza, banda e stato dopo revoca.
- [ ] ADR 0001 aggiornato con evidenze e decisione oppure con blocchi espliciti.

Criteri di accettazione:

1. Un dispositivo autorizzato raggiunge un servizio sul NAS; uno revocato non lo raggiunge.
2. È documentato dove risiedono control plane, data plane e relay.
3. È chiaro quali metadati vede ogni componente.
4. La soluzione scelta non viene descritta come «WireGuard + Headscale» senza precisare il tipo di client.

### M0.3 — Spike SQLite e multi-arch

Stato: **bloccato da M0.1**

- [ ] Confronto breve tra driver/query builder compatibili con TypeScript.
- [ ] Migrazione di prova, transazione, foreign key e backup consistente.
- [ ] Build o esecuzione verificata su `linux/amd64` e `linux/arm64`.
- [ ] ADR per la scelta di persistenza.

Criteri di accettazione:

1. Il database viene creato e migrato da zero.
2. Backup e restore conservano i dati di prova.
3. La dipendenza scelta non rende opaca o fragile la build ARM64.

### M0.4 — Baseline di sicurezza e threat model

Stato: **bloccato da M0.2 e M0.3**

- [ ] Confini di fiducia documentati.
- [ ] Inventario dei segreti e loro ciclo di vita.
- [ ] Modello delle minacce per NAS, telefono, control plane e relay.
- [ ] Policy dei log e dei dati diagnostici.
- [ ] Procedura di aggiornamento e rollback iniziale.

## M1 — Istanza locale e identità

### M1.1 — Configurazione e identità dell'istanza

- [ ] Creazione dell'istanza al primo avvio.
- [ ] Nome, descrizione, identificatore stabile e configurazione locale.
- [ ] Migrazioni e repository SQLite reali.
- [ ] API amministrative protette.

### M1.2 — Account, sessioni e ruoli

- [ ] Registrazione controllata da invito.
- [ ] Password Argon2id.
- [ ] Login e logout.
- [ ] Sessioni per dispositivo e revoca.
- [ ] Ruoli admin, moderatore e membro.
- [ ] Rate limiting e test negativi di autorizzazione.

### M1.3 — Inviti e provisioning

- [ ] Inviti monouso e riutilizzabili con scadenza.
- [ ] Richiesta e approvazione amministrativa.
- [ ] Collegamento al provisioning di rete mediante interfaccia, non SDK concreto nel dominio.
- [ ] Audit degli eventi amministrativi.

### M1.4 — Dashboard amministrativa minima

- [ ] Next.js aggiunto solo ora al workspace.
- [ ] Login amministratore.
- [ ] Membri, inviti, sessioni/dispositivi e revoca.
- [ ] Stato dell'istanza e diagnostica sicura.

Gate M1:

1. Un amministratore installa un'istanza, crea un invito e approva un account.
2. Il membro accede soltanto attraverso il percorso di rete autorizzato.
3. La revoca di sessione e accesso di rete è verificata separatamente.
4. Backup e restore preservano istanza, utenti e configurazione.

## M2 — Feed locale verticale

### M2.1 — Post testuali

- [ ] Dominio post con scope `local` obbligatorio di default.
- [ ] Creazione, lettura, timeline paginata e cancellazione.
- [ ] Autorizzazione locale e moderazione.

### M2.2 — Commenti

- [ ] Commenti e relazioni padre.
- [ ] Conteggi coerenti e cancellazione/moderazione.
- [ ] Test di accesso tra account autorizzati e revocati.

### M2.3 — Immagini

- [ ] Adapter filesystem.
- [ ] Upload temporaneo, validazione e commit atomico.
- [ ] Thumbnail e metadati.
- [ ] Quote e cleanup.

### M2.4 — Client mobile minimo

- [ ] React Native con build nativa riproducibile.
- [ ] Login, stato della rete, timeline, pubblicazione e commenti.
- [ ] Nessuna superficie pubblica o chat.
- [ ] Gestione offline limitata e stati d'errore espliciti.

Gate M2:

1. Su un NAS reale, più dispositivi autorizzati pubblicano e commentano.
2. Nessuna API del feed è raggiungibile dopo la revoca prevista dal modello.
3. I media sopravvivono a restart e restore.
4. Tutti i contenuti creati in questa fase hanno scope `local` verificabile.

## M3 — Robustezza operativa

- [ ] Installazione guidata e diagnostica hardware/rete.
- [ ] Aggiornamento con migrazioni e rollback documentato.
- [ ] Backup automatico cifrabile e restore provato.
- [ ] Quote, cleanup, rate limiting e hardening.
- [ ] Build multi-arch pubblicabile.
- [ ] Guida per almeno due classi di hardware reale.

## Milestone successive, non autorizzate ora

L'ordine seguente è indicativo e richiederà un nuovo piano tecnico prima dell'implementazione:

1. ActivityPub e profilo pubblico.
2. Esposizione HTTPS, relay e anti-abuso federato.
3. Chat/DM con decisione esplicita sul livello di confidenzialità.
4. MLS per DM e gruppi.
5. Export/import e migrazione ActivityPub `Move`.
6. Governance opzionale.

