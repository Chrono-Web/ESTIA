# ESTIA — Visione di prodotto

- Data: 2026-08-13
- **Revisione del 2026-08-16**: spostato il centro di gravità dal quartiere alla sovranità del dato. Che cosa è cambiato e che cosa no è in §11.
- Fonte: `ESTIA-piano-di-progetto.docx` (luglio 2026), conciliato in [`RECONCILIATION.md`](RECONCILIATION.md)
- Ruolo: questo documento dice **perché** ESTIA esiste e **come deve sentirsi**. I requisiti tecnici stanno in [`PROJECT_SPEC.md`](PROJECT_SPEC.md), l'ordine dei lavori in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## 1. In una frase

ESTIA è un social network vero, in cui **i tuoi contenuti stanno fisicamente in un posto che è tuo** — casa tua, o lo spazio comune della tua comunità — cifrato, senza algoritmo e senza pubblicità.

L'accento è su **vero**. La sovranità dei dati e l'assenza di ranking devono essere conseguenze invisibili dell'architettura, non un onere quotidiano per chi usa l'app. Un'alternativa ai social centralizzati funziona solo se, prima di tutto, è un social piacevole da usare.

Il quartiere resta la prima superficie e il primo motivo per cui qualcuno installa ESTIA. Ma non è più **la definizione** del prodotto: la definizione è dove vivono i dati. Un'istanza può essere il feed di un condominio, oppure il server di una famiglia o di una persona sola che vuole stare sulle proprie gambe — e in entrambi i casi ESTIA è la stessa cosa.

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

## 11. Che cosa è cambiato il 2026-08-16, e che cosa no

Il centro di gravità si è spostato: **prima era il quartiere, ora è il fatto che i dati stiano fisicamente in un posto tuo.** Il quartiere resta la prima superficie e il primo motivo per installare ESTIA, ma non è più ciò che definisce il prodotto.

**Che cosa cambia davvero:**

- un'istanza è legittima anche con un solo membro: non è più «una comunità che si dà un server», è «qualcuno che tiene i propri dati a casa propria e ci fa entrare chi vuole»;
- il **profilo** smette di essere una superficie futura e opzionale e diventa la seconda cosa da costruire, perché è ciò che rende ESTIA utile a chi non ha un quartiere attorno;
- il profilo può essere **chiuso**: chi vuole seguirti chiede, e tu accetti. È lo scope `followers`, che nello schema c'è dalla prima migrazione del feed e non è mai stato implementato;
- la federazione resta **opzionale per istanza** ([ADR 0002](adr/0002-activitypub-confine-non-schema.md)), ma diventa la strada normale per parlare con chi sta altrove, non un'estensione per pochi.

**Che cosa non cambia, e va difeso proprio adesso:**

- **il default resta la cerchia più stretta.** Nulla diventa pubblico per omissione, e questa è una protezione, non una conseguenza di quale superficie venga per prima;
- **il feed locale non viene federato** ([`PROJECT_SPEC.md`](PROJECT_SPEC.md) §3): resta la bacheca di chi condivide l'istanza;
- **niente ranking, niente pubblicità, niente analytics comportamentali**;
- **i messaggi privati escono end-to-end o non escono** ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)). Spostare il centro sul dato personale rende questa regola più stringente, non meno;
- **zero server dello sviluppatore.**

**Il rischio che questa revisione introduce**, dichiarato qui perché non venga scoperto fra sei mesi: un prodotto centrato sul dato personale è più facile da spiegare e più difficile da far _usare_. Il quartiere dava una ragione per accendere l'app tutti i giorni; la sovranità del dato, da sola, no. Se il profilo e la federazione diventano il centro, ESTIA compete con il Fediverso invece che con la chat di condominio — un campo dove il vantaggio va dimostrato, non dedotto.
