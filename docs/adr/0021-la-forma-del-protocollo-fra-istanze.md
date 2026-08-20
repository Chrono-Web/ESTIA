# ADR 0021 — La forma del protocollo fra istanze: la versione nell'ALPN, una domanda per stream

- Stato: **Accepted**
- Data: 2026-08-20
- Proprietario: progetto ESTIA
- Scioglie: «la forma del protocollo» e «il versionamento», lasciate aperte da [ADR 0018](0018-federazione-fra-istanze-estia.md)
- Poggia su: [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), che dice **che cosa** è lecito chiedere; qui si decide **come si chiede**
- Non tocca: gli invarianti di [ADR 0002](0002-activitypub-confine-non-schema.md), che valgono identici perché sono proprietà del modello di dominio

## Contesto

I tre cancelli tecnici di ADR 0018 sono chiusi e il capitolo di sicurezza è scritto. Resta la cosa che quell'ADR aveva registrato fra le voci aperte, e che è anche la più difficile da cambiare dopo: **la forma dei messaggi.**

Va decisa con una consapevolezza sola, che è anche la ragione per cui questo documento esiste invece di essere una funzione scritta bene: **un protocollo diventa irreversibile nel momento in cui due macchine che non si aggiornano insieme lo parlano.** Da lì in poi ogni cambiamento deve convivere con ciò che c'era prima. ADR 0018 lo aveva già messo fra le conseguenze negative — «due istanze di versioni diverse dovranno continuare a parlarsi, problema che ActivityPub risolveva per noi».

## 1. Chi chiede non lo dice il messaggio, lo dice la connessione

**L'identità dell'istanza che chiede è la chiave pubblica del capo remoto della connessione QUIC, e non compare in nessun campo.**

È la decisione più importante qui dentro, e ha già un precedente nel progetto: la §2 della baseline vieta di concedere privilegi in base a un'intestazione HTTP, «perché quella la scrive il chiamante». Un campo `istanza` dentro il messaggio sarebbe la stessa identica cosa, e trasformerebbe l'intero modello di ADR 0020 — nega salvo rapporto — in un controllo che chiunque supera dichiarandosi qualcun altro.

Il trasporto ci consegna quel dato già autenticato: iroh stabilisce la connessione **verso una chiave**, e l'handshake QUIC prova che l'altro capo possiede la privata corrispondente. Fidarsi del trasporto qui è corretto; fidarsi di un campo non lo sarebbe mai.

Ne discende una regola di implementazione che vale come invariante: **nessuna funzione che decide un permesso accetta l'identità come parametro leggibile dal messaggio.** Il livello di rapporto si calcola dalla chiave della connessione, prima di guardare che cosa è stato chiesto.

## 2. La versione sta nell'ALPN

**L'ALPN è `estia/N`, dove `N` è la versione maggiore del protocollo.** Un'istanza dichiara **tutte** le maggiori che sa parlare — oggi `["estia/1"]`, domani `["estia/2", "estia/1"]` — e la negoziazione ALPN di QUIC sceglie.

L'alternativa era un campo `versione` dentro il primo messaggio, e va detto perché è stata scartata: con quella si scopre l'incompatibilità **dopo** aver stabilito la connessione e **dopo** aver parsato qualcosa, e ogni messaggio successivo si porta dietro la propria logica di compatibilità. Con l'ALPN la negoziazione avviene una volta sola, prima di tutto, dove il trasporto la fa già per conto suo — e il fallimento è pulito: la connessione non si stabilisce, invece di stabilirsi e non capirsi.

**Che cosa succede fra versioni diverse**, detto per intero perché è il caso che ADR 0018 temeva:

- un'istanza nuova che ne incontra una vecchia **parla la vecchia**, perché annuncia entrambe;
- un'istanza vecchia che ne incontra una nuova funziona, per la stessa ragione, senza sapere che esiste una versione nuova;
- il giorno che una maggiore viene **ritirata**, chi non ha aggiornato smette di collegarsi con un errore netto — «non parliamo la stessa lingua» — e non con dati che sembrano validi e non lo sono. Ritirare una maggiore è quindi una decisione di prodotto con una data, non una pulizia di codice.

## 3. Una domanda e una risposta per stream

**Ogni richiesta apre uno stream bidirezionale, ci scrive la domanda, chiude il lato di scrittura, legge la risposta e finisce lì.**

QUIC regala gli stream: aprirne uno costa quasi niente e non c'è un limite pratico da amministrare. Quindi non serve niente di ciò che di solito si costruisce sopra una connessione — nessun multiplexer, **nessun identificatore di correlazione**, nessuna coda di richieste in volo da appaiare alle risposte. La concorrenza è gratis e la sequenza è ovvia: se una richiesta è lenta, non ne rallenta nessun'altra.

È anche la forma che la sonda di ADR 0018 esercita già dal 2026-08-20, quindi non è una scommessa: è ciò che ha attraversato due linee domestiche cinque volte.

## 4. JSON, e il tetto viene prima del parse

**I messaggi sono JSON in UTF-8**, e ogni lettura ha un **tetto in byte applicato prima di interpretare qualunque cosa**.

L'ordine è la parte che conta, non il formato: si legge al massimo `N` byte, e solo dopo si prova a capirli. Un'istanza sconosciuta non deve poter far allocare memoria proporzionale a ciò che decide lei — è la stessa regola con cui [ADR 0011](0011-immagini-in-webassembly.md) legge la dimensione dall'intestazione prima di decodificare un'immagine.

JSON invece di un formato binario per tre ragioni pratiche: il progetto lo usa già ovunque e i contratti sono già JSON Schema; un protocollo che si legge con gli occhi si diagnostica quando due case non si parlano e non si può attaccare un debugger; e i messaggi di controllo sono piccoli, quindi la compattezza non compra niente. **Questa scelta va riaperta quando passeranno i contenuti**, dove le dimensioni cambiano ordine di grandezza — ed è registrata sotto come condizione di riesame, non come dimenticanza.

## 5. La forma di una risposta

Ogni risposta è una delle due, e mai qualcosa in mezzo:

- `{"ok": true, ...}` con i campi propri della domanda;
- `{"ok": false, "codice": "...", "messaggio": "..."}`, dove il **codice è stabile e destinato al programma** e il messaggio è una frase per una persona.

È la stessa disciplina di `DomainError` dentro l'istanza, e per la stessa ragione: un chiamante che deve distinguere i casi leggendo il testo di un messaggio è un chiamante che si rompe alla prima riformulazione.

**Un rifiuto non spiega più del necessario.** «Non sei collegata» è la risposta giusta; «non sei collegata, ma questa persona esiste» sarebbe un modo di rispondere a una domanda che non è stata autorizzata — cioè un canale di enumerazione costruito con i messaggi d'errore, che è precisamente ciò che ADR 0020 §1 vieta.

## 6. Che cosa può cambiare dentro una versione maggiore

Perché la regola del §2 valga davvero, dentro una maggiore le modifiche sono **solo additive**:

- si possono **aggiungere campi** a una richiesta o a una risposta; chi non li conosce li **ignora** invece di rifiutare;
- si possono **aggiungere tipi di richiesta**; chi non li conosce risponde `ok: false` con il codice `richiesta_sconosciuta`, che è un no ordinato e non un errore di trasporto;
- **non** si cambia il significato di un campo esistente, **non** se ne cambia il tipo, e **non** se ne rende obbligatorio uno che era assente. Ognuna di queste tre è una versione maggiore nuova.

Ignorare i campi sconosciuti è ciò che rende possibile aggiungere qualcosa senza coordinare l'aggiornamento di tutte le case d'Italia nello stesso weekend.

## 7. Che cosa il protocollo non trasporta

Non è una precisazione, sono invarianti che il codice deve rendere impossibili da violare per distrazione:

- **il feed locale non è raggiungibile da nessuna richiesta**, per nessun livello di rapporto ([ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §3);
- **non esiste una richiesta che consegni contenuti a questa istanza.** Il protocollo ha domande e risposte, non consegne: non c'è casella d'ingresso, quindi non c'è niente da validare, da mettere in coda o da conservare per conto di altri;
- **niente è enumerabile**: ogni richiesta nomina ciò che vuole, e non esiste una domanda che risponda «tutti».

## Conseguenze

**Positive.** La compatibilità fra versioni è delegata a un meccanismo che il trasporto ha già e che sbaglia in modo pulito. Non c'è nessuna macchina a stati da mantenere sopra la connessione. L'autorizzazione ha un solo punto d'ingresso — la chiave del capo remoto — e non può essere aggirata da un campo. E il protocollo si legge, il che conta molto quando le due macchine da confrontare stanno in due città.

**Negative.** JSON costa in byte, e quando passeranno le fotografie sarà il momento di riaprire. Una versione maggiore nuova richiede di parlarne due per un periodo, quindi il codice di transizione esiste per davvero. E la scelta «una domanda per stream» rende scomodo, per costruzione, tutto ciò che somiglia a un flusso continuo — se un giorno servisse una notifica spinta in tempo reale, quella non sarà una richiesta e vorrà una decisione sua.

**Neutre.** Niente di ciò che esiste cambia. La sonda di ADR 0018 continua a vivere sul proprio ALPN, separata, e resta una misura.

## Quando riesaminare

- **Quando passeranno i contenuti**, in particolare le immagini: il §4 va rimisurato con dimensioni vere, e un formato binario diventa un candidato serio.
- Se servisse una **notifica spinta** — l'avviso vuoto di ADR 0018 — perché il §3 la rende scomoda di proposito, e va decisa invece che improvvisata sopra una richiesta esistente.
- Se una versione maggiore dovesse essere **ritirata**, il §2 chiede una data e un annuncio, non una rimozione silenziosa.
