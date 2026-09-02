# ADR 0042 — Come MLS attraversa: la casa che mette in fila, e il nome che porta la casa

- Stato: **Proposed** — [ADR 0039](0039-mls-attraversa-le-istanze.md) ha deciso **che** si federa; questo decide **come**, e tocca confini di fiducia
- Data: 2026-08-28
- Proprietario: progetto ESTIA
- Attua: [ADR 0039](0039-mls-attraversa-le-istanze.md) strada B
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0029](0029-un-messaggio-si-consegna.md), [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md), [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md), [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md)
- Poggia su: spike [S4](../spike/S4-autenticare-chi-entra.md), [S5](../spike/S5-quanto-pesa-un-albero.md)

## Contesto

[ADR 0039](0039-mls-attraversa-le-istanze.md) ha scelto la strada B — prima MLS attraversa, poi si taglia — e ha lasciato cinque nodi. Uno è chiuso da una misura; ne resta un altro che quell'ADR non aveva visto, e che è il più costoso da correggere dopo.

**Il nodo 5 è chiuso.** [S5](../spike/S5-quanto-pesa-un-albero.md) ha misurato che un Welcome cresce di **262 byte per foglia** e che a cinquanta foglie occupa 17 932 caratteri Base64 contro un tetto di 65 536: margine 3,7×, e il primo tetto vero si incontra a **~187 foglie**. Il tetto della federazione non va toccato e **il disegno non cambia**. Era la domanda che poteva far ripensare tutto.

## Il nodo che ADR 0039 non aveva visto

**Oggi la credenziale MLS porta solo il nome: `credenziale(username)` in [`gruppo.ts`](../../apps/web/src/mls/gruppo.ts).** Dentro un albero con una casa sola va bene, perché i nomi lì sono unici. Fra due case non lo sono: `anna` a Milano e `anna` a Torino sono due persone diverse con la stessa credenziale, e l'`AuthenticationService` andrebbe a cercare la chiave nella casa sbagliata — cioè **autenticherebbe la persona sbagliata**, che è esattamente il buco che [S4](../spike/S4-autenticare-chi-entra.md) esiste per chiudere.

Va corretto **prima** del taglio, e il momento è adesso per una ragione precisa: **nessun gruppo MLS esiste ancora in produzione**, perché l'interfaccia non è ancora passata. Cambiare la forma della credenziale oggi costa una riga; farlo dopo vuol dire migrare alberi vivi, che in MLS significa ricrearli.

## Decisione

### 0. La credenziale porta la casa

**L'identità di una credenziale `basic` diventa `<username>@<chiave della casa>`**, dove la chiave è quella pubblica dell'istanza — la stessa con cui [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §1 identifica chi chiama, e l'unica che non si può dichiarare.

Ne discende la regola di instradamento dell'`AuthenticationService`, che è tutta la differenza fra federare e sbagliare persona:

- casa **mia** → registro locale (`getActiveDeviceKeysByUserId`, già filtrato per i dispositivi approvati di [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md));
- casa **d'altri** → il registro di quella casa, chiesto a lei.

### 1. Di quale registro ci si fida, detto per intero

Per un membro remoto il registro è di un'altra istanza. La validazione diventa: **«mi fido che la casa di Bruno dica la verità su Bruno»**.

Non è una fiducia nuova nella sostanza — [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) costruisce già rapporti fra istanze, e una casa che mente sui propri membri può già oggi consegnare buste per conto loro — ma **va dichiarata**, perché allarga il limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md): i registri di cui fidarsi diventano due, e il numero di sicurezza da confrontare a voce passa da rimedio consigliato a **rimedio necessario**.

**Un vincolo d'implementazione che non è una rifinitura.** `validateCredential` viene chiamata **a ogni foglia** durante la validazione dell'albero ([S4](../spike/S4-autenticare-chi-entra.md) §«Limiti»). Una domanda di rete per foglia, su un gruppo da cinquanta, sarebbe cinquanta giri: **il registro di una casa remota si chiede una volta per validazione e si tiene per la durata di quella validazione**, non per foglia. Fuori da quella finestra non si conserva: un registro memorizzato è una revoca che non arriva.

### 2. Chi può depositare un handshake in casa d'altri

**L'istanza `K` può depositare nella conversazione `X` se e solo se `X` ha fra i membri un `remote:K:*`.**

Si verifica in locale su `conversazione_membri`, e `K` è la chiave della connessione — mai un campo del messaggio, per la regola di [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §1. Nessuna casa può infilare buste in una conversazione a cui non partecipa, e non serve chiedere niente a nessuno per saperlo.

### 3. Una casa mette in fila, ed è quella dove la conversazione è nata

È il nodo che [ADR 0039](0039-mls-attraversa-le-istanze.md) chiama «il più tecnico dei cinque e quello che si sbaglia più facilmente, perché in laboratorio non si vede».

**Ogni conversazione ha una casa che ordina, decisa alla nascita e scritta sulla riga della conversazione.** I commit si depositano lì; tutti leggono da lì la coda ordinata. La casa che ordina non capisce che cosa smista — resta un Delivery Service che muove buste opache, come [ADR 0027](0027-la-libreria-mls.md) punto 3 già stabiliva.

**Perché una e non due.** MLS applica i commit **in sequenza**, e la sua architettura presuppone un servizio di consegna che li metta in fila. Con due code indipendenti due commit alla stessa epoch sono una corsa: entrambe le case ne accettano uno, e da quel momento hanno due alberi diversi che si credono lo stesso. Non è un errore che si vede — è uno stato che diverge in silenzio, e si scopre quando un messaggio non si apre più.

**Il caso della corsa, risolto.** Con una fila sola, il secondo commit arriva a un'epoch già superata e viene rifiutato. Chi l'ha scritto lo rifà sull'epoch nuova. È un fallimento **visibile e ripetibile**, che è la differenza che conta.

**Il costo, dichiarato.** Se la casa che ordina è spenta, in quella conversazione **non si può cambiare chi c'è**: niente ingressi, niente uscite. Ma i messaggi applicativi non cambiano l'epoch, quindi **si continua a scrivere e a leggere**. La frase che l'interfaccia dovrà dire è una: _«Finché la casa di Bruno è spenta puoi scrivere, ma non puoi aggiungere o togliere nessuno.»_ E grazie a [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md) l'istanza **sa** se quella casa è accesa, quindi può dirlo prima invece che dopo un tentativo fallito.

**L'alternativa scartata**, e perché: fondere due code ordinando per epoch con un criterio di spareggio. Richiede che le due case concordino sullo spareggio **e** che convergano, e sbaglia esattamente quando due persone committano insieme — cioè il caso che in laboratorio non si riproduce. Un disegno che è corretto solo finché nessuno fa due cose insieme non è un disegno.

### 4. L'archivio si replica, con la deroga che c'è già

**Ribaltato da [ADR 0043](0043-custodia-lato-mittente.md): l'archivio non si replica. Ogni casa custodisce le voci dei propri membri e le _serve su richiesta_ — la cronologia si visita, come i post di [ADR 0018](0018-federazione-fra-istanze-estia.md), ed è l'unione delle custodie. Quanto segue vale solo fino all'accettazione di 0043.**

Le voci d'archivio **viaggiano con il messaggio** e si depositano in entrambe le case. È la stessa deroga di [ADR 0029](0029-un-messaggio-si-consegna.md) — i messaggi privati si consegnano, non si visitano — estesa a ciò che di quel messaggio deve sopravvivere alla forward secrecy. Il deposito è già **idempotente per (conversazione, id del messaggio)** ([ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 3), quindi due copie convergono senza coordinarsi.

Il **mazzo** si replica con la sua regola dell'epoch che non torna indietro. Quella regola ha bisogno che le due case concordino sull'ordine delle epoch — e ce l'hanno, perché è ciò che il punto 3 garantisce. **Senza il punto 3 questo punto non starebbe in piedi**, ed è la ragione per cui sono decisi insieme.

### 5. I tetti restano quelli

Chiuso da [S5](../spike/S5-quanto-pesa-un-albero.md). Nessuna costante cambia. Si aggiunge però **un test che tiene fermo il fatto**: se un aggiornamento della libreria facesse crescere il Welcome di un ordine di grandezza, oggi non se ne accorgerebbe nessuno fino al campo.

## Le operazioni da scrivere

Sul protocollo di [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), che non cambia forma né versione maggiore: sono richieste nuove, non una grammatica nuova.

| `tipo`            | chi la fa               | che cosa porta                                |
| ----------------- | ----------------------- | --------------------------------------------- |
| `chiavi-di-firma` | chi valida un albero    | le chiavi di firma **approvate** di un membro |
| `handshake`       | chi ha fatto un commit  | la busta, per la casa che ordina              |
| `handshake-da`    | ogni casa che partecipa | la coda ordinata da un cursore in poi         |
| `group-info`      | chi rientra             | il punto di rientro dell'epoch corrente       |
| `archivio`        | chi ha decifrato        | le voci da replicare                          |
| `mazzo`           | chi ha riavvolto        | il mazzo, con la sua epoch                    |

Tutte soggette al tetto di tempo di [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md) §6 e ai budget di [`limits.ts`](../../apps/core-api/src/federation/limits.ts). Nessuna porta contenuti in chiaro: per l'istanza che le smista sono buste opache, come tutto il resto.

## Come si verifica

1. Due case, un gruppo, un messaggio che arriva a tutti — e il testo in chiaro assente da **entrambi** i database e da entrambi i backup `age`.
2. **Due commit lanciati insieme dalle due case**: uno vince, l'altro riceve un rifiuto esplicito e si rifà. Nessuno dei due alberi diverge. È la prova del punto 3, e va fatta con due istanze vere.
3. Un membro remoto la cui chiave **non** è nel registro della sua casa non entra in niente.
4. Due persone con lo stesso username su due case diverse **non** si confondono: è la prova del punto 0.
5. Con la casa che ordina spenta: si scrive e si legge, non si aggiunge nessuno, e **l'interfaccia lo dice prima**.
6. La cronologia letta da una casa e dall'altra è la stessa.
7. Un test tiene fermo il peso del Welcome misurato da [S5](../spike/S5-quanto-pesa-un-albero.md).

## Quando riesaminare

- **Se la casa che ordina diventa un problema pratico** — cioè se nel pilot capita spesso di non poter cambiare i membri perché una casa è spenta: allora si guarda un ordinamento distribuito, sapendo che costa la convergenza.
- **Insieme al numero di sicurezza**: il punto 1 lo rende necessario e non più consigliato, ed è la stessa schermata che [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) §«Conseguenze sull'interfaccia» chiede già.
- **Se una casa si scollegasse da una conversazione ancora viva**: che ne è delle foglie dei suoi membri è una domanda che questo ADR non affronta, e che va affrontata prima dei gruppi grandi.
