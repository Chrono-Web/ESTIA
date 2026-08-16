# ESTIA — Visione di prodotto

- Data: 2026-08-13
- **Precisazione del 2026-08-16**: ESTIA è proprietaria, condivisa, comunitaria, protetta **e connessa con chiunque**. La quinta parola c'era dal primo giorno ma i documenti l'avevano degradata a «visione, non roadmap»: §11 la rimette al suo posto, con le conseguenze.
- Fonte: `ESTIA-piano-di-progetto.docx` (luglio 2026), conciliato in [`RECONCILIATION.md`](RECONCILIATION.md)
- Ruolo: questo documento dice **perché** ESTIA esiste e **come deve sentirsi**. I requisiti tecnici stanno in [`PROJECT_SPEC.md`](PROJECT_SPEC.md), l'ordine dei lavori in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## 1. In una frase

ESTIA è un social network vero, in cui **i tuoi contenuti stanno fisicamente in un posto che è tuo** — casa tua, o lo spazio comune della tua comunità — cifrato, senza algoritmo e senza pubblicità.

L'accento è su **vero**. La sovranità dei dati e l'assenza di ranking devono essere conseguenze invisibili dell'architettura, non un onere quotidiano per chi usa l'app. Un'alternativa ai social centralizzati funziona solo se, prima di tutto, è un social piacevole da usare.

E che da lì tu possa **raggiungere chiunque**. Un'istanza può essere il feed di un condominio, il server di una famiglia o la macchina di una persona sola: in tutti i casi ESTIA è la stessa cosa, e in tutti i casi si parla anche con chi sta altrove. Il quartiere è la prima superficie, non il recinto. Le cinque parole che tengono insieme il prodotto sono in §11.

## 2. I principi che governano ogni scelta

1. **I dati stanno dove stai tu.** È il principio da cui discendono gli altri. L'istanza è un server in un luogo reale che appartiene a chi lo ospita: una casa, un condominio, uno spazio sociale. Non è un dettaglio di deployment, è la ragione del prodotto — e resta vera anche quando la comunità è una persona sola.
2. **La fluidità viene prima della struttura.** Postare, commentare, entrare in un gruppo devono avere l'attrito di Instagram o WhatsApp. Se un'azione quotidiana richiede una procedura, la procedura è un difetto di design.
3. **Il pubblico è un'estensione, non un interruttore globale.** Non è l'istanza ad aprirsi al mondo: è il singolo profilo, o il singolo post. E **niente diventa pubblico per omissione**: il default è sempre la cerchia più stretta, indipendentemente da quale superficie sia la principale.
4. **La sicurezza è un vincolo architetturale, non una feature.** Tre strati indipendenti, ognuno contro un avversario diverso (§6).
5. **Moderazione a ruoli, come nei social reali.** Chi ospita è admin e nomina moderatori. I processi deliberativi esistono solo come modulo opzionale, per le comunità che li vogliono.
6. **Zero server dello sviluppatore.** Nessun costo fisso centrale, nessun punto di controllo, nessun dato che transiti dall'infrastruttura di chi sviluppa il progetto.

Sul sesto principio vale la formulazione precisa di [`PROJECT_SPEC.md`](PROJECT_SPEC.md) §4: nessun server _applicativo_ globale obbligatorio. DNS, autorità di certificazione, APNs/FCM e relay restano dipendenze possibili, dichiarate e sostituibili.

## 3. Le tre superfici

Un solo account, un solo login, un'unica app. Tre modi di esistere dello stesso profilo, con confini di visibilità distinti.

| Superficie      | Riferimento        | Che cos'è                                                                                                                                                                                         |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feed locale** | Instagram          | Il feed di chi condivide l'istanza: foto e post visibili solo ai membri. Cronologico. È il **default** di ogni contenuto.                                                                         |
| **Profilo**     | Threads / Twitter  | Il proprio spazio, con i propri contenuti. Può essere chiuso — chi vuole seguirti chiede, e tu accetti — oppure aperto e federato via ActivityPub verso Mastodon, Pixelfed e altre istanze ESTIA. |
| **Gruppi**      | Discord / WhatsApp | Spazi privati in tempo reale. Slegati dal territorio: possono includere membri di altre istanze.                                                                                                  |

L'utente sceglie di volta in volta a quale cerchia parlare, e **il default è sempre la cerchia più stretta**. Questa regola sopravvive al cambio di centro di gravità: vale come protezione, non come conseguenza del fatto che il quartiere venga per primo.

Le tre superfici non sono tre app: sono tre confini di visibilità sopra la stessa identità e gli stessi dati, che stanno tutti nello stesso posto.

> **Stato attuale.** Il perimetro tecnico realizzato copre la prima superficie, completa di immagini e provata su hardware reale. Profilo e gruppi restano da costruire, e in quest'ordine il profilo viene per primo: è la superficie che rende ESTIA utile anche a chi non ha un quartiere attorno. La comunità pilota va comunque reclutata su ciò che esiste, non sulle tre superfici.

## 4. Budget di esperienza

Sono soglie di prodotto, non aspirazioni. Una milestone che le supera funzionalmente ma le manca su questi numeri non è completa.

| Budget                                               | Soglia      | Verificato al gate |
| ---------------------------------------------------- | ----------- | ------------------ |
| Installazione di un'istanza da parte di un admin     | < 30 minuti | M3                 |
| Dal tap sul link d'invito al feed popolato           | < 3 minuti  | M2                 |
| Revoca di un dispositivo → perdita effettiva accesso | < 1 minuto  | M1, M2             |
| Passaggi tecnici richiesti a un membro non tecnico   | 0           | M2                 |
| Permessi di sistema richiesti all'onboarding         | 1 (VPN)     | M2                 |

L'ultimo merita una nota: il permesso VPN è l'unico attrito che ESTIA non può eliminare, perché è la sua garanzia di sicurezza principale. Va speso una volta sola, spiegato in una frase, e non ripresentato mai più.

## 5. Flussi che devono restare semplici

### 5.1 Ingresso di un nuovo membro

1. L'admin genera un link d'invito e lo condivide come condividerebbe un gruppo WhatsApp: messaggio, SMS, QR stampato in bacheca.
2. L'utente apre il link. Se l'app c'è si apre, altrimenti una pagina porta agli store.
3. L'app mostra la **vetrina dell'istanza** — nome, descrizione, numero di membri, regole della casa — **senza rivelare chi ne fa parte**. È un requisito di privacy: l'elenco dei membri non è pubblico nemmeno per chi ha il link.
4. L'utente scrive nome e un messaggio libero. L'admin approva con un tap.
5. Il provisioning è **un unico passaggio automatico**: account, credenziali di rete del dispositivo, profilo. L'app chiede il permesso VPN e attiva il percorso privato.
6. Al primo accesso l'utente trova il feed già popolato.

Il punto critico è il passo 5. Se account e accesso di rete diventano due procedure separate per l'utente finale, il flusso è fallito anche se tecnicamente funziona.

### 5.2 Perdita di un dispositivo

Dalla dashboard, o da un altro proprio dispositivo, si revoca quel device. Perde l'accesso di rete e le sessioni applicative. Sono due revoche distinte nell'implementazione — e vanno verificate separatamente — ma devono essere **un solo gesto** per chi le esegue.

### 5.3 Apertura del profilo pubblico

Una scelta individuale dell'utente, mai una delibera dell'istanza. L'app spiega prima che cosa cambia (§6), verifica che l'istanza abbia un endpoint pubblico e, se manca, guida l'admin ad attivarlo. Il passaggio è reversibile.

## 6. Onestà sulla sicurezza

Il modello ha tre strati indipendenti: la compromissione di uno non deve compromettere gli altri.

| Strato            | Protegge da                         | Stato                  |
| ----------------- | ----------------------------------- | ---------------------- |
| 1 — Rete privata  | Attaccanti esterni, reti ostili     | Da decidere (ADR 0001) |
| 2 — Dati a riposo | Furto fisico del NAS, backup rubati | Requisito M0.4 / M3    |
| 3 — E2E messaggi  | Chi ospita l'istanza                | Non implementato       |

**Regola che non si negozia:** nessuna interfaccia deve suggerire una protezione che non è attiva. Niente lucchetti finti, niente «cifrato» generico. Finché lo strato 3 non esiste, DM e gruppi non possono essere descritti come privati rispetto all'amministratore.

E va detto anche ciò che il modello **non** nasconde:

- Chi ospita l'istanza vede chi è membro, quando i dispositivi si connettono e le dimensioni del traffico. L'esistenza delle conversazioni non è occultabile, solo il contenuto.
- Il feed locale è per sua natura leggibile dal server che lo serve. È la bacheca del quartiere, non una chat privata.
- Ciò che è pubblicato come pubblico esce dal perimetro protetto per definizione: è il suo scopo.

Queste distinzioni si spiegano nell'app, non nelle FAQ.

## 7. Moderazione

Il modello a ruoli dei social reali, senza procedure assembleari obbligatorie:

- **Admin d'istanza** — chi ospita: approva membri, nomina moderatori, gestisce storage e regole.
- **Moderatori d'istanza** — gestiscono segnalazioni sul feed locale, nascondono contenuti, sospendono account.
- **Admin di gruppo** — pieni poteri sul proprio gruppo.
- **Strumenti individuali** — blocco, silenziamento, segnalazione: sempre disponibili a tutti.
- **Livello federazione** — blocklist di istanze remote gestita dall'admin.

Le comunità che vogliono processi deliberativi attivano il modulo di governance opzionale. Per tutte le altre quel modulo non esiste e non compare in interfaccia. La struttura è una scelta, non un'imposizione.

## 8. Portabilità come diritto

Senza portabilità completa, chi fonda l'istanza diventerebbe un piccolo padrone di quartiere. Il progetto prevede quindi un vero diritto di uscita: se un'istanza degenera, i membri se ne vanno con il proprio archivio — post, media, relazioni, appartenenze, impostazioni — e i follower vengono reindirizzati automaticamente.

È un requisito di progetto, non un'aggiunta finale. Anche prima che esista l'export, nessuna scelta di schema deve rendere impossibile cambiare istanza di casa.

## 9. Che cosa ESTIA non è

Non è un fork di Mastodon, non è una chat aziendale, non è una piattaforma di governance. Non avrà **marketplace, feed algoritmico, pubblicità né analytics comportamentali**: su questi non c'è discussione, perché sono esattamente i meccanismi da cui ESTIA esiste per allontanarsi.

Il perimetro sono le tre superfici. Ogni proposta che non ricade in una di esse va rifiutata per default: il rischio principale del progetto, secondo la sua stessa analisi, è lo scope creep.

### Stories ed eventi: riaperti il 2026-08-16, non ancora decisi

Erano in questo elenco fra i «non avrà». Sono stati riaperti perché la ragione portata è di prodotto e non di moda: **le stories sono un modo leggero di dire una cosa a chi ti sta vicino**, e in un quartiere servono più che altrove — un avviso, un guasto, un banchetto domani in cortile.

Restano però **non decisi**, perché portano una tensione con due proprietà che questo progetto ha difeso a caro prezzo, e che vanno risolte prima e non dopo:

1. **L'effimero contro la portabilità.** Qui ogni contenuto è durevole, esportabile e destinato a lasciare un tombstone per la federazione. «Sparisce dopo 24 ore» è un comportamento opposto, e va deciso se sparisce _davvero_ — cancellazione reale, non nascosta — e che cosa finisce nell'export di chi se ne va.
2. **L'effimero contro la moderazione.** Un contenuto che scade prima che qualcuno lo segnali è un contenuto che di fatto non si modera. In un condominio, dove le persone si incontrano di persona il giorno dopo, non è un dettaglio.

Gli **eventi** hanno una domanda più semplice davanti: se un evento è un post con una data, non serve una superficie nuova; se richiede inviti, conferme e calendario, è un prodotto dentro il prodotto, ed è il caso da cui §9 mette in guardia.

Entrambi vanno chiusi con un ADR prima di qualunque codice.

## 10. Come si giudica il risultato

Non sul manifesto. Su quattro domande concrete:

1. Quanto è bello postare una foto e vederla comparire agli altri.
2. Quanto è affidabile la connessione quando cambi rete camminando per strada.
3. Quanto è vera la promessa che nessuno — nemmeno chi ospita il server — possa leggere ciò che non gli è destinato.
4. Quanto è facile, per chi se ne va, portarsi via tutto — e per chi resta, sapere dove sono fisicamente le proprie cose.

La prima ha avuto la sua prima risposta il 2026-08-15: una persona non tecnica è entrata e ha usato la bacheca senza che le venisse spiegato nulla. La terza è l'unica che oggi ESTIA non può ancora mantenere, e il documento lo dice apertamente. La quarta è nuova, ed è il centro di gravità di questa revisione.

## 11. Il tipo di social che ESTIA vuole essere

Cinque parole, e vanno tenute tutte insieme: **proprietario, condiviso, comunitario, protetto, connesso**.

Non è un elenco di aggettivi. È che ognuna, da sola, descrive qualcosa che esiste già e che non serviva costruire. Un posto solo tuo esiste: si chiama disco fisso. Uno condiviso e comunitario esiste: si chiama gruppo di messaggistica. Uno connesso con chiunque esiste, ed è esattamente quello da cui ESTIA prende le distanze. La cosa nuova è **pretenderle contemporaneamente**.

### La precisazione del 2026-08-16

Questa sezione nasce da una correzione, e la correzione riguardava questo documento, non l'idea.

I documenti tecnici avevano trasformato **l'ordine di costruzione** in una definizione: siccome il feed locale era la prima superficie da costruire, ESTIA era diventata «un social con l'anima di un quartiere», e il resto «visione, non roadmap». Ma il resto non era un'aggiunta futura: le tre superfici, i gruppi dichiarati fin dall'inizio «slegati dal territorio» e la federazione verso altre istanze c'erano dal primo giorno. Era la sequenza a essere stata scambiata per la sostanza.

**La connessione con chiunque è costitutiva, non un'estensione.** Se ho amici a Torino e io sto a Roma, devo poterli seguire e parlare con loro. Un ESTIA in cui ogni palazzo è un giardino recintato sarebbe l'opposto del punto: sarebbe un intranet condominiale, e la sovranità del dato senza nessuno con cui parlare non è sovranità, è isolamento.

Il quartiere resta la prima superficie e il primo motivo per cui qualcuno accende un'istanza. Non è **la definizione**: la definizione è che i dati stanno in un posto tuo **e** che da lì puoi raggiungere chiunque.

### Perché questo è anche uno strumento politico

Va scritto, perché ha conseguenze tecniche e non è retorica.

Una rete in cui i contenuti stanno su macchine di chi li scrive, e le macchine si parlano fra loro senza un centro, è una rete che **nessuno può spegnere con una decisione aziendale**. Non c'è un account da sospendere, un algoritmo che sceglie chi ti legge, un'infrastruttura che può cambiare le regole da un giorno all'altro. Per una comunità che si organizza — un quartiere, un collettivo, un sindacato, persone che si coordinano — questa non è una preferenza tecnica: è la differenza fra avere una voce e averla in prestito.

Le proprietà che lo rendono vero sono già scelte, ed è utile vederle in fila: la federazione come confine e non come schema ([ADR 0002](adr/0002-activitypub-confine-non-schema.md)), il primo contatto senza autorità esterne ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)), i backup riapribili senza ESTIA ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)), l'export come diritto (§8), zero server dello sviluppatore.

Ne discende anche una responsabilità, e sarebbe disonesto tacerla: una rete che nessuno può spegnere è una rete in cui **la moderazione è locale e federata, mai centrale**. Chi ospita risponde di ciò che ospita, e le blocklist fra istanze sono l'unico strumento contro chi abusa. Funziona quanto funzionano le comunità che la usano.

### Che cosa non cambia, e va difeso proprio adesso

Un allargamento della visione è il momento in cui le proprietà scomode evaporano senza che nessuno decida di buttarle. Quindi, per iscritto:

- **il default resta la cerchia più stretta.** Nulla diventa pubblico per omissione: è una protezione, non una conseguenza di quale superficie venga per prima;
- **il feed locale non viene federato** ([`PROJECT_SPEC.md`](PROJECT_SPEC.md) §3): resta la bacheca di chi condivide l'istanza;
- **niente ranking, niente pubblicità, niente analytics comportamentali**;
- **i messaggi privati escono end-to-end o non escono** ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)). Un social che si propone come strumento di organizzazione rende questa regola più stringente, non meno: è esattamente lo scenario in cui la differenza si paga;
- **zero server dello sviluppatore.**

### La tensione vera, che resta aperta

Non è fra quartiere e mondo. È fra **protetto** e **connesso**, e non si risolve una volta per tutte: ogni passo verso l'esterno è superficie che esce dal tuo controllo. Un post pubblico è pubblico per sempre e ovunque; un follower remoto è una copia dei tuoi contenuti su una macchina che non è tua; una federazione che funziona bene è anche una federazione che propaga in fretta.

Gli strumenti per governarla sono quelli già decisi — default alla cerchia più stretta, apertura per profilo e per singolo post, feed locale mai federato, E2E per i messaggi privati — e vanno applicati sapendo che servono a questo, non per abitudine.

**Conseguenza sull'ordine dei lavori:** profilo e federazione salgono, perché sono ciò che rende vera la quinta parola. Il piano è aggiornato di conseguenza.
