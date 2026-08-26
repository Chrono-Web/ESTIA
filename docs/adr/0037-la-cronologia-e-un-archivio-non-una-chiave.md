# ADR 0037 — La cronologia è un archivio, non una chiave

- Stato: **Accepted** — decisa dal proprietario il 2026-08-26
- Data: 2026-08-26
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)
- Modifica: [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) §2, che va letto insieme a questo
- Prepara: l'adozione di MLS e i gruppi (Milestone successive #5)

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

3. **La chiave d'archivio è della conversazione, non della persona.** Questa è la conseguenza diretta della scelta al punto 4: se chi entra deve poter leggere il pregresso, la chiave non può derivare dalla passphrase di un singolo, o solo quel singolo potrebbe rileggere. La chiave d'archivio è quindi **per conversazione**, a vita lunga, e **viaggia dentro il gruppo MLS** — è il gruppo che la distribuisce ai suoi membri, non l'istanza.

4. **Chi entra in un gruppo riceve il pregresso.** Ricevendo la chiave d'archivio, un nuovo membro può leggere quello che si è detto prima del suo ingresso. È una scelta di prodotto, non un effetto collaterale, e **va detta a chi scrive**: quello che scrivi oggi potrà essere letto da chi entrerà domani.

5. **Il backup con passphrase di [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) resta, e cambia contenuto.** Non custodisce più chiavi di messaggio, che non esistono più. Custodisce l'identità del dispositivo e ciò che serve a rientrare nelle proprie conversazioni e a recuperare le chiavi d'archivio. La frase di ADR 0028 §2 va riscritta di conseguenza quando si implementa.

## Che cosa questa decisione copre, e che cosa no

**Copre: il traffico e il database dell'istanza.** Chi ospita, chi ruba il NAS, chi legge un backup `age` non ha il testo dei messaggi né dall'una né dall'altra parte, e — questa è la novità rispetto a `ESTIA-E2E-v1` — **una chiave compromessa oggi non apre più il passato sul filo**.

**Non copre, e va scritto dove si legge:**

1. **L'archivio è l'anello debole, per costruzione.** Chi ottiene la chiave d'archivio di una conversazione legge tutta quella conversazione, sempre, senza limiti di tempo. La forward secrecy protegge il trasporto; l'archivio è precisamente il posto dove si rinuncia. Questo **non è un peggioramento rispetto a oggi** — è la stessa esposizione che [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) già accetta — ma prima era implicita e ora è un oggetto con un nome.

2. **Chi viene rimosso da un gruppo conserva la chiave d'archivio che aveva.** MLS gli toglie i messaggi nuovi, e questo è crittografico e definitivo. Non gli toglie il pregresso che poteva già leggere: quello che lo ferma è il controllo d'accesso dell'istanza, non la crittografia. **Rimuovere qualcuno non è cancellare quello che ha visto**, e l'interfaccia non deve suggerire il contrario.

3. **Perdere tutti i dispositivi e la passphrase vuol dire perdere la cronologia.** Non c'è una terza copia e non deve esserci: una via di recupero gestita dall'istanza sarebbe una via di lettura per chi la ospita.

4. **Restano aperti i limiti 2, 3 e 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)** che questa decisione non tocca. In particolare **la verifica fuori banda delle chiavi**: MLS la rende possibile con il suo `AuthenticationService`, ma nessuno la implementa da solo. Finché non c'è, un'istanza compromessa può ancora sostituire una chiave.

## Conseguenze sull'interfaccia

Non sono un capitolo successivo. Cambiare la crittografia senza cambiare l'interfaccia rompe le persone invece dei byte, e ognuno di questi punti è una promessa che oggi l'interfaccia fa e domani non potrà più fare.

- **Il cambio di telefono va raccontato prima, non dopo.** Oggi «inserisci la passphrase e torna tutto». Domani: torna tutto **se** l'archivio c'è. Chi non ha mai impostato la passphrase deve saperlo quando ha ancora il telefono vecchio in mano, non quando l'ha perso.
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
- L'istanza conserva più dati: le buste di trasporto **e** l'archivio. Va misurato prima di implementare, e non è un dettaglio contabile: [ADR 0013](0013-backup-cifrati-in-formato-age.md) §2 registra che un backup chiede **circa sei volte la dimensione dei dati** perché l'archivio si cifra tutto in memoria, ed è già «un tetto pratico alla dimensione di un'istanza». Raddoppiare ciò che si conserva spinge dritto contro quel tetto.
- Una conversazione senza archivio impostato diventa illeggibile a un dispositivo nuovo. Il caso «non l'ho mai configurato» esiste e va progettato, non lasciato al caso peggiore.

### Neutre

- Nessuna modifica al codice deriva da questo ADR: fissa la regola, e va attuato insieme all'adozione di MLS.
- `ESTIA-E2E-v1` resta in servizio finché MLS non entra. Questa decisione non lo cambia.

## Che cosa resta da verificare prima di implementare

Questo ADR decide **la regola di prodotto** e indica il meccanismo. Non lo specifica al bit, e non deve: quello che segue va misurato in uno spike, non deciso a tavolino.

1. **Come viaggia la chiave d'archivio dentro il gruppo.** Il candidato è `mlsExporter`, che deriva un segreto applicativo dal segreto di epoch e che [S1](../spike/S1-ts-mls-sotto-la-csp.md) ha già esercitato. Va verificato che sopravviva ai cambi di epoch senza rendere illeggibile l'archivio scritto sotto le epoch precedenti.
2. **Quanto pesa l'archivio**, in disco sull'istanza e nei backup, su una conversazione realistica del pilot.
3. **Che cosa succede a chi non ha mai impostato la passphrase** e cambia telefono: è il caso più probabile in una comunità non tecnica, ed è quello che decide se questo disegno regge sul campo.
4. **Se l'archivio debba essere per conversazione o per membro-nella-conversazione.** Il punto 3 della Decisione sceglie «per conversazione» perché è ciò che rende possibile il punto 4; se lo spike mostrasse che questo rende irrevocabile troppo, la scelta va riaperta insieme al punto 4, non da sola.

## Come si verifica

1. Un test verifica che le chiavi di trasporto **non compaiano** in `key_backups` né in nessun altro deposito lato istanza.
2. Un test verifica che l'archivio sia illeggibile senza la chiave d'archivio, con la stessa scansione di database e backup `age` già usata per M6.
3. Un test verifica che un dispositivo nuovo, con la sola passphrase, **non** possa decifrare il traffico di trasporto precedente — cioè che la forward secrecy sia reale e non solo dichiarata.
4. Un test verifica che un membro rimosso non decifri i messaggi successivi alla rimozione, e che l'istanza **rifiuti** di servirgli l'archivio.

## Quando riesaminare

- Se lo spike del punto 1 mostra che la chiave d'archivio non può attraversare i cambi di epoch in modo sicuro, questa decisione va riaperta prima di scrivere codice.
- Se il pilot mostra che la cronologia recuperabile non è la funzione che si crede — cioè che nessuno cambia telefono, o che nessuno imposta la passphrase — allora l'opzione «forward secrecy piena e niente archivio» torna sul tavolo, ed è la più semplice delle due.
- Se ESTIA esce dal pilot verso persone che non si fidano di chi ospita, il punto 2 della §«Che cosa non copre» — chi esce conserva il pregresso — va rivalutato come limite di prodotto, non come dettaglio.
