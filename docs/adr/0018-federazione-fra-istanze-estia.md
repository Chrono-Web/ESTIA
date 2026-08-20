# ADR 0018 — La federazione di base è fra istanze ESTIA; ActivityPub è un'opzione

- Stato: **Accepted**
- Data: 2026-08-19
- Proprietario: progetto ESTIA
- Riordina: la milestone successiva «Federazione ActivityPub», che era l'unico modo previsto di uscire dall'istanza
- Non tocca: [ADR 0002](0002-activitypub-confine-non-schema.md), i cui invarianti restano validi e servono anche qui

## Contesto

Fino a oggi i documenti prevedevano una sola porta verso l'esterno: **ActivityPub, opzionale per istanza**, dove «opzionale» aveva una ragione tecnica precisa e mai detta fino in fondo.

ActivityPub consegna in push: un'istanza remota deve poter **raggiungere la tua** su HTTPS, a un nome stabile. Quindi servono un dominio, un certificato e un endpoint pubblico. Ma [ADR 0003](0003-primo-contatto-in-rete-locale.md) ha costruito ESTIA esattamente al contrario — nessun dominio, nessun certificato, nessuna porta aperta — e [ADR 0001](0001-private-network-control-plane.md) ha misurato che chiedere quelle cose a un amministratore costa **sette passaggi tecnici**, con il tentativo reale fermatosi al quarto.

Ne discendeva una conseguenza che nessuno aveva scritto: **la federazione era di fatto riservata a chi compra un dominio.** Chi accende un'istanza su un NAS dietro CGNAT — cioè il caso normale, quello per cui il prodotto è progettato — restava in un giardino recintato. [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11 dice l'opposto: «la connessione con chiunque è costitutiva, non un'estensione».

Il pezzo che mancava non era una decisione di prodotto: era un modo di far parlare due macchine che non hanno né indirizzo stabile né nome.

## La distinzione che scioglie il nodo

**ActivityPub è un protocollo di interoperabilità; un trasporto peer-to-peer è un trasporto.** Non sono alternative sullo stesso asse, ed è per questo che la domanda «AP oppure no» era mal posta.

Con un trasporto che indirizza **per chiave pubblica** invece che per indirizzo IP, due istanze si trovano senza dominio, senza certificato e senza aprire porte: la stessa proprietà che [ADR 0001](0001-private-network-control-plane.md) cercava e non trovò nel 2026-07.

Va notata anche l'asimmetria con M4, perché è ciò che rende questa strada percorribile **adesso** e l'altra no:

| Uso                          | Chi parla con chi  | Che cosa serve                                                      |
| ---------------------------- | ------------------ | ------------------------------------------------------------------- |
| Trasporto remoto (M4)        | Telefono → istanza | Client iOS e Android, app store, uno strato di rete sul dispositivo |
| **Federazione (questo ADR)** | Istanza ↔ istanza  | Due server Linux                                                    |

Nel secondo caso non c'è nessun telefono, nessun app store e nessun iOS. I blocchi che tengono ferma M4 qui non si applicano.

## Decisione

**1. La base della federazione è una rete fra istanze ESTIA**, che si trovano e si autenticano per **chiave pubblica**. Funziona senza dominio, senza certificato, senza port forwarding e dietro CGNAT. Chi accende un'istanza può raggiungere chiunque ne abbia un'altra, senza comprare niente.

**2. I contenuti si visitano, non si replicano.** Un post resta sull'istanza di chi lo ha scritto, e viene servito **su richiesta** a chi ha il diritto di vederlo. Nessuna istanza accumula gli archivi di persone che non ospita.

**3. ActivityPub resta, come opzione volontaria.** Chi vuole affacciarsi su Mastodon, Pixelfed e sul resto del Fediverso adotta un dominio e attiva l'adapter. Chi non lo fa non perde nulla della rete ESTIA. AP smette di essere l'unica porta e diventa una delle due — quella fatta di copie, per costruzione.

**4. ESTIA accetta di scrivere il proprio protocollo fra istanze**, e con esso di essere in parte un progetto di rete. È una deroga esplicita all'obiezione di [ADR 0001](0001-private-network-control-plane.md) contro l'Opzione C — «renderebbe ESTIA anche un prodotto di networking» — e va giustificata invece che aggirata: quell'obiezione riguardava un **motore VPN dentro un'app mobile**, con entitlement, app store, comportamento in background e consumo energetico. Qui il perimetro è **server ↔ server**, su Linux, senza negozi di applicazioni in mezzo. È un problema più piccolo di un ordine di grandezza, e in cambio consegna la proprietà su cui il progetto si regge.

## I contenuti si visitano, non si replicano — perché, e a che prezzo

È il punto 2, ed è la parte di questo ADR che diverge dal resto del mondo federato. Mastodon e ActivityPub **consegnano e archiviano**: quando pubblichi, una copia del post parte verso il server di ogni follower e lì resta. È una scelta di protocollo, non una legge della federazione, ed è la scelta che ESTIA non fa.

Qui il percorso è un altro. Un browser non parla la lingua della rete fra istanze, quindi: **il client chiede alla propria istanza, la propria istanza chiede a quella dell'autore, e restituisce.** La regola che rende vera la decisione è una sola, e va trattata come vincolo di implementazione e non come ottimizzazione: **quel passaggio tiene i contenuti in memoria e non li scrive su disco.** Chiusa l'applicazione, non resta niente da nessuna parte se non a casa dell'autore.

Serve anche un modo di sapere che c'è qualcosa di nuovo senza ricevere copie. La forma coerente è **un avviso vuoto** — «ho pubblicato», senza il contenuto — e il contenuto si recupera solo se e quando qualcuno guarda davvero. È lo stesso disegno delle notifiche push di cui parla il piano per la chat: la busta si consegna, il contenuto si va a prendere.

### Che cosa compra

- **La cancellazione diventa vera.** Cancellare un post lo cancella, invece di spedire in giro una richiesta di cancellazione che ogni destinatario è libero di ignorare.
- **La revoca diventa vera.** Togliere un follower ha effetto immediato, perché ogni lettura è una richiesta nuova che l'istanza dell'autore può rifiutare. Il controllo resta dove sta il contenuto.
- **La frase di [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §1 diventa letterale**: i tuoi contenuti stanno fisicamente in un posto che è tuo, e continuano a starci anche quando qualcuno da un'altra istanza li legge.

### Che cosa costa

- **Se la macchina dell'autore è spenta, i suoi contenuti non sono leggibili.** Con le copie restavano disponibili; qui no. È il prezzo principale, ed è sostenibile solo perché il prodotto presuppone già «una macchina che resti accesa» ([`INSTALLAZIONE.md`](../INSTALLAZIONE.md)).
- **Niente lettura offline** del feed remoto.
- **Aprire il feed costa una richiesta a ogni istanza** delle persone seguite, e si attende la più lenta.
- **Un profilo molto seguito fa lavorare la propria macchina**: con le copie il costo era una spedizione sola, qui è una richiesta per lettore. Da misurare prima di scrivere il protocollo, perché decide se serve una forma di cache condivisa e a quali condizioni.

### La cosa che va detta e non nascosta

**In questo modello l'istanza dell'autore sa quando qualcuno lo legge.** Con la consegna a copie l'autore non lo sa; con la visita, la richiesta arriva a casa sua. Non è un difetto risolvibile del tutto — è la controparte del controllo — ma va limitata per costruzione:

- la richiesta arriva dall'**istanza** del lettore, non dal suo dispositivo, il che aggrega i lettori di una stessa istanza;
- si applica la regola già in vigore per le connessioni in arrivo: **contare, non registrare** ([`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §7);
- nessuna funzione di prodotto può essere costruita su questo dato. Niente «visualizzato da», niente conteggi di lettura per post: sarebbe trasformare un effetto collaterale in una feature, e insegnare al sistema a conservare ciò che deve dimenticare.

### L'eccezione, dichiarata

**ActivityPub è fatto di copie.** Chi sceglie quella superficie accetta che i propri post finiscano sui server del Fediverso e vi restino, con la cancellazione che vale quanto vale lì. Non è un difetto da correggere: è la ragione in più per cui quella porta è opzionale, e per cui va detto **al momento della scelta** — non nelle condizioni d'uso.

E una precisazione che evita una promessa di troppo: nessun sistema impedisce a un lettore di fare uno screenshot. Ciò che cambia non è l'impossibilità di copiare, è che **il sistema non crea copie da solo**.

## Che cosa non cambia, e va difeso proprio adesso

Un allargamento è il momento in cui le proprietà scomode evaporano senza che nessuno decida di buttarle. Quindi, per iscritto:

- **Il feed locale non viene federato** ([`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §3). Resta la bacheca di chi condivide l'istanza.
- **Il default resta la cerchia più stretta**: scope `local`, e mai `public` per omissione.
- **Gli invarianti di [ADR 0002](0002-activitypub-confine-non-schema.md) valgono identici.** Identificatori opachi, autore e istanza di casa espliciti, scope obbligatorio, timestamp UTC, cancellazione logica con tombstone, relazioni esplicite: sono proprietà del **modello di dominio**, indipendenti dal protocollo che le trasporta, e la funzione pura di traduzione in `Note` ([`activitystreams.ts`](../../apps/core-api/src/feed/activitystreams.ts)) resta la prova che l'informazione necessaria c'è.
- **Zero server dello sviluppatore.** Vale anche per l'infrastruttura del trasporto: vedi §«L'infrastruttura del trasporto».

## Superfici e pubblicazione

### Tre feed, tre gesti separati

| Feed            | Chi lo vede                               | Esiste                              |
| --------------- | ----------------------------------------- | ----------------------------------- |
| **Locale**      | I membri dell'istanza                     | Sempre. È il default e non esce mai |
| **Rete ESTIA**  | Chi segue la persona, sulle altre istanze | Sempre, ma la presenza è una scelta |
| **ActivityPub** | Il Fediverso                              | Solo se l'istanza adotta un dominio |

**Ogni feed ha il proprio pulsante per pubblicare, e i post non si sovrappongono.** Non è una preferenza di interfaccia: è l'invariante 3 di [ADR 0002](0002-activitypub-confine-non-schema.md) — «scope obbligatorio, mai `public` per assenza» — resa gesto. Un menu a tendina si legge male; due pulsanti diversi no. E rende l'invariante di [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §3 vero per costruzione: se un post locale non è promuovibile, il feed locale non può essere federato per errore.

Oggi il composer non offre alcuna scelta di cerchia, e il servizio scrive `local` quando nessuno dice altro. Era deliberato — un'etichetta «pubblico» che non raggiunge nessuno mente — e questa sezione dice come quel buco va riempito quando la rete esisterà.

### Il feed di una persona non è un flusso globale

Composto da due sorgenti: **chi la persona segue**, e **la sua istanza**. Nessuno riceve «tutto ESTIA», e non è una limitazione accettata a malincuore: un flusso globale richiederebbe o un aggregatore centrale — rifiutato — o che ogni macchina domestica ricevesse il traffico di tutte le altre, che non regge. Il lavoro che un'istanza fa è proporzionale a **quanto i suoi membri seguono**, non a quanto è grande la rete.

### La presenza è una scelta della persona, non dell'istanza

1. **Non presente nella rete ESTIA** — esiste solo nell'istanza. **È il default**, perché niente diventa pubblico per omissione ([`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §2, principio 3).
2. **Presente e privato** — non compare in nessuna ricerca; ci si collega solo per **contatto diretto**.
3. **Presente e pubblico** — cercabile.

Il contatto diretto avviene con un **QR code**, e la ragione è tecnica prima che di comodità: un link richiederebbe un dominio a cui puntare, cioè un intermediario per tutta la rete, cioè il centro che questo ADR rifiuta. **Il QR non trasporta un indirizzo, trasporta una chiave** — la stessa forma di identità con cui le istanze si trovano. È [ADR 0003](0003-primo-contatto-in-rete-locale.md) spostato di un piano: là un dispositivo riconosce un'istanza senza autorità esterne, qui una persona ne riconosce un'altra.

### Che cosa «privato» promette

Con il punto 2 la promessa è forte, e va scritta con precisione perché finirà in un'interfaccia.

Un account privato significa: **i tuoi contenuti restano sulla tua macchina, e ogni volta che qualcuno li chiede la tua macchina decide se rispondere.** Togli l'approvazione e la lettura successiva fallisce. Non c'è nessun archivio altrove da cui recuperarli.

Resta una differenza con [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), e va tenuta visibile invece che appiattita: per i messaggi privati la garanzia è **crittografica**, quindi vale anche contro chi amministra una macchina; per un profilo privato la garanzia è **di controllo dell'accesso**, e vale finché la macchina è tua e si comporta come deve. Sono due livelli diversi, e l'interfaccia non deve farli sembrare uno.

## Scoperta: come ci si trova senza un centro

«Pubblico e cercabile» richiede un indice, e un indice è la forma più naturale di centro. La forma scelta non ne costruisce uno: **l'indice si autogenera dalle connessioni che già esistono.**

- **Quello che un'istanza tiene**: i profili pubblici propri e quelli delle istanze **direttamente collegate**. Un salto, non due.
- **Quello che chiede al momento**: se una ricerca non trova nulla in casa, l'istanza la inoltra a quelle che conosce, che rispondono **solo per i propri** profili pubblici. Il risultato arriva con l'indicazione di **tramite chi** è stato trovato, e non viene archiviato.
- **Chi non c'è non compare**: gli stati 1 e 2 non entrano in nessun indice, per quanto collegata sia la loro istanza.

**Il salto transitivo è stato scartato, con i numeri davanti.** Se ogni istanza collegata ne porta un centinaio, due salti sono decine di migliaia di profili e tre sono l'intera rete: l'indice ridiventa il flusso globale appena evitato. In più, pubblicare l'elenco delle proprie connessioni espone il grafo sociale dell'istanza, che è informazione sensibile per conto suo. La ricerca a richiesta copre lo stesso bisogno pagandolo solo quando serve.

La proprietà che ne discende merita di essere nominata, perché è ciò che sostituisce l'algoritmo: **la scoperta segue il grafo sociale.** Si incontrano le persone che qualcuno di vicino ha ritenuto degne di essere seguite. È una reputazione implicita, senza ranking e senza punteggi sui contenuti.

### Come due istanze si collegano

Due legami diversi, e vanno tenuti distinti perché uno è automatico e l'altro è una decisione.

**Il legame sociale nasce dalle persone.** Quando qualcuno segue qualcuno sull'altra istanza, le due macchine cominciano a parlarsi. Nessun amministratore interviene: la rete cresce perché le persone si seguono.

**Il legame amministrativo è deliberato.** Un amministratore può collegare la propria istanza a un'altra anche senza che nessuno segua nessuno — le istanze dei condomini dello stesso quartiere, per dire — e quel legame condivide l'indice pubblico. È anche il posto dove vivono i suoi contrari: il blocco di un'istanza e l'adesione alla lista di blocco di qualcuno di cui ci si fida.

Il rischio da nominare: **un'istanza può mentire su chi ospita**, e riempire di profili finti l'indice di chi la conosce. La difesa non è tecnica, è strutturale: per entrare in un indice bisogna che qualcuno segua qualcuno, e un'istanza che si comporta male si blocca — e il blocco tocca solo la rete, mai la bacheca di casa.

## Il candidato tecnico: iroh

Verificato il 2026-08-19, e non adottato sulla fiducia.

| Voce                      | Stato                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versione                  | **1.0 rilasciata a giugno 2026** — la data è di fonte giornalistica, non della documentazione; il pacchetto Node è oggi 1.1.0. Impegno dichiarato di stabilità del protocollo di trasmissione |
| Indirizzamento            | `EndpointID` = chiave pubblica; l'identità sopravvive al cambio di rete                                                                                                                       |
| Attraversamento del NAT   | Hole punching su QUIC; relay solo come ripiego dichiarato                                                                                                                                     |
| Cifratura                 | Fra i due capi, QUIC; i relay non vedono i contenuti                                                                                                                                          |
| Binding ufficiali         | Rust, **Node.js** (N-API), Swift, Kotlin, Python                                                                                                                                              |
| Pacchetto Node            | `@number0/iroh` 1.1.0, licenza `MIT OR Apache-2.0` — compatibile con l'AGPL                                                                                                                   |
| Architetture precompilate | `linux-arm64-gnu` e `linux-arm64-musl` presenti, oltre a x64, macOS, Android e Windows                                                                                                        |

Le connessioni QUIC restano aperte e sopravvivono al cambio di rete, il che rende sostenibile un modello a visita: la richiesta di lettura viaggia su un canale già stabilito invece di aprirne uno ogni volta.

### Come si collegano, in ordine di preferenza

1. **Diretto**, da macchina a macchina, bucando i due NAT. È la strada preferita e non per eleganza: nessun terzo nel percorso, latenza minima, nessuna dipendenza.
2. **Attraverso un relay**, quando la prima fallisce. Il relay inoltra e basta: la cifratura è **fra i due capi** (QUIC, chiavi dei due endpoint), quindi **non può leggere ciò che trasporta**, non conserva nulla, non tiene account e non sa che cosa sia ESTIA. È un ponte, non un server.

Le proprietà di sicurezza che reggono entrambe le strade, e che vanno dichiarate a chi usa il prodotto invece di restare in un ADR: **l'identità è la chiave**, quindi si parla con quella macchina e non con chi dice di esserlo; **le chiavi private non escono dai dispositivi**; e **il relay è sostituibile a caldo**, perché non custodisce niente che debba essere migrato.

**Misurato il 2026-08-20 su due linee domestiche italiane**, in due città diverse e su **due architetture diverse** — un NAS `arm64` e un mini-PC `x86_64`, che è la coppia con cui si è chiusa la verifica 1: il diretto non è riuscito in nessuna delle due direzioni, e le istanze si sono parlate via relay — 348 ms in un verso, 1393 ms nell'altro, RTT di trasporto fra 136 e 160 ms, con IPv6 assente su una delle due linee. È la prima misura del caso CGNAT, aperto dal 2026-08-13 ([ADR 0001](0001-private-network-control-plane.md), evidenza 8). **Vale per quella coppia e non stabilisce una percentuale**: iroh dichiara il diretto nella grande maggioranza dei casi, e la misura del 2026-08-13 su rete mobile lo confermò. Quello che stabilisce è che **il ripiego va progettato come parte del prodotto**, non trattato come un caso che non capiterà.

**Rayfish non è il candidato**, ed è bene separarlo: è una mesh VPN costruita _sopra_ iroh, si dichiara sperimentale, pre-1.0 e senza audit indipendente, e non supporta iOS — verificato di nuovo il 2026-08-19. Ma una mesh VPN serve a mettere **dispositivi** su una rete virtuale, che è il problema di M4. Per far parlare due istanze non serve una VPN: serve una connessione.

**L'istanza ha già la chiave giusta.** Dal primo avvio genera una coppia **ed25519** ([`identity.ts`](../../apps/core-api/src/instance/identity.ts)), che è la stessa forma di identità che iroh usa per indirizzare. Se riusarla o derivarne una separata per il trasporto era una domanda di igiene crittografica da sciogliere in implementazione, e la prudenza diceva di derivarla.

**Sciolta il 2026-08-20: si deriva**, con HKDF-SHA256 dal seme della chiave dell'istanza e un'etichetta sua (`deriveNetworkSecretKey`). La chiave dell'istanza firma a livello applicativo, quella di rete è l'identità dell'handshake QUIC: separarle non costa niente e toglie di mezzo il riuso fra protocolli.

Ma la ragione per cui questa riga esiste non è l'igiene crittografica, è un guasto misurato. **Il codice di rete dell'istanza cambiava a ogni riavvio.** Senza una chiave, `bind()` se ne genera una nuova — verificato il 2026-08-20: due `bind()` di seguito, due identità diverse — e siccome qui **la chiave è l'indirizzo**, spegnere e riaccendere il container voleva dire diventare un'altra macchina per chiunque avesse salvato la precedente. Un aggiornamento dell'immagine faceva lo stesso. È lo stesso genere di errore di [ADR 0019](0019-i-dati-hanno-un-posto-prima-della-configurazione.md), su un piano diverso: là i dati sopravvivono al riavvio, qui deve sopravvivere l'identità con cui gli altri ti trovano.

**Derivata e non conservata a parte**, e questa parte è una scelta: `instance-identity.pem` è già il file che l'istanza non può perdere, già dentro ogni backup, già protetto dal rifiuto di ADR 0019. Un secondo file di chiave sarebbe una seconda cosa da perdere, e mancherebbe dagli archivi presi prima che esistesse. Derivando, un ripristino su un altro NAS torna su con **lo stesso codice di rete**.

### La deroga sui moduli nativi, dichiarata

Questo progetto ha rifiutato i moduli nativi **due volte** e per iscritto: [ADR 0008](0008-hashing-password-argon2id.md) per Argon2id e [ADR 0011](0011-immagini-in-webassembly.md) per le immagini, entrambe con la motivazione di [ADR 0005](0005-persistenza-node-sqlite.md) — i NAS di destinazione sono spesso ARM e talvolta musl.

`@number0/iroh` **è** un modulo nativo, costruito con napi-rs. La deroga si regge su due fatti:

1. **I binari precompilati per `linux/arm64`, glibc e musl, esistono e sono pubblicati** dalla stessa organizzazione che pubblica il pacchetto. È la condizione la cui assenza aveva fatto scartare le alternative native nelle altre due decisioni.
2. **Non esiste un'alternativa in WebAssembly per questo lavoro.** Argon2id e la decodifica delle immagini sono calcolo puro; l'attraversamento del NAT richiede socket UDP e controllo del percorso di rete, che un modulo WebAssembly non ha.

Resta condizionata alla verifica 1 di §«Prima di implementare»: finché l'immagine non parte davvero su un NAS ARM, questo paragrafo è un'argomentazione, non un fatto.

## L'infrastruttura del trasporto: dove si annida il terzo

iroh, nella configurazione predefinita, usa **l'infrastruttura di n0** — l'organizzazione che sviluppa iroh — per due funzioni: un servizio di scoperta su DNS (`dns.iroh.link`) e un insieme di relay pubblici di ripiego.

Lasciarla così sarebbe la stessa contraddizione di Tailscale, solo meno visibile: un componente di terzi obbligatorio nel percorso di ogni istanza, contro il vincolo «nessun backend applicativo globale obbligatorio» — che vale per gli sviluppatori di ESTIA e a maggior ragione per quelli di qualcun altro.

### Il vincolo che decide, e che viene prima dell'indipendenza

**L'installazione di ESTIA è tutta qui, e non può crescere di un passo:** si installa l'immagine, si prende il codice dai log, lo si incolla nel portale, e l'istanza va. L'unica altra cosa che un amministratore farà mai è **condividere la propria chiave pubblica** con un'altra istanza. Fine.

Niente port forwarding, niente impostazioni del modem, niente porte aperte a mano. Non è una preferenza di comodità: è la ragione per cui [ADR 0003](0003-primo-contatto-in-rete-locale.md) esiste, ed è misurata in [ADR 0001](0001-private-network-control-plane.md) — sette passaggi tecnici chiesti a un amministratore, con il tentativo reale fermatosi al quarto. **La persona che installa ESTIA non sa usare Docker e probabilmente non l'ha mai fatto.** Un prodotto che richiede di configurare il router è un prodotto per chi sa configurare il router, cioè per nessuno di quelli a cui questo è rivolto.

Ogni riga qui sotto passa da quel filtro prima che dall'indipendenza.

### I relay pubblici di n0 sono accettati

**Rivisto il 2026-08-20, lo stesso giorno in cui era stato deciso il contrario.** La prima versione di questa sezione chiedeva relay «autoospitati o comunitari» come condizione di adozione. Era sbagliata, e non per un dettaglio: **un relay proprio vuole una macchina raggiungibile, cioè una porta aperta sul router.** Chiedeva a ogni comunità esattamente il passo che il paragrafo qui sopra vieta — e lo chiedeva proprio a chi non sa farlo, mentre chi sa aprire una porta non aveva bisogno di ESTIA per parlare con un amico.

Quello che il relay è davvero, detto con precisione perché decide la questione:

- **Non vede i contenuti.** La cifratura è fra i due capi — QUIC, chiavi dei due endpoint — quindi il relay trasporta pacchetti che non può leggere, non conserva niente, non tiene account e non sa che cosa sia ESTIA. Il suo modo di fallire è la **disponibilità**, mai la riservatezza. Non è un confine di fiducia sui dati.
- **È l'ultima spiaggia, e questo è il suo valore.** Non è un ripiego imbarazzante da minimizzare: è **la garanzia che la connessione arriva comunque**, anche quando i due router non si bucano. Senza di esso il prodotto funzionerebbe per le coppie fortunate e non per le altre, e quale delle due sei non è una cosa che una persona possa sapere o cambiare.

Quindi la dipendenza da n0 si accetta, e si accetta come **compromesso dichiarato** fra indipendenza totale e un prodotto che funziona in casa di chiunque.

**Il costo, detto per intero invece che minimizzato:** se n0 spegnesse i propri relay, le coppie di istanze il cui collegamento diretto non passa smetterebbero di parlarsi finché non si configura un'alternativa. È una dipendenza vera. Quello che la rende sostenibile non è una promessa, è una proprietà: **i relay non custodiscono niente**, quindi sono sostituibili a caldo — il giorno che servisse, è un cambio di configurazione e non una migrazione. E la gerarchia non cambia: **il diretto resta la strada, il relay il ripiego.**

**L'istanza dichiara quale sta usando**, nel pannello, come già fa per il trasporto del pilot in [`ACCESSO_DA_FUORI.md`](../ACCESSO_DA_FUORI.md) §5. Una dipendenza dichiarata è una dipendenza che si può cambiare; una ereditata in silenzio no.

### La scoperta è una domanda separata, e resta aperta

Non la decide questo paragrafo, perché **il filtro del vincolo la passano entrambe le risposte**: né il servizio DNS di n0 né la DHT Mainline di BitTorrent costano un solo passo a chi installa. Quindi la scelta lì è di indipendenza pura, non di esperienza d'uso, e va fatta con calma invece che trascinata da questa.

Quello che va detto adesso è cosa la scoperta **serve a fare**, perché senza di essa il paragrafo sul vincolo è falso: è ciò che permette di raggiungere un'istanza **avendone solo la chiave pubblica**, senza indirizzi e senza un codice che scade. Verificato il 2026-08-20 con l'API Node: un `EndpointAddr` costruito dal solo `EndpointId`, senza indirizzi diretti e senza URL di relay, si collega. **Se l'unica cosa che l'utente condivide è la chiave, la scoperta non è opzionale: è ciò che rende vera quella frase.**

## Sicurezza: l'assunzione che cambia

Oggi [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §5 poggia su una frase precisa: l'istanza **non è raggiungibile da Internet**, «coperto per costruzione». Una rete fra istanze la contraddice: l'istanza diventa raggiungibile da chiunque conosca la sua chiave pubblica, ed è il punto della decisione, non un effetto collaterale.

Il modello a visita **riduce** una parte di quel rischio e ne sposta un'altra, e conviene vederlo prima di scrivere il capitolo:

- **Non si accettano contenuti spinti da sconosciuti.** Un'istanza serve letture, non riceve archivi altrui: sparisce l'intera classe di problemi fatta di spazio disco riempito da remoto, media non richiesti e code di consegna da validare.
- **Resta la superficie di lettura**: chi può chiedere che cosa, quante volte, e come si dice di no.

Il capitolo va scritto prima del codice, almeno con queste voci:

- **Che cosa può chiedere un'istanza sconosciuta**, e che cosa no. Il feed locale non è nell'elenco, per invariante.
- **Limiti di richiesta per istanza remota**, sullo stesso principio del tetto generale già in vigore.
- **Che cosa si conserva** di chi ci contatta e di chi ci legge: contare, non registrare.
- **Come si nega**: blocco di una singola istanza e blocco per lista, che è la materia della moderazione federata.
- **Che cosa vede il trasporto**: i relay non leggono i contenuti, ma un servizio di scoperta sa chi cerca chi. È il confine di fiducia 4 in una forma nuova, e va dichiarato come è stato fatto in [`ACCESSO_DA_FUORI.md`](../ACCESSO_DA_FUORI.md) §5.

Quando quel capitolo sarà scritto, la tabella dei confini di fiducia guadagnerà una riga: **l'istanza remota**, che non è né la tua né il dispositivo di un membro.

## Conseguenze

**Positive.** La federazione smette di costare un dominio e diventa il comportamento predefinito. La quinta parola di [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11 — _connesso_ — smette di dipendere da un acquisto. Cancellazione e revoca diventano reali invece che cortesi. La proprietà politica del §11, «una rete che nessuno può spegnere con una decisione aziendale», si rafforza: senza domini da revocare e senza registrar da convincere. E il Fediverso resta raggiungibile per chi lo vuole.

**Negative.** ESTIA acquisisce un protocollo da progettare, versionare e mantenere, e un modulo nativo nella catena di dipendenze. Due istanze di versioni diverse dovranno continuare a parlarsi, problema che AP risolveva per noi. La moderazione fra istanze va inventata invece che ereditata. La disponibilità di un contenuto dipende dalla macchina di chi lo ha scritto. E l'autore acquisisce un'informazione che con le copie non aveva: quando qualcuno lo legge.

**Neutre.** Niente di ciò che è stato costruito finora cambia: modello di dominio, adapter ActivityStreams, client web e installazione restano quelli.

## Prima di implementare

Nessuna riga di codice prima di queste. **Riordinate il 2026-08-20**, e riscritte invece che rinumerate in silenzio: la 1 è chiusa, la 3 si è ridotta a una prova sola quando i relay di n0 sono stati accettati, la 2 misura una scala che questa rete non ha ancora, e la 4 è l'unica che resta davvero davanti al protocollo.

1. **iroh su un NAS ARM vero. — Chiusa il 2026-08-20.** Il pacchetto Node dentro l'immagine ESTIA, su `linux/arm64`, e due istanze che si collegano. Scioglieva la deroga sui moduli nativi, e andava fatta sull'hardware: questo progetto ha già scoperto due volte che le misure da qui mentono.
   - **In laboratorio**, su `linux/amd64`: `@number0/iroh` 1.1.0 dentro `node:24.18.0-bookworm-slim`, che è **l'immagine di base di ESTIA**. Il modulo nativo si carica, e **due container separati si sono collegati per chiave pubblica** con il preset minimo — nessun relay, nessuna scoperta, nessuna infrastruttura di terzi — scambiandosi una richiesta e una risposta su uno stream QUIC bidirezionale.
   - **Sul campo, lo stesso giorno**: due case, due città, due linee domestiche italiane, e **due architetture diverse** — un **NAS `arm64`** da una parte, un **mini-PC `x86_64`** dall'altra. Si sono trovate per chiave pubblica e si sono parlate. È questa la metà che conta: il modulo nativo gira su ARM **fuori dal laboratorio**, e l'attraversamento del NAT è stato esercitato per davvero invece che simulato su una macchina sola.
   - **Che cosa stabilisce**: la deroga sui moduli nativi non è più un'argomentazione, è un fatto. `linux/arm64` non è una riga in una tabella di binari pubblicati: ci ha girato sopra un'istanza vera, in casa di qualcuno.
   - **Che cosa non stabilisce**, e va tenuto separato: è **una coppia di linee, non un campione**, esattamente come la misura del 2026-08-13 su una sola casa. E il collegamento **diretto non è passato in nessuna delle due direzioni** — cosa che non toglie niente a questa verifica, perché non è affar suo: è materia della 3, ed è il motivo per cui la 3 è salita in cima.
   - Riproducibile: `Endpoint.builder()`, `applyMinimal()`, `alpns([Array.from(Buffer.from("estia/federazione/0"))])`, `bind()`; l'ALPN va passato come **array di numeri**, non come `Buffer`, ed è l'unico punto in cui l'API non si indovina.
   - **Dal 2026-08-20 la misura vive dentro l'istanza**, invece che in uno script a parte: `ESTIA_NETWORK_PROBE=local|internet` accende una sonda che pubblica l'identità di rete dell'istanza nel pannello, accetta un collegamento e ne risponde uno — un numero casuale rimandato indietro, **nessun contenuto**. Dal pannello si incolla il codice dell'altra istanza e si vede se è raggiungibile, in quanto tempo e **per collegamento diretto o via relay**, che è il dato che serve.
     - Tre proprietà la rendono sicura da spedire in `latest` prima che la decisione sia verificata: **è spenta salvo richiesta**, perché accendere un socket cambia la postura di rete di una macchina che sta in casa di qualcuno; **non può impedire l'avvio**, perché il modulo compilato è importato dentro una guardia e un fallimento diventa una frase in diagnostica invece di un'istanza che non parte; e **non trasporta niente**, quindi non anticipa nessuna decisione di prodotto.
     - **Si accende dal pannello**, non solo da un file. La prima versione la mostrava soltanto quando era già accesa, il che la rendeva accendibile solo da terminale: è precisamente l'errore che [ADR 0016](0016-backup-dal-pannello.md) aveva già corretto per i backup — «attivarli richiedeva di aprire un terminale sul NAS, cioè richiedeva di non farlo». Corretto lo stesso giorno, con la stessa regola: l'impostazione vive nel database e si cambia a caldo, ma **la variabile d'ambiente vince**, e dove c'è il pannello mostra il valore e dichiara da dove arriva invece di offrire una modifica che il riavvio annullerebbe.
     - **Ed è la sonda che ha chiuso questa verifica**, dalle due case, senza che servisse scrivere altro software.
2. **Il costo di un profilo molto seguito. — Aperta, e rinviata di proposito.** Quante letture al secondo regge un NAS prima che il modello a visita diventi insostenibile, e a partire da quale soglia servirebbe una cache condivisa — che sarebbe una copia, e quindi una decisione da riaprire, non da improvvisare.
   - **Perché rinviata**: misura una scala che non esiste ancora. Le istanze sono due e i lettori sono una famiglia; una misura di carico fatta adesso misurerebbe il vuoto, e la si rifarebbe comunque il giorno che i numeri diventano veri.
   - **Fino a dove vale il rinvio**, perché un rinvio senza confine è una cancellazione: va chiusa **prima che la rete si apra a sconosciuti** — cioè prima dello stato «presente e pubblico» e prima dell'indice dei profili pubblici. Le connessioni deliberate fra istanze che si conoscono stanno sotto quella soglia; un profilo cercabile no. Scoprire su utenti veri che il modello a visita non regge sarebbe scoprirlo troppo tardi, ed è precisamente il costo che questo rinvio non deve pagare.
3. **Scoperta e relay senza infrastruttura obbligatoria. — Ridotta a una prova sola il 2026-08-20.** Era la voce più grossa; si è sgonfiata quando la domanda giusta ha sostituito quella sbagliata.
   - **La metà relay è decisa e non va misurata**: i relay di n0 sono accettati come ripiego dichiarato (§«L'infrastruttura del trasporto»). L'alternativa autoospitata è esclusa a monte perché vuole una porta aperta sul router, e questo prodotto non chiede a nessuno di toccare il router. Quello che restava da misurare — «latenza attraverso un relay proprio invece che pubblico» — non ha più un oggetto.
   - **La metà scoperta resta**, ma non blocca: DNS di n0 e DHT Mainline costano zero passi entrambe a chi installa, quindi la scelta è di indipendenza e si fa con calma.
   - **La prova che conta, e che sostituisce tutte e due**: che **due case si raggiungano con la sola chiave pubblica**, senza ticket e senza indirizzi. È l'unica cosa che deve funzionare perché sia vero il vincolo su cui poggia il prodotto — installo, incollo il codice, condivido la chiave, fine. Verificata il 2026-08-20 a livello di API (`EndpointAddr` dal solo `EndpointId`, nessun indirizzo diretto, collegata), e **il pannello dallo stesso giorno dà la chiave** invece del ticket: il codice lungo compare soltanto su `local`, dove non c'è nessuna scoperta e gli indirizzi devono viaggiare con la chiave. Resta da rifare **fra le due case**, dove è la scoperta e non la rete locale a dover risolvere la chiave — e non richiede altro software, solo le due istanze accese su `internet`.
4. **Il capitolo di sicurezza** qui sopra, scritto e discusso, prima di aprire una porta a istanze sconosciute. **Aperta, e va scritta prima del protocollo, non dopo**: decide che cosa può chiedere un'istanza che non conosciamo, ed è una proprietà che non si aggiunge a un protocollo già scritto senza riscriverlo.

Restano aperte e non bloccano: la forma del protocollo, il versionamento e il meccanismo dell'avviso vuoto. Il rapporto fra la chiave dell'istanza e quella del trasporto **non è più aperto**: si deriva, per le ragioni in §«Il candidato tecnico: iroh».

## Quando riesaminare

- **La verifica 1 è passata il 2026-08-20**, quindi il candidato regge e questa voce non è più un rischio aperto: iroh gira su `arm64` in casa di qualcuno. Resta il suo contrario — se una versione futura del pacchetto smettesse di pubblicare i binari per `arm64` o `musl`, la deroga sui moduli nativi cadrebbe con essa, e il candidato andrebbe riaperto.
- **Se la verifica 2 dice che il modello a visita non regge**, la scelta da riaprire è il punto 2, non l'intera decisione: si tornerebbe a una forma di copia, e allora vanno riscritte anche le promesse su cancellazione e revoca. Non si tiene la promessa e si cambia il meccanismo.
- Se il protocollo fra istanze si rivela più costoso della federazione AP che sostituiva, va riaperta la scelta invece di difendere la coerenza.
- Se qualcuno standardizza il caso «federazione senza dominio» nel Fediverso, questo ADR va confrontato con quello standard.

## Fonti

Verificate il 2026-08-19.

- https://docs.iroh.computer/what-is-iroh
- https://docs.iroh.computer/languages
- https://docs.iroh.computer/languages/javascript
- https://docs.iroh.computer/concepts/relays
- https://docs.iroh.computer/concepts/discovery
- https://registry.npmjs.org/@number0/iroh/latest
- https://github.com/rayfish/rayfish
- https://www.w3.org/TR/activitypub/
