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
| M0.4      | **Completata** (2026-08-14) — [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md)                        |
| M1.1      | Completata, salvo due voci residue di verifica                                                      |
| M1.2      | **Completata** (2026-08-14) — account, sessioni, ruoli, recupero                                    |
| M1.3      | **Completata** (2026-08-14) — inviti, ammissione, audit; tre voci spostate a M3/M4                  |
| M1.4      | **Completata** (2026-08-14) — client web                                                            |
| M2        | **Attiva** — feed locale verticale                                                                  |
| M3 → M4   | Non iniziate                                                                                        |

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

Stato: **completata** (2026-08-14) — [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md)

I confini di fiducia si sono semplificati con ADR 0003 e 0004: nessuna esposizione pubblica, nessuna autorità di certificazione, nessun control plane di terzi.

- [x] Confini di fiducia documentati, alla luce di ADR 0003 e 0004.
- [x] Inventario dei segreti e loro ciclo di vita: chiave dell'istanza, chiavi dei dispositivi, hash delle password, token di sessione, codici d'invito.
- [x] Modello delle minacce per NAS, dispositivo del membro, rete locale e trasporto remoto.
- [x] Che cosa protegge la rete locale e che cosa **non** protegge: autentica il canale, non autorizza la persona.
- [x] Strategia di cifratura a riposo, in tre livelli, con il terzo dichiarato apertamente come scoperto.
- [x] Strategia di backup cifrato con chiave distinta da quella dell'istanza.
- [x] Permessi su file e directory dei dati: decisi, applicati dal codice e verificati da test.
- [x] Policy dei log e dei dati diagnostici, con l'unica eccezione deliberata resa esplicita.
- [x] Procedura di aggiornamento e rollback iniziale.

Vincoli che ne derivano per **M1.2 e M1.3**, da non riscoprire più tardi:

1. Token di sessione e codici d'invito si conservano **solo come hash**: leggere il database non deve produrre una credenziale utilizzabile.
2. Nessun endpoint concede privilegi in base all'indirizzo IP: la provenienza dalla rete locale non è mai una credenziale.
3. La revoca chiude attivamente le connessioni aperte, non attende la scadenza.
4. Un test verifica che un login fallito non registri nei log la password né il token presentati.

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

Stato: **completata** (2026-08-14)

- [x] Nessun percorso di registrazione pubblico: l'unico account creabile è l'amministratore, al primo avvio e una volta sola. Il meccanismo degli inviti arriva in M1.3.
- [x] Password Argon2id ([ADR 0008](adr/0008-hashing-password-argon2id.md)), con vettore di regressione nei test.
- [x] Login e logout.
- [x] Sessioni per dispositivo, elencabili e revocabili; la revoca invalida il token all'istante.
- [x] Ruoli `instance_admin`, `instance_moderator`, `member`, senza gerarchia implicita: ogni rotta elenca i ruoli ammessi.
- [x] Rate limiting su login e setup, e test negativi di autorizzazione.
- [x] Recupero dell'accesso senza canale centrale e senza indebolire la baseline ([ADR 0009](adr/0009-recupero-accesso-amministratore.md)): codice trascrivibile mostrato una volta sola, conservato solo come hash, a uso singolo, che revoca tutte le sessioni e ne emette subito uno nuovo.

Vincoli di M0.4 rispettati e verificati da test:

- token di sessione conservati **solo come SHA-256**, password come Argon2id: un test legge il database e verifica che nessuna delle due sia utilizzabile;
- login per utente inesistente e per password sbagliata restituiscono **la stessa risposta**, e verificano entrambi un hash, così i tempi non rivelano quali account esistono;
- l'autorizzazione viene dalla sessione, mai dall'indirizzo IP;
- un test cattura i log e verifica che un login fallito non scriva né la password né il token.

Il recupero dell'accesso è stato risolto con [ADR 0009](adr/0009-recupero-accesso-amministratore.md). L'accesso fisico al server come prova di possesso è stato **scartato**: equivarrebbe a dire che chiunque entri in casa diventa amministratore, contro [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §2. Resta il costo dichiarato: chi perde codice e password perde l'istanza, e l'installazione dovrà dirlo con chiarezza (M3).

### M1.3 — Ammissione e dispositivi

Stato: **completata** (2026-08-14) per la parte di ammissione. Tre voci sono state **spostate**, con motivazione: vedi sotto.

- [x] Inviti monouso e riutilizzabili con scadenza, revocabili, con il codice restituito una volta sola e conservato solo come hash.
- [x] Vetrina d'istanza per l'invitato: nome, descrizione e numero di membri, **senza l'elenco dei membri**.
- [x] Richiesta e approvazione amministrativa: **avere un invito valido permette di chiedere, mai di entrare** (ADR 0003, requisito 3). Verificato da un test che, dopo la richiesta, il login fallisce e il numero di membri non cambia.
- [x] Audit degli eventi amministrativi, con l'autore risolto e nessuna credenziale registrata.

Vincoli di M0.4 rispettati: codici d'invito solo come hash, nessun privilegio dall'indirizzo IP, ammissione riservata a `instance_admin`.

**Tre voci spostate, e il perché.** Costruirle adesso avrebbe prodotto meccanismi che non fanno nulla — cioè stub che sembrano produzione, che `AGENTS.md` vieta.

1. **Scoperta sulla rete locale (mDNS) → M3.** Richiede una dipendenza e, sotto Docker, la rete host: il multicast non attraversa il bridge. È una decisione di topologia di deployment, e va presa con l'installazione guidata, non prima.
2. **Registrazione della chiave del dispositivo → M4.** Con il client web (ADR 0004) un browser non ha una coppia di chiavi. Le chiavi di dispositivo diventano reali con lo strato di trasporto o con un client nativo. Nel frattempo il bisogno operativo è coperto: **le sessioni sono la lista dei dispositivi**, sono elencabili e revocabili, e la revoca è verificata da test.
3. **Dichiarazione del percorso di primo contatto → M4.** La distinzione fra i tre percorsi dell'ADR 0003 riguarda **come un dispositivo apprende e fissa la chiave dell'istanza**. In rete locale via browser quel fissaggio non avviene ancora: registrare un percorso oggi significherebbe registrare una costante.

### M1.4 — Client web: accesso e amministrazione

Stato: **completata** (2026-08-14) — [ADR 0010](adr/0010-client-web-spa-statica.md)

- [x] Applicazione web aggiunta ora al workspace, **una sola** per membri e amministrazione (ADR 0004), come SPA statica servita dall'istanza stessa.
- [x] Configurazione al primo avvio, con il codice di recupero mostrato una volta sola e un passaggio esplicito di presa visione.
- [x] Login, sessione, logout, e recupero dell'accesso con il codice.
- [x] Richiesta di ammissione con codice d'invito, anche da link diretto, con la vetrina d'istanza che **non elenca i membri**.
- [x] Sezioni amministrative protette dal ruolo: richieste, inviti, registro.
- [x] Elenco dei dispositivi collegati con revoca; revocare il proprio termina la sessione all'istante.
- [x] Stato dell'istanza e diagnostica sicura, che dichiara «non verificabile» dove non può verificare (ADR 0007).

La sicurezza del browser, che [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) rinviava a questa milestone, è decisa: token in `Authorization` e non in cookie — quindi nessuna superficie CSRF — con una Content Security Policy senza `unsafe-inline` come contrappeso allo XSS. Verificata da test.

Gate M1:

1. [x] Un amministratore apre il browser, crea l'istanza e un invito. Percorso completo eseguito nell'interfaccia reale. **Non ancora ripetuto sul NAS**, solo su una macchina di sviluppo.
2. [x] Una seconda persona entra con l'invito, dopo approvazione esplicita. Eseguito nell'interfaccia e coperto da test.
3. [x] La revoca di un dispositivo gli impedisce l'accesso, misurata e non stimata.
4. [x] Backup e restore preservano istanza, identità, utenti e configurazione, verificati da test: la copia della directory dati a istanza ferma riporta la stessa chiave pubblica, gli account funzionanti e gli inviti ancora spendibili.

**Residuo dichiarato:** il gate va ripetuto su hardware reale, insieme alla verifica di `node:sqlite` su Node 24 e `linux/arm64` rimasta da M1.1. Sono le due voci che tengono M1 formalmente aperta finché non si tocca il NAS.

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
- [ ] Scoperta dell'istanza sulla rete locale con un nome comprensibile (da M1.3): richiede rete host sotto Docker, quindi va decisa insieme alla topologia di installazione.
- [ ] Scelta della cifratura a riposo con **passphrase all'avvio come default**, compromesso spiegato in parole comprensibili e conseguenze del rifiuto dichiarate ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)).
- [ ] L'istanza rileva e dichiara lo stato reale della cifratura a riposo; dove non è verificabile lo dice, e l'interfaccia non mostra mai protezioni che non ha.
- [ ] Aggiornamento con migrazioni e rollback documentato.
- [ ] Backup automatico cifrato con chiave distinta conservata fuori dall'istanza, comprensivo della chiave privata dell'istanza, e restore provato.
- [ ] Quote, cleanup, rate limiting e hardening.
- [ ] Build multi-arch pubblicabile.
- [ ] Guida per almeno due classi di hardware reale.

Gate M3: un amministratore installa un'istanza su hardware reale in meno di 30 minuti seguendo la sola documentazione, e un restore da backup cifrato ripristina tutto.

## M4 — Accesso da fuori dalla rete locale

Milestone additiva: il prodotto è già utilizzabile senza di essa. Riprende ciò che M0.2 ha lasciato non misurato.

- [ ] Trasporto del pilot documentato e dichiarato ai partecipanti (Tailscale, ADR 0004).
- [ ] Prova del trasporto peer-to-peer a chiavi: due nodi che si trovano senza dominio né port forwarding.
- [ ] **Revoca nel modello a chiavi**: misura del tempo effettivo di perdita dell'accesso, budget 60 secondi.
- [ ] Registrazione della chiave del dispositivo presso l'istanza, e dichiarazione del percorso di primo contatto (da M1.3): diventano reali solo quando un dispositivo fissa davvero la chiave dell'istanza.
- [ ] Comportamento sotto CGNAT su una linea reale.
- [ ] Metadati conservati dal trasporto scelto.
- [ ] ADR sulla scelta definitiva del trasporto.

## Milestone successive, non autorizzate ora

Richiedono un nuovo piano tecnico prima dell'implementazione.

1. Client mobile, con l'integrazione del motore di rete già collaudata su desktop.
2. **Chat, DM e gruppi con cifratura end-to-end nello stesso rilascio.** Non esiste una versione intermedia in chiaro: [ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md) rende MLS parte della funzionalità, non una milestone successiva. Le notifiche push arrivano con questo blocco.
3. Profilo pubblico e federazione ActivityPub, **opzionale per istanza**: solo chi vuole affacciarsi sul Fediverso adotta un dominio (ADR 0002).
4. Indice dei profili pubblici, per la ricerca di persone tra istanze.
5. Export/import e migrazione ActivityPub `Move`.
6. Governance opzionale.

Le condizioni per riesaminare il rinvio della chat sono in [`RECONCILIATION.md`](RECONCILIATION.md) §7.
