# Segnalare un problema di sicurezza

_English speakers: reports in English are equally welcome — see [How to report](#come-segnalare)._

ESTIA tiene le fotografie e le conversazioni di persone reali su un NAS in casa di qualcuno. Una vulnerabilità qui non è un bug: è qualcosa che riguarda dei vicini di casa che si fidano di chi ospita l'istanza.

## Come segnalare

**Usa la segnalazione privata di GitHub**: scheda _Security_ del repository → _Report a vulnerability_. Il canale è cifrato e visibile solo al manutentore.

**Non aprire una issue pubblica** per una vulnerabilità: una issue è indicizzata da subito, e le istanze là fuori sono su NAS domestici che nessuno aggiorna nel giro di un'ora.

Nella segnalazione aiuta molto avere: quale versione o commit, come riprodurre, che cosa ottieni che non dovresti, e — se te la senti — che cosa proponi.

## Che cosa aspettarti, detto con onestà

Questo progetto ha **un solo manutentore**, è **pre-1.0** e **non ha ricevuto un audit di sicurezza indipendente**. Non prometto tempi di risposta che non posso garantire: prometto che leggo, che rispondo, e che se hai ragione lo dico e lo scrivo.

Sulla divulgazione: chiedo un tempo ragionevole per correggere prima che la cosa diventi pubblica, e mi impegno a darti credito nella correzione se lo desideri. Non ci sono premi in denaro.

Le versioni supportate sono l'ultimo `main` e l'ultima immagine pubblicata. Non esistono ancora rilasci con versione, quindi non esistono rami di manutenzione.

## Che cosa è una vulnerabilità, qui

Vale la pena essere precisi, perché questo progetto **dichiara per iscritto ciò che non protegge** in [`docs/SECURITY_BASELINE.md`](docs/SECURITY_BASELINE.md). Una cosa già dichiarata non è una falla: è un limite noto, e discuterlo è benvenuto in una issue normale.

**Sono vulnerabilità, e mi interessano molto:**

- ottenere accesso senza una sessione valida, o mantenerlo dopo una revoca;
- fare cose riservate a un ruolo superiore — un membro che modera, un moderatore che amministra;
- leggere contenuti dell'istanza senza esserne membro, comprese le immagini: **conoscere l'identificatore di un media non deve bastare**;
- far scrivere o leggere all'istanza file fuori dalle proprie directory, dal percorso dei media o da un archivio di ripristino;
- far cadere o esaurire un'istanza con un solo contenuto: un'immagine costruita apposta, un archivio malformato, una richiesta che aggira i limiti;
- aggirare le quote, i limiti di dimensione o il rate limiting;
- far finire nei log una credenziale — password, token, codice di invito o di recupero, chiave privata;
- rendere leggibile un backup a chi non ha la chiave privata, o far sì che un archivio manomesso venga ripristinato in silenzio;
- **far dichiarare all'istanza una protezione che non ha** — per esempio far risultare «cifratura attiva» dove non lo è. Su questo progetto è una vulnerabilità a tutti gli effetti, non un difetto estetico.

**Non sono vulnerabilità, perché sono scelte dichiarate:**

- chi amministra il NAS vede tutto ciò che l'istanza conserva ([`PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) §6);
- il feed locale è leggibile dal server che lo serve: è la bacheca di chi condivide l'istanza, non una chat privata;
- i dati sul disco sono in chiaro se l'amministratore non ha cifrato il volume ([ADR 0007](docs/adr/0007-cifratura-a-riposo-e-furto-fisico.md)) — l'istanza lo rileva e lo dichiara;
- i messaggi privati non esistono ancora, e non esisteranno finché non saranno end-to-end ([ADR 0006](docs/adr/0006-messaggi-privati-end-to-end-o-niente.md));
- l'istanza è raggiungibile in HTTP sulla rete locale: è il modello del primo contatto ([ADR 0003](docs/adr/0003-primo-contatto-in-rete-locale.md)).

Se pensi che una di queste scelte sia sbagliata, è una discussione che voglio avere — ma è una issue, non una segnalazione riservata.

## Una cosa che vale sempre

**Non provare niente su istanze altrui.** Le istanze ESTIA sono NAS in case di persone, non bersagli di prova. Installane una tua: la procedura è in [`docs/INSTALLAZIONE.md`](docs/INSTALLAZIONE.md) e non richiede nulla che tu non abbia già.
