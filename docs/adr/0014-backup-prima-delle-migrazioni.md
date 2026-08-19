# ADR 0014 — Il backup che precede una migrazione

- Stato: **Accepted**
- Data: 2026-08-16
- Proprietario: progetto ESTIA
- Vincolante per: M3
- Attua: [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §8, sopra [ADR 0013](0013-backup-cifrati-in-formato-age.md)

## Contesto

Due decisioni già prese, messe una accanto all'altra, producono un requisito che nessuna delle due enuncia.

[`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §8 dice che le migrazioni sono **solo in avanti** e che **il rollback di un aggiornamento è il ripristino da backup**. Non esistono migrazioni inverse, e non è una dimenticanza: una migrazione inversa corretta è difficile da scrivere e raramente esercitata.

[ADR 0013](0013-backup-cifrati-in-formato-age.md) ha dato all'istanza dei backup automatici, e il primo parte **un minuto dopo l'avvio**.

Un minuto dopo l'avvio è troppo tardi. Le migrazioni sono già state applicate mentre il processo apriva il database, quindi il primo archivio dell'istanza aggiornata fotografa lo schema **nuovo**. Il punto di ritorno più recente resta quello della notte prima: fra lui e adesso ci sono i post e le fotografie di un giorno intero, e nessuno se ne accorge finché non serve.

La procedura di [`INSTALLAZIONE.md`](../INSTALLAZIONE.md) §12 dice all'amministratore di fare il backup a mano prima di aggiornare, ed è giusto che lo dica. Ma è una riga di documentazione contro una perdita irreversibile: la protezione va messa dove non si può dimenticare.

## Il nodo tecnico, che è un problema di ordine

Le due cose da mettere in fila si aprono a vicenda.

1. `openDatabase()` **applica le migrazioni mentre apre il database.** Aprire e migrare sono lo stesso gesto, quindi non c'è un momento in cui l'istanza sappia che deve migrare e non l'abbia ancora fatto.
2. Il backup copia il database con `VACUUM INTO`, che **il database lo apre**. Non è una copia di file: è una query.

Ne segue che «backup prima delle migrazioni» non si ottiene spostando una chiamata. Va spezzata la prima: **sapere quali migrazioni mancano deve diventare un'operazione distinta dall'applicarle.**

## Decisione

**Quando l'istanza trova migrazioni da applicare su uno schema che esiste già, scrive un backup cifrato prima di applicarle. Se non riesce, o se nessun backup è configurato, applica comunque le migrazioni e dichiara che quell'aggiornamento non ha un punto di ritorno.**

Sei conseguenze, ognuna delle quali è una scelta e non un dettaglio.

### 1. Aprire e migrare diventano due gesti

`openConnection()` apre il database, ne fissa i permessi e i pragma, e non tocca lo schema. `readSchemaState()` legge quali migrazioni risultano applicate **senza crearne la tabella**. `runMigrations()` resta quello di prima. `openDatabase()` sopravvive come composizione dei due, perché decine di test lo usano legittimamente per avere un database pronto.

La separazione è il vero contenuto tecnico di questa decisione: tutto il resto discende da lì.

### 2. Al momento dello snapshot l'istanza non tiene aperto il database

Fra il «so che devo migrare» e il primo `exec` di DDL, l'istanza **chiude la propria connessione**, esegue il backup — che apre la sua, fa `VACUUM INTO` e la richiude — e poi riapre.

WAL reggerebbe due connessioni insieme, ed è esattamente ciò che accade ogni notte con i backup automatici a istanza viva. Ma qui si sta per scrivere DDL, e una riapertura all'avvio non costa nulla: il server non è ancora in ascolto, non c'è nessuno da far aspettare. Preferire l'ordine più noioso, dove al momento dello snapshot non esiste altra connessione, toglie di mezzo una categoria intera di domande a cui non si vorrebbe dover rispondere il giorno di un ripristino.

### 3. Il primo avvio non è un aggiornamento

Su un database appena creato mancano tutte le migrazioni, ma non c'è niente da proteggere: non esistono contenuti, non esiste ancora la chiave privata dell'istanza. Un archivio lì sarebbe rumore, e un rumore dannoso — insegnerebbe a ignorare la categoria di messaggi che questa decisione esiste per rendere visibile.

Il discrimine è quindi «esiste già uno schema»: nessuna migrazione risulta applicata significa istanza nuova, non aggiornamento.

### 4. Un backup che manca non ferma l'istanza — un backup che fallisce nemmeno

La prima metà era già decisa, il 2026-08-16, e va riportata per intero perché è il cuore della cosa: **se ci sono migrazioni da applicare e nessun backup è configurato, l'istanza parte comunque e lo dichiara.** Rifiutarsi di partire proteggerebbe i dati lasciando un quartiere senza la propria bacheca, cioè un danno certo contro un rischio possibile.

La seconda metà è nuova, e segue dallo stesso ragionamento: **anche un backup configurato che fallisce non ferma l'avvio.** Il calcolo non cambia — il danno resta certo e il rischio resta possibile — e un'istanza che si rifiuta di partire perché la cartella dei backup è piena sarebbe un modo elaborato di trasformare un disco pieno in un'interruzione di servizio.

Cambia però **il tono della dichiarazione**, e questa è la parte che conta. Chi non ha configurato i backup sa di non averli: gli si sta ricordando una cosa che ha scelto. Chi li ha configurati **crede di essere protetto**, e non lo è. È la stessa asimmetria di [ADR 0007](0007-cifratura-a-riposo-e-furto-fisico.md), dove una cifratura dichiarata e non rilevata vale un avviso in rosso mentre una cifratura assente e non dichiarata vale una constatazione: una protezione creduta e non presente è peggio di una protezione assente e nota.

### 5. La dichiarazione è persistente, perché il fatto che descrive lo è

«Lo dichiara» non è una riga nei log. I log li legge chi va a cercarli, e un avviso stampato all'avvio sparisce al riavvio successivo.

L'istanza **registra ogni aggiornamento dello schema nel proprio database** — da quale versione a quale, quando, e se un backup lo ha preceduto — e lo mostra nella diagnostica dell'amministratore, accanto allo stato della cifratura a riposo. Con i log, non al posto loro.

Nei log la cosa viene detta due volte quando non c'è backup: `schema_migration_without_backup` **prima** di migrare e `schema_migrated_without_backup` dopo. Non è ridondanza: la riga registrata nel database esiste solo se l'avvio arriva fino in fondo, e una migrazione che facesse cadere il processo non lascerebbe altrimenti alcuna traccia del fatto che un aggiornamento senza protezione è stato tentato.

La persistenza non è comodità: è correttezza. Se un aggiornamento è stato applicato senza punto di ritorno, quella cosa resta vera anche dopo il riavvio, anche la settimana dopo, e resta vera **anche se nel frattempo i backup hanno ricominciato a girare** — perché un archivio successivo alla migrazione non riporta indietro uno schema che va solo avanti. Un avviso che scade da solo racconterebbe che il problema si è risolto, e non si è risolto.

### 6. Gli archivi di aggiornamento sono una famiglia a parte

Un backup che precede una migrazione si chiama `estia-aggiornamento-<data>.tar.age`, contro `estia-<data>.tar.age` dei backup periodici, e le due famiglie **si ruotano separatamente**, ciascuna con il proprio `ESTIA_BACKUP_KEEP`.

Senza questa separazione l'archivio più prezioso che l'istanza produca sarebbe anche il più esposto: con `ESTIA_BACKUP_KEEP=1`, il backup della notte successiva cancellerebbe l'unico punto di ritorno dell'aggiornamento. E l'alternativa opposta — tenerli tutti per sempre — riempirebbe un disco senza che nessuno l'abbia deciso.

Gli aggiornamenti sono pochi: qualche archivio in più su un NAS è un prezzo trascurabile per l'unica copia che vale davvero la pena avere.

## Che cosa questa decisione non fa

**Non rende reversibile una migrazione.** Il ripristino resta un'operazione manuale, con la procedura di [`INSTALLAZIONE.md`](../INSTALLAZIONE.md) §13, e produce l'istanza com'era **prima**: quello che è stato scritto dopo l'aggiornamento non c'è più. È il significato di «il rollback è il ripristino da backup», e va detto invece che addolcito.

**Non sostituisce il backup manuale prima di un aggiornamento.** Lo rende una cintura in più, non l'unica: chi segue la procedura ha due archivi, chi la dimentica ne ha uno.

**Non protegge da una migrazione che riesce e sbaglia.** Una migrazione applicata in transazione o passa o non passa; una che passa e produce dati sbagliati è un difetto del codice, e l'unica cosa che questa decisione garantisce è che esista un punto a cui tornare.

## Conseguenze

**Positive.** Il punto di ritorno di un aggiornamento è di pochi secondi prima e non della notte precedente. La protezione non dipende più dal fatto che qualcuno ricordi una riga di documentazione. E l'assenza di quel punto di ritorno smette di essere invisibile: è scritta dove chi amministra guarda.

**Negative.** Un avvio con migrazioni da applicare diventa più lento del tempo necessario a cifrare l'intero archivio, media compresi — su un'istanza con molte fotografie, su un NAS lento, è tempo reale in cui la bacheca non risponde. È il prezzo, ed è pagato una volta per aggiornamento. La memoria necessaria è quella che [ADR 0013](0013-backup-cifrati-in-formato-age.md) dichiara già: `age-encryption` 0.3.0 cifra un buffer intero.

**Da tenere presente.** Registrare gli aggiornamenti nel database richiede una tabella, quindi una migrazione — che è essa stessa il primo aggiornamento a essere protetto da questo meccanismo. La ricorsione è voluta e si esercita da sola: la prima istanza esistente che riceve questo codice si fa un backup prima di crearsi la tabella in cui annoterà di averlo fatto.

## Quando riesaminare

- Se un'istanza reale mostrasse che il backup pre-aggiornamento allunga l'avvio oltre quanto un quartiere tollera, la risposta è misurarlo e poi decidere — non toglierlo in silenzio.
- Se arrivasse un percorso di aggiornamento che sostituisce il container mentre il vecchio è ancora vivo, l'ordine qui descritto va rifatto: presuppone che un solo processo apra quella directory dei dati.
- Se le migrazioni smettessero di essere solo in avanti, cadrebbe la premessa di §8 e questa decisione andrebbe riaperta insieme a quella.
