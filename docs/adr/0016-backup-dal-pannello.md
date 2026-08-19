# ADR 0016 — I backup si governano dal pannello, il ripristino no

- Stato: **Accepted**
- Data: 2026-08-17
- Proprietario: progetto ESTIA
- Vincolante per: M3
- Sopra: [ADR 0013](0013-backup-cifrati-in-formato-age.md), [ADR 0014](0014-backup-prima-delle-migrazioni.md)

## Contesto

I backup esistono, sono cifrati, girano da soli e l'istanza dice se stanno funzionando. Ma per **attivarli** bisogna aprire un terminale sul NAS, generare una coppia di chiavi con un comando, incollare la chiave pubblica in un file `docker-compose.yml`, creare una cartella con i permessi giusti e riavviare il container.

[`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §4 fissa a **zero** i passaggi tecnici richiesti a un membro non tecnico, e a meno di 30 minuti l'installazione di un'istanza. La riga di comando non viola nessuno dei due alla lettera — chi amministra non è un membro qualunque. Ma è il motivo per cui la voce più costosa dell'installazione reale del 2026-08-15 è stata l'installazione stessa, e §9 dice che «se un'azione quotidiana richiede una procedura, la procedura è un difetto di design».

E c'è una conseguenza peggiore del fastidio: **i backup che si attivano da terminale sono i backup che non si attivano.** Lo stato `not_configured` della diagnostica esiste perché è il caso normale, non l'eccezione.

## La cosa che non va spostata, e perché

`backup/cli.ts` porta scritta la ragione per cui è nato fuori dall'API:

> Un amministratore ne ha bisogno **proprio quando l'istanza è nei guai**, e una procedura che richiede un'interfaccia web funzionante è una procedura che fallisce esattamente quando serve.

Quel ragionamento regge, ed è asimmetrico: vale per il **ripristino**, non per il resto. Fare un backup si fa a istanza viva, per definizione; ripristinare si fa quando l'istanza non c'è più — disco rotto, NAS rubato, container che non parte. Un pulsante «ripristina» nel pannello è utile il giorno in cui non serve e assente il giorno in cui serve.

## Decisione

**Attivare, eseguire, controllare e portarsi via i backup si fa dal pannello di amministrazione. Ripristinare resta un'operazione da riga di comando.**

Quattro conseguenze che sono scelte.

### 1. La configurazione dei backup diventa modificabile a caldo, e le variabili d'ambiente vincono

`AGENTS.md` fissa che la configurazione è validata all'avvio e che il processo fallisce se mancano valori obbligatori. Quella regola resta dov'è utile — porta, directory dei dati, limiti — ma non può valere per i backup, perché è esattamente ciò che costringe al terminale.

Chiave pubblica, intervallo e numero di archivi da tenere si conservano quindi **nel database** e si cambiano dall'interfaccia, senza riavviare.

Le variabili d'ambiente non spariscono e **hanno la precedenza**: dove `ESTIA_BACKUP_PUBLIC_KEY` è impostata, il pannello mostra il valore e dichiara che arriva dall'ambiente, invece di offrire una modifica che al riavvio verrebbe sovrascritta. Due sorgenti di verità che si contraddicono in silenzio sono peggio di una sola scomoda: chi ha già un `docker-compose.yml` che funziona non deve scoprire che l'interfaccia stava mentendo.

### 2. Dove finiscono gli archivi **non** si sceglie dall'interfaccia

Un percorso scritto in un campo di testo è un percorso su cui il processo scriverà: sarebbe una scrittura arbitraria sul filesystem del NAS concessa attraverso il browser, cioè la superficie che [ADR 0012](0012-immagini-autenticate-non-indovinabili.md) e la pipeline dei media hanno lavorato per non aprire.

Quindi: la cartella viene da `ESTIA_BACKUP_DIR` se c'è, altrimenti è `backup/` **dentro la directory dei dati**. Nessun campo, nessun percorso in arrivo dalla rete.

Il costo va dichiarato invece che nascosto, ed è reale: un archivio sullo stesso disco protegge da un errore umano e da un aggiornamento andato male, **non dalla rottura del disco né dal furto del NAS**. È metà di ciò che un backup deve fare. Per questo il punto 3 non è un accessorio.

### 3. Gli archivi si scaricano dal pannello, ed è la parte che vale di più

Un backup che resta sul NAS non è ancora un backup. Oggi portarselo via richiede `scp` — cioè il terminale, cioè il passaggio che non si fa mai.

Il pannello elenca gli archivi e permette di **scaricarli**, autenticato e riservato a `instance_admin`. Sono cifrati verso una chiave che l'istanza non possiede: farli passare per il browser non li espone più di quanto siano già esposti sul disco, ed è ciò che rende vero il consiglio «tienine una copia altrove».

### 4. La chiave privata viene mostrata una volta e non torna

Generare la coppia dal pannello significa che la chiave privata esiste per un istante nella memoria dell'istanza, viene mostrata una volta sola e non è più recuperabile — **la stessa forma del codice di recupero di [ADR 0009](0009-recupero-accesso-amministratore.md)**, e la stessa che il comando `chiavi` ha sempre avuto girando sul NAS.

Ciò che non cambia è la proprietà che conta: **conservata, sull'istanza c'è solo la chiave pubblica.** L'istanza continua a produrre archivi che non è in grado di rileggere.

Ne segue che il pannello **non può verificare un archivio**: servirebbe la chiave privata, e chiederla in un campo di testo la porterebbe sul NAS, distruggendo l'unica proprietà per cui [ADR 0013](0013-backup-cifrati-in-formato-age.md) è stato scritto. Se un giorno servisse, si fa decifrando **nel browser** — `age` è una libreria che gira anche lì — e resta una decisione separata da prendere, non un'estensione ovvia di questa.

## Che cosa questo non risolve

**Il ripristino resta da terminale**, con la procedura di [`INSTALLAZIONE.md`](../INSTALLAZIONE.md) §13. Il pannello lo dice e mostra il comando esatto, invece di far finta che il problema non esista.

**Un backup nella directory dei dati non protegge dal furto del NAS.** Il pannello lo dichiara ogni volta che quella è la configurazione attiva.

**Il tetto di memoria di [ADR 0013](0013-backup-cifrati-in-formato-age.md) non si sposta**: un backup chiede circa sei volte i dati, e un pulsante che lo lancia a mano può uccidere il container esattamente come lo scheduler. La diagnostica lo prevede già.

## Conseguenze

**Positive.** Attivare i backup smette di richiedere un terminale, e quindi smette di essere la cosa che non si fa. Portarseli via anche. La configurazione si cambia senza riavviare l'istanza, il che toglie di mezzo l'unico motivo per cui un amministratore doveva imparare `docker compose`.

**Negative.** Una seconda sorgente di configurazione, con una precedenza da ricordare. Un endpoint che serve file grandi, che va servito a flusso e non caricato in memoria. E un default — archivi accanto ai dati — che è metà protezione: accettato perché la scelta vera è fra metà protezione e nessuna, non fra metà e tutta.

## Quando riesaminare

- Se qualcuno chiedesse la verifica di un archivio dall'interfaccia: si decide come decifrare **nel browser**, non si sposta la chiave privata sull'istanza.
- Se comparisse una destinazione remota per gli archivi — un disco di rete, un altro NAS — quella è un'estensione di §2 e va decisa lì, perché riapre la questione dei percorsi in arrivo dalla rete.
