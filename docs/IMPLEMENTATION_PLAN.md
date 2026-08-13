# Piano di implementazione

Questo piano copre la **Fase 1** del piano di progetto di luglio 2026 e la espande. Le Fasi 2–4 di quel documento sono elencate in fondo con la loro destinazione. Il rapporto tra i due percorsi è fissato in [`RECONCILIATION.md`](RECONCILIATION.md).

## Regole di avanzamento

- È attiva soltanto la prima milestone non completata.
- **Eccezione motivata:** due milestone di spike possono procedere in parallelo quando non condividono alcuna superficie di decisione e una delle due dipende da hardware o condizioni di rete non immediatamente disponibili. Oggi l'eccezione si applica a M0.2 e M0.3, e solo a quelle.
- Una milestone non è completata se il percorso principale dipende da mock.
- Ogni milestone termina con test, documentazione e un comando riproducibile.
- Le caselle vengono aggiornate solo dopo la verifica dei criteri di accettazione.
- I budget di esperienza di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4 sono criteri di gate, non aspirazioni: una milestone funzionalmente completa che li manca non è completata.
- Ricerca con utenti e reclutamento del pilot non rientrano in questo piano tecnico. I budget di esperienza sì.

## Stato corrente

| Milestone | Stato                   |
| --------- | ----------------------- |
| M0.1      | Completata (2026-07-15) |
| M0.2      | **Attiva**              |
| M0.3      | **Attiva in parallelo** |
| M0.4      | Bloccata da M0.2 e M0.3 |
| M1 → M3   | Non iniziate            |

## M0 — Fondazioni e rischi architetturali

### M0.1 — Bootstrap riproducibile della repository

Stato: **completata**

- [x] Monorepo `pnpm` inizializzato e versioni fissate.
- [x] TypeScript strict, formatter, lint, typecheck e test configurati.
- [x] `apps/core-api` con Fastify e health endpoint.
- [x] `packages/config`, `packages/contracts`, `packages/testing` minimi.
- [x] Container multi-stage non-root.
- [x] Compose minimale con health check.
- [x] `.env.example`, `.gitignore` e istruzioni locali.
- [x] Test automatici e smoke test documentati.

Criteri di accettazione:

1. Da un clone pulito, installazione, build, lint, typecheck e test terminano con successo.
2. Il container parte senza privilegi, risponde a liveness/readiness e si arresta correttamente.
3. Nessuna dipendenza frontend, database o rete privata è stata aggiunta prematuramente.

Chiusura (2026-08-13). Verifica rieseguita con esito positivo. Rilievi sanati in sede di chiusura:

- rimossi i residui non versionati del prototipo di aprile 2026 (`.data/`, `.logs/`), che contenevano token di sessione e un hash di password non conforme alla baseline;
- la documentazione era esclusa dal controllo di formattazione: `docs/`, `AGENTS.md` e `AI_START_PROMPT.md` rientrano ora in `pnpm format`;
- il criterio 1 non era verificato automaticamente a ogni modifica: aggiunta una pipeline che lo esegue da clone pulito.

### M0.2 — Spike della rete privata

Stato: **attiva**

È il rischio che può invalidare il prodotto: se nessuna topologia soddisfa revoca affidabile, mobilità e CGNAT, cambia la promessa di ESTIA, non solo la sua implementazione. Ambiente e protocollo sperimentale in [`infra/network-lab/`](../infra/network-lab/README.md).

- [ ] Ambiente ripetibile in `infra/network-lab`.
- [ ] Inventario delle opzioni dell'ADR 0001 con versioni e licenze.
- [ ] Headscale e client Tailscale provati in una topologia raggiungibile.
- [ ] Primo contatto, registrazione, revoca e rotazione provati.
- [ ] Percorso diretto e percorso relay distinti nei log dell'esperimento.
- [ ] Test su LAN, rete mobile e scenario CGNAT reale o emulato.
- [ ] Misure minime: tempo di connessione, riconnessione, latenza, banda e stato dopo revoca.
- [ ] Micro-prototipo mobile nativo separato dall'app di prodotto, per stimare l'opzione B su iOS e Android.
- [ ] ADR 0001 aggiornato con evidenze e decisione oppure con blocchi espliciti.

Criteri di accettazione:

1. Un dispositivo autorizzato raggiunge un servizio sul NAS; uno revocato non lo raggiunge.
2. La revoca produce perdita effettiva di accesso entro il budget di 1 minuto, misurata e non stimata.
3. È documentato dove risiedono control plane, data plane e relay.
4. È chiaro quali metadati vede ogni componente.
5. La soluzione scelta non viene descritta come «WireGuard + Headscale» senza precisare il tipo di client.
6. Ogni misura è riproducibile da un terzo seguendo il solo `infra/network-lab/README.md`.

### M0.3 — Spike SQLite e multi-arch

Stato: **attiva in parallelo** — non condivide decisioni con M0.2 e non richiede hardware di rete.

- [ ] Confronto breve tra driver/query builder compatibili con TypeScript.
- [ ] Migrazione di prova, transazione, foreign key e backup consistente.
- [ ] Build o esecuzione verificata su `linux/amd64` e `linux/arm64`.
- [ ] Verifica che gli invarianti di dominio dell'ADR 0002 siano esprimibili come vincoli reali nello schema.
- [ ] ADR per la scelta di persistenza.

Criteri di accettazione:

1. Il database viene creato e migrato da zero.
2. Backup e restore conservano i dati di prova.
3. La dipendenza scelta non rende opaca o fragile la build ARM64.
4. Identificatori opachi e scope obbligatorio sono rappresentabili senza artifici.

### M0.4 — Baseline di sicurezza e threat model

Stato: **bloccata da M0.2 e M0.3**

- [ ] Confini di fiducia documentati.
- [ ] Inventario dei segreti e loro ciclo di vita.
- [ ] Modello delle minacce per NAS, telefono, control plane e relay.
- [ ] Strategia di cifratura a riposo: volume cifrato come opzione raccomandata dall'installazione, con alternativa a livello di database dove il volume non è cifrabile.
- [ ] Strategia di backup cifrato con chiave distinta da quella dell'istanza.
- [ ] Policy dei log e dei dati diagnostici.
- [ ] Procedura di aggiornamento e rollback iniziale.

## M1 — Istanza locale e identità

### M1.1 — Configurazione e identità dell'istanza

- [ ] Creazione dell'istanza al primo avvio.
- [ ] Nome, descrizione, identificatore stabile e configurazione locale.
- [ ] Migrazioni e repository SQLite reali.
- [ ] API amministrative protette.
- [ ] Test che verificano gli invarianti dell'ADR 0002 sullo schema effettivo.

### M1.2 — Account, sessioni e ruoli

- [ ] Registrazione controllata da invito.
- [ ] Password Argon2id.
- [ ] Login e logout.
- [ ] Sessioni per dispositivo e revoca.
- [ ] Recupero dell'accesso senza canale centrale e senza indebolire la baseline.
- [ ] Ruoli admin, moderatore e membro.
- [ ] Rate limiting e test negativi di autorizzazione.

### M1.3 — Inviti e provisioning

- [ ] Inviti monouso e riutilizzabili con scadenza.
- [ ] Vetrina d'istanza per l'invitato: nome, descrizione, numero di membri e regole, **senza esporre l'elenco dei membri**.
- [ ] Richiesta e approvazione amministrativa.
- [ ] Collegamento al provisioning di rete mediante interfaccia, non SDK concreto nel dominio.
- [ ] Account e accesso di rete provisionati come singola operazione per l'utente finale.
- [ ] Audit degli eventi amministrativi.

### M1.4 — Dashboard amministrativa minima

- [ ] Next.js aggiunto solo ora al workspace.
- [ ] Login amministratore.
- [ ] Membri, inviti, sessioni/dispositivi e revoca.
- [ ] Revoca di sessione e accesso di rete come gesto unico, con esito verificabile.
- [ ] Stato dell'istanza e diagnostica sicura.

Gate M1:

1. Un amministratore installa un'istanza, crea un invito e approva un account.
2. Il membro accede soltanto attraverso il percorso di rete autorizzato.
3. La revoca di sessione e accesso di rete è verificata separatamente e rientra nel budget di 1 minuto.
4. Backup e restore preservano istanza, utenti e configurazione.

## M2 — Feed locale verticale

### M2.1 — Post testuali

- [ ] Dominio post con scope `local` obbligatorio di default.
- [ ] Creazione, lettura, timeline paginata e cancellazione.
- [ ] Autorizzazione locale e moderazione.
- [ ] Test di mappatura del post verso `Note`, come funzione pura sul dominio (ADR 0002).

### M2.2 — Commenti e reazioni

- [ ] Commenti e relazioni padre.
- [ ] Like, con conteggi coerenti e senza effetti sull'ordinamento.
- [ ] Conteggi coerenti e cancellazione/moderazione.
- [ ] Test di accesso tra account autorizzati e revocati.

### M2.3 — Immagini

- [ ] Adapter filesystem.
- [ ] Upload temporaneo, validazione e commit atomico.
- [ ] Thumbnail e metadati.
- [ ] Quote e cleanup.
- [ ] Il server accetta immagini già compresse dal client e rifiuta gli originali oltre soglia, senza dipendere dal transcoding lato NAS.

### M2.4 — Client mobile minimo

- [ ] React Native con build nativa riproducibile.
- [ ] Login, stato della rete, timeline, pubblicazione e commenti.
- [ ] Compressione delle immagini lato client prima dell'upload.
- [ ] Sblocco biometrico dell'app.
- [ ] Nessuna superficie pubblica o chat.
- [ ] Gestione offline limitata e stati d'errore espliciti.

Gate M2:

1. Su un NAS reale, più dispositivi autorizzati pubblicano e commentano.
2. Nessuna API del feed è raggiungibile dopo la revoca prevista dal modello.
3. I media sopravvivono a restart e restore.
4. Tutti i contenuti creati in questa fase hanno scope `local` verificabile.
5. Un membro non tecnico completa il percorso dal link d'invito al feed popolato in meno di 3 minuti, senza assistenza e senza toccare configurazioni.
6. La pubblicazione di una foto da rete mobile non degrada per la CPU del NAS: la compressione avviene sul client.

## M3 — Robustezza operativa

- [ ] Installazione guidata e diagnostica hardware/rete.
- [ ] L'installazione propone la cifratura del volume dati come opzione raccomandata e documenta le conseguenze del rifiuto.
- [ ] Aggiornamento con migrazioni e rollback documentato.
- [ ] Backup automatico cifrato con chiave distinta, e restore provato.
- [ ] Quote, cleanup, rate limiting e hardening.
- [ ] Build multi-arch pubblicabile.
- [ ] Guida per almeno due classi di hardware reale.

Gate M3:

1. Un amministratore installa un'istanza su hardware reale in meno di 30 minuti, seguendo la sola documentazione.
2. Un restore da backup cifrato ripristina istanza, membri, contenuti e media.

## Milestone successive, non autorizzate ora

L'ordine è indicativo e richiederà un nuovo piano tecnico prima dell'implementazione. Corrispondono alle Fasi 2–4 del piano di progetto.

1. ActivityPub, profilo pubblico e feed follower.
2. Esposizione HTTPS, relay, peering tra istanze e anti-abuso federato.
3. Chat, DM e gruppi, con decisione esplicita sul livello di confidenzialità; notifiche push APNs/FCM arrivano con questo blocco.
4. MLS per DM e gruppi.
5. Export/import e migrazione ActivityPub `Move`.
6. Governance opzionale.

Il rinvio del punto 3 è la scelta più costosa dal lato prodotto: le condizioni per riesaminarlo sono in [`RECONCILIATION.md`](RECONCILIATION.md) §7.
