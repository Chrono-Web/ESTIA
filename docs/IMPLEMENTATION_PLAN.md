# Piano di implementazione

Questo piano copre la **Fase 1** del piano di progetto di luglio 2026 e la espande. Le Fasi 2–4 di quel documento sono elencate in fondo con la loro destinazione. Il rapporto tra i due percorsi è fissato in [`RECONCILIATION.md`](RECONCILIATION.md).

**Riorganizzato il 2026-08-14** dopo la chiusura dello spike di rete. Le decisioni che lo hanno cambiato sono [ADR 0003](adr/0003-primo-contatto-in-rete-locale.md) (primo contatto in rete locale), [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) (client web, trasporto sostituibile) e [ADR 0005](adr/0005-persistenza-node-sqlite.md) (persistenza).

## Regole di avanzamento

- È attiva soltanto la prima milestone non completata, salvo eccezioni dichiarate nella milestone stessa.
- Una milestone non è completata se il percorso principale dipende da mock.
- Ogni milestone termina con test, documentazione e un comando riproducibile.
- Le caselle vengono aggiornate solo dopo la verifica dei criteri di accettazione.
- Tre stati, e il terzo esiste perché due non bastavano a dire la verità: `[ ]` non iniziata, `[x]` **verificata**, `[~]` **costruita e non ancora verificata sul campo**. Una voce `[~]` ha il codice, i test e la documentazione, e le manca la prova su hardware vero — che in questo progetto non è una formalità, perché ogni volta che è stata fatta ha trovato qualcosa. `[~]` non conta ai fini di un gate.
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
| M3         | **Attiva** — costruita per intero, gate **aperto**: mancano le due prove su hardware vero                                                 |
| M4         | **Aperta nella prima voce, poi in pausa deliberata** — Tailscale resta il trasporto del pilot; la scelta aspetta la verifica di ADR 0018  |

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

Il laboratorio [`infra/network-lab/`](../infra/network-lab/README.md) va rimosso o riconvertito **quando riprende il lavoro sul trasporto**: è materiale dello spike chiuso. La prima voce di M4, chiusa il 2026-08-17, non lo tocca — dichiara quel confine, non lo attraversa.

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

1. [x] Su un NAS reale, più persone dalla rete locale pubblicano e commentano. **Fatto il 2026-08-15** su un UGREEN `x86_64` con UGOS, raggiunta dalla rete locale, due membri reali.
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

- [~] Installazione guidata e diagnostica. Costruita tutta; manca la sola verifica sul campo, qui sotto.
  - [x] **Guida scritta**: [`INSTALLAZIONE.md`](INSTALLAZIONE.md), dal NAS spento all'istanza con i backup che girano. Nasce dall'installazione reale del 2026-08-15, e i suoi passaggi più noiosi esistono perché quella volta sono andati storti: architettura controllata prima e non dopo, la porta pubblicata su `0.0.0.0`, la scelta fra volume con nome e bind mount fatta guardando dove Docker tiene già i dati, e una tabella dei sintomi con i sette inciampi veri di quella sera.
    - **Riscritta il 2026-08-19 su un secondo resoconto reale**, di una persona senza esperienza di Docker: quattro difetti, tutti nella prima metà della guida e nessuno nel prodotto. **Docker era dato per installato** — il passo 1 partiva da `docker --version` senza dire come si ottiene, e sui NAS non si ottiene da terminale; **il blocco Compose veniva incollato nel terminale**, che risponde `comando non trovato`, perché niente diceva che quel blocco è il contenuto di un file; **il passo del pannello del NAS stava dentro il passo del terminale**, e le due strade si leggevano come una sola mescolata; e **la guida diceva «NAS» ovunque** anche dove parlava di qualunque macchina, il che escludeva a parole il mini-PC che è il candidato della seconda classe di hardware.
    - Le correzioni: un passo 1 che installa Docker per NAS, Linux e Docker Desktop con la verifica in fondo; una sezione «Come si legge questa guida» che dichiara la differenza fra un blocco `sh` e un blocco `yaml` e biforca le due strade in una tabella; il file Compose creato da un `cat > … <<'YAML'` incollabile in un colpo solo, con `docker compose config` per controllarlo; il pannello grafico in una sezione sua che sostituisce tre passi e poi rientra nel percorso comune; «macchina» al posto di «NAS» dove la cosa non è del NAS; e cinque righe nuove nella tabella dei sintomi, una per ciascun errore visto in quel resoconto.
  - [~] **Verifica del gate**: qualcuno che non ha assistito a quella sera installa un'istanza in meno di 30 minuti **seguendo solo la guida**. Costruito: la guida esiste, è stata riscritta tre volte su difetti reali, e copre ora l'immagine pubblica, il pannello del NAS e i backup senza terminale. Manca: **una persona che non sia l'autore né chi ha assistito**. **Data per passata dal proprietario il 2026-08-17**, con l'intenzione di riprenderla nello studio dell'esperienza d'uso. La casella resta vuota di proposito: nessun estraneo ha ancora installato seguendo solo la guida, e la guida nel frattempo è cambiata parecchio — immagine pubblica, passo 3 riscritto, backup dal pannello — quindi oggi è meno provata di prima, non di più. **Il 2026-08-19 un primo tentativo esterno c'è stato**, e ha dato la risposta che serviva: chi non conosce Docker non ha superato il passo 2 con la sola guida — ha chiesto a un assistente conversazionale i comandi mancanti e li ha eseguiti senza capirli. Fuori budget, quindi, e non per il prodotto: i difetti erano tutti nel testo, e sono corretti sopra. La verifica va rifatta da capo su questa versione, con una persona diversa.
  - [x] Diagnostica nell'interfaccia, oltre alla tabella dei sintomi. La sezione «Stato dell'istanza» dice adesso le quattro cose che l'istanza sa e che prima restavano nei log: la cifratura a riposo osservata contro quella dichiarata ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)), **lo stato reale dei backup periodici**, l'ultimo aggiornamento dello schema con il suo backup ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)) e i permessi della directory dei dati quando il filesystem li ha rifiutati.
    - Il criterio è sempre lo stesso: **rosso solo dove chi amministra crede di essere protetto e non lo è.** Backup non configurati è una constatazione, backup configurati che non producono archivi è un allarme. Vale per la cifratura dichiarata e non rilevata, e per il backup di aggiornamento fallito.
    - Lo stato dei backup non si ferma a «configurati sì o no», che era già nei log dal 2026-08-15: guarda **se un archivio è davvero arrivato, e quando**. `stale` scatta oltre due intervalli, `missing` quando la cartella è vuota e l'istanza è su da più di dieci minuti — la finestra serve a non gridare al lupo nel minuto che precede il primo backup.
- [x] Scoperta dell'istanza sulla rete locale con un nome comprensibile (da M1.3). **Decisa il 2026-08-17 con [ADR 0017](adr/0017-niente-mdns-nostro.md), e l'esito è che ESTIA non la implementa**: la fa il NAS, che pubblica già il proprio nome, e la guida insegna `http://nome-del-nas.local:3000` invece di reimplementarlo.
  - Misurato prima di decidere: il multicast **attraversa il bridge di Docker fra container** — due container sulla stessa rete si sentono su `224.0.0.251:5353` senza configurazione — e **non arriva alla rete di casa**, perché quel passaggio è instradato. Un responder dentro un container bridged parlerebbe a nessuno.
  - Il prezzo per farlo arrivare sarebbe `network_mode: host`: via la pubblicazione delle porte, via il confine di rete del container su una rete che [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §2 dichiara non fidata, e la guida biforcata in due percorsi. Il guadagno residuo — che il nome dica «estia» invece del nome del NAS — è estetico.
  - **La metà grossa di quel bisogno era già stata chiusa lo stesso giorno, senza toccare la rete.** Il problema vero non era il nome, era che per far entrare qualcuno bisognava comporsi a mano `http://INDIRIZZO:3000/entra?codice=…`: la schermata d'ingresso accettava il codice nell'URL da M1.4, ma il pannello mostrava solo il codice. Ora **Crea invito** produce il link intero, costruito dall'indirizzo da cui l'amministratore sta guardando — che è, per costruzione, un indirizzo che su quella rete funziona.
  - E dichiara il caso in cui non funzionerebbe: un invito creato da `localhost` porta un link che si apre solo sul NAS stesso, e l'interfaccia lo dice in rosso invece di lasciarlo scoprire a chi lo riceve. È l'inciampo «dal telefono non si apre, dal NAS sì» della tabella dei sintomi, intercettato dove nasce.
  - **Resta mDNS**, che aggiungerebbe due cose: un nome al posto di un indirizzo IP, e la sopravvivenza a un cambio di indirizzo del NAS. Va deciso in un ADR perché il multicast non attraversa il bridge di Docker e servirebbe `network_mode: host`, che smonta la pubblicazione delle porte e l'isolamento di rete del container per una comodità. **E va verificato su una LAN vera**, quindi è bloccato dallo stesso hardware delle altre voci aperte, non dal tempo.
- [x] Scelta della cifratura a riposo con **passphrase all'avvio come default**, compromesso spiegato in parole comprensibili e conseguenze del rifiuto dichiarate ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)). La scelta vive in [`INSTALLAZIONE.md`](INSTALLAZIONE.md), con la tabella dei tre livelli e il prezzo di ciascuno: chi non decide ottiene la protezione migliore.
- [x] L'istanza rileva e dichiara lo stato reale della cifratura a riposo; dove non è verificabile lo dice, e l'interfaccia non mostra mai protezioni che non ha. Fatto il 2026-08-16: legge la pila dei dispositivi sotto la directory dei dati e riconosce `dm-crypt` **anche sotto LVM**; su ZFS e dove non può ispezionare risponde «non verificabile»; e quando la configurazione dichiara una cifratura che non vede, **contraddice la dichiarazione** nell'interfaccia e nei log. Provato contro un volume LUKS reale.
  - Il limite, dichiarato invece che aggirato: dall'interno si vede **se** un volume è cifrato, mai **come viene sbloccato** — una passphrase digitata e una chiave su disco producono lo stesso dispositivo. Il livello resta una dichiarazione dell'amministratore, che l'istanza confronta con ciò che osserva.
- [x] Aggiornamento con migrazioni e rollback documentato. **L'istanza si fa un backup da sola quando si accorge di avere migrazioni da applicare, prima di applicarle** ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)): le migrazioni sono solo in avanti e [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §8 stabilisce che il rollback di un aggiornamento _è_ il ripristino da backup. Il backup automatico non bastava: parte un minuto dopo l'avvio, cioè quando le migrazioni sono già state applicate, e il punto di ritorno sarebbe stato quello della notte prima.
  - **Il nodo era l'ordine, e si è sciolto separando due gesti.** `openDatabase()` applicava le migrazioni mentre apriva il database, quindi non esisteva un momento in cui l'istanza sapesse di dover migrare senza averlo già fatto. Ora `openConnection()` apre soltanto, `readSchemaState()` legge che cosa manca **senza creare la tabella** — la sua assenza è l'unico modo di distinguere un'istanza nuova da una da aggiornare — e `runMigrations()` applica. Fra il sapere e l'applicare, l'istanza **chiude la propria connessione**, scrive il backup e riapre: al momento dello snapshot nessuna connessione dell'istanza è aperta, il che toglie di mezzo la domanda invece di rispondervi.
  - **Deciso il 2026-08-16, e non per default:** se ci sono migrazioni da applicare e **nessun backup configurato, l'istanza parte comunque e lo dichiara.** Rifiutarsi di partire proteggerebbe i dati lasciando un quartiere senza la propria bacheca, il che è un danno certo contro un rischio possibile. Lo stesso calcolo vale per un backup **configurato che fallisce**: si aggiorna lo stesso, ma la dichiarazione è più forte, perché chi lo ha configurato crede di essere protetto — la stessa asimmetria per cui una cifratura dichiarata e non rilevata vale un avviso in rosso.
  - **La dichiarazione arriva a chi amministra e non scade.** L'aggiornamento è registrato nel database e compare in «Stato dell'istanza», accanto alla cifratura a riposo. Non è comodità: le migrazioni vanno solo in avanti, quindi un aggiornamento senza punto di ritorno resta senza punto di ritorno dopo il riavvio e anche se nel frattempo i backup ricominciano a girare. Un avviso che scade da solo racconterebbe che il problema si è risolto.
  - Il **primo avvio** di un'istanza nuova non è un aggiornamento: nessun backup e nessun avviso, perché non c'è ancora niente da proteggere e un rumore lì insegnerebbe a ignorare proprio questa categoria di messaggi.
  - Gli archivi che precedono un aggiornamento si chiamano `estia-aggiornamento-*.tar.age` e **hanno una rotazione loro**: con `ESTIA_BACKUP_KEEP=1` la rotazione notturna avrebbe cancellato l'unico punto di ritorno dell'aggiornamento.
  - **Provato aggiornando un'istanza vera, non i test.** Immagine costruita dal commit precedente, istanza creata su un volume Docker con dentro un post reale, poi la stessa directory dati riavviata con l'immagine nuova. L'archivio prodotto è stato riaperto da **implementazioni indipendenti** — `age` 1.2.1, GNU tar 1.35 e il client `sqlite3` 3.48.0 in un container Alpine — e contiene lo schema **alla versione 6**, senza la tabella che la migrazione 7 crea, con il post e la chiave privata dell'istanza dentro. L'istanza aggiornata risponde alla versione 7 con il post al suo posto. Ripetuto senza backup configurati: parte, registra `schema_migrated_without_backup`, e lo ripete in diagnostica dopo due riavvii **senza rimigrare nulla** — una sola riga in `schema_upgrades`.
- [~] Backup **automatico** cifrato con chiave distinta conservata fuori dall'istanza, comprensivo della chiave privata dell'istanza, e restore provato. Costruito tutto, compresa la gestione dal pannello; manca la sola prova di ripristino su hardware vero:
  - [x] Backup cifrato in formato `age`, deciso in [ADR 0013](adr/0013-backup-cifrati-in-formato-age.md): un `tar` cifrato che si riapre **con strumenti standard, senza ESTIA**.
  - [x] Chiave distinta e fuori dall'istanza: cifrando verso un destinatario X25519, sul NAS vive solo la chiave pubblica e **l'istanza non sa rileggere i propri backup**.
  - [x] Include la chiave privata dell'istanza, il database e i media.
  - [x] Snapshot coerente **a istanza viva**, con `VACUUM INTO`: non serve più fermarla.
  - [x] Restore provato, con dieci test: round trip completo con foto, chiave sbagliata rifiutata, **archivio manomesso di un byte rifiutato**, nessun ripristino a metà, e percorsi risalenti nel `tar` respinti.
  - [x] Verificato con implementazioni indipendenti: `age` 1.2.1, GNU tar 1.35 e il client `sqlite3`, in un container, aprono l'archivio e ne leggono il contenuto.
  - [x] **Esecuzione automatica** nel processo dell'istanza, con rotazione degli archivi: un amministratore non deve imparare lo scheduler del proprio NAS. Il primo backup parte un minuto dopo l'avvio, così un errore di configurazione si vede subito. Una configurazione a metà **impedisce l'avvio**, e nessuna configurazione produce un avviso nei log: un amministratore che crede di avere i backup è messo peggio di uno che sa di non averli.
  - [x] **Governabili dal pannello, senza terminale** ([ADR 0016](adr/0016-backup-dal-pannello.md)), dal 2026-08-17. Attivarli richiedeva di aprire un terminale sul NAS, generare una coppia di chiavi, incollarla in un `docker-compose.yml`, creare una cartella con i permessi giusti e riavviare: cioè richiedeva di non farlo. Ora si genera la coppia dall'interfaccia — la privata mostrata una volta sola, come il codice di recupero — si sceglie ogni quanto e quanti tenerne, si fa un backup subito, e **si scaricano**. Quest'ultimo è il pezzo che vale di più: un archivio che resta sul NAS non è ancora un backup.
    - Le impostazioni vivono nel database e si cambiano a caldo, ma **le variabili d'ambiente vincono**: dove c'erano già, il pannello mostra il valore e dichiara da dove arriva invece di offrire una modifica che il riavvio annullerebbe.
    - **La cartella non si sceglie dall'interfaccia**: un percorso in arrivo dalla rete sarebbe una scrittura arbitraria sul NAS. Viene dall'ambiente, o è `backup/` accanto ai dati — che è metà protezione, e il pannello lo dice ogni volta invece di lasciarlo credere.
    - **Il ripristino resta da riga di comando**, e l'assenza del pulsante è la decisione: serve esattamente quando quell'interfaccia non si raggiunge. Il pannello lo dichiara e rimanda alla guida.
    - Provato nell'interfaccia vera: coppia generata, backup periodici attivati, backup su richiesta, archivio scaricato dal browser. E da test: chiave privata offerta al posto della pubblica rifiutata, percorsi risalenti nel nome dell'archivio respinti, un membro qualunque tenuto fuori.
  - [~] La prova di un ripristino su **hardware reale**. **Eseguita il 2026-08-19 su un mini-PC Linux x86_64** — Linux Mint, Docker 29, immagine pubblica `ghcr.io/chrono-web/estia:latest` — dal pannello e non dai test: coppia di chiavi generata dall'interfaccia, backup periodici attivati, backup su richiesta, archivio scaricato via API, ripristinato con il comando del passo 13 della guida, e istanza di prova riaccesa su un'altra porta sui dati ripristinati. **Torna tutto**: stessa chiave pubblica dell'istanza, stessa password, il post al suo posto.
    - **E ha trovato due difetti che nessun test aveva visto**, che è esattamente ciò per cui il gate chiede hardware vero.
    - **Il comando di ripristino della guida non funzionava.** Girava come `--user 10001:10001` contro una cartella creata dall'amministratore, quindi di proprietà del suo utente: la prima scrittura falliva. Non era un caso limite, era il percorso documentato. Ora il container fa il ripristino da root e **consegna i file all'utente dell'istanza** con `chown`, e la guida spiega perché quel comando è l'unico che parte da root.
    - **E il messaggio d'errore mandava dalla parte sbagliata.** Fallita la scrittura, la pulizia che evita un ripristino a metà falliva a sua volta — non si può rimuovere una directory che è un punto di mount — e la sua eccezione **sostituiva quella vera**: si leggeva `EACCES … rmdir '/restore'` invece del file che non si era potuto scrivere. Corretto in [`archive.ts`](../apps/core-api/src/backup/archive.ts): la pulizia svuota la cartella invece di rimuoverla, e non può più coprire la ragione per cui è scattata. Con il suo test, che si salta da root perché lì il caso non è riproducibile.
    - Manca: **la stessa prova sul NAS**, che aggiunge `arm64` e il suo filesystem. La frase «mai eseguito su hardware, solo in container» non è più vera; «mai eseguito su quel NAS» sì. Chiude anche il criterio 4 del gate M1.
  - **Osservazione dal campo, 2026-08-19**: l'istanza installata su quel mini-PC da una persona diversa dall'autore gira da giorni **senza backup configurati** — `backup_not_configured` nei log, che è il meccanismo che funziona come deve. Ma è la conferma sul campo del rischio che il passo 10 della guida chiama «la parte che si salta e non si dovrebbe»: chi installa arriva a «funziona» e si ferma lì.
- [x] Quote, cleanup, rate limiting e hardening. Le quote e il cleanup dei media esistono da M2.3; il resto è stato chiuso il 2026-08-16.
  - **Rate limiting: un tetto su tutto**, invece che solo dove qualcuno si era ricordato di metterlo. I limiti stretti scelti apposta — login 10 al minuto, recupero 5 ogni dieci minuti, richieste d'ingresso 10 ogni dieci minuti — restano quelli; sopra c'è un massimo generale di 600 al minuto che nessun client vero raggiunge. Il motivo del cambio è nel modello delle minacce e non nell'eleganza: [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §2 dice che una rete di casa **non è una rete fidata**, e «nessun limite se nessuno se lo ricorda» regala all'attaccante interno tutto ciò che nessuno si è ricordato. I controlli di salute sono esclusi dal conteggio: un healthcheck che inizia a fallire fa riavviare il container, e trasformerebbe una raffica in un'interruzione.
  - **Limiti di risorse del container: `pids_limit` sì, memoria no, e la memoria è la parte interessante.** Un archivio viene cifrato tutto in memoria ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)) e **misurando servono circa sei volte i dati** — 1,25 GB per 200 MB, 2,5 GB per 400 MB. Sotto quella soglia il backup non fallisce con un errore: lo uccide il kernel, senza scrivere niente, e con `restart: unless-stopped` l'istanza riparte e riprova. Un default scelto a occhio avrebbe quindi rotto i backup di chi ha molte fotografie, quindi non c'è: c'è la variabile, c'è la regola documentata, e **l'istanza confronta il proprio limite con i propri dati e lo dice in «Stato dell'istanza» prima che succeda**.
  - Un tentativo di ridurre quel costo — scrivere il `tar` su file invece di accumularlo in memoria — è stato fatto, misurato e **annullato**: sotto un limite di cgroup la page cache di quel file viene conteggiata al container esattamente come la memoria risparmiata, e la soglia non si è mossa. La riduzione vera passa da una cifratura a flusso, che `age-encryption` 0.3.0 non offre.
  - Ne discende un limite di prodotto che va detto adesso e non quando qualcuno lo scopre: **oltre qualche centinaio di megabyte di fotografie, i backup automatici smettono di essere sostenibili su un NAS.** Registrato in ADR 0013 fra le cose da riesaminare.
  - Intestazioni di sicurezza verificate su tutte le risposte e non solo sulle pagine: CSP senza `unsafe-inline`, `nosniff`, `no-referrer`, `DENY` valgono anche per le API.
- [x] Build multi-arch **pubblicabile**. La build era verificata su `linux/amd64` e `linux/arm64` dal 2026-08-15, immagine avviata e funzionante su entrambe; mancava la pubblicazione, che era una decisione di distribuzione e non di codice. Presa il 2026-08-16 con l'apertura del repository ([ADR 0015](adr/0015-licenza-agpl.md)): l'immagine è su `ghcr.io/chrono-web/estia`, **scaricabile senza credenziali** — verificato con un token anonimo del registry, indice OCI con `linux/amd64` e `linux/arm64` dentro la stessa etichetta, più un'etichetta `sha-` per commit. Da qui in poi aggiornare un'istanza è `docker compose pull`, ed è quello che dice [`INSTALLAZIONE.md`](INSTALLAZIONE.md).
  - **Ogni architettura si costruisce sul proprio runner** dal 2026-08-16, invece di emulare `arm64` con QEMU su una macchina `amd64`: i runner ARM nativi sono gratuiti sui repository pubblici, e l'apertura li ha resi disponibili. Le due metà si spingono per digest e un lavoro finale le unisce in un indice a cui attacca le etichette — se le mettesse ogni lavoro, l'ultimo ad arrivare farebbe puntare `latest` a una sola architettura. Misurato: **2,4 minuti** contro 3,5, e con la cache ancora fredda; la build `arm64` da sola è passata a 44 secondi.
  - Il workflow non si accontenta del push riuscito: ispeziona l'indice pubblicato e fallisce se dentro non ci sono entrambe le architetture. Verificato anche da fuori, in anonimo — indice OCI con `linux/amd64` e `linux/arm64`, immagine scaricata e avviata, `/health/ready` a posto.
- [x] **L'istanza si accorge se i propri dati non sopravvivranno all'aggiornamento**, aggiunto il 2026-08-17 dopo una perdita reale. Un'istanza installata dal pannello di un NAS senza mappare una cartella funziona perfettamente e **si azzera al primo aggiornamento**: il container viene buttato e rifatto, e con lui spariscono account, contenuti, fotografie e la chiave privata dell'istanza, che [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §3 classifica come non sostituibile.
  - Riprodotto sull'immagine pubblicata prima di scrivere una riga: senza volume, ricreare il container restituisce `state: unconfigured` e una chiave pubblica nuova; con un volume con nome, la stessa operazione torna configurata.
  - **La correzione è una riga: l'immagine dichiara `VOLUME /data`.** In un primo momento era stata scartata sulla base di una misura sbagliata — provata solo con `docker run` seguito da `rm` e `run`, che è il caso peggiore e non è quello che usa nessun percorso di aggiornamento. Rimisurata come si doveva: **stessa Compose, stessa ricreazione, con la riga i dati restano e senza spariscono.** È esattamente ciò che `jellyfin/jellyfin` dichiara per `/config`, ed è il motivo per cui aggiornare Jellyfin non richiede di rifare gli account.
  - Provato con un aggiornamento vero — immagine cambiata, container ricreato, **niente mappato a mano**: stessa chiave pubblica, password ancora valida, post ancora al suo posto.
  - Il rilevamento resta come rete sotto, non come rimedio, e adesso ha da dire una cosa utile in più: distingue un volume **anonimo** — durevole ma scomodo da ritrovare, ed è quello che si ottiene senza mappare niente — da uno a cui qualcuno ha dato un nome. La strada è quella di [ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md): l'istanza guarda la propria tabella dei mount e dice ciò che vede, nei log e nella diagnostica.
  - **La lezione da non perdere**: la prima misura ha risposto alla domanda sbagliata. `docker run` a mano non è il percorso di aggiornamento di nessuno, e misurare quello ha prodotto una conclusione plausibile e falsa, che stava per diventare un avviso al posto di una correzione.
- [~] Guida per almeno due classi di hardware reale. Costruito: la guida è scritta e non contiene più niente di specifico dell'UGREEN su cui è nata — architettura risolta dall'indice multi-arch, immagine dal registry, dati su un volume dichiarato dall'immagine. Manca: **installarla su una seconda classe di macchina** e scoprire che cosa dava per scontato. Il candidato è un mini-PC Linux, ed è legato alla decisione fra M4 e federazione.

Gate M3: un amministratore installa un'istanza su hardware reale in meno di 30 minuti seguendo la sola documentazione, e un restore da backup cifrato ripristina tutto.

**Stato del gate al 2026-08-17: aperto, e per una ragione sola.** Tutto ciò che si scrive è scritto: delle sedici voci di M3 nessuna è più `[ ]`, e le tre `[~]` hanno codice, test e documentazione. Ma il gate non chiede codice, chiede **due prove su hardware vero**, e nessuna delle due è stata fatta:

1. **un ripristino da backup cifrato su un NAS reale** — **eseguito il 2026-08-19 su un mini-PC Linux x86_64**, dal pannello e con il comando della guida, e ha trovato due difetti veri; resta da rifare **sul NAS**, che aggiunge `arm64` e il suo filesystem;
2. **un'installazione in meno di 30 minuti da parte di qualcuno che non ha scritto la guida** — il proprietario l'ha data per passata il 2026-08-17, ma nessun estraneo l'ha ancora seguita.

Non sono formalità. La prova sul campo del 2026-08-15 trovò un difetto che nessun test aveva visto — la directory dei dati a `0755` sotto Docker — e il 2026-08-17 un aggiornamento reale ne ha trovato uno peggiore: i dati che sparivano perché l'immagine non dichiarava il volume. **Entrambi invisibili da qui.** Finché quelle due prove non ci sono, M3 è costruita e non chiusa.

## M4 — Accesso da fuori dalla rete locale

Milestone additiva: il prodotto è già utilizzabile senza di essa. Riprende ciò che M0.2 ha lasciato non misurato.

**Stato al 2026-08-19: aperta nella prima voce.** Delle sette voci, sei dipendono dalla scelta del trasporto — che è l'ultima, e non è stata fatta: senza un trasporto scelto non c'è niente da misurare sotto CGNAT, nessun tempo di revoca da cronometrare e nessuna chiave di dispositivo da fissare. La prima voce invece non ne dipende, e per una ragione che merita di essere detta: **il trasporto del pilot è già deciso** da [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md), ed è Tailscale. Restava da documentarlo e da dichiararlo a chi lo attraversa, ed è ciò che è stato fatto il 2026-08-17 nell'interfaccia e il 2026-08-19 nella documentazione.

- [~] Trasporto del pilot documentato e dichiarato ai partecipanti (Tailscale, ADR 0004). **Dichiarato nell'interfaccia dal 2026-08-17, documentato dal 2026-08-19.** Manca la sola cosa che qui vale una spunta: che qualcuno lo percorra.
  - Il motivo di farlo adesso è in [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §1: il trasporto remoto è il confine di fiducia 4, «terzo dichiarato e sostituibile», e dichiararlo in un documento non è dichiararlo — chi attraversa quel confine i documenti non li legge.
  - **Nell'interfaccia**, dal 2026-08-17: l'istanza classifica **l'indirizzo del socket**, mai un'intestazione — quella la scrive il chiamante, e chiunque potrebbe dichiararsi locale — in quattro casi (`loopback`, `local`, `overlay`, `public`). A chi arriva da fuori dice che i contenuti restano cifrati fino all'istanza, e che chi gestisce quella rete vede comunque che si è collegato, quando e da dove. Sulla rete di casa tace: un avviso che compare ogni giorno è arredamento.
    - **Conta i tipi di rete, non gli indirizzi**: quattro contatori e quattro date in memoria, e nessun indirizzo da nessuna parte, come vuole §7. Che qualcuno arrivi da fuori è affare di chi amministra; da quale indirizzo non è affare di nessuno.
    - Il caso `public` è detto **come osservazione e non come verdetto**, dopo una misura che ha smentito a metà strada la prima versione: una porta pubblicata attraverso Docker Desktop arriva da un indirizzo pubblico vero — 104.16.8.34 — senza che nulla sia esposto a nessuno. Dall'indirizzo non si distingue un'esposizione da un proxy in mezzo, quindi l'istanza dichiara quale delle due non sa. Il primo arrivo di quel tipo finisce nei log una volta sola e resta nella diagnostica: §5 assume che l'istanza non sia raggiungibile da Internet, ed è un'ipotesi sul router di qualcun altro — di quelle che si rompono in silenzio.
    - Verificato contro socket veri e non solo con indirizzi finti: una rete Docker con sottorete `100.64.0.0/24` — lo spazio che usa una mesh VPN — e un container che chiama da `100.64.0.3` ottiene `overlay`.
    - Il limite di quell'inferenza è dichiarato nella documentazione invece che nascosto: `100.64.0.0/10` è insieme lo spazio delle mesh VPN e quello del CGNAT degli operatori, quindi «rete privata» è ciò che l'istanza deduce, non ciò che sa.
  - **Nella documentazione**, dal 2026-08-19: [`ACCESSO_DA_FUORI.md`](ACCESSO_DA_FUORI.md). Il trasporto va **sulla macchina e non attorno all'istanza** — un container affiancato legherebbe alla rete privata anche il percorso locale, che è quello principale, contro ADR 0004; le **revoche sono due** e non si sostituiscono, quella dell'istanza e quella del trasporto; la rete di casa non si annuncia mai come rotta, perché consegnerebbe la casa dove serviva una porta; e la chiave del nodo **scade dopo 180 giorni**, cioè l'istanza sparisce da fuori mentre da casa continua a funzionare.
  - **Che cosa vede il terzo, in tabella e con le fonti** (§5 di quel documento, verificato il 2026-08-19): chiavi pubbliche, nome e sistema operativo del dispositivo, indirizzo pubblico e orari al server di coordinamento; chi si è collegato a chi e quando nel registro del traffico; pacchetti cifrati ai relay; i contenuti a nessuno. Tre cose dette per intero: le chiavi private non escono dai dispositivi, i metadati invece sì, e **per quanto vengano conservati non è dichiarato**. Più una che riguarda ESTIA e non Tailscale: ogni membro apre un account con un'azienda terza, che è la cosa che questo progetto esiste per rendere non necessaria. Accettabile per un pilot, non come architettura — ed è il motivo per cui l'ultima voce di questa milestone esiste.
  - Manca: **che qualcuno la percorra.** La pagina è scritta dalle fonti pubbliche e da una sola misura sul campo — l'iPhone su rete mobile del 2026-08-13, percorso diretto, 0% di perdita, 151 ms — non da un'installazione riuscita, ed è l'opposto di come è nata [`INSTALLAZIONE.md`](INSTALLAZIONE.md). Il documento lo dichiara in testa. Finché un membro vero non entra da fuori su una macchina condivisa, questa casella resta a metà: è la stessa regola che tiene aperto il gate di M3.
- [ ] Prova del trasporto peer-to-peer a chiavi: due nodi che si trovano senza dominio né port forwarding.
- [ ] **Revoca nel modello a chiavi**: misura del tempo effettivo di perdita dell'accesso, budget 60 secondi.
- [ ] Registrazione della chiave del dispositivo presso l'istanza, e dichiarazione del percorso di primo contatto (da M1.3): diventano reali solo quando un dispositivo fissa davvero la chiave dell'istanza.
- [ ] Comportamento sotto CGNAT su una linea reale.
- [ ] Metadati conservati dal trasporto scelto.
- [ ] ADR sulla scelta definitiva del trasporto. **Rinviato di proposito al 2026-08-19**, e non per mancanza di tempo: la prima verifica di [ADR 0018](adr/0018-federazione-fra-istanze-estia.md) — iroh dentro l'immagine, su ARM — risponde in buona parte anche a questa domanda, e decidere prima di quel dato sarebbe adottare sulla fiducia. Nel frattempo **Tailscale resta il trasporto del pilot**, dichiarato in ADR 0004 e documentato in [`ACCESSO_DA_FUORI.md`](ACCESSO_DA_FUORI.md): chi ce l'ha già lo usa, ed è una dipendenza di prova, non una scelta di prodotto. Tre candidati, da misurare e non da adottare sulla fiducia:
  - **Tailscale**, già usato nel pilot e dichiarato in [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md). Maturo, con app iOS, ma con un control plane di terzi.
  - **iroh direttamente dentro ESTIA**, candidato dal 2026-08-19 e conseguenza di [ADR 0018](adr/0018-federazione-fra-istanze-estia.md): se l'istanza parla già iroh per federare, il dispositivo può parlarlo con lei — binding ufficiali **Swift per iOS e Kotlin per Android**, cioè nessun buco di piattaforma che dipenda dalla roadmap di altri, e **una dipendenza di rete sola invece di due**. Non serve una VPN: ESTIA non deve mettere una macchina su una rete virtuale, deve far parlare un'app con un servizio. I due prezzi, dichiarati: la strada nativa arriva **con l'app mobile**, che ADR 0004 ha tolto dalla strada critica; e dal **browser** iroh funziona in WebAssembly ma **solo attraverso un relay**, perché una pagina web non può mandare pacchetti UDP — quindi servirebbe comunque una macchina pubblica che faccia da ponte, autoospitabile ma da tenere accesa.
  - **[Rayfish](https://github.com/rayfish/rayfish)**, segnalato il 2026-08-15 e riguardato il 2026-08-19: mesh VPN peer-to-peer in Rust **costruita sopra `iroh`**, MPL-2.0, **senza server di coordinamento centrale**. Il giudizio del 2026-08-15 regge, e il candidato precedente lo indebolisce: risolve un problema più grande di quello che ESTIA ha — mettere un'intera macchina su una rete virtuale — portandosi dietro un progetto pre-1.0 su cui poggerebbe la sicurezza di rete di ogni istanza. È esattamente la proprietà che [ADR 0001](adr/0001-private-network-control-plane.md) cercava e non trovò, e che costò sette passaggi tecnici all'amministratore. Ma il progetto si dichiara **sperimentale, pre-1.0 e senza audit di sicurezza indipendente**, e supporta Linux e macOS, Android in modo iniziale, **non iOS**. Su di esso poggerebbe l'intera sicurezza di rete di un'istanza: oggi non regge il criterio di `AGENTS.md` sull'usare componenti maturi. Da riesaminare quando si apre questo ADR, non prima.

## Milestone successive, non autorizzate ora

Richiedono un nuovo piano tecnico prima dell'implementazione.

**Riordinate il 2026-08-16** dopo la revisione di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §11, che ha spostato il centro dal quartiere alla sovranità del dato. Il profilo sale, perché è la superficie che rende ESTIA utile anche a chi non ha un quartiere attorno.

**Riordinate di nuovo il 2026-08-19** con [ADR 0018](adr/0018-federazione-fra-istanze-estia.md): la federazione di base non è più ActivityPub. La rete fra istanze ESTIA diventa il comportamento predefinito e non costa un dominio; ActivityPub scende a opzione per chi vuole il Fediverso. Con essa entra nell'elenco la moderazione federata, che prima non aveva un posto perché non c'era ancora niente da moderare fuori dall'istanza.

1. **Profilo, con follow e richieste di follow.** Pagina profilo, profilo chiuso o aperto, e lo scope `followers` — che è nello schema dalla prima migrazione del feed e non è mai stato implementato. Comprende la scelta della cerchia al momento di pubblicare, che oggi l'interfaccia non offre di proposito: un post «pubblico» non raggiungerebbe nessuno finché non c'è federazione, e un'etichetta che mente è peggio di una funzione che manca.
   - **La forma è decisa** da [ADR 0018](adr/0018-federazione-fra-istanze-estia.md) §«Superfici e pubblicazione», e non è un menu a tendina: **un pulsante per feed, senza sovrapposizioni**. Le impostazioni della persona sono tre — non presente nella rete ESTIA (default), presente e privata, presente e pubblica — e il contatto diretto avviene con un **QR code che trasporta una chiave, non un indirizzo**, perché un link richiederebbe un dominio comune, cioè un centro.
   - **Come si cerca** è deciso nello stesso ADR, §«Scoperta»: indice autogenerato dalle istanze già collegate, un salto, più ricerca a richiesta. Resta da progettare, non da decidere.
2. **Rete fra istanze ESTIA**, decisa il 2026-08-19 con [ADR 0018](adr/0018-federazione-fra-istanze-estia.md): le istanze si trovano e si autenticano **per chiave pubblica**, senza dominio, senza certificato, senza aprire porte e dietro CGNAT. È ciò che rende vero il punto 1 fuori dall'istanza **senza comprare niente**, ed è la ragione per cui la federazione smette di essere riservata a chi ha un dominio. La proprietà che la definisce è la seconda decisione di quell'ADR: **i contenuti si visitano, non si replicano** — un post resta sulla macchina di chi lo ha scritto e viene servito su richiesta, quindi cancellazione e revoca diventano reali. Si paga in disponibilità: a macchina spenta, quei contenuti non sono leggibili. Candidato tecnico `iroh` 1.0, con quattro verifiche vincolanti prima di scrivere codice. **La prima è a metà dal 2026-08-20**: dentro `node:24.18.0-bookworm-slim`, l'immagine di base di ESTIA, il modulo nativo si carica e **due container separati si collegano per chiave pubblica** senza relay né scoperta di terzi; resta da rifare su `arm64`, e soprattutto resta non provato l'attraversamento del NAT, che richiede due reti vere. **Dal 2026-08-20 la sonda è dentro l'immagine** (`ESTIA_NETWORK_PROBE`, spenta di default, incapace di impedire l'avvio, e senza trasportare contenuti): da qui in avanti quella verifica non richiede software, richiede due case. Le quattro: girare su un NAS ARM vero, **il costo di un profilo molto seguito** — quante letture al secondo regge una macchina domestica prima che il modello a visita non stia in piedi —, scoperta e relay senza infrastruttura di terzi, e il capitolo di sicurezza per le istanze sconosciute — l'assunzione di [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §5 cambia proprio qui.
3. **ActivityPub, opzionale per istanza**: chi vuole affacciarsi sul Fediverso adotta un dominio e attiva l'adapter ([ADR 0002](adr/0002-activitypub-confine-non-schema.md), [ADR 0018](adr/0018-federazione-fra-istanze-estia.md)). Non è più l'unica porta verso l'esterno, è la sola che costa un acquisto, ed è **la sola fatta di copie**: ciò che esce di lì viene archiviato su server altrui e la cancellazione vale quanto vale là. Va detto a chi la sceglie, nel momento in cui la sceglie. Gli invarianti di ADR 0002 valgono comunque, per entrambe le porte: sono proprietà del modello di dominio, non del protocollo.
4. **Moderazione federata**, che con il punto 2 smette di essere teorica: una rete aperta fra istanze è anche una rete che propaga in fretta. Il livello «blocklist di istanze remote» esiste già in [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §7; sopra ci vanno le idee raccolte il 2026-08-19, ancora da istruire in un ADR.
   - **Le segnalazioni circolano, i verdetti no.** Un'istanza accumula segnalazioni da chi la incontra, e ogni istanza decide a chi credere e a quali liste iscriversi. Nessuna autorità emette sentenze valide per tutti: sarebbe il centro che ESTIA esiste per non avere.
   - **Perdita di visibilità e offuscamento preventivo** al posto della sparizione, **con la lista dei motivi visibile** a chi guarda. È la stessa regola che il progetto applica ovunque: dire perché, invece di agire in silenzio.
   - **Riconoscitore di immagini per materiale di abuso**, registrato come voce e non come funzione decisa, perché ha tre problemi aperti che vanno sciolti prima: il meccanismo standard contro la pedopornografia sono **liste di impronte di materiale già noto**, il cui accesso è riservato a organizzazioni verificate e che un'istanza domestica non può avere; un modello che classifica da solo produce **falsi positivi** in un sistema dove non esiste nessuno a cui fare appello; e il confine da non passare mai è la **scansione dei contenuti privati**, che collide con [ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md). Da valutare anche il costo di calcolo su un NAS ARM.
5. **Chat, DM e gruppi con cifratura end-to-end nello stesso rilascio.** Non esiste una versione intermedia in chiaro: [ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md) rende MLS parte della funzionalità, non una milestone successiva. Le notifiche push arrivano con questo blocco. **I gruppi attraversano le istanze** — tre amici a Milano, Genova e Torino, un gruppo solo — e questo non è un costo aggiuntivo per MLS: è il caso d'uso per cui è stato progettato, membri su server diversi che non si fidano l'uno dell'altro. La chat vive sullo stesso profilo con cui si pubblica, come su Instagram, con la reattività di WhatsApp. Il muro noto è un altro, ed è già registrato fra le decisioni aperte: **le notifiche push**. Va detto con precisione, perché è più basso di quanto sembri: nel disegno che usa Signal la notifica è un **segnale vuoto** che sveglia l'app, e il messaggio viene recuperato e decifrato **sul dispositivo** — Apple e Google vedono che è arrivato qualcosa e quando, mai il contenuto né il mittente. Resta l'asimmetria fra i due sistemi: su Android esistono percorsi di push autogestiti, su iOS il recapito in background passa obbligatoriamente da APNs. Quindi il terzo è nel percorso come **portalettere che non apre la busta**, e ciò che gli si concede è metadato, non contenuto. La condizione 1 di [`RECONCILIATION.md`](RECONCILIATION.md) §7 si è avverata il 2026-08-15 — gate M2 superato su hardware reale, e la comunità pilota che chiede i messaggi diretti come mancanza principale — quindi il rinvio va **riesaminato**, che non vuol dire riaperto d'ufficio.
6. Client mobile, con l'integrazione del motore di rete già collaudata su desktop.
7. **Indice dei profili pubblici**, per la ricerca di persone tra istanze. Con [ADR 0018](adr/0018-federazione-fra-istanze-estia.md) smette di essere un accessorio — è ciò che dà significato allo stato «profilo pubblico» — e la forma è decisa: **l'indice si autogenera dalle connessioni che già esistono**, un salto solo, più una ricerca inoltrata a richiesta alle istanze conosciute. Il salto transitivo è scartato con i numeri davanti: due salti sono decine di migliaia di profili, e l'indice ridiventa il flusso globale appena evitato.
8. Export/import e migrazione ActivityPub `Move`.
9. Governance opzionale.
10. **Stories ed eventi**, se e solo se un ADR scioglie le due tensioni dichiarate in [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §9: l'effimero contro la portabilità, e l'effimero contro la moderazione.

Le condizioni per riesaminare il rinvio della chat sono in [`RECONCILIATION.md`](RECONCILIATION.md) §7.
