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

| Milestone  | Stato                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| M0.1       | Completata (2026-07-15, chiusa 2026-08-13)                                                                                                |
| M0.2       | **Chiusa** (2026-08-14) — esito: cambio di modello                                                                                        |
| M0.3       | **Completata** (2026-08-14) — [ADR 0005](adr/0005-persistenza-node-sqlite.md); verifica residua chiusa il 2026-08-15 su Node 24 e `arm64` |
| M0.4       | **Completata** (2026-08-14) — [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md)                                                              |
| M1.1       | Completata; resta una sola voce, la scoperta sulla rete locale, spostata a M3                                                             |
| M1.2       | **Completata** (2026-08-14) — account, sessioni, ruoli, recupero                                                                          |
| M1.3       | **Completata** (2026-08-14) — inviti, ammissione, audit; tre voci spostate a M3/M4                                                        |
| M1.4       | **Completata** (2026-08-14) — client web                                                                                                  |
| M2.1, M2.2 | **Completate** (2026-08-14) — post, commenti, like                                                                                        |
| M2.3       | **Completata** (2026-08-15) — immagini in WebAssembly, con quote e cleanup                                                                |
| M2.4       | **Completata** (2026-08-15) — bacheca e immagini nell'interfaccia                                                                         |
| Gate M2    | **Chiuso** (2026-08-15) — provato su un NAS reale, con un membro non tecnico entrato senza assistenza                                     |
| M3         | **Attiva** — robustezza operativa                                                                                                         |
| M4         | Non iniziata                                                                                                                              |

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

**Verifica residua chiusa il 2026-08-15**: le prove sono state ripetute nell'immagine di riferimento su Node 24.18.0 e `linux/arm64` nativo, e poi su `linux/amd64`. Dettaglio in [ADR 0005](adr/0005-persistenza-node-sqlite.md).

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
- [x] Verifica di `node:sqlite` su Node 24.18.0 e `linux/arm64` (residuo di M0.3), eseguita il 2026-08-15 nell'immagine di riferimento: **Node v24.18.0, `linux/arm64` nativo e non emulato**, con le chiavi esterne rifiutate davvero e non ignorate. Ripetuta su `linux/amd64`. Nessun modulo nativo da compilare, che era il rischio per cui M0.3 era uno spike.
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

**Residuo, aggiornato il 2026-08-15 dopo la prova sul NAS.** La verifica di `node:sqlite` su Node 24 e `linux/arm64` è fatta. Del gate M1 ripetuto su hardware reale sono stati esercitati i criteri 1 e 2 — un amministratore ha creato l'istanza e un invito dal browser, e una seconda persona è entrata dopo approvazione esplicita — mentre **restano da rifare sul NAS i criteri 3 e 4**, la revoca misurata e il ciclo di backup e restore. Vanno chiusi con il backup automatico di M3, che tocca comunque quella procedura.

## M2 — Feed locale verticale

### M2.1 — Post testuali

Stato: **completata** (2026-08-14)

- [x] Dominio post con scope `local` obbligatorio di default, **verificato anche nel database** e non solo nella risposta.
- [x] Creazione, lettura, timeline paginata con cursore e cancellazione logica.
- [x] Autorizzazione locale e moderazione: l'autore cancella il proprio, il moderatore anche l'altrui, e nessun altro.
- [x] Test di mappatura del post verso `Note`, come funzione pura sul dominio (ADR 0002).

Nascondere un contenuto non lo toglie dalla timeline: **gli svuota il corpo** per tutti tranne l'autore e chi modera. Una conversazione che perde un pezzo in silenzio lascia le risposte appese a niente.

### M2.2 — Commenti e reazioni

Stato: **completata** (2026-08-14)

- [x] Commenti legati al post, in ordine di scrittura.
- [x] Like idempotenti, con conteggi coerenti e **nessun effetto sull'ordinamento**: verificato da un test, perché è l'unico modo di impedire che un ranking entri di soppiatto.
- [x] Cancellazione e moderazione, con gli stessi confini dei post.
- [x] Test di accesso: il feed è chiuso agli anonimi e a chi ha una sessione revocata.

### M2.3 — Immagini

Stato: **completata** (2026-08-15) — [ADR 0011](adr/0011-immagini-in-webassembly.md), [ADR 0012](adr/0012-immagini-autenticate-non-indovinabili.md)

- [x] Adapter filesystem, dietro la porta `MediaStorage` che `PROJECT_SPEC.md` §9 richiede: scrittura atomica, lettura, esistenza, cancellazione e metadati.
- [x] Upload temporaneo, validazione e commit atomico: l'immagine si carica prima e si allega al post dopo, e i due scritti sono una transazione sola.
- [x] Thumbnail e metadati: miniatura **WebP** lato lungo 640, misure e pesi registrati nel database.
- [x] Quote e cleanup: quota per membro applicata **prima** di scrivere, spazzata degli upload mai pubblicati, e i file di un post cancellato liberati subito.
- [x] Compressione lato client prima dell'invio; il server rifiuta gli originali oltre soglia, in byte e in pixel.

La libreria è decisa: **WebAssembly**, [ADR 0011](adr/0011-immagini-in-webassembly.md). `sharp` è stato scartato perché nativo, e contraddirebbe la proprietà che ADR 0005 e ADR 0008 hanno già difeso due volte. Le versioni sono fissate e verificate nell'ADR, con la data.

Il punto che rende la scelta sostenibile: **il lavoro pesante lo fa il client**, che ridimensiona e comprime prima di caricare. L'istanza tocca immagini già piccole, e la lentezza del WebAssembly si applica a un lavoro reso leggero a monte. Misurato nell'interfaccia reale: una foto da 3000×2000 e 4,7 MB arriva all'istanza come 1600×1067 e 44 kB, e l'istanza la elabora in **82 ms**.

Fatto lato istanza, perché la compressione nel browser è un'ottimizzazione e non un controllo — ognuno con un test che lo tiene fermo:

1. **Il tipo si legge dai byte.** Un file che dichiara `image/jpeg` e contiene altro viene rifiutato con `415`.
2. **La misura in pixel si legge dall'intestazione, prima di decodificare.** È l'unico ordine che difende davvero: un file di poche centinaia di byte può dichiarare cento milioni di pixel, e se lo si scopre decodificando è già tardi.
3. **La quota si applica prima di scrivere**, ed è per membro.
4. **Si scrive in un file temporaneo e si rinomina**, quindi nessuno legge mai un'immagine a metà.
5. **Il percorso viene da un identificatore generato dall'istanza.** Il nome del file caricato non arriva nemmeno al server: l'upload è il corpo della richiesta, senza multipart.

**Una cosa in più rispetto al piano, e va detta apertamente.** L'istanza toglie dai file caricati tutto ciò che non serve a disegnarli — Exif per primo. Una foto scattata col telefono porta con sé le coordinate di dove è stata scattata, e la bacheca di un quartiere è l'ultimo posto in cui dovrebbero finire per sbaglio. Non è una riscrittura dei pixel ma del contenitore: nessuna perdita di qualità. Il client, ricomprimendo, le perderebbe comunque; questo copre chi carica **senza** passare dal nostro client, che è esattamente la categoria da cui l'ADR 0011 dice di difendersi.

**Il formato delle miniature era una decisione aperta** dell'ADR 0011 ed è stata chiusa misurando: WebP pesa la metà di JPEG a parità di tempo e di resa.

### M2.4 — Client web: feed

Stato: **completata** (2026-08-15)

- [x] Timeline, pubblicazione, commenti, like, con moderazione ed eliminazione dove il ruolo lo consente.
- [x] Il composer dichiara dove finisce quello che scrivi: «lo vedono solo i membri di questo quartiere».
- [x] Nessuna superficie pubblica, nessuna chat.
- [x] Stati d'errore espliciti.
- [x] Caricamento immagini con compressione nel browser, fino a quattro per messaggio, con anteprima, descrizione per chi non vede l'immagine, e la miniatura che si apre a grandezza intera.

Due cose che la parte immagini del client ha dovuto risolvere e che valgono per chiunque ci lavori dopo:

- **Le immagini si scaricano autenticate** ([ADR 0012](adr/0012-immagini-autenticate-non-indovinabili.md)). Un `<img src>` non porta con sé l'intestazione `Authorization`, e mettere il token nell'URL lo avrebbe sparso in cronologia e log. Si recuperano quindi con `fetch` e si mostrano da un URL `blob:`, il che ha richiesto **una riga in più nella CSP** — `img-src` accetta `blob:` — motivata nell'ADR.
- **La rotazione la applica il client ai pixel.** Una foto scattata col telefono è spesso ruotata da un tag Exif; ridisegnandola su `canvas` con l'orientamento richiesto, l'immagine è dritta per tutti e il tag non serve più a nessuno.

Gate M2:

1. [x] Su un NAS reale, più persone dalla rete locale pubblicano e commentano. **Fatto il 2026-08-15** su un UGREEN `x86_64` con UGOS, istanza a `<indirizzo-lan-del-nas>:3000`, due membri reali.
2. [x] Nessuna API del feed è raggiungibile dopo la revoca — comprese le immagini, verificato da test.
3. [x] I media sopravvivono a restart e restore. Provato su un'istanza vera: fermata, copiata la directory dati, ripristinata, riavviata — post, miniatura e descrizione tornano identici byte per byte.
4. [x] Tutti i contenuti creati hanno scope `local` verificabile, nella risposta e nel database.
5. [x] Una persona non tecnica completa il percorso dall'invito al feed popolato senza assistenza. **Fatto il 2026-08-15**: la seconda persona è entrata con l'invito e ha usato la bacheca senza che le venisse spiegato nulla, e in fretta.

**Gate M2 chiuso il 2026-08-15.** M2 è completa.

### Che cosa ha detto la prova sul campo

Vale più della spunta, perché indirizza M3.

**Il prodotto ha retto.** L'ingresso di un membro non tecnico è stato rapido e senza assistenza: è il budget di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4 — «passaggi tecnici richiesti a un membro non tecnico: 0» — rispettato su hardware vero, non stimato.

**L'installazione no.** Ha richiesto un'ora abbondante di assistenza esperta, con tre inciampi che nessuna documentazione avrebbe evitato perché la documentazione non esisteva: `scp` che fallisce perché il NAS non espone `sftp-server`, `/tmp` e la home non scrivibili, e l'architettura del NAS assunta invece che verificata. Il gate M3 chiede **meno di 30 minuti con la sola documentazione**: oggi siamo lontani, e sappiamo esattamente di quanto.

**Un difetto è emerso solo lì.** La directory dei dati restava a `0755` sotto Docker, perché il `mode` di `mkdir` non tocca una directory che esiste già. I test passavano perché la directory temporanea che usano nasce a `0700`. Nessuna prova su portatile lo avrebbe mostrato.

**Il percorso che ha funzionato**, da riprodurre in M3: immagine costruita altrove e trasferita nella pipe SSH direttamente in `docker load`, volume Docker con nome — la cartella dati di Docker era già sul pool di archiviazione — e nessun bind mount, quindi nessun `chown` e nessun permesso da sistemare a mano.

## M3 — Robustezza operativa

Milestone attiva. La prova sul campo del 2026-08-15 dice da dove partire: **il prodotto è pronto, l'installazione no.**

- [ ] Installazione guidata e diagnostica. Il percorso verificato su UGREEN va scritto e generalizzato: trasferimento dell'immagine senza registry, volume con nome quando la cartella dati di Docker è già sul pool, e il controllo dell'architettura **prima** e non dopo.
- [ ] Scoperta dell'istanza sulla rete locale con un nome comprensibile (da M1.3): richiede rete host sotto Docker, quindi va decisa insieme alla topologia di installazione.
- [ ] Scelta della cifratura a riposo con **passphrase all'avvio come default**, compromesso spiegato in parole comprensibili e conseguenze del rifiuto dichiarate ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)).
- [ ] L'istanza rileva e dichiara lo stato reale della cifratura a riposo; dove non è verificabile lo dice, e l'interfaccia non mostra mai protezioni che non ha.
- [ ] Aggiornamento con migrazioni e rollback documentato.
- [ ] Backup **automatico** cifrato con chiave distinta conservata fuori dall'istanza, comprensivo della chiave privata dell'istanza, e restore provato. Fatto il 2026-08-15, tranne la parte automatica:
  - [x] Backup cifrato in formato `age`, deciso in [ADR 0013](adr/0013-backup-cifrati-in-formato-age.md): un `tar` cifrato che si riapre **con strumenti standard, senza ESTIA**.
  - [x] Chiave distinta e fuori dall'istanza: cifrando verso un destinatario X25519, sul NAS vive solo la chiave pubblica e **l'istanza non sa rileggere i propri backup**.
  - [x] Include la chiave privata dell'istanza, il database e i media.
  - [x] Snapshot coerente **a istanza viva**, con `VACUUM INTO`: non serve più fermarla.
  - [x] Restore provato, con dieci test: round trip completo con foto, chiave sbagliata rifiutata, **archivio manomesso di un byte rifiutato**, nessun ripristino a metà, e percorsi risalenti nel `tar` respinti.
  - [x] Verificato con implementazioni indipendenti: `age` 1.2.1, GNU tar 1.35 e il client `sqlite3`, in un container, aprono l'archivio e ne leggono il contenuto.
  - [x] **Esecuzione automatica** nel processo dell'istanza, con rotazione degli archivi: un amministratore non deve imparare lo scheduler del proprio NAS. Il primo backup parte un minuto dopo l'avvio, così un errore di configurazione si vede subito. Una configurazione a metà **impedisce l'avvio**, e nessuna configurazione produce un avviso nei log: un amministratore che crede di avere i backup è messo peggio di uno che sa di non averli.
  - [ ] La prova di un ripristino sul **NAS reale**. È il pezzo che manca, e chiude anche il criterio 4 del gate M1.
- [ ] Quote, cleanup, rate limiting e hardening. Le quote e il cleanup dei media esistono da M2.3; restano il resto e i limiti di risorse del container.
- [ ] Build multi-arch **pubblicabile**. La build in sé è verificata su `linux/amd64` e `linux/arm64` il 2026-08-15, immagine avviata e funzionante su entrambe: manca solo la pubblicazione su un registry, che è una decisione di distribuzione e non di codice.
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
- [ ] ADR sulla scelta definitiva del trasporto. Due candidati, da misurare e non da adottare sulla fiducia:
  - **Tailscale**, già usato nel pilot e dichiarato in [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md). Maturo, con app iOS, ma con un control plane di terzi.
  - **[Rayfish](https://github.com/rayfish/rayfish)**, segnalato il 2026-08-15 e guardato lo stesso giorno: mesh VPN peer-to-peer in Rust su `iroh`, MPL-2.0, **senza server di coordinamento centrale**. È esattamente la proprietà che [ADR 0001](adr/0001-private-network-control-plane.md) cercava e non trovò, e che costò sette passaggi tecnici all'amministratore. Ma il progetto si dichiara **sperimentale, pre-1.0 e senza audit di sicurezza indipendente**, e supporta Linux e macOS, Android in modo iniziale, **non iOS**. Su di esso poggerebbe l'intera sicurezza di rete di un'istanza: oggi non regge il criterio di `AGENTS.md` sull'usare componenti maturi. Da riesaminare a M4, non prima.

## Milestone successive, non autorizzate ora

Richiedono un nuovo piano tecnico prima dell'implementazione.

**Riordinate il 2026-08-16** dopo la revisione di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §11, che ha spostato il centro dal quartiere alla sovranità del dato. Il profilo sale, perché è la superficie che rende ESTIA utile anche a chi non ha un quartiere attorno.

1. **Profilo, con follow e richieste di follow.** Pagina profilo, profilo chiuso o aperto, e lo scope `followers` — che è nello schema dalla prima migrazione del feed e non è mai stato implementato. Comprende la scelta della cerchia al momento di pubblicare, che oggi l'interfaccia non offre di proposito: un post «pubblico» non raggiungerebbe nessuno finché non c'è federazione, e un'etichetta che mente è peggio di una funzione che manca.
2. **Federazione ActivityPub**, **opzionale per istanza**: solo chi vuole affacciarsi sul Fediverso adotta un dominio ([ADR 0002](adr/0002-activitypub-confine-non-schema.md)). È ciò che rende vero il punto 1 fuori dall'istanza.
3. **Chat, DM e gruppi con cifratura end-to-end nello stesso rilascio.** Non esiste una versione intermedia in chiaro: [ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md) rende MLS parte della funzionalità, non una milestone successiva. Le notifiche push arrivano con questo blocco. La condizione 1 di [`RECONCILIATION.md`](RECONCILIATION.md) §7 si è avverata il 2026-08-15 — gate M2 superato su hardware reale, e la comunità pilota che chiede i messaggi diretti come mancanza principale — quindi il rinvio va **riesaminato**, che non vuol dire riaperto d'ufficio.
4. Client mobile, con l'integrazione del motore di rete già collaudata su desktop.
5. Indice dei profili pubblici, per la ricerca di persone tra istanze.
6. Export/import e migrazione ActivityPub `Move`.
7. Governance opzionale.
8. **Stories ed eventi**, se e solo se un ADR scioglie le due tensioni dichiarate in [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §9: l'effimero contro la portabilità, e l'effimero contro la moderazione.

Le condizioni per riesaminare il rinvio della chat sono in [`RECONCILIATION.md`](RECONCILIATION.md) §7.
