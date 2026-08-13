# ESTIA — Visione di prodotto

- Data: 2026-08-13
- Fonte: `ESTIA-piano-di-progetto.docx` (luglio 2026), conciliato in [`RECONCILIATION.md`](RECONCILIATION.md)
- Ruolo: questo documento dice **perché** ESTIA esiste e **come deve sentirsi**. I requisiti tecnici stanno in [`PROJECT_SPEC.md`](PROJECT_SPEC.md), l'ordine dei lavori in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## 1. In una frase

ESTIA è un social network vero — con l'anima di un quartiere, ospitato su un NAS di casa, cifrato, senza algoritmo e senza pubblicità.

L'accento è su **vero**. La sovranità dei dati, l'assenza di ranking algoritmico, il radicamento territoriale devono essere conseguenze invisibili dell'architettura, non un onere quotidiano per chi usa l'app. Un'alternativa ai social centralizzati funziona solo se, prima di tutto, è un social piacevole da usare.

## 2. I principi che governano ogni scelta

1. **La fluidità viene prima della struttura.** Postare, commentare, entrare in un gruppo devono avere l'attrito di Instagram o WhatsApp. Se un'azione quotidiana richiede una procedura, la procedura è un difetto di design.
2. **Il locale resta fisico.** L'istanza è legata a un server che sta in un luogo reale: un condominio, una via, uno spazio sociale. Il legame territoriale è identitario, non solo tecnico.
3. **Il pubblico è un'estensione, non un interruttore globale.** Non è l'istanza ad aprirsi al mondo: è il singolo profilo, o il singolo post.
4. **La sicurezza è un vincolo architetturale, non una feature.** Tre strati indipendenti, ognuno contro un avversario diverso (§6).
5. **Moderazione a ruoli, come nei social reali.** Chi ospita è admin e nomina moderatori. I processi deliberativi esistono solo come modulo opzionale, per le comunità che li vogliono.
6. **Zero server dello sviluppatore.** Nessun costo fisso centrale, nessun punto di controllo, nessun dato che transiti dall'infrastruttura di chi sviluppa il progetto.

Sul sesto principio vale la formulazione precisa di [`PROJECT_SPEC.md`](PROJECT_SPEC.md) §4: nessun server _applicativo_ globale obbligatorio. DNS, autorità di certificazione, APNs/FCM e relay restano dipendenze possibili, dichiarate e sostituibili.

## 3. Le tre superfici

Un solo account, un solo login, un'unica app. Tre modi di esistere dello stesso profilo, con confini di visibilità distinti.

| Superficie           | Riferimento        | Che cos'è                                                                                                             |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Feed locale**      | Instagram          | Il feed del quartiere: foto e post visibili solo ai membri dell'istanza. Cronologico. È il default di ogni contenuto. |
| **Profilo pubblico** | Threads / Twitter  | Opt-in per profilo o per singolo post. Federato via ActivityPub verso Mastodon, Pixelfed, altre istanze ESTIA.        |
| **Gruppi**           | Discord / WhatsApp | Spazi privati in tempo reale. Slegati dal territorio: possono includere membri di altre istanze.                      |

L'utente sceglie di volta in volta a quale cerchia parlare. Il default è sempre la cerchia più stretta.

> **Stato attuale.** Il perimetro tecnico autorizzato copre soltanto la prima superficie. Profilo pubblico e gruppi sono visione, non roadmap: vedi [`RECONCILIATION.md`](RECONCILIATION.md) §6. La comunità pilota va reclutata sulla promessa del feed locale, non sulle tre superfici.

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

Non è un fork di Mastodon, non è una chat aziendale, non è una piattaforma di governance. Non avrà stories, marketplace, eventi, feed algoritmico, pubblicità né analytics comportamentali.

Il perimetro sono le tre superfici. Ogni proposta che non ricade in una di esse va rifiutata per default: il rischio principale del progetto, secondo la sua stessa analisi, è lo scope creep.

## 10. Come si giudica il risultato

Non sul manifesto. Su tre domande concrete:

1. Quanto è bello postare una foto nel feed del quartiere.
2. Quanto è affidabile la connessione quando cambi rete camminando per strada.
3. Quanto è vera la promessa che nessuno — nemmeno chi ospita il server — possa leggere ciò che non gli è destinato.

La terza è l'unica che oggi ESTIA non può ancora mantenere, e il documento lo dice apertamente.
