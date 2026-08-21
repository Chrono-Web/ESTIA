# ADR 0023 — Come si legge la bacheca di una persona di un'altra istanza

- Stato: **Accepted** — decisa dal proprietario il 2026-08-21
- Data: 2026-08-21 (bozza), **decisa lo stesso giorno**
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0022](0022-il-follow-attraversa-le-istanze.md)
- Attua: il punto 2 dell'elenco delle milestone successive, ed è il contenuto di **M5**

> **Questo documento è nato come bozza dichiarata e non presa**, il mattino del
> 2026-08-21. È stato deciso la sera dello stesso giorno, e in mezzo c'è
> l'unica cosa che in questo progetto sposta una decisione: il campo.

## Perché è stata decisa adesso

Due fatti, nel giro di un giorno.

**Il primo: è successo ciò che questo documento aspettava.** Il §«Quando riesaminare» della bozza diceva «quando due istanze del pilot hanno persone che si seguono a vicenda e la mancanza si sente sul campo, che è la misura che vale più di questo documento». È successo il giorno dopo: due istanze collegate, due persone che si seguono nelle due direzioni, due feed di rete vuoti. E la segnalazione non diceva «manca la bacheca remota»: diceva **«il segui non funziona»**, che è come si presenta una mezza promessa a chi non ha letto gli ADR.

**Il secondo: lo sbarramento dichiarato era già caduto.** La bozza metteva davanti a sé la quarta verifica di [ADR 0018](0018-federazione-fra-istanze-estia.md), il capitolo di sicurezza, e la chiamava «non aggirabile da qui». Quella verifica è chiusa dal 2026-08-20 ed è [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), scritto il giorno **prima** che la bozza nascesse. Non mancava un cancello: mancava una decisione.

## Contesto

Dal 2026-08-21 l'interfaccia ha due superfici distinte: il feed **dell'istanza**, che non esce di casa, e il feed **della rete**, che raggiunge chi segue. Un post scritto nella seconda ha `scope = followers`, e finora veniva letto dai follower **di questa istanza** e da nessun altro.

Chi segue da un'altra istanza non lo leggeva. Non era un difetto dell'implementazione: ADR 0018 stabilisce che **i contenuti si visitano, non si replicano**, e ADR 0021 elenca i sei messaggi che il protocollo conosce — `presentazione`, `collegamento`, `profilo`, `cerca`, `segui`, `smetti`. Nessuno di essi chiede dei post.

## La domanda

**Con quale messaggio un'istanza chiede a un'altra i post di una persona, e che cosa quella risposta permette di dedurre a chi non dovrebbe dedurre niente?**

## Che cosa rendeva la domanda difficile

Non il trasporto: `bacheca` somiglia a `cerca`, e ADR 0021 dà già una richiesta e una risposta per stream. Erano tre proprietà che il messaggio deve avere insieme, e ognuna tira in una direzione diversa.

**1. È il primo messaggio che porta contenuti, non nomi.** Tutti e sei quelli di prima trasportano identificatori corti. `MAX_RESPONSE_BYTES` vale 16 kB, e una pagina di post è un altro ordine di grandezza. Il tetto va rialzato o la risposta va impaginata — e ADR 0021 dice che **il tetto viene prima della lettura**, quindi la scelta va fatta prima, non scoperta dopo.

**2. È il primo messaggio il cui permesso dipende da una persona, non dall'istanza.** Gli altri cinque si rispondono guardando lo stato del collegamento. Qui la domanda è «questa persona di là può leggere questa persona di qua?», e la risposta sta nella lista dei follower — che ADR 0022 mette in casa di chi è seguito proprio perché sia lei a decidere. Ma **chi chiede è un'istanza**: l'handshake prova quale macchina parla, non quale persona.

**3. Le immagini non entravano nel modello.** [ADR 0012](0012-immagini-autenticate-non-indovinabili.md) le fa scaricare autenticate, con la sessione di chi guarda. Un lettore remoto una sessione qui non ce l'ha.

## Le opzioni, e che cosa costano

**A. `bacheca`, impaginata: chi legge va a prendere i post quando apre il feed.** Coerente con «i contenuti si visitano»: cancellare un post lo cancella davvero, perché nessuno ne ha una copia. Costa una richiesta a ogni apertura del feed — il lavoro di un'istanza è proporzionale a quanto i suoi membri seguono, che ADR 0018 accetta esplicitamente — e rende il feed lento quanto l'istanza più lenta, o incompleto quando una è spenta.

**B. La stessa cosa, con una cache a scadenza.** Riduce le richieste. Ma una cache è una copia, e la copia è ciò che ADR 0018 ha tolto cancellando l'indice dei profili: «una riga d'indice è una copia che sopravvive a chi nomina». Un post cancellato resterebbe leggibile fino alla scadenza, e «quando cancelli è cancellato davvero» diventerebbe «quasi».

**C. Consegna: chi scrive spinge il post a chi lo segue.** È ActivityPub. Fa sparire la latenza e funziona con le istanze spente. Ma è replicazione, e riporta il problema che ADR 0018 aveva risolto: la cancellazione diventa una cortesia chiesta a macchine che non controlli.

**D. Non farlo.** La modalità rete resta una superficie locale. È lo stato in cui il pilot ha trovato il prodotto, ed è quello che ha prodotto la segnalazione.

## Decisione 1: A, la visita impaginata

**Adottata A**, per la ragione per cui era già l'inclinazione: è l'unica che tiene insieme le due promesse che questo progetto fa a chi lo usa — **i contenuti stanno a casa di chi li scrive, e cancellare cancella davvero** — e B e C costano esattamente quelle. Il prezzo è dichiarato e non si nasconde: **a macchina spenta, quei post non sono leggibili.**

**Un affinamento rispetto alla bozza, fatto scrivendo la decisione: la richiesta è per istanza, non per persona.** La bozza diceva «una richiesta per persona»; se una persona ne segue cinque sulla stessa istanza, sono cinque connessioni per la stessa macchina. Il messaggio porta quindi **l'elenco dei nomi** che si vogliono leggere su quell'istanza:

```
{ tipo: "bacheca", nome, da, chi: [{ nome, prova }, …], prima?, quanti? }
```

Non è un'enumerazione e non ne diventa una: si chiede **per nome**, esattamente come `profilo`, e un nome che non si conosce non si può chiedere. Il tetto sui nomi per richiesta è **16**, che sta comodamente dentro `MAX_REQUEST_BYTES` e non è una soglia di prodotto: chi ne segue di più fa due richieste.

Ne discende la proprietà che conta per una macchina domestica: **il lavoro è proporzionale al numero di istanze che si raggiungono, non al numero di persone che si seguono.**

## Decisione 2: il segreto per coppia, che prova un permesso e non un'identità

È la risposta al punto 2, ed è il pezzo che la bozza lasciava aperto.

**Come nasce.** Quando un follow diventa `accettato` — subito, per un profilo aperto; al momento del sì, per uno chiuso — l'istanza **di chi è seguito** conia un segreto casuale (32 byte) per quella coppia, e lo restituisce nella risposta a `segui`. Chi ha chiesto lo conserva sulla propria riga `following`.

**Come si conserva.** Hashed (SHA-256) da chi **verifica**, in chiaro da chi lo **presenta**: è la stessa regola dei token di sessione di M1.2 — leggere il database di chi verifica non deve produrre una credenziale utilizzabile — e la stessa asimmetria, perché una credenziale che va presentata da qualche parte deve stare in chiaro.

**Come si ritrova, se si perde.** Si richiede `segui`: la riga esiste già, non se ne apre una seconda, e la risposta riporta lo stato **e** il segreto. È lo stesso gesto che dal 2026-08-21 permette di scoprire di essere stati accettati, e ora ha una seconda ragione di esistere. Un ripristino da un backup vecchio non lascia quindi nessuno fuori.

**Come si revoca.** Togliendo il follower: la riga sparisce e il segreto con lei, e la lettura successiva fallisce. Nessuna revoca da spedire, nessun destinatario libero di ignorarla — è la proprietà di ADR 0022, che qui diventa vera anche per la lettura invece che soltanto per l'elenco.

**Che cosa prova, detto con precisione.** Prova che **quel follow è stato accettato**, non che quella persona sia reale. ADR 0022 §4 resta in piedi per intero: un'istanza può inventarsi un membro e chiedere di seguire con un nome falso. Quello che cambia è che un nome falso **non compra niente finché qualcuno di qua non gli dice di sì** — e se gli dice di sì, ha deciso qualcuno di qua. Prima, il nome bastava a essere dichiarato; adesso serve una decisione presa in casa di chi pubblica.

**E che cosa non prova.** L'istanza che custodisce il segreto può usarlo per chiunque, perché è lei a custodirlo: è inerente al modello, ed è la stessa cosa che ADR 0022 §4 dice già. Sparirà solo con una chiave personale, quando le persone ne avranno una — client nativo, o la chat di [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md).

**Perché non contraddice ADR 0021 §«chi chiede non è nel messaggio».** Quella regola vieta che il messaggio **dichiari un'identità**, perché il chiamante scriverebbe quello che gli pare — e infatti l'istanza continua a essere provata dalla connessione e da nient'altro. Il segreto non dichiara niente: **si usa, non si asserisce.** È una capacità, e una capacità o funziona o non funziona; non c'è modo di scriverne una falsa.

## Decisione 3: il tetto viene prima, e i conti sono questi

`MAX_RESPONSE_BYTES` resta **16 kB per i messaggi di controllo**. `bacheca` ha il proprio tetto, ed è derivato invece che scelto:

- una pagina è di **10 post** al massimo (`quanti`, con 10 anche come default);
- un post ha un corpo di al massimo `POST_MAX_LENGTH` = 5000 caratteri, cioè fino a 20 kB in UTF-8 nel caso peggiore, più fino a quattro descrizioni di immagine da 300 caratteri e i campi brevi;
- **10 × 24 kB ≈ 240 kB**, da cui `MAX_BACHECA_BYTES` = **256 kB**.

**L'impaginazione è a finestra di tempo, non a cursore opaco**: `prima` è un istante, e ogni sorgente risponde con i post più recenti **precedenti** a quello. È la scelta che rende il feed componibile senza tenere uno stato per sorgente: un cursore composito crescerebbe con il numero di istanze e si romperebbe ogni volta che una entra o esce dall'elenco. Si paga in lavoro sprecato — si chiedono più post di quelli che si mostrano — e per la scala di questo prodotto è il prezzo giusto.

**Il budget delle richieste di contenuto è separato e più stretto.** Oggi «collegata» e «in contatto» hanno lo stesso tetto, 120 richieste al minuto: con `bacheca` quel tetto varrebbe **30 MB al minuto in uscita** da un NAS di casa, il che lo renderebbe un modo di occupare la linea di qualcun altro. Le richieste che portano contenuti hanno quindi un budget proprio, **30 al minuto**, contato per chiave come già fa `RemoteBudgets`.

## Decisione 4: le immagini viaggiano a parte, in proxy e senza copia

Un secondo messaggio, `immagine`, che chiede **un'immagine per volta** con la stessa prova della coppia. Le tre ragioni per cui non stanno nella risposta di `bacheca`: farebbero saltare un tetto appena stabilito, costringerebbero a scaricare ciò che nessuno guarderà, e un fallimento su una foto porterebbe giù una pagina di testo.

L'istanza di chi legge fa da **proxy e non da archivio**: prende i byte quando il browser di un suo membro li chiede, li serve sotto la sessione di quel membro come vuole [ADR 0012](0012-immagini-autenticate-non-indovinabili.md), e **non li scrive su disco**. Un proxy non è una copia: quando l'altra macchina si spegne o il post viene cancellato, la foto smette di esistere qui, che è esattamente la promessa.

Il tetto lo mette **chi legge**, e con il proprio limite (`media.maxBytes`, 5 MB di default): un'immagine più grande del proprio limite non si scarica e lo si dice, invece di troncarla o di fidarsi del limite di un'altra istanza.

## Decisione 5: che cosa deve esserci nel feed della rete

Richiesto dal proprietario nel momento in cui ha deciso A, e messo qui perché è un requisito e non un dettaglio d'interfaccia.

**Nella lente «rete» si vedono i post di tutte le persone che si seguono e che stanno fuori dall'istanza, insieme a quelle di casa.** Non è una novità e non è un'aggiunta: è ADR 0018 §«Il feed di una persona non è un flusso globale» — «composto da due sorgenti: chi la persona segue, e la sua istanza» — che finora era vero per metà, perché la metà remota non aveva un modo di arrivare.

Ne discendono quattro vincoli che nessuna ottimizzazione può togliere:

1. **Nessuna sorgente è privilegiata.** I post di casa e quelli di fuori si ordinano insieme per data, in un elenco solo. Due sezioni separate sarebbero una gerarchia che nessuno ha deciso.
2. **La metà locale continua a essere autorizzata dalla lista `followers`**, come dal 2026-08-21. La metà remota **si prende da `following`**, ed è la lista giusta per il verso giusto: `followers` autorizza e sta in casa di chi pubblica, `following` dice dove andare e sta in casa di chi legge. Chi autorizza resta l'altra istanza, con la propria lista e con la prova.
3. **Un'istanza spenta rende il feed incompleto e non rotto**, e lo dice: quella parte manca, e si sa di chi è. Una ricerca già si comporta così — «una risposta parziale è la risposta giusta» — e un feed non può comportarsi peggio.
4. **La lente resta una separazione netta**: quello che si vede in «rete» non compare in «istanza» e viceversa. I post non si sovrappongono, che è ADR 0018 §«un pulsante per feed».

## Conseguenze

**Positive.** La promessa di ADR 0018 diventa intera: si segue qualcuno in un'altra casa e lo si legge, senza dominio, senza certificato e senza che nessuno abbia una copia. Cancellazione e revoca restano vere per costruzione invece che per protocollo. E il follow smette di essere una fondazione che non produce niente di visibile.

**Negative.** Il feed dipende dalla disponibilità delle altre macchine, e questo è nuovo: fino a oggi niente nel prodotto si rompeva perché una casa era spenta. Il protocollo cresce di due messaggi e di un segreto da conservare, cioè di superficie da difendere. E la lettura costa lavoro a chi è letto, che è il punto su cui la verifica 2 di ADR 0018 — rinviata, con un confine scritto — smette di essere teorica: adesso ha un oggetto da misurare.

**Neutre.** Presenza, ricerca, collegamenti fra istanze e i sei messaggi esistenti non cambiano. `segui` guadagna un campo nella risposta, che una versione più vecchia ignora senza rompersi (ADR 0021 §6).

## Quando riesaminare

- **Se la verifica 2 di ADR 0018 dice che il modello a visita non regge**: si riapre il punto 2 di quell'ADR — cioè si torna a una forma di copia — e allora vanno riscritte anche le promesse su cancellazione e revoca. Non si tiene la promessa e si cambia il meccanismo di nascosto.
- **Se il feed diventa troppo lento perché troppe istanze rispondono adagio**: la cosa da cambiare è quando si chiede, non se si conserva. Una cache resta ciò che ADR 0018 ha escluso.
- **Quando le persone avranno una chiave propria**: il segreto per coppia diventa una firma, e la decisione 2 si semplifica invece di complicarsi.
- **Se un'istanza collegata usasse `bacheca` per misurare chi segue chi**: il budget separato è la prima difesa, e la seconda è che «non ho niente per te» e «non hai il permesso» sono la stessa risposta. Se non bastasse, va rivista la forma della risposta, non il permesso.
