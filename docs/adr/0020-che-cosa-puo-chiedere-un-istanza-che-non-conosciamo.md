# ADR 0020 — Che cosa può chiedere un'istanza che non conosciamo

- Stato: **Accepted**
- Data: 2026-08-20
- Proprietario: progetto ESTIA
- Attua: la verifica 4 di [ADR 0018](0018-federazione-fra-istanze-estia.md), «il capitolo di sicurezza, scritto prima di aprire una porta a istanze sconosciute»
- Rivede: [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §1 — i confini di fiducia diventano sei — e la prima riga del §5
- Non tocca: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), che vale identico e non è materia di questo documento

## Contesto: l'assunzione che salta

La prima riga del modello delle minacce dice che l'istanza **non è raggiungibile da Internet**, e la colonna dello stato dice «coperto per costruzione». Non è più vero.

Il 2026-08-20 due istanze in due case diverse si sono raggiunte **per sola chiave pubblica**, senza che nessuno aprisse una porta su nessun router. Non è un difetto: è la decisione di ADR 0018, ed è ciò che rende la federazione possibile a chi non compra un dominio. Ma un'assunzione di sicurezza che cade va riscritta, non lasciata invecchiare in una tabella.

**Che cosa è cambiato davvero**, detto con precisione, perché la frase «raggiungibile da Internet» è più grossa del fatto:

- **Nessuna porta è aperta.** La raggiungibilità non passa dal router, e nessuno deve configurare niente — vincolo di ADR 0018.
- **Chi possiede la chiave pubblica può aprire una connessione** autenticata verso l'istanza.
- **Chi non ce l'ha, no.** Una chiave ed25519 non si indovina, e non è pubblicata da nessuna parte se non da chi la possiede.

Quindi la superficie non è «Internet»: è **chiunque abbia ricevuto la chiave**. Più piccola di un indirizzo pubblico, più grande di zero — e destinata a crescere, perché condividere la chiave è precisamente ciò che il prodotto chiede di fare. Un'istanza che sta in rete da un anno ha la propria chiave in mano a persone che non ricorda.

Ne discende la forma di tutto questo documento: **la chiave è ciò che permette di bussare, mai ciò che autorizza a entrare.** È lo stesso errore che la §2 della baseline vieta per la rete locale — «stare sulla LAN non rende nessuno membro» — spostato di un piano.

## La regola, prima dell'elenco

**Un'istanza sconosciuta può fare esattamente una cosa: presentarsi.** Tutto il resto richiede un rapporto che qualcuno di qua ha accettato.

Non è prudenza generica. È l'unica forma che regge alla crescita descritta sopra: se il default fosse «serve, salvo blocco», ogni istanza dovrebbe inseguire con una lista di rifiuti una popolazione che non conosce e che aumenta. Con «nega, salvo rapporto» la superficie resta proporzionale alle relazioni che qualcuno ha stabilito davvero, e non al numero di persone che hanno visto passare una chiave.

## 1. Che cosa può chiedere, per livello di rapporto

Quattro livelli, e il livello è una proprietà del **rapporto**, non della richiesta.

**Corretto il 2026-08-20** ([ADR 0022](0022-il-follow-attraversa-le-istanze.md)): la prima versione faceva bastare un follow per essere «collegata», e quel «oppure» era un buco — qualunque istanza si sarebbe promossa da sola dichiarando un follow, e avrebbe comprato con una bugia il diritto di elencare le persone di qua. Il legame sociale e quello amministrativo autorizzano cose diverse, quindi sono livelli diversi: **quello che si ottiene da soli non elenca nessuno.**

| Livello         | Come ci si arriva                                                                                   | Che cosa può chiedere                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Sconosciuta** | Ha la chiave                                                                                        | Presentarsi, chiedere un collegamento, **chiedere di seguire** qualcuno. Nient'altro                      |
| **In contatto** | C'è almeno un follow **accettato** fra le due ([ADR 0022](0022-il-follow-attraversa-le-istanze.md)) | Un profilo **nominato**, se presente. Nient'altro                                                         |
| **Collegata**   | Un amministratore di qua ha accettato                                                               | L'**elenco** dei soli profili pubblici; la ricerca inoltrata; i contenuti il cui scope include chi chiede |
| **Bloccata**    | Decisione di qua, singola o per lista                                                               | Niente. Il rifiuto avviene prima di qualunque richiesta                                                   |

Tre invarianti valgono a **ogni** livello, bloccata inclusa, e non sono negoziabili da nessuna impostazione:

**Il feed locale non è nell'elenco.** Mai, per nessun livello, per nessuna istanza, nemmeno per la più fidata. È l'invariante di [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §3 e di ADR 0018, e qui diventa una regola di sicurezza oltre che di prodotto: la bacheca di casa non esce, e non esiste una configurazione che la faccia uscire.

**Non si accettano contenuti spinti.** Un'istanza serve **letture**; non ha una casella d'ingresso, non riceve archivi altrui, non ha code di consegna da validare. È la conseguenza migliore del modello a visita di ADR 0018, e va nominata perché cancella un'intera classe di problemi: spazio riempito da remoto, media non richiesti, oggetti malformati da parsare prima di sapere chi li manda.

**Niente è enumerabile, tranne una cosa sola.** Non si può chiedere «dammi i tuoi membri», «dammi i tuoi post», «dammi le tue connessioni». Si chiede **qualcosa che si sa già nominare**. L'enumerazione è il modo in cui un'istanza ostile raccoglie un grafo sociale, e vietarla costa che la scoperta debba passare dalle relazioni.

**L'eccezione, delimitata il 2026-08-20 e riletta il 2026-08-21**: a un'istanza **collegata** si può elencare **i profili di chi è in EstiaNet** (privati e pubblici), e nient'altro. Non è una crepa nella regola, è la regola applicata bene — quelle persone hanno chiesto esplicitamente di essere sulla rete, e un elenco che le contiene fa la cosa che hanno chiesto. Privato/pubblico decide i post sul profilo, non l'appartenenza all'elenco. Restano non elencabili **per sempre e per chiunque**: i membri fuori da EstiaNet, i post, e le connessioni di questa istanza.

Va scritto anche come si è arrivati qui, perché la prima versione di questo paragrafo diceva un'altra cosa. Sosteneva che questa regola e la scoperta di [ADR 0018](0018-federazione-fra-istanze-estia.md) «si sostengono». **Non era vero**: quel documento chiedeva a ogni istanza di conservare i profili pubblici delle istanze collegate, e per farlo serviva esattamente la domanda che questa riga vieta. Le due si sono scontrate, non sostenute. Sciolto il nodo togliendo l'indice da ADR 0018 e delimitando l'eccezione qui. Il 2026-08-21 l'eccezione smette di restringersi a «solo pubblico»: elencare chi è in rete è ciò che rende vera la ricerca; nascosto resta chi ha scelto di non entrarci.

**Un profilo nominato si può chiedere anche se è privato**, ed è ciò che rende possibile aprire la pagina dalla ricerca o da un QR: «profilo privato» significa non mostrare i post finché non c'è un follow accettato, non essere irraggiungibile. Ma con un vincolo che vale come proprietà di sicurezza: **«non trovato» deve essere indistinguibile da «non esiste»** per chi è fuori da EstiaNet. Rispondere «esiste ma non è presente» ricostruirebbe l'enumerazione una domanda per volta, che è il modo in cui queste cose vengono aggirate davvero.

## 2. Limiti di richiesta, per istanza e non solo in totale

Il tetto generale già in vigore non basta qui, e la ragione è aritmetica: un tetto globale trasforma **un'istanza rumorosa nel problema di tutte le altre**. Se una sola satura il budget, le richieste legittime di venti istanze collegate vengono rifiutate insieme alle sue.

Quindi:

1. **Ogni istanza remota ha il proprio budget**, contato sulla sua chiave. Superarlo esaurisce il suo, e nessun altro.
2. **Il costo di una sconosciuta è limitato prima dell'autenticazione.** Una connessione che si apre e non conclude niente deve costare poco e scadere da sola, altrimenti il limite si aggira semplicemente non finendo mai le richieste.
3. **Il budget di una sconosciuta è molto più stretto di quello di una collegata**, perché l'unica cosa che le serve è presentarsi. Un rapporto accettato è anche una dichiarazione di quanto lavoro si è disposti a fare per qualcuno.
4. **Il rifiuto è esplicito ed economico.** Si dice di no e si chiude; non si lascia in attesa, che costerebbe a noi quanto servire.

## 3. Che cosa si conserva: contare, non registrare

La regola del §7 della baseline vale identica, e l'istanza ha già il modo di applicarla: `ConnectionOriginLog` conta i tipi di connessione senza scrivere un solo indirizzo. Qui la stessa distinzione cade su una linea diversa, e la linea è **il consenso**.

**Di un'istanza collegata si conserva il rapporto**: la sua chiave, il nome che dichiara, quando è stata collegata e quando è stata vista l'ultima volta. È un dato che esiste perché qualcuno di qua ha detto di sì, e serve a poter dire di no dopo.

**Di un'istanza sconosciuta non si conserva niente su disco.** Né la chiave, né l'ora, né quante volte ha bussato. I contatori che servono ai limiti del §2 vivono **in memoria**, con un tetto e una scadenza, e un riavvio li dimentica.

La ragione è che il registro di chi ha provato a raggiungerti **è un grafo sociale di persone che non sono tue**, ed è esattamente il genere di archivio che questo progetto esiste per non costruire. Un'istanza che conservasse quell'elenco avrebbe, dopo un anno, la mappa di chi ha avuto la sua chiave in mano.

E la regola che ADR 0018 ha già scritto per i conteggi di lettura vale anche qui, perché è la stessa tentazione: **nessuna funzione di prodotto può essere costruita su questi dati.** Niente «istanze che ti hanno cercato», niente suggerimenti, niente classifiche. Costruirci sopra una funzione significa insegnare al sistema a conservare ciò che deve dimenticare.

**Una cosa resta scoperta e va dichiarata**, invece di essere nascosta in fondo: l'istanza dell'autore **sa quando qualcuno legge**. È la controparte del non lasciare copie in giro, ADR 0018 l'ha già detto, e le difese sono strutturali e non tecniche — la richiesta arriva dall'istanza del lettore e non dal suo dispositivo, quindi aggrega; e si conta senza registrare. Non è eliminabile senza rinunciare al modello a visita.

## 4. Come si nega

**Blocco di una singola istanza, per chiave.** Il rifiuto avviene **all'handshake**, prima che qualunque richiesta venga letta: una connessione da una chiave bloccata non arriva mai al punto in cui esiste una domanda a cui rispondere.

**Blocco per lista**, che è la forma federata della stessa cosa. Vale il principio di ADR 0018 e va ripetuto qui perché è ciò che tiene la moderazione lontana dal diventare un'autorità: **le segnalazioni circolano, i verdetti no.** Ci si iscrive alla lista di qualcuno di cui ci si fida, e resta una decisione di questa istanza — revocabile, e senza che nessuno emetta sentenze valide per tutti.

**Il blocco tocca solo la rete, mai la bacheca di casa.** Bloccare un'istanza non toglie niente ai membri di questa, e non cancella niente di ciò che è già stato letto o scritto qui.

**La revoca è immediata**, con la stessa regola della decisione 4 del §3 della baseline: una connessione già aperta si **chiude attivamente**, non si lascia scadere. Un blocco che avesse effetto al prossimo riavvio sarebbe un blocco che non funziona nel momento in cui serve.

**E non si finge.** Un'istanza bloccata si accorge di essere stata rifiutata: non le si costruisce attorno l'illusione che l'istanza non esista. Fingere costerebbe complessità reale per un beneficio che si perde comunque al primo confronto fra due istanze bloccate — e questo progetto non mostra protezioni che non ci sono.

## 5. Che cosa vede il trasporto, ed è il confine nuovo

I due terzi nel percorso non sono lo stesso terzo, e vanno tenuti distinti perché vedono cose diverse.

**Il relay non vede i contenuti**, e vede tutto il resto. La cifratura è fra i due capi — QUIC, chiavi dei due endpoint — quindi trasporta pacchetti che non può leggere, non conserva niente e non tiene account. Ma inoltrando fra due chiavi **sa che quella A sta parlando con quella B**, quando, e per quanto. È metadato, non contenuto, e va detto per intero invece di fermarsi alla metà rassicurante.

La misura del 2026-08-20 impedisce di trattarlo come un caso di bordo: fra le due case il collegamento diretto **non è riuscito in nessuno dei cinque tentativi**. Per quella coppia di linee il relay non è il ripiego raro, è il percorso di ogni conversazione — quindi quel metadato non è un'eccezione, è la norma. Il che non cambia la decisione di ADR 0018 §«L'infrastruttura del trasporto» — senza relay il prodotto funzionerebbe solo per le coppie fortunate — ma cambia come va dichiarata: **chi passa da un relay concede a chi lo gestisce il grafo di chi parla con chi.**

Due cose lo attenuano e nessuna lo annulla: il traffico è **fra istanze e non fra persone**, quindi ciò che si vede è che due case si parlano, non chi di preciso; e i relay sono **sostituibili a caldo**, perché non custodiscono niente. La strada che lo eliminerebbe davvero è che il collegamento diretto passi — motivo in più perché resti la strada e non un'aspirazione.

**La scoperta sa chi cerca chi**, e questa è la parte che costa. Per essere raggiungibile dalla sola chiave, un'istanza **pubblica dove abita**: chi interroga la scoperta può stabilire che quella chiave è in linea e da dove, e chi la gestisce vede le interrogazioni. È il prezzo del vincolo su cui il prodotto poggia — condividi la chiave, e basta quella — ed è pagato con un metadato, mai con un contenuto.

Due cose lo limitano, e vanno dette insieme al costo:

- **è spento salvo richiesta.** Un'istanza appena installata non pubblica niente e non è raggiungibile da nessuno: accendere la rete è un atto dell'amministratore, mai di un aggiornamento;
- **la presenza di una persona è una scelta sua**, distinta da quella dell'istanza (ADR 0018): il default è «non presente», e nessun profilo entra in nessun indice per omissione.

### La tabella dei confini di fiducia guadagna una riga

| #   | Confine            | Cosa sta dentro                                 | Chi lo controlla                            |
| --- | ------------------ | ----------------------------------------------- | ------------------------------------------- |
| 6   | **Istanza remota** | Ciò che le si serve su richiesta, e nient'altro | Un altro amministratore, che non conosciamo |

**È il primo confine che non controlla nessuno di cui ci fidiamo.** I cinque precedenti stanno in mano all'amministratore, al membro, a chi tiene la rete di casa o a un terzo dichiarato e sostituibile. Questo sta in mano a una persona di cui non sappiamo niente, e l'unica cosa che ce ne garantisce il comportamento è che **non le abbiamo dato niente su cui possa comportarsi male**. Da qui l'elenco del §1, e la sua brevità.

Ne discende una conseguenza che va scritta perché finirà in un'interfaccia: **un'istanza può mentire su chi ospita.** Può dichiarare profili che non esistono, o attribuirsi persone che non ha. La difesa non è tecnica ed è già in ADR 0018: per entrare in un indice bisogna che qualcuno segua qualcuno, e un'istanza che si comporta male si blocca. Quello che il prodotto non deve fare è **presentare come verificato** ciò che è soltanto dichiarato: il nome di un'istanza remota è una cosa che lei dice di sé, e l'interfaccia deve dirlo così.

## Conseguenze

**Positive.** L'assunzione del §5 smette di essere una frase invecchiata e diventa un modello. La superficie di attacco resta proporzionale alle relazioni accettate invece che alla diffusione della chiave. La classe di problemi legata ai contenuti spinti non esiste per costruzione. E il divieto di enumerazione mette d'accordo sicurezza e scoperta dal grafo sociale, che erano state decise separatamente.

**Negative.** Ogni richiesta remota va autorizzata rispetto a un rapporto, il che è più codice e più test di un controllo unico all'ingresso. I budget per istanza vanno tarati, e una taratura sbagliata si manifesta come lentezza per chi ha ragione. Il divieto di conservare le sconosciute rende impossibile diagnosticare a posteriori un abuso: si vede che è successo, non da chi — ed è un costo accettato, non una svista.

**Neutre.** Niente di ciò che esiste cambia: il feed locale, gli account, i media e i backup non sono toccati.

## Cosa questo documento non copre

- **La forma del protocollo** e il suo versionamento. Qui si dice che cosa è lecito chiedere, non come si scrive la domanda.
- **La moderazione federata** oltre al blocco: le liste, i motivi visibili e la perdita di visibilità sono il punto 4 dell'elenco delle milestone successive, e vogliono un ADR loro.
- **La chat fra istanze**, che vive sotto [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) e ha un modello suo.
- **Il costo di un profilo molto seguito**, che è la verifica 2 di ADR 0018 e riguarda la scala, non la sicurezza.

## Quando riesaminare

- Se qualcuno chiede di **servire il feed locale** a un'istanza remota, anche solo come opzione. La risposta è no, e questo documento è il posto dove è scritto perché.
- Se si presenta un bisogno reale di **enumerazione** — un indice, una migrazione, un export verso un'altra istanza. Allora va riaperto qui, con il grafo sociale davanti, invece di essere aggiunto come parametro a una richiesta esistente.
- Se i limiti del §2 si rivelano **troppo stretti per un uso legittimo**, va cambiata la taratura e non il principio.
- Se la scoperta cambia forma (DNS di n0 contro DHT Mainline, domanda ancora aperta in ADR 0018), il §5 va rimisurato: le due espongono cose simili ma non identiche.
- **Se il collegamento diretto comincia a passare**, il §5 migliora da solo e va riscritto con i numeri nuovi: oggi dice che il metadato del relay è la norma perché su quelle due linee lo è, non perché debba esserlo.
