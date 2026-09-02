# ADR 0043 — La conversazione si visita: ognuno custodisce quello che ha scritto

- Stato: **Proposed** — decide chi custodisce i messaggi privati, e quindi chi può ritirarli
- Data: 2026-08-28
- Proprietario: progetto ESTIA
- **Riapre: [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md)**, che è il documento che questa scelta ribalta davvero — non 0029, che ne è il corollario
- Ribalta anche: la deroga di [ADR 0029](0029-un-messaggio-si-consegna.md) §1 per i messaggi privati, e il punto 4 di [ADR 0042](0042-come-mls-attraversa.md)
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md), [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md), [ADR 0042](0042-come-mls-attraversa.md)
- Rimanda a: **M4** per il trasporto dispositivo ↔ casa, che questa decisione vincola ma non sceglie

## Contesto

### Che cosa si chiede

Detto dal proprietario il 2026-08-28, ed è il requisito, non un desiderio:

> _«Se io scrivo a una persona dove mi trovo, e poi decido di spegnere la macchina, voglio che quel messaggio quella persona non lo legga. Se io spengo l'istanza dove sono, non c'è modo che qualcuno mi legga.»_

Non è (solo) difesa dal sequestro. È **ritiro**, controllato da chi ha scritto: la mia parola resta mia, e quando spengo la macchina smette di essere disponibile. È mettersi al sicuro a vicenda — chi scrive non lascia in casa d'altri qualcosa che non può più togliere.

### Perché per i post va bene, e per i messaggi sembrava di no

[ADR 0018](0018-federazione-fra-istanze-estia.md) decisione 2 lo fa già per i contenuti pubblici: **si visitano, non si replicano.** Macchina spenta, post non leggibile. Nessuno l'ha mai considerato un difetto.

[ADR 0029](0029-un-messaggio-si-consegna.md) ha fatto un'eccezione per i privati, e la ragione era dichiarata: la **disponibilità** — «se un messaggio vivesse solo sul server del mittente, nel momento in cui il mittente spegne il proprio computer il destinatario non potrebbe leggere». Era una scelta di prodotto, non una legge, e questo ADR la ribalta consapevolmente.

**Quello che davvero non funziona non è la visita: è visitare una busta MLS.** Una busta è protetta da una chiave che si autodistrugge — `ts-mls` conserva il materiale per **4 epoch** (`retainKeysForEpochs`, verificato nella libreria). Andarla a prendere in ritardo è tornare a una porta di cui la serratura è stata fusa: non si apre nemmeno con il mittente riacceso.

ESTIA ha però già l'oggetto giusto da visitare. [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) §2 lo dice: l'archivio **non ha forward secrecy per costruzione**, ed «è ciò che lo rende recuperabile». Una visita fra un mese vale come una fra un minuto.

**Quindi: si visita l'archivio, non la busta.** E allora è identico ai post.

### Le tre cose che si stavano confondendo

|                      | che cos'è                      | che cosa fa                                 |
| -------------------- | ------------------------------ | ------------------------------------------- |
| **Casa** (istanza)   | un nodo iroh con la sua chiave | **custodisce**, risponde, e si spegne       |
| **Persona** (membro) | appartiene a una casa          | **scrive**, e appartiene alla conversazione |
| **Dispositivo**      | una foglia dell'albero MLS     | **cifra e decifra**, e basta                |

La custodia segue la **persona**, quindi la sua **casa**: scrivo dal telefono o dal portatile, in tutti e due i casi la voce sta a casa mia. Aggiungere dispositivi non frammenta niente.

I dispositivi contano solo per MLS, dove una persona con due dispositivi è **due foglie** ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md), e la nota in fondo a [S5](../spike/S5-quanto-pesa-un-albero.md)).

## Decisione

### 1. Il trasporto è effimero, e non è la cosa che si visita

La busta MLS serve a portare il messaggio dal mio dispositivo al tuo **adesso**, mentre siamo accesi tutti e due. Vive minuti.

Sul server di chi riceve **si cancella appena il suo dispositivo l'ha presa**. La finestra di esposizione passa da «per sempre» a «qualche secondo», e un NAS sequestrato non contiene nemmeno il ciphertext ricevuto.

Non si custodisce la busta lato mittente, e non si differisce la consegna: sarebbe l'unica scelta che rompe la forward secrecy, per il motivo del §«Perché per i post va bene».

### 2. L'archivio è custodito da chi scrive, e si visita

**Ogni casa conserva le voci d'archivio dei messaggi scritti dai suoi membri. Nessuna replica.**

La cronologia di una conversazione è l'unione delle custodie: il client la chiede a ciascuna casa e la ricompone. In un gruppo sono N custodie, una per casa partecipante.

Da qui viene tutto il resto, senza forzare niente:

- **spengo la mia istanza** → la mia parte non si serve più, su nessuno schermo;
- **riaccendo** → torna intera, perché l'archivio non ratcheta e non scade;
- **elimino** → cancello le mie voci, e **non esiste un'altra copia su nessun server**. «Elimina per tutti» smette di essere una richiesta cortese ([ADR 0029](0029-un-messaggio-si-consegna.md) §3) e diventa un fatto;
- **sei stato via una settimana** → la busta è scaduta, ma leggi la voce d'archivio da casa mia. Il limite delle 4 epoch non si incontra mai, perché non si passa più di lì.

### 3. Il segnaposto si deduce, non si conserva

Il client sa chi partecipa alla conversazione. Se la casa di una persona non risponde, sa già che manca la sua parte: non serve una riga sul server di chi legge.

E **non deve esserci**: una riga durevole che dice «Anna ha mandato qualcosa alle 22:14, 380 byte» è esattamente la testimonianza che questa decisione toglie da casa d'altri.

Si perde la precisione — non si sa **quanti** messaggi mancano né dove stessero. Al posto di dieci buchi numerati si mostra una fascia:

> **La parte di Anna non è disponibile** — la sua istanza è spenta.

È anche più onesto: se la casa è spenta, quella precisione non ce l'hai.

### 4. Nessun dispositivo risponde a richieste di contenuti

Con l'app, un telefono **avrà** una NodeId iroh: è così che iroh connette, e M4 lo prevede già («i due nodi da far trovare sono un dispositivo e la sua istanza»). Averla non è il problema. Il problema sarebbe **ascoltare**.

**Un dispositivo chiama la propria casa e basta. Non accetta connessioni sull'ALPN di ESTIA, non è mai censito come custode, e nessun `remote:` punta a un telefono.**

Non è una preferenza architetturale: è **la condizione perché il ritiro funzioni.** Se il telefono servisse l'archivio, spegnere il NAS non toglierebbe niente — e sarebbe peggio di adesso, perché un telefono si sequestra più facilmente di una macchina in un armadio.

**Conseguenza per M4, da contare lì e non scoprire dopo:** una NodeId sul telefono dà all'infrastruttura di scoperta e ai relay il profilo di accensione **di una persona**, non di una macchina. [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md) §«Che cosa vede il terzo» ha argomentato che per un NAS «acceso/spento» è vicino a «c'è qualcuno in casa»; per un telefono è «questa persona è sveglia, e da quale rete». È più intimo, ed è meno di quello che concede Tailscale oggi — ma va nel bilancio di M4 con la stessa cura.

### 5. Che cosa il ritiro fa, e che cosa non può fare

Va scritto qui, per intero, perché è la differenza fra una promessa e uno slogan.

**Fa questo:**

- chi **non ha ancora letto**, non leggerà mai;
- chi **ha letto**, non può tornare a rileggere;
- un **server sequestrato** contiene solo ciò che quella casa ha scritto.

**Non può fare questo, e nessun disegno lo può:**

- **chi ha già letto, ha letto.** Il testo è passato dai suoi occhi, e da lì non si toglie;
- i **metadati di trasporto** ([ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md)) restano quello che sono: chi ha parlato con chi, e quando.

E poggia su **due assunzioni di client onesto**, che stanno qui insieme perché cadono insieme:

1. **il dispositivo di chi legge non tiene una copia in chiaro** — altrimenti «spengo e sparisce» sarebbe falso sul suo schermo;
2. **nessun dispositivo risponde a richieste di contenuti** (§4).

Valgono contro un client onesto e contro un dispositivo sequestrato che esegue il codice vero. **Non** valgono contro chi si scrive un client apposta per tenersi le cose — come per chiunque, Signal compreso. Va detto a chi usa il prodotto con queste parole, non con «non c'è modo».

## Che cosa questo ribalta, e va detto dove sta

**[ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) è il documento che questa decisione ribalta.** È nato per rispondere a: _la forward secrecy distrugge le chiavi, come fa una persona a ritrovare la sua cronologia?_ La risposta era: **la cronologia è della conversazione**, e sopravvive a chiunque.

Adesso si dice il contrario: **la cronologia è di chi l'ha scritta, e si ritira.**

Non sono conciliabili, e la seconda vince. In particolare cade la §3 di quell'ADR — «le chiavi d'archivio sono della conversazione» resta vera come **crittografia** (il mazzo continua a viaggiare nel gruppo), ma smette di esserlo come **disponibilità**: la chiave apre, la casa serve, e la casa può spegnersi.

0029 e 0042 §4 sono corollari e si aggiornano di conseguenza.

## Conseguenze

### Positive

- Chi scrive può ritirare la propria parola, e spegnere la macchina è il gesto che la ritira.
- Un server sequestrato rivela solo quello che quella casa ha scritto.
- «Elimina per tutti» diventa efficace lato server invece che cortese.
- I privati tornano coerenti con [ADR 0018](0018-federazione-fra-istanze-estia.md): **anche i messaggi si visitano.** L'eccezione di 0029 si chiude, e il modello del prodotto torna a essere uno solo.

### Negative

- **Niente chat offline.** La cronologia si rilegge dalla rete: senza connessione resta solo quello che hai scritto tu, che è a casa tua.
- **Con la mia casa spenta non leggo nemmeno la mia storia.** Il ritiro vale anche verso di me — il telefono che ha scritto il messaggio non lo conserva, lo conserva casa mia.
- **I miei dispositivi non si sincronizzano se la mia casa è giù**, perché passano tutti da lì (§4) e non esiste un percorso alternativo.
- **Aggiungere un dispositivo è un commit MLS** ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md)), e con la casa che mette in fila di [ADR 0042](0042-come-mls-attraversa.md) §3 quel commit vuole **quella casa accesa**. In una conversazione nata a casa di Bruno, con casa sua spenta non puoi autorizzare il tuo telefono. Il costo era già dichiarato in 0042 §3; con l'app smette di essere raro, e l'interfaccia deve dirlo.
- **Leggere significa connettersi alla casa di ogni corrispondente**, quindi il momento in cui leggi è visibile ai relay. È un segnale che prima non c'era, ed è il rovescio del bilancio di [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md).

### Neutre

- Il server resta un Delivery Service cieco: chi custodisce non legge, perché la voce d'archivio è cifrata con il mazzo del gruppo.
- Il protocollo non cambia forma: le operazioni sono quelle che [ADR 0042](0042-come-mls-attraversa.md) elenca, con `archivio` che diventa una **visita** invece di un deposito replicato.

## Come si verifica

1. Il database di chi riceve **non contiene** la busta di un messaggio ricevuto e già prelevato: solo la finestra fra consegna e prelievo, misurata.
2. Nessuna riga di segnaposto sul server di chi riceve: la mancanza si deduce, e un `SELECT` non trova traccia dei messaggi altrui.
3. **Spengo la mia istanza → la mia parte sparisce da ogni schermo. Riaccendo → torna intera.** È la prova centrale, e si fa con due case vere.
4. Il testo in chiaro assente da **entrambi** i database e da entrambi i backup `age` (invariato dal gate M6).
5. «Elimina per tutti» rimuove le voci e le rende irrecuperabili ovunque non siano già state lette.
6. Con la casa di un mittente spenta, l'interfaccia mostra la fascia del §3 **prima** di ogni tentativo, non dopo un errore — usando lo stato che [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md) già fornisce.
7. Un dispositivo **non risponde** a una richiesta di contenuti fatta direttamente alla sua NodeId.

## Quando riesaminare

- **Se nel pilot «la casa spenta» rende le conversazioni inutilizzabili** più che private: allora si valuta una finestra di grazia — la casa serve ancora per N ore dopo lo spegnimento — sapendo che è esattamente ciò che questa decisione toglie.
- **Prima di promettere la chat offline**: oggi non c'è, e prometterla vorrebbe dire una copia locale, cioè rinunciare al ritiro.
- **Insieme al numero di sicurezza** di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md): resta l'unica difesa contro l'istanza che si sostituisce a un membro, e questa decisione non la tocca.
- **Se il costo del punto 4 delle Negative mordesse** — dispositivi che non si riescono ad autorizzare perché una casa è spenta — va rivisto insieme a [ADR 0042](0042-come-mls-attraversa.md) §3, non da solo.
