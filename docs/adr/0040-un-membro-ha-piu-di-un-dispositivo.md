# ADR 0040 — Un membro ha più di un dispositivo, e qualcuno deve dire di sì

- Stato: **Accepted** — decisa dal proprietario il 2026-08-27: **strada B**
- Data: 2026-08-27
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0034](0034-distinzione-tra-dispositivo-fisico-e-sessione-di-login.md), [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md), [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md)
- Poggia su: spike [S3](../spike/S3-il-rientro-di-un-dispositivo.md), [S4](../spike/S4-autenticare-chi-entra.md)
- Riscrive: [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §1, che descrive un dispositivo solo

## Contesto

### Oggi ESTIA è a un dispositivo per persona, e non lo dice

Non è «le chiavi stanno nella sessione», che sarebbe scomodo e basta. È peggio, ed è verificabile in tre righe di SQL: quando qualcuno ti scrive, l'istanza gli consegna **una** chiave — la più recente fra le tue (`claimKeyPackageForUser` prende `devices[0]` da un elenco ordinato per data). Chi scrive cifra per quella, e per quella soltanto.

Ne segue una cosa che nessuna schermata dice: **aprire ESTIA da un secondo dispositivo spegne il primo.** Il telefono genera chiavi sue, diventa il più recente, e da quel momento i messaggi nuovi arrivano cifrati per il telefono — il computer resta loggato, sembra a posto, e non li apre più.

`ESTIA-E2E-v1` non sa fare altro: cifra per un destinatario. Su WhatsApp e su Signal un messaggio viene cifrato **una volta per ogni dispositivo** di ogni destinatario, ed è esattamente la differenza. [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) ha registrato quattro limiti di quel protocollo; **questo non era fra i quattro**, perché il multi-dispositivo non era nel disegno.

### Con MLS il meccanismo c'è già

In MLS **un dispositivo è una foglia dell'albero**. Una conversazione fra due persone con due dispositivi ciascuna è un gruppo di quattro foglie, e un messaggio si cifra una volta per tutte: nessuno resta indietro. La libreria lo regge e nel repository c'è già il test che lo prova — _«un secondo dispositivo della stessa persona entra, con una chiave sua»_ — insieme a quello che fissa il vincolo che ne discende: **la stessa chiave di firma non entra due volte**, quindi due dispositivi sono due chiavi di firma diverse.

E l'altra metà — la cronologia su un dispositivo appena arrivato — è già decisa e costruita: è l'archivio di [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), che appartiene alla conversazione e non al dispositivo.

**Quindi non manca la crittografia. Manca la regola su chi può aggiungere una foglia a nome tuo.**

## Il fatto che decide la domanda

Questo va letto prima delle opzioni, perché le riordina.

**Con MLS come è costruito adesso, per aggiungere un dispositivo basta saper entrare nell'account.** Il percorso è tutto già aperto, e nessun passaggio chiede altro:

1. un browser nuovo fa login e registra la propria chiave di firma (`POST /api/v1/dispositivi/chiave`, serve solo essere autenticati);
2. da quel momento la chiave **è nel registro**, e l'`AuthenticationService` di [S4](../spike/S4-autenticare-chi-entra.md) la riconosce come tua, perché il registro è la sua unica fonte;
3. il diritto di leggere il `GroupInfo` di una conversazione viene dall'essere **membro**, e la membership è della persona, non del dispositivo;
4. l'ingresso esterno con `resync: false` aggiunge una foglia, e il commit si deposita sul canale di handshake — che accetta chi è membro.

Nessuno di questi quattro passaggi chiede la frase segreta. **La frase segreta serve a _sostituire_ una foglia (`resync: true`), non ad _aggiungerne_ una.**

Ne discende la cosa che rende questo un ADR e non una funzione: **se si costruisce la cosa ovvia senza decidere niente, si è scelta l'opzione C.** Il confine di sicurezza dei messaggi privati diventa la password dell'account — la stessa che apre la bacheca — e chi la ottiene non legge il passato (la forward secrecy tiene) ma **si aggiunge a tutte le tue conversazioni e legge tutto il seguito**, più il pregresso dall'archivio.

## Il vincolo che vale per tutte e tre

**Tutta la gestione delle chiavi si fa dall'interfaccia, zero terminale** — regola del proprietario, 2026-08-27, qui scritta per la prima volta. La ragione è che se la gestiscono i membri, e non sono tecnici. Un collegamento di dispositivo che chiede una riga di comando non è una funzione: è un buco. Vale per tutte le opzioni qui sotto, e squalifica qualunque disegno che preveda di copiare una chiave a mano.

## Le tre strade

### A — Un dispositivo alla volta (è il disegno di oggi)

La frase segreta sposta la tua identità sul dispositivo nuovo, e il `resync` di [S3](../spike/S3-il-rientro-di-un-dispositivo.md) **sostituisce** la foglia vecchia. Telefono e computer non convivono: l'ultimo che entra è quello che riceve.

- **Non costa niente**: è quello che già succederà quando l'interfaccia passerà a MLS.
- **Ha una proprietà buona che le altre due non hanno**: il dispositivo perduto smette di essere membro da solo, senza che nessuno se ne ricordi.
- **Non è un'alternativa a WhatsApp**, e va detto a chi usa il prodotto invece di lasciarglielo scoprire cambiando stanza.

### B — Lo autorizza un dispositivo che hai già (Signal, WhatsApp)

Il dispositivo nuovo mostra un codice; uno già dentro lo legge, riconosce la persona e **aggiunge la foglia** a tutte le conversazioni. ESTIA ha già il componente `QrCode` nell'interfaccia, messo lì per il primo contatto di [ADR 0018](0018-federazione-fra-istanze-estia.md).

- **È la storia di fiducia più forte delle tre**, ed è l'unica che tocca il limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md): l'approvazione viene da una cosa che possiedi, non dal registro dell'istanza. [S4](../spike/S4-autenticare-chi-entra.md) §3 ha mostrato che un'istanza ostile può registrare una chiave come tua; con B quella chiave non entra in niente, perché nessun tuo dispositivo l'ha approvata.
- **Costa una via di riserva**: chi ha un dispositivo solo e lo perde non ha nessuno che approvi. Il ripiego è A — la frase segreta che sostituisce — e va costruito insieme, o la funzione si rompe proprio per chi è già in difficoltà.
- **Costa un flusso d'interfaccia vero**: mostrare, leggere, confermare, e dire che cosa si sta autorizzando.

### C — Basta entrare nell'account

Il dispositivo nuovo si aggiunge da solo dopo il login, con l'ingresso esterno.

- **È già quasi costruito**, come dice la sezione sopra: è ciò che si ottiene senza decidere.
- **Funziona da soli**, che è la proprietà per cui [S3](../spike/S3-il-rientro-di-un-dispositivo.md) via A era stata scelta: in una comunità non c'è un amministratore sveglio a ogni ora.
- **Sposta la riservatezza dei messaggi sulla password dell'account.** Oggi quella password apre la bacheca; con C apre anche tutte le conversazioni future. Sono due livelli di rischio diversi tenuti da un segreto solo, e [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) tratta i messaggi come la cosa più protetta del prodotto.
- **Peggiora esattamente il buco che [S4](../spike/S4-autenticare-chi-entra.md) §3 ha misurato**: chi ospita può registrare una chiave a nome tuo, e con C quella chiave si aggiunge alle tue conversazioni senza che nessuno dica di sì.

## Quello che costa uguale in tutte e tre

Va messo in conto una volta sola, perché non dipende dalla scelta.

1. **Aggiungere una foglia costa un commit per conversazione.** Chi ha quaranta conversazioni aperte ne paga quaranta, ognuno con il suo giro sul canale di handshake. Va misurato prima di prometterlo, e va mostrato mentre succede (euristica 1: un'azione che non è istantanea dice che sta lavorando).
2. **Togliere un dispositivo costa lo stesso, e oggi non lo fa nessuno.** [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §1 promette che revocare una sessione revoca la chiave, e la sua nota del 2026-08-26 registra che **nel codice non succede**. Con più dispositivi quel difetto smette di essere teorico: un telefono venduto resta una foglia che riceve. La revoca deve rimuovere la foglia **da ogni conversazione**, e questo vale in A, B e C.
3. **Un dispositivo appena aggiunto non apre subito la cronologia.** È il punto 8 di [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), misurato: l'ingresso esterno porta all'epoch successiva, il mazzo d'archivio è avvolto sotto quella precedente, e la cronologia riappare quando un altro dispositivo applica il commit e riavvolge. Con B lo fa il dispositivo che ha autorizzato, ed è naturale; con A e C bisogna decidere che cosa vede l'utente nell'attesa.
4. **Fra istanze non funziona niente di tutto questo** finché [ADR 0039](0039-mls-attraversa-le-istanze.md) non è decisa: le foglie di un membro remoto vivono dietro il confine di casa sua.

## Decisione

**Si sceglie B: a dire di sì è un dispositivo che già possiedi.**

La ragione non è la sicurezza in astratto: è che B è l'unica delle tre in cui **il sì lo dice una persona con una cosa in mano**, e quello è l'unico ingrediente che il limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) aspetta da sempre. Il numero di sicurezza serve a confrontare la chiave di un'altra persona; l'approvazione di B serve a confrontare la tua. Sono lo stesso gesto rivolto a due domande diverse, e costruirne uno rende l'altro più facile.

Ne discendono quattro obblighi, e nessuno è una rifinitura.

1. **A resta come via di riserva, dichiarata.** Chi ha un dispositivo solo e lo perde non ha nessuno che approvi: gli resta la frase segreta, che **sostituisce** la foglia invece di affiancarla. Va costruita insieme, o la funzione si rompe proprio per chi è già in difficoltà.
2. **C si rifiuta esplicitamente.** Non basta non sceglierla: è quello che si ottiene per inerzia, quindi il codice deve **impedirla**. Finché non c'è un'approvazione, un dispositivo nuovo non entra in una conversazione per il solo fatto di aver fatto login.
3. **La revoca toglie la foglia da ogni conversazione.** Il difetto già registrato in [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §1 — `revokeDeviceKey` che non chiama nessuno — smette di essere teorico nel momento in cui i dispositivi sono più d'uno.
4. **Tutto dall'interfaccia**, come dice il vincolo qui sopra.

### Dove vive, nell'interfaccia

**Deciso e costruito il 2026-08-27**, prima del meccanismo, perché è la parte che non dipende da MLS.

Le impostazioni si dividono in due lavori invece di uno solo (euristica 8 di [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md)):

- **Chat** — le chiavi dei messaggi privati, la copia di sicurezza, e **qui arriveranno le richieste di autorizzazione** di un dispositivo nuovo. È il posto dove si governa chi può leggere i propri messaggi.
- **Accesso e dispositivi** — da dove sei entrato, come si disconnette qualcuno, come si esce. Resta il legame con le chiavi in una sola direzione: uscire le cancella, e il pulsante lo dice.

**Quello che non è stato costruito, e perché.** La richiesta e l'approvazione non ci sono, e non c'è nemmeno un pulsante che non fa niente: aggiungere la foglia di un dispositivo nuovo a ogni conversazione è un'operazione MLS, e MLS non è ancora nel percorso dell'interfaccia — sta dietro il punto 4 di [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) e quindi dietro [ADR 0039](0039-mls-attraversa-le-istanze.md). Costruire adesso una schermata di autorizzazione la cui autorizzazione non autorizza niente sarebbe uno stub che sembra produzione, e [`AGENTS.md`](../../AGENTS.md) lo vieta.

**E finché il meccanismo non c'è, l'interfaccia dice la verità di oggi**: ESTIA funziona su un dispositivo alla volta. È un difetto a prescindere dalla strada scelta, ed è la prima cosa che la sezione Chat mostra.

## Come si verifica

1. Una persona con due dispositivi riceve lo **stesso** messaggio su entrambi, e lo legge su entrambi.
2. Un dispositivo aggiunto oggi legge la cronologia di ieri — non appena la condizione del punto 3 di §«Quello che costa uguale» è soddisfatta, e nel frattempo l'interfaccia dice che sta aspettando invece di mostrare messaggi vuoti.
3. Un dispositivo **rimosso** smette di ricevere: non alla scadenza di qualcosa, subito, e su tutte le conversazioni.
4. Con B: una chiave registrata a nome di un membro **senza** l'approvazione di un suo dispositivo non entra in nessuna conversazione. È la prova che chiude ciò che [S4](../spike/S4-autenticare-chi-entra.md) §3 ha aperto.
5. Il costo di aggiungere un dispositivo è misurato su un numero realistico di conversazioni, non su una.

## Quando riesaminare

- **Prima di M8**, e non dopo: i gruppi e le foglie multiple dello stesso membro toccano lo stesso meccanismo, e costruirli in due tempi vuol dire costruirli due volte.
- Se si sceglie A, prima di ESTIA 1.0 beta: «un dispositivo alla volta» è una promessa di prodotto, e va rimessa sul tavolo prima di farla a delle persone.
- Insieme al numero di sicurezza: B e il numero di sicurezza sono due metà dello stesso problema — sapere che una chiave è di chi dice di essere — e conviene disegnarli insieme anche se si costruiscono in tempi diversi.
