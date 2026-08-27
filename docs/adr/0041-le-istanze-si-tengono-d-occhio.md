# ADR 0041 — Le istanze si tengono d'occhio, e non lo fa più chi apre il feed

- Stato: **Accepted** — decisa dal proprietario il 2026-08-27: battito ogni **5 minuti**, e **non si spegne**
- Data: 2026-08-27
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md), [ADR 0029](0029-un-messaggio-si-consegna.md)
- Non decide: l'**avviso vuoto** di [ADR 0018](0018-federazione-fra-istanze-estia.md) §«I contenuti si visitano», che [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §«Quando riesaminare» tiene esplicitamente separato e che resta aperto

## Contesto

### La raggiungibilità non è uno stato: è un effetto collaterale

Fino a oggi ESTIA non sapeva mai se un'altra casa fosse accesa. Lo scopriva, ogni volta da capo, **il membro che apriva la lente «rete»**: il client azzerava l'elenco e ripartiva da zero, l'istanza interrogava tutte le case collegate in quel momento, e ogni domanda apriva una connessione QUIC nuova che chiudeva subito dopo.

Il campo `last_seen_at` esisteva già nella tabella delle istanze remote, ma lo scriveva soltanto il traffico che capitava di fare — o il pulsante «Prova» del pannello, cioè una persona. Fra una visita e l'altra, nessuno guardava.

Ne discendevano tre cose, e vale la pena tenerle distinte perché una sola di esse è cosmetica:

1. **Un'attesa a ogni ingresso.** Cosmetica, ma non innocua: la sala macchine («sto contattando…», casa per casa) diventa il primo contenuto della schermata.
2. **Una casa spenta non falliva presto.** `cerca` aveva un tetto di due secondi; la lettura di una bacheca non aveva alcun tetto, quindi l'attesa la decideva il trasporto.
3. **E soprattutto: i messaggi arrivavano tardi.** Questa non è cosmetica affatto.

### Il difetto che si vedeva davvero

La consegna di [ADR 0029](0029-un-messaggio-si-consegna.md) mette il messaggio in una coda locale e un drenaggio la svuota ogni cinque secondi. Un tentativo fallito arretra: 30s, 1m, 2m, 4m… fino a **un'ora**.

L'arretramento è giusto. Quello che mancava è la sua metà: **nessuno rimetteva la coda in partenza quando l'altra casa tornava.** Chi scriveva a una casa spenta si trovava un messaggio con una data di prossimo tentativo lontana, e quella data restava anche dopo che il motivo del fallimento era sparito. Nel caso peggiore un messaggio partiva **un'ora dopo** che il destinatario era tornato online.

Questo mette a rischio il gate di M6 — _due case, due persone, una conversazione che attraversa_ — perché quel gate misurerebbe questo difetto invece della federazione.

### Le tre cose che stavano appiccicate

Il collegamento fra istanze è **amministrativo e deliberato**, si fa una volta, ed è già così ([ADR 0018](0018-federazione-fra-istanze-estia.md) §«Come due istanze si collegano»). La lettura dei contenuti è **su richiesta**, e deve restarlo: [ADR 0018](0018-federazione-fra-istanze-estia.md) decisione 2 dice che i contenuti si visitano e non si replicano.

In mezzo c'era una terza cosa che non aveva un posto: **sapere se di là c'è qualcuno.** Non è una decisione amministrativa e non è un contenuto. È manutenzione, e la manutenzione è un mestiere dell'istanza — come il drenaggio della coda e come i backup di [ADR 0016](0016-backup-dal-pannello.md), che per la stessa ragione non li avvia una persona.

## Decisione

### 1. Un battito ogni cinque minuti verso ogni istanza collegata

L'istanza chiede alle case **collegate** — non a quelle in attesa, non a quelle bloccate — se ci sono. La domanda è la `presentazione` che il protocollo ha già: nessun tipo di richiesta nuovo, quindi nessuna versione maggiore e nessun coordinamento fra case ([ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §6).

Cinque minuti e non dieci perché il costo è, letteralmente, aritmetica: una richiesta ogni cinque minuti contro un tetto di **120 al minuto** per un'istanza collegata ([`limits.ts`](../../apps/core-api/src/federation/limits.ts)). Dodici richieste all'ora per casa collegata, di qualche centinaio di byte. Non c'era ragione di comprare latenza con un risparmio che non si misura.

### 2. Arretramento, non silenzio

La formulazione ingenua — «se non risponde smetto, e aspetto che sia lei a cercarmi» — ha un caso che la rompe, e non è raro: **il buco nel mezzo**. Se la rete salta per due minuti mentre entrambe le case sono accese, tutte e due smettono di chiedere e nessuna delle due ricomincia mai. Il collegamento resta formalmente in piedi e praticamente morto, senza che nessuno abbia sbagliato niente.

Quindi si arretra invece di tacere: **5 → 10 → 20 → 40 → tetto a 60 minuti.** Un'istanza spenta da una settimana costa 24 domande al giorno, non 288.

### 3. Qualunque contatto in arrivo vale come battito

È la regola che rende vera l'intuizione da cui è nato questo ADR — _aspetta che sia lei a farsi viva_ — senza portarsi dietro il caso che la rompe. **Non serve che sia un battito**: una ricerca, una lettura di bacheca, un cuore, la consegna di un messaggio. Qualsiasi cosa arrivi da quella chiave prova che di là c'è qualcuno, e azzera l'attesa.

Il meccanismo esiste già e non va costruito: ogni richiesta in arrivo scrive `last_seen_at`. Il battito **legge quel campo** invece di tenere una verità sua, e per questo non può divergere da ciò che è successo davvero.

### 4. Il risveglio della coda

Al passaggio **spenta → accesa** — e solo a quel passaggio, non a ogni battito riuscito — i messaggi in uscita per quella chiave tornano in partenza: `prossimo_invio` a adesso, tentativi azzerati. Il drenaggio che gira ogni cinque secondi fa il resto.

È questa la voce che risolve «i messaggi non arrivano in tempo». Le altre tre rendono onesto il pannello; questa cambia il prodotto.

### 5. Non si spegne

Deciso dal proprietario, ed è la parte che vale la pena scrivere per esteso perché è una scelta e non un'omissione.

Un interruttore qui sarebbe un modo di rompere la consegna dei messaggi da una schermata di impostazioni, senza che la schermata lo dica — e chi lo spegnesse per prudenza otterrebbe messaggi in ritardo di un'ora, non più riservatezza. Il battito **fa parte del funzionamento**, come il drenaggio della coda di [ADR 0029](0029-un-messaggio-si-consegna.md) e come lo svuotamento dei caricamenti orfani.

Resta vero, e non è in contraddizione, che **l'intera rete fra istanze si spegne**: `ESTIA_NETWORK_PROBE` a `off` chiude l'endpoint, e senza endpoint non c'è nessun battito. La scelta di stare in EstiaNet è ancora dell'amministratore, per intero. Quello che non è più una scelta è _come_ ci si sta.

### 6. Ogni domanda a un'altra istanza ha un tetto di tempo

Non è una voce a parte, è la stessa decisione vista da vicino: se la raggiungibilità è uno stato, un'attesa senza fine è un modo di non averlo. Otto secondi per una domanda ordinaria, venti per una fotografia — che è grande e viaggia spesso per relay — e i due che avevano già un tetto lo tengono: due secondi la ricerca, cinque il battito.

### 7. Che cosa il battito non è

- **Non è l'avviso vuoto.** Non dice «ho pubblicato» e non sveglia niente dall'altra parte: chiede e basta. L'avviso vuoto resta la decisione separata che [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §«Quando riesaminare» pretende, e questo ADR non la anticipa né la rende più facile da improvvisare.
- **Non porta contenuti** e non ne conserva. [ADR 0018](0018-federazione-fra-istanze-estia.md) decisione 2 non è toccata: i post continuano a visitarsi.
- **Non è un indice.** Nessuna istanza impara da un battito l'esistenza di una casa che non conosceva già.
- **Non è la sonda di rete** di [ADR 0018](0018-federazione-fra-istanze-estia.md), che vive sul proprio ALPN, misura un giro e resta una misura.

## Che cosa vede il terzo

Va scritto qui e non scoperto dopo, ed è l'unica voce di questo ADR che costa qualcosa.

Un battito ogni cinque minuti dà all'infrastruttura di scoperta e ai relay di n0 il **profilo di accensione della casa**, con risoluzione di cinque minuti: quando c'è, quando non c'è, da quando. Su una macchina che sta in casa di qualcuno, «accesa / spenta» è vicino a «c'è qualcuno / non c'è nessuno».

Tre cose lo rendono un costo accettabile, e nessuna delle tre è che sia piccolo:

1. **Quel terzo è già accettato e dichiarato** ([ADR 0018](0018-federazione-fra-istanze-estia.md) §«I relay pubblici di n0 sono accettati»), e non vede né contenuti né chi parla con chi dentro le case.
2. **Prima non era meglio, era peggio in un modo diverso.** Il traffico esisteva solo quando qualcuno _usava_ l'applicazione: un profilo a scatti, che racconta le abitudini delle persone e non solo lo stato della macchina. Un battito regolare **appiattisce** quel segnale, e la scoperta dell'accensione la fa comunque il primo che apre il feed.
3. **Il battito tiene caldo il buco nel NAT.** Una conseguenza tecnica che vale come argomento di prodotto: connessioni che oggi cadono sul relay hanno più probabilità di riuscire dirette, cioè di non passare da nessun terzo.

Il posto dove questa riga vive è [ADR 0018](0018-federazione-fra-istanze-estia.md) §«I relay pubblici di n0 sono accettati», che è dove sta il terzo della rete fra istanze, ed è stato aggiornato con essa. **Non** la tabella di [`ACCESSO_DA_FUORI.md`](../ACCESSO_DA_FUORI.md) §5: quella parla di Tailscale e del trasporto del pilot, cioè di un terzo diverso, e mescolare i due renderebbe illeggibili entrambi.

## Conseguenze

**Positive.** La raggiungibilità diventa uno stato dell'istanza, quindi il pannello dice la verità anche quando nessuno guarda. I messaggi partono entro secondi da quando l'altra casa torna, invece che entro un'ora. Il membro non paga più, all'ingresso, il conto di una diagnosi che non ha chiesto. E una casa spenta non blocca più nessuna schermata, perché ogni domanda ha una fine.

**Negative.** L'istanza parla anche quando nessuno la usa, e §«Che cosa vede il terzo» dice a chi. Il battito è codice che gira sempre e va tenuto fuori dai test come tutti i timer — vive nel processo (`server.ts`), non nell'applicazione costruita. E lo stato del battito sta in memoria: un riavvio ricomincia da un giro completo, che è il comportamento giusto ma va saputo.

**Neutre.** Nessun contenuto cambia posto. Il protocollo non cambia forma. Il legame amministrativo resta una decisione di chi amministra, e questo ADR non gliene toglie nessuna.

## Quando riesaminare

- **Se le case collegate diventassero molte** (decine): il battito è lineare, e a un certo punto conviene distribuirlo nel tempo invece di misurare l'attesa per ciascuna.
- **Quando si deciderà l'avviso vuoto**: quella decisione avrà bisogno di un canale che sveglia, e il battito è il posto ovvio dove appoggiarlo — che è precisamente la ragione per cui va deciso e non improvvisato.
- **Se il tetto di otto secondi tagliasse letture legittime** su linee lente: si misura, non si alza a sentimento.
- **Se servisse saltare del tutto una casa che il battito dà per spenta**, invece di interrogarla e aspettare il tetto: sarebbe più veloce, ma fa vedere meno di quello che c'è quando lo stato è vecchio di pochi minuti. Non è stato fatto, di proposito.
