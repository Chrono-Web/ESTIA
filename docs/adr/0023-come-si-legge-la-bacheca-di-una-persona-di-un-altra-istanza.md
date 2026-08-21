# ADR 0023 — Come si legge la bacheca di una persona di un'altra istanza

- Stato: **Proposed** — bozza, da decidere
- Data: 2026-08-21
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0022](0022-il-follow-attraversa-le-istanze.md)

> **Questa è una decisione preparata, non presa.** `AGENTS.md` chiede che una
> scelta che tocca rete e confini di fiducia sia scritta e fermata lì, e
> [ADR 0018](0018-federazione-fra-istanze-estia.md) mette il **capitolo di
> sicurezza** — la sua quarta verifica — prima di allargare il protocollo. Il
> documento esiste perché la domanda è emersa costruendo, e perché lasciarla
> implicita costerebbe più che scriverla.
>
> **Quella quarta verifica è chiusa dal 2026-08-20**: vedi l'aggiornamento qui
> sotto. Resta preparata e non presa, ma non è più in attesa di un cancello.

## Aggiornamento del 2026-08-21: il campo ha parlato, e lo sbarramento non c'è più

Due cose sono cambiate nel giro di un giorno, e nessuna delle due era prevista qui dentro.

**La prima: è successo ciò che questo documento aspettava per essere riletto.** Il §«Quando riesaminare» qui in fondo dice «quando due istanze del pilot hanno persone che si seguono a vicenda e la mancanza si sente sul campo, che è la misura che vale più di questo documento». È successo: due istanze collegate, due persone che si seguono nelle due direzioni, e due feed di rete vuoti. La segnalazione non diceva «manca la bacheca remota», diceva **«il segui non funziona»** — ed è il dato che conta, perché è come si presenta una mezza promessa a chi non ha letto gli ADR.

**La seconda: il cancello dichiarato è chiuso, e questo documento non se n'era accorto.** Il §«Prima di decidere» mette al primo posto la quarta verifica di [ADR 0018](0018-federazione-fra-istanze-estia.md), il capitolo di sicurezza, e la chiama «lo sbarramento dichiarato, non aggirabile da qui». Quella verifica **è chiusa dal 2026-08-20**, ed è [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), scritto il giorno prima che questo documento nascesse. Quindi qui non manca più un cancello: manca una decisione, ed è il punto 2 — **come si prova che chi chiede è chi dice di essere**, dato che l'handshake prova l'istanza e non la persona.

Lo stato resta **Proposed** e la decisione resta di chi la deve prendere. Ciò che cambia è che non c'è più niente davanti, e che il costo di non decidere ha smesso di essere teorico: la voce «Conseguenze se non si decide» diceva «si può restarci a tempo indeterminato senza che nessuno venga ingannato», e va letta con quello che si è visto — nessuno è stato ingannato, e tutti e due hanno creduto che il prodotto fosse rotto.

Il piano che ne discende è **M5** in [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md), che tiene questa decisione come prima voce e non comincia niente prima di lei.

## Contesto

Dal 2026-08-21 l'interfaccia ha due superfici distinte: il feed **dell'istanza**,
che non esce di casa, e il feed **della rete**, che raggiunge chi segue. Un post
scritto nella seconda ha `scope = followers`, e viene letto dai follower **di
questa istanza**.

Chi segue da un'altra istanza non lo legge. Non è un difetto
dell'implementazione: ADR 0018 stabilisce che **i contenuti si visitano, non si
replicano**, e ADR 0021 elenca i sei messaggi che il protocollo conosce —
`presentazione`, `collegamento`, `profilo`, `cerca`, `segui`, `smetti`. Nessuno
di essi chiede dei post.

Oggi l'interfaccia lo dichiara: quando qualcuno ha follower remoti e scrive
nella lente della rete, sotto il composer compare una riga che dice che quei
post non arrivano ancora e perché. È l'unica cosa onesta da fare — un feed che
li omettesse in silenzio sarebbe indistinguibile da uno rotto — ma è metà di una
promessa, e la metà mancante è questa.

## La domanda

**Con quale messaggio un'istanza chiede a un'altra i post di una persona, e che
cosa quella risposta permette di dedurre a chi non dovrebbe dedurre niente?**

## Che cosa rende la domanda difficile

Non è il trasporto: `bacheca` somiglia a `cerca`, e ADR 0021 dà già una richiesta
e una risposta per stream. Sono tre proprietà che il messaggio deve avere
insieme, e ognuna tira in una direzione diversa.

**1. È il primo messaggio che porta contenuti, non nomi.** Tutti e sei quelli di
oggi trasportano identificatori corti: un nome, un termine di ricerca, una
chiave. `MAX_RESPONSE_BYTES` vale 16 kB, e una pagina di post con le immagini è
un altro ordine di grandezza. Il tetto va rialzato o la risposta va impaginata —
e ADR 0021 dice che **il tetto viene prima della lettura**, quindi la scelta va
fatta prima, non scoperta dopo.

**2. È il primo messaggio il cui permesso dipende da una persona, non
dall'istanza.** Gli altri cinque si rispondono guardando lo stato del
collegamento. Qui la domanda è «questa persona di là può leggere questa persona
di qua?», e la risposta sta nella lista dei follower — che ADR 0022 mette in casa
di chi è seguito proprio perché sia lei a decidere. Ma **chi chiede è
un'istanza**: l'handshake prova quale macchina parla, non quale persona. Il
nome del lettore lo dichiarerebbe l'istanza che chiama, come già fa `da` in
`segui`, e un'istanza collegata potrebbe dichiararne uno qualunque.

**3. Le immagini non entrano nel modello.** [ADR 0012](0012-immagini-autenticate-non-indovinabili.md)
le fa scaricare autenticate, con la sessione di chi guarda, da URL che non
valgono da soli. Un lettore remoto non ha una sessione su questa istanza. O
viaggiano nella risposta — e allora il tetto salta davvero — o serve un secondo
messaggio, o i post remoti si vedono senza fotografie, che è una scelta di
prodotto e non un dettaglio tecnico.

## Le opzioni, e che cosa costano

**A. `bacheca`, una richiesta per persona, impaginata.**
`{ tipo: "bacheca", nome, chi, da, cursore? }` → una pagina di post. Chi legge va
a prenderli quando apre il feed. Semplice, e coerente con «i contenuti si
visitano»: cancellare un post lo cancella davvero, perché nessuno ne ha una
copia. Costa una richiesta per persona seguita a ogni apertura del feed — il
lavoro di un'istanza è proporzionale a quanto i suoi membri seguono, che ADR 0018
accetta esplicitamente — e rende il feed lento quanto l'istanza più lenta, o
incompleto quando una è spenta.

**B. La stessa cosa, con una cache a scadenza.** Riduce le richieste. Ma una
cache è una copia, e la copia è precisamente ciò che ADR 0018 ha tolto quando ha
cancellato l'indice dei profili: «una riga d'indice è una copia che sopravvive a
chi nomina». Un post cancellato resterebbe leggibile fino alla scadenza, e la
promessa «quando cancelli è cancellato davvero» diventerebbe «quasi».

**C. Consegna: chi scrive spinge il post a chi lo segue.** È il modello di
ActivityPub. Fa sparire la latenza e funziona con le istanze spente. Ma è
replicazione, cioè il contrario della decisione di ADR 0018, e riporta il
problema che quella decisione ha risolto: la cancellazione diventa una richiesta
di cortesia rivolta a macchine che non controlli.

**D. Non farlo.** La modalità rete resta una superficie **locale**: si pubblica
per i propri follower, e chi segue da fuori vede il profilo e non i post. Meno di
quanto ADR 0018 promette, ma è già oggi lo stato reale, e ha il pregio di non
aggiungere superficie a un protocollo che ADR 0018 vuole tenere chiuso finché non
esiste il capitolo di sicurezza.

**L'inclinazione, dichiarata e non decisa: A.** È l'unica che mantiene insieme le
due promesse che questo progetto fa a chi lo usa — i contenuti stanno a casa
tua, e cancellare cancella — e le altre due costano proprio quelle. Ma A senza
una risposta al punto 2 apre una porta che ADR 0020 spende la propria lunghezza a
tenere chiusa, e quella risposta va scritta prima.

## Prima di decidere

1. ~~**Il capitolo di sicurezza di ADR 0018** (la sua quarta verifica). È lo
   sbarramento dichiarato, e non è aggirabile da qui.~~ **Chiuso il 2026-08-20**
   con [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md),
   cioè il giorno prima che questo documento fosse scritto. Restano i tre punti
   qui sotto, e il 2 è quello che decide la forma del messaggio.
2. **Come si prova che chi chiede è chi dice di essere**, dato che l'handshake
   prova l'istanza e non la persona. Almeno tre strade da confrontare: fidarsi
   dell'istanza che dichiara il nome (com'è oggi per `segui`), un segreto per
   coppia consegnato quando il follow viene accettato, o una firma della persona
   con una chiave sua — che è un modello di identità nuovo, e va molto oltre
   questo ADR.
3. **Che cosa può dedurre chi chiede ripetutamente.** «Non trovato» e «non hai il
   permesso» devono restare la stessa risposta, come già per i profili, e va
   verificato che il ritmo delle richieste non diventi un modo di dedurre chi
   segue chi.
4. **Le immagini**: nella risposta, in un secondo messaggio, oppure assenti — e
   il costo in `MAX_RESPONSE_BYTES` di ciascuna scelta, misurato.

## Conseguenze se non si decide

Nessuna, se non che la modalità rete resta metà di una promessa, dichiarata come
tale nell'interfaccia. È uno stato onesto e sostenibile: si può restarci a tempo
indeterminato senza che niente si rompa e senza che nessuno venga ingannato.

**Corretto il 2026-08-21, dopo averlo visto succedere.** Sostenibile lo era
finché nessuno si seguiva da un'istanza all'altra; il primo giorno in cui è
successo, la metà mancante si è letta come un guasto. E il paragrafo qui sopra
sbagliava anche il soggetto: la dichiarazione nell'interfaccia c'era **solo per
chi scrive** — la riga sotto il composer — e non per chi legge, che è la persona
che apre un feed vuoto e non ha nessun motivo di sospettare che sia pieno di
niente per una ragione decisa. Quella metà è stata aggiunta lo stesso giorno.
Resta vero che nessuno viene ingannato; smette di essere vero che non costa
nulla.

## Quando riesaminare

Quando la quarta verifica di ADR 0018 è chiusa, oppure quando due istanze del
pilot hanno persone che si seguono a vicenda e la mancanza si sente sul campo —
che è la misura che vale più di questo documento.
