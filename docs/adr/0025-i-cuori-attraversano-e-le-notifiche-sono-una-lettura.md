# ADR 0025 — I cuori attraversano, e le notifiche sono una lettura

- Stato: **Accepted** — decisa dal proprietario il 2026-08-21
- Data: 2026-08-21
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0022](0022-il-follow-attraversa-le-istanze.md), [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md)
- Attua: la superficie «notifiche», che esisteva come destinazione e non come funzione

## Contesto

Dal 2026-08-21 i post attraversano le istanze. La riga con cui M5 lo dichiara ne
dichiara anche il confine: «testo e fotografie attraversano; **le reazioni no**».
Un post remoto, nell'interfaccia, non ha cuore e non ha risposta, e il commento
nel codice che lo disegna dice perché: «un pulsante che non fa niente è peggio
di un pulsante che manca».

Nel frattempo `/notifiche` è una destinazione della barra con dentro una pagina
che dichiara il vuoto — «qui arriveranno gli avvisi che riguardano te» — ed è
lì da quando la barra esiste.

Le due cose si sono incontrate sul pilot. Chi usa il prodotto ha chiesto le
notifiche, e la richiesta non era «una pagina in più»: era **che funzionassero
anche fra le case**. Che è la stessa richiesta di M5 — «il segui non funziona» —
un piano più in su: adesso i post arrivano, e non arriva niente di ciò che
succede ai propri.

## La domanda

Sono due, e la seconda è più profonda della prima.

1. **Con che cosa un cuore attraversa**, dato che ADR 0021 §3 rende scomodo di
   proposito tutto ciò che somiglia a un flusso continuo, e rimanda la notifica
   spinta a una decisione sua?
2. **Dove vive una notifica**, dato che ADR 0018 ha tolto dal prodotto l'indice
   dei profili con la frase che pesa su ogni tabella nuova: «una riga d'indice è
   una copia che sopravvive a chi nomina»?

## Che cosa rendeva difficile la prima

**Sembrava richiedere il push, e non lo richiede.** È l'equivoco da smontare per
primo, perché ha tenuto ferma questa funzione più a lungo del necessario. Un
cuore che attraversa **non è una notifica spinta**: è una richiesta che fa
l'istanza di chi mette il cuore, nel momento in cui una persona preme un
pulsante. Una domanda, una risposta, uno stream — esattamente la forma che
ADR 0021 §3 dà a tutto il resto. L'avviso vuoto di ADR 0018, quello che va
deciso a parte, servirebbe a **svegliare** un'istanza che non sta chiedendo
niente; qui nessuno dorme, e chi manda è chi ha appena premuto.

**Il permesso, invece, sembrava mancare e c'era già.** Un cuore su un post che
si sta leggendo è una scrittura fatta da qualcuno che **sta già leggendo**, e
ciò che gli permette di leggere è la prova per coppia di [ADR 0023] §2. Quella
prova dimostra precisamente il fatto giusto: _questa persona può leggere questa
bacheca_. Non serve inventare un permesso nuovo, e inventarlo sarebbe stato il
modo di sbagliare: due permessi per la stessa relazione sono due verità che
prima o poi divergono.

## Che cosa rendeva difficile la seconda

Una notifica somiglia molto a ciò che questo progetto ha già rifiutato una
volta. Il modo consueto di costruirla è una tabella di eventi: una riga per
ogni cosa che succede, con dentro una copia di chi l'ha fatta e di che cosa
riguardava. Quella riga sopravvive al post che nomina, sopravvive alla persona
che nomina, e va poi ripulita con un lavoro periodico che nessuno ricorda di
avere scritto.

E c'era una tentazione simmetrica dal lato di chi mette il cuore: segnarsi in
casa propria «ho messo un cuore a questo post remoto», per poter disegnare il
cuore pieno senza chiedere. Sarebbe una copia di un fatto che vive altrove,
cioè esattamente il modo in cui due macchine cominciano a dire due cose diverse.

## Decisione 1: un messaggio `cuore`, e non un flusso

Il settimo messaggio del protocollo, nella famiglia di `segui` — piccolo,
idempotente, con uno stato che si accende e si spegne:

```
{ tipo: "cuore", nome, da, chi: { nome, prova }, post, stato: true | false }
→ { ok: true, cuori, mio }
```

Sta dentro `MAX_REQUEST_BYTES` senza avvicinarvisi, e **non entra nel budget dei
contenuti**: non porta byte, ne porta l'assenza. Vale il budget normale
dell'istanza, contato per chiave come tutto il resto.

**`stato` invece di due messaggi** — `cuore` e `togli` — perché togliere un
cuore è la stessa decisione presa al contrario, e due messaggi avrebbero due
percorsi di autorizzazione da tenere allineati per sempre.

**La risposta riporta il conteggio.** Non è cortesia: chi ha appena premuto deve
poter disegnare il numero giusto senza richiedere la bacheca, e il numero giusto
lo conosce solo chi lo custodisce.

**Un'istanza che non lo conosce risponde già bene, e senza che si tocchi niente:**
il parser di ADR 0021 ha `richiesta_sconosciuta` con dentro la frase «probabilmente
parla una versione più vecchia del protocollo». Chi ha premuto lo vede detto:
il cuore non è arrivato, e non viene disegnato pieno lo stesso. Nessuna versione
maggiore nuova, nessun periodo di transizione: `estia/1` cresce di un messaggio
che le versioni vecchie rifiutano in modo pulito.

## Decisione 2: il permesso è la prova della bacheca, sentinella compresa

**Chi può leggere un post può mettergli un cuore.** Vale per la prova per coppia
di [ADR 0023] §2 e vale per `PROVA_PROFILO_PUBBLICO`, la prova sentinella con
cui un'istanza collegata legge la bacheca di un profilo **pubblico** senza un
follow accettato.

**Deciso dal proprietario**, e contro l'alternativa più stretta che era sul
tavolo — cuori solo con una prova vera, quindi solo dopo un sì. La ragione della
scelta è che l'alternativa produceva una superficie che si spiega male: leggo il
tuo profilo pubblico, il post mi piace, e il cuore è grigio perché prima devo
chiederti di seguirti. Un profilo dichiarato pubblico dalla persona che lo
possiede è già la risposta alla domanda «chi può interagire con questo».

**Il prezzo va scritto, perché è reale e non si compensa altrove.** Con la prova
per coppia, chi mette il cuore è **una persona a cui qualcuno di qua ha detto di
sì**: la decisione l'ha presa un membro di questa istanza. Con la sentinella no.
Lì l'unica cosa autenticata è **l'istanza**, dall'handshake; il nome della
persona è dichiarato da lei, e vale la regola di ADR 0020 §5 — dichiarato, mai
verificato — la stessa che già regge `da` in `segui`. Quindi:

- **su un profilo pubblico un cuore è garantito fino alla casa, non fino alla
  persona.** Una casa collegata che mentisse potrebbe firmare cuori con i nomi
  che preferisce, e ciò che la trattiene non è una prova: è che è una casa a cui
  qualcuno ha detto di sì, e che si può scollegare;
- **il budget è la difesa vera contro il rumore**, non il permesso: i cuori
  stanno nel tetto per chiave dell'istanza, quindi una casa che ne sparasse a
  raffica esaurisce il proprio tetto e nessun altro;
- **una riga per coppia (post, casa, nome)**, quindi premere due volte non
  moltiplica niente, e il conteggio non si gonfia riprovando.

Questo confine va **riesaminato prima** che i profili pubblici siano offerti a
istanze non collegate, che è la stessa soglia oltre la quale ADR 0018 tiene la
propria verifica 2.

## Decisione 3: il cuore lo conserva chi è amato, e nessun altro

**Chi riceve il cuore lo scrive**, in `remote_post_likes(post_id, instance_key,
username, created_at)`. È una copia di un fatto avvenuto altrove, ed è
consapevole: è la stessa asimmetria di [ADR 0022], dove **chi è seguito
conserva i propri follower** perché quella è la lista che _autorizza_ e che
_conta_. Un cuore sul mio post è un fatto sul mio contenuto; se non stesse qui,
il conteggio dei cuori del mio post sarebbe una domanda da girare a macchine che
possono essere spente, e il numero cambierebbe a seconda di chi risponde oggi.

Sparisce con il post, per `ON DELETE CASCADE`: non c'è niente da ripulire dopo,
e nessun lavoro periodico da ricordarsi.

**Chi mette il cuore non conserva niente.** Il cuore pieno lo dice la bacheca:
`PostRemoto` guadagna `cuori` e `mioCuore`, calcolati contro la prova con cui si
sta chiedendo — che identifica già la coppia, quindi la domanda «questo l'ho
amato io?» ha una risposta senza inventare uno stato locale. È la decisione 2 di
ADR 0018 applicata a un dato nuovo: **si visita, non si replica**. Ed evita per
costruzione il caso in cui il mio database dice «l'ho amato» e quello dell'altra
casa non ha più la riga.

**Togliere un follower porta via i suoi cuori.** La riga che li autorizzava non
c'è più, e tenerli direbbe una cosa falsa — che quella persona ha un rapporto
con questo contenuto — nello stesso senso in cui ADR 0022 dice che la revoca ha
effetto subito e senza spedire niente a nessuno. I cuori arrivati con la
sentinella su un profilo pubblico non sono toccati: non c'era nessun follow da
revocare, e a chiuderli si chiude la presenza pubblica.

## Decisione 4: una notifica è una lettura, non un registro

**Non esiste una tabella di notifiche, e non deve esistere.** Tutto ciò che
serve è già scritto, con la sua data, dal fatto stesso che è successo:

| Che cosa dice                       | Da dove viene, e da nessun'altra parte |
| ----------------------------------- | -------------------------------------- |
| ha messo un cuore al tuo post       | `post_likes`, `remote_post_likes`      |
| ha messo un cuore a un tuo commento | `comment_likes`                        |
| ha risposto a un tuo post           | `comments`                             |
| ha risposto a un tuo commento       | `comments.parent_id`                   |
| ti ha chiesto di seguirti           | `followers`, `state = 'in_attesa'`     |
| ha iniziato a seguirti              | `followers`, `state = 'accettato'`     |

Le notifiche sono quindi una **domanda** su quelle sei sorgenti, ordinata per
data. Ne discendono tre proprietà che una tabella di eventi avrebbe dovuto
inseguire con del lavoro, e che qui sono gratis:

1. **Un post cancellato porta via le proprie notifiche**, perché non ne esiste
   una copia da invalidare — la stessa frase che ADR 0023 usa per i post remoti.
2. **Un cuore tolto toglie la propria notifica.** Non resta un avviso su un
   fatto che non è più vero.
3. **Non c'è niente da ripulire, mai.** Nessuna scadenza, nessun lavoro
   periodico, nessuna tabella che cresce per sempre in un NAS di casa.

Si scrive **una cosa sola**, ed è l'unica che non è deducibile da nient'altro:
`notifiche_viste(user_id, viste_at)`, cioè fin dove quella persona ha già
guardato. Serve al pallino sulla campanella e a distinguere le righe nuove.

**I cuori sullo stesso post si raggruppano** — richiesto dal proprietario, ed è
anche l'unico modo di non far scomparire una risposta sotto quindici cuori. Il
raggruppamento avviene **dentro la pagina** che si sta leggendo: se i cuori di
un post stanno a cavallo di due pagine, il post ricompare più in basso con i più
vecchi. È una conseguenza dichiarata dell'impaginazione per data, e la scelta
alternativa — raggruppare prima di impaginare — vorrebbe leggere tutto per
mostrare trenta righe.

**Il contatore non è una lettura in tempo reale**, e non si finge tale: si
chiede a intervalli. Un aggiornamento spinto sarebbe la notifica spinta di
ADR 0021 §3, cioè una decisione che non è questa.

## Decisione 5: le risposte non attraversano, e si dice perché

Un cuore attraversa; una **risposta** no. Non è simmetria mancata:

- un cuore è **un fatto di una riga** — questa persona, questo post — e non ha
  contenuto da moderare. Una risposta sono parole scritte da qualcunə che non è
  membro di questa istanza, ospitate su questa istanza, sotto la responsabilità
  di chi la amministra. Apre la moderazione federata, che l'elenco delle
  milestone successive tiene apposta come voce sua;
- un cuore si revoca cancellando una riga; una conversazione no;
- e il caso d'uso che il pilot ha chiesto è quello: sapere che qualcosa che hai
  scritto è arrivato a qualcuno.

L'interfaccia continua quindi a **non offrire** la risposta sui post remoti, e
adesso la differenza fra le due assenze è visibile: il cuore c'è, la risposta
non c'è. Un pulsante che manca accanto a uno che funziona si legge come una
scelta; due pulsanti che mancano si leggevano come una funzione rotta.

## Conseguenze

**Positive.** Il follow fra case produce, per la prima volta, qualcosa che torna
indietro: si scrive, qualcuno legge, e lo si sa. Le richieste di follow remote
smettono di essere sepolte in Impostazioni → Presenza, dove nessuno andava a
cercarle, ed è la correzione della stessa classe di difetto trovata in M5 —
un gesto che esiste ma non ha un posto in cui essere visto. E niente di tutto
questo introduce un registro che cresce.

**Negative.** Il protocollo cresce di un messaggio e di due campi, cioè di
superficie da difendere. `remote_post_likes` è la prima tabella che conserva un
fatto prodotto da un'altra casa, e ogni tabella del genere va giustificata da
sola: questa lo è dal fatto che riguarda contenuto proprio. Sui profili pubblici
l'identità di chi mette un cuore è garantita solo fino all'istanza — scritto
nella decisione 2, e da riesaminare alla stessa soglia della verifica 2 di
ADR 0018. E il conteggio della campanella costa una richiesta ogni tanto a ogni
scheda aperta, che su un NAS domestico non è zero.

**Neutre.** `bacheca`, `immagine`, `profilo`, `cerca`, `segui`, `smetti` non
cambiano forma. `PostRemoto` guadagna due campi opzionali, che una versione più
vecchia ignora senza rompersi (ADR 0021 §6), e in loro assenza il cuore resta
semplicemente non disponibile.

## Quando riesaminare

- **Prima che i profili pubblici siano leggibili da istanze non collegate**: la
  decisione 2 poggia sul fatto che una casa che abusa è una casa a cui qualcuno
  ha detto di sì, e che si può scollegare. Senza quel sì, il ragionamento cade.
- **Se il raggruppamento a cavallo di pagina dà fastidio sul campo**: si cambia
  l'impaginazione, non il modello. La tabella di eventi resta esclusa.
- **Quando arriveranno chat e notifiche push** ([ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md)):
  il contatore a intervalli è la cosa che quel blocco sostituisce per prima, e la
  notifica spinta va decisa lì, non qui.
- **Se qualcuno chiedesse le risposte fra istanze**: è la decisione 5, e va
  riaperta insieme alla moderazione federata, mai da sola.
