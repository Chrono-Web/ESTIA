# ADR 0037 — La cronologia è un archivio, non una chiave

- Stato: **Accepted** — decisa dal proprietario il 2026-08-26
- Data: 2026-08-26
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)
- Modifica: [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §2, che va letto insieme a questo
- Prepara: l'adozione di MLS e i gruppi (Milestone successive #5) — **decisa il 2026-08-26 da [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md)**, che fa dell'archivio qui descritto la condizione del taglio netto con `ESTIA-E2E-v1`

## Contesto

[ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) ha registrato che `ESTIA-E2E-v1` non ha forward secrecy, e lo spike [S1](../spike/S1-ts-mls-sotto-la-csp.md) ha misurato che MLS ce l'ha davvero: chi entra in un gruppo non legge il passato, e chi ne esce non legge il seguito.

Ma la forward secrecy non è gratis, e il prezzo lo paga una promessa che ESTIA fa già oggi. [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §2 dice:

> _«All'accesso da un nuovo browser, inserendo la passphrase il membro riscarica il blob, ripristina le chiavi e decifra l'intera cronologia conservata sull'istanza.»_

**Con la forward secrecy questa frase diventa impossibile, non difficile.** Il ratchet distrugge le chiavi vecchie: nessun backup di chiavi può riaprire ciò che quelle chiavi proteggevano, perché quelle chiavi non esistono più da nessuna parte. Un backup che le conservasse non sarebbe un backup — sarebbe la rinuncia alla forward secrecy, scritta in un altro file.

Oggi l'istanza conserva **tutte le buste per sempre** (si cancellano solo eliminando la conversazione, [`repository.ts:398`](../../apps/core-api/src/messaggi/repository.ts)) e `key_backups` custodisce una riga per membro con le chiavi sotto passphrase. È questo che rende vera la frase di ADR 0028, ed è esattamente questo che la forward secrecy rompe.

La scelta non è tecnica. È: **che cosa deve poter leggere un telefono nuovo?**

## Decisione

**Il trasporto e la cronologia diventano due cose separate, con due garanzie diverse, entrambe dichiarate.**

1. **Sul filo: forward secrecy piena.** I messaggi viaggiano e si conservano cifrati con le chiavi del ratchet. Chi intercetta il traffico, chi compromette l'istanza, chi legge i backup del NAS non apre né il passato né il futuro. Nessuna chiave di trasporto viene mai salvata da nessuna parte per essere riusata dopo.

2. **La cronologia è un archivio, e contiene testo ricifrato, non chiavi.** Dopo aver decifrato un messaggio, il client lo **ricifra con una chiave d'archivio** e deposita quello sull'istanza. L'archivio è un oggetto suo, con un suo ciclo di vita e un suo modello di minaccia, e **non ha forward secrecy per costruzione**: è ciò che lo rende recuperabile.

3. **Le chiavi d'archivio sono della conversazione, non della persona, e sono una catena.** Questa è la conseguenza diretta della scelta al punto 4: se chi entra deve poter leggere il pregresso, la chiave non può derivare dalla passphrase di un singolo, o solo quel singolo potrebbe rileggere. Sono quindi **per conversazione**, a vita lunga, e **viaggiano dentro il gruppo MLS** — è il gruppo che le distribuisce ai suoi membri, non l'istanza.

   **Corretto il 2026-08-26 dallo spike [S2](../spike/S2-la-chiave-d-archivio.md), che ha misurato due cose.** La prima: `mlsExporter` **non può essere** la chiave d'archivio, perché il segreto che produce è legato all'epoch e chi entra dopo non può derivare quello delle epoch precedenti. È invece la **serratura** giusta — tutti i membri di un'epoch lo derivano identico — quindi cifra il _mazzo_ delle chiavi, non l'archivio. La seconda: **una chiave sola non basta.** Se fosse immortale, chi viene rimosso leggerebbe anche il futuro dell'archivio, non solo il pregresso, e sarebbe più permissiva di quanto la §«Che cosa non copre» punto 2 dichiara. Quindi: `A₁` nasce casuale con la conversazione, il mazzo `{A₁…Aₙ}` si riavvolge a ogni cambio di epoch, e **a ogni rimozione nasce `Aₙ₊₁`**. Ruotare non richiede di ricifrare l'archivio: si aggiunge una chiave e si riavvolge un oggetto da poche centinaia di byte.

4. **Chi entra in un gruppo riceve il pregresso.** Ricevendo la chiave d'archivio, un nuovo membro può leggere quello che si è detto prima del suo ingresso. È una scelta di prodotto, non un effetto collaterale, e **va detta a chi scrive**: quello che scrivi oggi potrà essere letto da chi entrerà domani.

5. **Il backup con passphrase di [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) resta, e cambia contenuto.** Non custodisce più chiavi di messaggio, che non esistono più. Custodisce l'identità del dispositivo e ciò che serve a rientrare nelle proprie conversazioni e a recuperare le chiavi d'archivio. La frase di ADR 0028 §2 va riscritta di conseguenza quando si implementa.

## Che cosa questa decisione copre, e che cosa no

**Copre: il traffico e il database dell'istanza.** Chi ospita, chi ruba il NAS, chi legge un backup `age` non ha il testo dei messaggi né dall'una né dall'altra parte, e — questa è la novità rispetto a `ESTIA-E2E-v1` — **una chiave compromessa oggi non apre più il passato sul filo**.

**Non copre, e va scritto dove si legge:**

1. **L'archivio è l'anello debole, per costruzione.** Chi ottiene la chiave d'archivio di una conversazione legge tutta quella conversazione, sempre, senza limiti di tempo. La forward secrecy protegge il trasporto; l'archivio è precisamente il posto dove si rinuncia. Questo **non è un peggioramento rispetto a oggi** — è la stessa esposizione che [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) già accetta — ma prima era implicita e ora è un oggetto con un nome.

2. **Chi viene rimosso da un gruppo conserva le chiavi d'archivio che aveva.** MLS gli toglie i messaggi nuovi, e questo è crittografico e definitivo. La rotazione della catena gli toglie anche l'archivio successivo alla rimozione — `Aₙ₊₁` nasce dopo che è uscito, e il mazzo si riavvolge sotto un'epoch di cui non fa parte: [S2](../spike/S2-la-chiave-d-archivio.md) lo ha verificato. Non gli toglie il **pregresso** che poteva già leggere, e lì la crittografia non può niente: quelle chiavi le ha avute. Quello che lo ferma è il controllo d'accesso dell'istanza. **Rimuovere qualcuno non è cancellare quello che ha visto**, e l'interfaccia non deve suggerire il contrario.

3. **Perdere tutti i dispositivi e la passphrase vuol dire perdere la cronologia.** Non c'è una terza copia e non deve esserci: una via di recupero gestita dall'istanza sarebbe una via di lettura per chi la ospita.

4. **Restano aperti i limiti 2, 3 e 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)** che questa decisione non tocca. In particolare **la verifica fuori banda delle chiavi**: MLS la rende possibile con il suo `AuthenticationService`, ma nessuno la implementa da solo. Finché non c'è, un'istanza compromessa può ancora sostituire una chiave.

## Conseguenze sull'interfaccia

Non sono un capitolo successivo. Cambiare la crittografia senza cambiare l'interfaccia rompe le persone invece dei byte, e ognuno di questi punti è una promessa che oggi l'interfaccia fa e domani non potrà più fare.

- **Il cambio di telefono va raccontato prima, non dopo — e non come lo si racconta oggi.** [S3](../spike/S3-il-rientro-di-un-dispositivo.md) ha corretto la frase: la cronologia torna **comunque**, con o senza passphrase, perché l'archivio è della conversazione. **Corretto di nuovo il 2026-08-26, misurando** (punto 8 qui sotto): torna comunque, ma **non subito** — chi rientra da solo deve aspettare che un altro membro applichi il suo commit. Quello che la passphrase dà è altro, ed è più concreto: **rientrare senza chiedere aiuto a nessuno, e togliere dal gruppo il telefono che hai perso**. Senza, serve che un altro membro sia sveglio e agisca, e il telefono perduto resta dentro finché qualcuno non lo toglie. È questo che va detto quando il telefono vecchio è ancora in mano.
- **La rimozione da un gruppo dice la verità.** «Non riceverà più messaggi» è vero. «Non potrà più leggere» è falso. Va scritto quello vero.
- **L'ingresso in un gruppo è un momento dichiarato.** Chi entra vede il pregresso, e chi c'era deve saperlo. Non è una notifica di servizio: è un cambio di chi può leggere quello che è già stato scritto.
- **I messaggi illeggibili sono uno stato, non un testo.** Con la forward secrecy diventano normali — un dispositivo che non c'era, un archivio non ancora scaricato. Oggi il client mobile scrive `[Errore di decifrazione]` dentro la nuvoletta come se fosse il messaggio ([ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)); non è più accettabile nemmeno come rimedio provvisorio.
- **La verifica dei dispositivi vuole una schermata**, il giorno che si chiude il limite 4: due persone che confrontano lo stesso numero, a voce. È più interfaccia che crittografia.
- **Il lucchetto deve poter dire che cosa non protegge.** Un'icona che promette e basta è peggio di nessuna icona, e [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) punto 2 lo impone già.

## Conseguenze

### Positive

- La promessa di ADR 0028 sopravvive nella sostanza — il telefono nuovo rilegge — pur guadagnando la forward secrecy dove serve davvero.
- La rinuncia alla forward secrecy diventa **un oggetto solo, dichiarato e circoscritto**, invece di una proprietà diffusa e taciuta come in `ESTIA-E2E-v1`.
- I gruppi diventano possibili con il comportamento che il proprietario ha scelto, e MLS li regge già ([S1](../spike/S1-ts-mls-sotto-la-csp.md)).
- È il disegno che usano i sistemi maturi con backup in cloud: trasporto con ratchet, archivio separato e dichiarato.

### Negative

- **Due percorsi crittografici da mantenere e da testare**, invece di uno. È il costo principale, e ricade sui client.
- L'istanza conserva più dati: le buste di trasporto **e** l'archivio. **Misurato il 2026-08-26** ([S2](../spike/S2-la-chiave-d-archivio.md)): l'archivio aggiunge il **29%** a quello che il trasporto pesa già, e 10.000 messaggi costano 4,8 MB in tutto. Contro il tetto di [ADR 0013](0013-backup-cifrati-in-formato-age.md) §2 — «qualche centinaio di megabyte» per l'istanza intera — i messaggi non sono ciò che riempie un'istanza: **lo sono le fotografie, e l'archivio non le tocca**, perché restano nei media e non si duplicano. La preoccupazione si ridimensiona, ma non sparisce per chi scrive molto.
- Una conversazione senza archivio impostato diventa illeggibile a un dispositivo nuovo. Il caso «non l'ho mai configurato» esiste e va progettato, non lasciato al caso peggiore.

### Neutre

- Nessuna modifica al codice deriva da questo ADR: fissa la regola, e va attuato insieme all'adozione di MLS.
- `ESTIA-E2E-v1` resta in servizio finché MLS non entra. Questa decisione non lo cambia.

## Che cosa resta da verificare prima di implementare

Questo ADR decide **la regola di prodotto** e indica il meccanismo. Non lo specifica al bit, e non deve: quello che segue va misurato in uno spike, non deciso a tavolino.

1. ~~**Come viaggia la chiave d'archivio dentro il gruppo.**~~ **Chiuso il 2026-08-26** da [S2](../spike/S2-la-chiave-d-archivio.md), con la correzione riportata nella Decisione §3: `mlsExporter` avvolge il mazzo, non cifra l'archivio, e le chiavi sono una catena. Le quattro proprietà che questo ADR decide sono state misurate una per una.
2. ~~**Quanto pesa l'archivio.**~~ **Chiuso il 2026-08-26** da [S2](../spike/S2-la-chiave-d-archivio.md): +29% sul trasporto, 4,8 MB per 10.000 messaggi, e i media non si duplicano.
3. ~~**Che cosa succede a chi non ha mai impostato la passphrase** e cambia telefono.~~ **Chiuso il 2026-08-26** da [S3](../spike/S3-il-rientro-di-un-dispositivo.md). Un dispositivo nuovo rientra in due modi: **con la passphrase da solo**, con l'ingresso esterno di MLS e senza che nessun altro sia online; **senza passphrase** solo se un altro membro lo riammette. **In entrambi i casi la cronologia torna intera**, il che conferma la Decisione §3 — l'archivio è della conversazione, non del dispositivo. Il caso «non l'ho mai configurata» quindi regge, a un prezzo: si dipende da qualcuno.

   **Ne segue che la passphrase cambia di natura**, e va raccontata diversamente: non è più «come recuperare la cronologia» — quella torna comunque — è **come rientrare senza dipendere da nessuno, e come far sparire dal gruppo il telefono perduto**. La §«Conseguenze sull'interfaccia» va letta con questa correzione.

4. ~~**Se l'archivio debba essere per conversazione o per membro-nella-conversazione.**~~ **Chiuso il 2026-08-26** da [S2](../spike/S2-la-chiave-d-archivio.md): «per conversazione» funziona, ed è misurato. La catena risolve il timore che rendesse «irrevocabile troppo» — una rimozione chiude il futuro, e solo il pregresso resta leggibile a chi esce.

5. **Aperto, trovato da [S3](../spike/S3-il-rientro-di-un-dispositivo.md): senza passphrase, riammettere qualcuno lascia il dispositivo perduto dentro il gruppo.** Il rientro con risincronizzazione **sostituisce** la foglia vecchia; una riammissione normale ne **affianca** una seconda, e il telefono smarrito resta membro — continuando a poter ricevere — finché una persona non lo rimuove a mano. MLS non può sapere che le due foglie sono la stessa persona: è esattamente ciò che la passphrase dimostra. Per ESTIA è una conseguenza di prodotto: **la rimozione del vecchio dispositivo deve far parte del gesto di riammissione**, chiesta dall'interfaccia e non lasciata al caso.

6. **Aperto, trovato da [S3](../spike/S3-il-rientro-di-un-dispositivo.md): l'ingresso esterno va autenticato.** Verifica che la credenziale sia ben formata, non che sia _tua_: chi ottiene un `GroupInfo` valido e sa produrre una credenziale con quel nome può tentare di entrare. La difesa è l'`AuthenticationService` di MLS, cioè lo stesso aggancio del limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md). **Si chiude insieme a quello, non separatamente**, o la via comoda diventa una porta.

7. **L'istanza deve conservare un `GroupInfo` per gruppo**, aggiornato a ogni epoch: è la condizione del rientro autonomo, ed è un oggetto nuovo lato server (1143 byte per un gruppo da due; su gruppi veri non è misurato).

8. **Aperto, trovato misurando il 2026-08-26: chi rientra da solo torna nel gruppo, ma non subito nella cronologia.**

   Il rientro con ingresso esterno porta all'epoch **successiva**; il mazzo depositato sull'istanza è avvolto sotto la **precedente**, e la serratura è per costruzione legata all'epoch ([S2](../spike/S2-la-chiave-d-archivio.md) parte 1A-B). Chi rientra non la può derivare: quell'epoch non è mai stata nella sua storia. La cronologia riappare quando un **altro** membro applica il commit di rientro e riavvolge il mazzo sotto la nuova — allora i due derivano la stessa serratura, e questo è misurato.

   Non è un difetto di MLS ed è inerente al disegno: prima che il suo commit sia applicato, chi rientra non condivide alcun segreto con il gruppo. Ma **cambia che cosa la passphrase può promettere**, e §«Conseguenze sull'interfaccia» va letta con questa correzione: il rientro nel gruppo è autonomo, il ritorno della cronologia no.

   Resta da decidere, ed è una scelta di prodotto: **che cosa può fare chi è appena rientrato, finché nessun altro si fa vivo.** Può leggere e scrivere sul trasporto, ma non può archiviare — e un messaggio scritto e non archiviato è un messaggio che, con la forward secrecy, sparisce dalla cronologia per sempre. Le strade sono tre: rifiutare la scrittura finché la cronologia non torna, tenere in sospeso le voci d'archivio sul dispositivo e depositarle dopo, oppure accettare il buco e dirlo. Nessuna delle tre è ovvia, e nessuna si decide in un commit.

## Come si verifica

1. Un test verifica che le chiavi di trasporto **non compaiano** in `key_backups` né in nessun altro deposito lato istanza.
2. Un test verifica che l'archivio sia illeggibile senza la chiave d'archivio, con la stessa scansione di database e backup `age` già usata per M6.
3. Un test verifica che un dispositivo nuovo, con la sola passphrase, **non** possa decifrare il traffico di trasporto precedente — cioè che la forward secrecy sia reale e non solo dichiarata.
4. Un test verifica che un membro rimosso non decifri i messaggi successivi alla rimozione, e che l'istanza **rifiuti** di servirgli l'archivio.

## Quando riesaminare

- Se lo spike del punto 1 mostra che la chiave d'archivio non può attraversare i cambi di epoch in modo sicuro, questa decisione va riaperta prima di scrivere codice.
- Se il pilot mostra che la cronologia recuperabile non è la funzione che si crede — cioè che nessuno cambia telefono, o che nessuno imposta la passphrase — allora l'opzione «forward secrecy piena e niente archivio» torna sul tavolo, ed è la più semplice delle due.
- Se ESTIA esce dal pilot verso persone che non si fidano di chi ospita, il punto 2 della §«Che cosa non copre» — chi esce conserva il pregresso — va rivalutato come limite di prodotto, non come dettaglio.
