# Piano di implementazione

Questo piano copre la **Fase 1** del piano di progetto di luglio 2026 e la espande. Le Fasi 2–4 di quel documento sono elencate in fondo con la loro destinazione. Il rapporto tra i due percorsi è fissato in [`RECONCILIATION.md`](RECONCILIATION.md).

**Riorganizzato il 2026-08-14** dopo la chiusura dello spike di rete. Le decisioni che lo hanno cambiato sono [ADR 0003](adr/0003-primo-contatto-in-rete-locale.md) (primo contatto in rete locale), [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) (client web, trasporto sostituibile) e [ADR 0005](adr/0005-persistenza-node-sqlite.md) (persistenza).

## Regole di avanzamento

- È attiva soltanto la prima milestone non completata, salvo eccezioni dichiarate nella milestone stessa.
- Una milestone non è completata se il percorso principale dipende da mock.
- Ogni milestone termina con test, documentazione e un comando riproducibile.
- Le caselle vengono aggiornate solo dopo la verifica dei criteri di accettazione.
- I budget di esperienza di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4 sono criteri di gate, non aspirazioni.
- Ricerca con utenti e reclutamento del pilot non rientrano in questo piano tecnico. I budget di esperienza sì.

## Il cambio di rotta, in breve

Lo spike di rete ha stabilito che il control plane non serve: il primo contatto avviene sulla **rete locale**, dove non occorre alcuna infrastruttura di fiducia. Ne conseguono tre semplificazioni:

1. **M1 e M2 non richiedono alcuno strato di rete.** Sono HTTP su rete locale. Niente domini, niente certificati, niente port forwarding, niente VPN.
2. **Il primo client è web**, non mobile. Esce dalla strada critica il pezzo più costoso del piano.
3. **L'accesso da fuori casa diventa una milestone additiva** (M4), non un prerequisito.

## Stato corrente

| Milestone | Stato                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------- |
| M0.1      | Completata (2026-07-15, chiusa 2026-08-13)                                                          |
| M0.2      | **Chiusa** (2026-08-14) — esito: cambio di modello                                                  |
| M0.3      | **Completata** (2026-08-14) — [ADR 0005](adr/0005-persistenza-node-sqlite.md), con verifica residua |
| M0.4      | **Attiva** — da chiudere prima di M1.2                                                              |
| M1.1      | **Attiva**                                                                                          |
| M1.2 → M4 | Non iniziate                                                                                        |

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

Chiusura (2026-08-13). Verifica rieseguita con esito positivo. Rilievi sanati: rimossi i residui non versionati del prototipo di aprile 2026; la documentazione è rientrata nel controllo di formattazione; aggiunta una pipeline che verifica il criterio 1 da clone pulito.

### M0.2 — Spike della rete privata

Stato: **chiusa** — lo spike ha prodotto una decisione, e la decisione è stata cambiare il modello di accesso.

L'esito completo è nella chiusura di [ADR 0001](adr/0001-private-network-control-plane.md). In sintesi: il data plane non è un rischio (percorso diretto misurato, 0% di perdita, 151 ms), ma **ospitare il control plane sul NAS costa sette passaggi tecnici** all'amministratore, contro un budget di prodotto che ne prevede zero. La soluzione non è stata un control plane migliore, ma [ADR 0003](adr/0003-primo-contatto-in-rete-locale.md): il primo contatto in rete locale non ha bisogno di control plane.

Evidenze prodotte, conservate in [`infra/network-lab/results/`](../infra/network-lab/results/):

- [x] Inventario delle opzioni con versioni e licenze.
- [x] Percorso diretto e percorso relay distinti e misurati.
- [x] Test su LAN e rete mobile reale.
- [x] Misure di connessione e latenza, a caldo e a freddo.
- [x] ADR 0001 aggiornato con evidenze e chiuso con esito esplicito.

**Non misurato, spostato in M4** — da non dimenticare: comportamento sotto CGNAT su una linea reale, tempo effettivo di revoca, metadati conservati dal trasporto, integrazione del motore di rete in un'app mobile.

Il laboratorio [`infra/network-lab/`](../infra/network-lab/README.md) va rimosso o riconvertito quando inizia M4: è materiale dello spike chiuso.

### M0.3 — Persistenza

Stato: **completata** — [ADR 0005](adr/0005-persistenza-node-sqlite.md)

- [x] Confronto tra driver compatibili con TypeScript.
- [x] Verifica di chiavi esterne effettivamente applicate e API sincrona adeguata.
- [x] ADR per la scelta di persistenza.

La scelta è `node:sqlite`, integrato nel runtime: **nessun modulo nativo**, quindi il rischio che rendeva questa una milestone di spike — la fragilità della build su `linux/arm64` — non esiste più.

**Verifica residua**, da completare durante M1.1: ripetere le prove sul runtime di riferimento Node 24.18.0 e su `linux/arm64` reale.

### M0.4 — Baseline di sicurezza e threat model

Stato: **attiva** — deve chiudersi **prima di M1.2**, che è la milestone in cui compaiono i primi segreti reali (password, sessioni).

I confini di fiducia sono ora noti e molto più semplici di prima: nessuna esposizione pubblica, nessuna autorità di certificazione, nessun control plane di terzi.

- [ ] Confini di fiducia documentati, alla luce di ADR 0003 e 0004.
- [ ] Inventario dei segreti e loro ciclo di vita: chiave dell'istanza, chiavi dei dispositivi, hash delle password, token di sessione, codici d'invito.
- [ ] Modello delle minacce per NAS, dispositivo del membro, rete locale e trasporto remoto.
- [ ] Che cosa protegge la rete locale e che cosa **non** protegge: autentica il canale, non autorizza la persona.
- [ ] Strategia di cifratura a riposo: volume cifrato raccomandato dall'installazione, alternativa a livello di database dove il volume non è cifrabile.
- [ ] Strategia di backup cifrato con chiave distinta da quella dell'istanza.
- [ ] Permessi su file e directory dei dati: la directory nasce `0700` e la chiave privata `0600`, ma il file del database resta `0644` e da M1.2 conterrà gli hash delle password. Decidere la policy e applicarla.
- [ ] Policy dei log e dei dati diagnostici.
- [ ] Procedura di aggiornamento e rollback iniziale.

## M1 — Istanza locale e identità

Tutta M1 funziona **in rete locale**. Nessuna dipendenza di rete, nessun dominio, nessun trasporto.

### M1.1 — Istanza, identità e persistenza

Stato: **attiva**

- [x] Creazione dell'istanza al primo avvio, con stato «non configurata» finché l'amministratore non la completa.
- [x] Nome, descrizione, identificatore stabile e configurazione locale.
- [x] **Coppia di chiavi dell'istanza** generata al primo avvio e conservata come identità permanente (ADR 0003).
- [x] Schema SQLite con migrazioni versionate, chiavi esterne attive, date UTC.
- [x] Repository di persistenza sostituibili, come impone `ARCHITECTURE.md` §4.
- [x] Codice di configurazione monouso per il primo avvio: stare sulla rete locale non basta per rivendicare un'istanza (ADR 0003, requisito 3).
- [x] Test che verificano gli invarianti dell'[ADR 0002](adr/0002-activitypub-confine-non-schema.md) sullo schema effettivo. Il default `local` sullo scope sarà verificabile da M2.1, quando esisteranno contenuti.
- [ ] Verifica di `node:sqlite` su Node 24.18.0 e `linux/arm64` (residuo di M0.3) — richiede Docker, non ancora eseguita.
- [ ] Scoperta dell'istanza sulla rete locale con un nome comprensibile (ADR 0003, requisito 2).

Criteri di accettazione:

1. Da un volume vuoto, l'istanza si crea, migra lo schema e riparte conservando la propria identità.
2. La chiave privata dell'istanza non compare nei log né nelle risposte delle API.
3. Nessuna chiave primaria o vincolo di unicità dipende da username o dominio.
4. Un contenuto creato senza scope esplicito risulta `local`.

### M1.2 — Account, sessioni e ruoli

Bloccata da M0.4.

- [ ] Registrazione controllata da invito.
- [ ] Password Argon2id.
- [ ] Login e logout.
- [ ] Sessioni per dispositivo e revoca.
- [ ] Recupero dell'accesso senza canale centrale e senza indebolire la baseline.
- [ ] Ruoli admin, moderatore e membro.
- [ ] Rate limiting e test negativi di autorizzazione.

### M1.3 — Ammissione e dispositivi

- [ ] Scoperta dell'istanza sulla rete locale con un nome comprensibile.
- [ ] Inviti monouso e riutilizzabili con scadenza.
- [ ] Vetrina d'istanza per l'invitato: nome, descrizione, numero di membri e regole, **senza esporre l'elenco dei membri**.
- [ ] Richiesta e approvazione amministrativa: **stare sulla rete locale non basta per entrare** (ADR 0003).
- [ ] Registrazione della chiave del dispositivo presso l'istanza; la lista dei dispositivi autorizzati è l'unica fonte di verità per la revoca.
- [ ] L'interfaccia dichiara con quale percorso è avvenuto il primo contatto.
- [ ] Audit degli eventi amministrativi.

### M1.4 — Client web: accesso e amministrazione

- [ ] Applicazione web aggiunta ora al workspace, **una sola** per membri e amministrazione (ADR 0004).
- [ ] Login, sessione, logout.
- [ ] Sezioni amministrative protette dal ruolo: membri, inviti, dispositivi, revoca.
- [ ] Stato dell'istanza e diagnostica sicura.

Gate M1:

1. Un amministratore installa un'istanza sul NAS, apre il browser dalla rete di casa, crea l'istanza e un invito.
2. Una seconda persona sulla stessa rete entra con l'invito, dopo approvazione esplicita.
3. La revoca di un dispositivo gli impedisce l'accesso, verificata e non stimata.
4. Backup e restore preservano istanza, identità, utenti e configurazione.

## M2 — Feed locale verticale

### M2.1 — Post testuali

- [ ] Dominio post con scope `local` obbligatorio di default.
- [ ] Creazione, lettura, timeline paginata e cancellazione.
- [ ] Autorizzazione locale e moderazione.
- [ ] Test di mappatura del post verso `Note`, come funzione pura sul dominio (ADR 0002).

### M2.2 — Commenti e reazioni

- [ ] Commenti e relazioni padre.
- [ ] Like, con conteggi coerenti e senza effetti sull'ordinamento.
- [ ] Cancellazione e moderazione.
- [ ] Test di accesso tra account autorizzati e revocati.

### M2.3 — Immagini

- [ ] Adapter filesystem.
- [ ] Upload temporaneo, validazione e commit atomico.
- [ ] Thumbnail e metadati.
- [ ] Quote e cleanup.
- [ ] Compressione lato client prima dell'invio; il server rifiuta gli originali oltre soglia.

### M2.4 — Client web: feed

- [ ] Timeline, pubblicazione, commenti, like.
- [ ] Caricamento immagini con compressione nel browser.
- [ ] Nessuna superficie pubblica, nessuna chat.
- [ ] Stati d'errore espliciti; la prima richiesta dopo l'inattività non blocca l'interfaccia.

Gate M2:

1. Su un NAS reale, più persone dalla rete locale pubblicano e commentano.
2. Nessuna API del feed è raggiungibile dopo la revoca.
3. I media sopravvivono a restart e restore.
4. Tutti i contenuti creati hanno scope `local` verificabile.
5. Una persona non tecnica completa il percorso dall'invito al feed popolato senza assistenza e senza toccare configurazioni.

## M3 — Robustezza operativa

- [ ] Installazione guidata e diagnostica.
- [ ] L'installazione propone la cifratura del volume dati come opzione raccomandata e documenta le conseguenze del rifiuto.
- [ ] Aggiornamento con migrazioni e rollback documentato.
- [ ] Backup automatico cifrato con chiave distinta, e restore provato.
- [ ] Quote, cleanup, rate limiting e hardening.
- [ ] Build multi-arch pubblicabile.
- [ ] Guida per almeno due classi di hardware reale.

Gate M3: un amministratore installa un'istanza su hardware reale in meno di 30 minuti seguendo la sola documentazione, e un restore da backup cifrato ripristina tutto.

## M4 — Accesso da fuori dalla rete locale

Milestone additiva: il prodotto è già utilizzabile senza di essa. Riprende ciò che M0.2 ha lasciato non misurato.

- [ ] Trasporto del pilot documentato e dichiarato ai partecipanti (Tailscale, ADR 0004).
- [ ] Prova del trasporto peer-to-peer a chiavi: due nodi che si trovano senza dominio né port forwarding.
- [ ] **Revoca nel modello a chiavi**: misura del tempo effettivo di perdita dell'accesso, budget 60 secondi.
- [ ] Comportamento sotto CGNAT su una linea reale.
- [ ] Metadati conservati dal trasporto scelto.
- [ ] ADR sulla scelta definitiva del trasporto.

## Milestone successive, non autorizzate ora

Richiedono un nuovo piano tecnico prima dell'implementazione.

1. Client mobile, con l'integrazione del motore di rete già collaudata su desktop.
2. Chat, DM e gruppi; le notifiche push arrivano con questo blocco.
3. Profilo pubblico e federazione ActivityPub, **opzionale per istanza**: solo chi vuole affacciarsi sul Fediverso adotta un dominio (ADR 0002).
4. Indice dei profili pubblici, per la ricerca di persone tra istanze.
5. MLS per DM e gruppi.
6. Export/import e migrazione ActivityPub `Move`.
7. Governance opzionale.

Le condizioni per riesaminare il rinvio della chat sono in [`RECONCILIATION.md`](RECONCILIATION.md) §7.
