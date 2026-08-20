# ADR 0019 — L'istanza non si lascia configurare su dati che spariranno

- Stato: **Accepted**
- Data: 2026-08-20
- Proprietario: progetto ESTIA
- Nasce da: la stessa configurazione persa due volte, il 2026-08-17 e il 2026-08-20
- Rivede: la conclusione del commit `15b1308`, che dichiarava il problema chiuso

## Contesto

Il 2026-08-17 un'istanza reale, installata dal pannello di un NAS, si è azzerata dopo un aggiornamento: `state: unconfigured`, chiave pubblica nuova, account e contenuti spariti. La causa era che senza un volume su `/data` i dati vivono nel layer scrivibile del container, che viene buttato ogni volta che il container si ricrea.

Sono seguite due correzioni nello stesso giorno.

La prima aggiunse un **rilevamento**: l'istanza legge la propria tabella dei mount e dichiara dove stanno i suoi dati. Nello stesso commit `VOLUME /data` era stato **provato e scartato**, misurando con `docker run` + `rm` + `run`: a ogni ricreazione Docker crea un volume anonimo nuovo, e i dati si perdono lo stesso.

La seconda rimise `VOLUME /data`, con una misura diversa — stessa Compose, `up -d --force-recreate` — in cui la riga funziona. Quella misura era corretta. La frase che le fu scritta accanto non lo era:

> It only fails to help under a bare `docker run` that removes and recreates the container by hand, **which no update path does**.

## Che cosa era sbagliato

Un volume anonimo sopravvive **solo se chi ricrea il container si porta dietro i mount di quello vecchio**. Compose lo fa. Non lo fanno:

- il pulsante di aggiornamento di Container Manager e Container Station, su un container creato a mano invece che come Progetto;
- il «recreate» di Portainer;
- Watchtower;
- `docker rm` seguito da `docker run`, che è il percorso che la prima misura aveva provato ed era stato archiviato come «l'aggiornamento di nessuno».

Era l'aggiornamento di chi ha installato dal pannello a mano — cioè esattamente la persona da cui era arrivata la segnalazione del 2026-08-17.

Il 2026-08-20 la stessa istanza aveva ancora un volume anonimo (`27dcbea8…`) e si era azzerata a ogni aggiornamento da allora, con i dati vecchi rimasti in volumi orfani sul disco.

Due errori distinti, e il secondo pesa più del primo:

1. **una generalizzazione da una misura sola.** Ne erano state fatte due, con esiti opposti; è stata tenuta quella comoda e scartata quella scomoda, invece di riconoscere che rispondevano a domande diverse.
2. **la generalizzazione è finita nella guida come una promessa.** [`INSTALLAZIONE.md`](../INSTALLAZIONE.md) diceva a chi installa dal pannello che gli aggiornamenti non gli avrebbero fatto rifare niente **anche dimenticando** di mappare la cartella. Chi ha seguito la guida ha fatto la cosa giusta e ha perso i dati lo stesso.

## Decisione

**Un'istanza si rifiuta di essere configurata quando i suoi dati non sopravvivranno a un aggiornamento.** La schermata di configurazione non mostra il modulo: mostra che cosa c'è che non va e la riga da aggiungere.

Vale per due casi, ed entrambi finiscono con la stessa perdita:

- `ephemeral` — i dati stanno nel layer scrivibile del container;
- `anonymous` — i dati stanno su un volume che nessuno ha chiesto, e che solo Compose si porta dietro.

Un volume anonimo smette quindi di essere classificato `persistent`. Non lo è: lo è soltanto lungo un percorso di aggiornamento su quattro.

**Il rifiuto si scavalca con `ESTIA_ALLOW_EPHEMERAL_DATA=true`**, e non dal pannello. Serve a guardare ESTIA dieci minuti con `docker run` e buttarla via. Non è raggiungibile da un'interfaccia perché non è una preferenza: è la dichiarazione che questi dati sono sacrificabili, e va scritta dove si crea il container.

## Perché rifiutare, quando ADR 0014 dice di non rifiutare

[ADR 0014](0014-backup-prima-delle-migrazioni.md) stabilisce che un'istanza **non si rifiuta mai di avviarsi**, nemmeno quando deve migrare senza un backup: negarsi lascerebbe un quartiere senza la sua bacheca, cioè un danno certo contro un rischio possibile.

Qui il calcolo è rovesciato, ed è l'unico posto in cui lo è:

- **Non c'è ancora niente da lasciare senza.** Un'istanza `unconfigured` non ha membri, contenuti né fotografie. Il costo del rifiuto è una configurazione da rifare fra cinque minuti, e quella configurazione **non è ancora stata fatta**.
- **Il costo dell'accettare è tutto ciò che verrà messo dentro dopo**, chiave privata compresa, che [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §3 dichiara non sostituibile.
- **L'istanza continua ad avviarsi.** Non si rifiuta di partire: si rifiuta di ricevere dei dati. Chi arriva vede una pagina che spiega, non un container che riparte in loop.

Un'istanza già configurata non viene toccata: il rifiuto vive solo nel momento in cui non c'è niente da perdere.

## Perché non è bastato l'avviso

Dal 2026-08-17 la schermata di configurazione mostrava già un avviso rosso per il caso `ephemeral`. Non ha impedito la seconda perdita, per due ragioni che vale la pena tenere:

- **per il caso anonimo non diceva nulla di allarmante**, perché il codice lo considerava persistente: diceva «sopravvivono agli aggiornamenti», che era falso lungo il percorso di chi lo stava leggendo;
- **un avviso sopra un modulo compilabile è una nota a piè di pagina.** Chi installa ha appena letto una guida che gli dice che va bene così. Fra un avviso e una guida, ha creduto alla guida, e ha avuto ragione a farlo: la guida è la promessa del progetto.

Da qui la forma del rimedio: non un avviso più grosso, ma l'assenza del modulo.

## Conseguenze

- Chi installa seguendo la guida — Compose, o Progetto nel pannello — **non incontra mai questa schermata**: il volume ha un nome nel file, e non gli viene chiesto niente.
- Chi crea il container a mano senza mappare niente la incontra **prima** di configurare, e le costa cinque minuti.
- Chi prova ESTIA al volo mette una variabile d'ambiente.
- La guida non promette più che si possa saltare la mappatura. La riga dei volumi passa da «conviene» a obbligatoria, con accanto come si recuperano i dati da un volume orfano.

## Che cosa resta da provare

Il rifiuto è provato in test; **il percorso che ha causato entrambe le perdite no**. Va misurato un aggiornamento vero dal pannello di un NAS su un container creato a mano — è la misura che nel primo commit era stata fatta e nel secondo scartata, e che nessuna delle due volte è stata rifatta dopo la correzione.
