# ADR 0043 — La conversazione si visita: ognuno custodisce quello che ha scritto

- Stato: **Accepted** — approvata dal proprietario il **2026-09-07**: contenuti custoditi solo dalla casa dell'autore, segnaposto remoto con mittente e orario consentito
- Data: 2026-08-28
- Attuazione: **parziale dal 2026-09-08**, deposito locale attribuito all’account e ricezione MLS senza copia d’archivio. Le chat attuali conservano ancora le buste ricevute; il taglio MLS resta subordinato ad ADR 0042 e alle verifiche del piano
- Proprietario: progetto ESTIA
- **Riapre: [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md)**, che è il documento che questa scelta ribalta davvero — non 0029, che ne è il corollario
- Ribalta anche: la deroga di [ADR 0029](0029-un-messaggio-si-consegna.md) §1 per i messaggi privati, e il punto 4 di [ADR 0042](0042-come-mls-attraversa.md)
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md), [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md)
- Vincola: [ADR 0042](0042-come-mls-attraversa.md), che resta **Proposed** per le altre scelte di federazione
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

### 0. La custodia segue l'autore, senza copie nella casa del lettore

**Precisazione vincolante del proprietario, 2026-09-07:** Marco è membro della casa A, Matteo della B. **A non conserva i contenuti di Matteo: li richiede sempre a B.** La stessa regola vale da B verso A e con qualunque numero di case.

Il divieto comprende messaggi, voci d'archivio, allegati, post e copie dei dati di profilo, **anche cifrati**. Si applica a database, WAL, file temporanei, cache persistenti, code, log, dump e backup. Scrivere e cancellare dopo la lettura non lo soddisfa: la copia può essere già finita in un backup o nel journal. Non sono ammesse copie di disponibilità quando B è spenta.

**Precisazione successiva del proprietario, nello stesso giorno:** può restare nella casa del destinatario il **segno che un messaggio esiste**, con **chi l'ha mandato e quando**. Il segnaposto è vuoto rispetto al contenuto: non contiene testo, allegati né il messaggio cifrato. È l'eccezione esplicitamente autorizzata, dettagliata al §3.

Per mostrare un contenuto devono transitare dei byte: il percorso resta dispositivo di Marco → A → B, con risposta inoltrata **solo in memoria per la richiesta in corso**, senza diventare un deposito. Il client ufficiale non conserva la cronologia remota su disco e una lettura successiva richiede nuovamente la casa dell'autore. Non si promette l'assenza fisica di byte dalla RAM durante la lettura.

**Oltre al segnaposto autorizzato, i riferimenti e lo stato condiviso non sono un'eccezione implicita.** Il codice conserva già identificatori remoti, relazioni, reazioni, puntatori e stato crittografico. La richiesta riguarda i dati delle persone: prima di approvare ADR 0042 va esplicitato, dato per dato, che cosa identifica la relazione di Marco e che cosa è una copia dei dati di Matteo. La loro persistenza non viene autorizzata chiamandoli semplicemente «metadati». L'inventario e la decisione sul minimo necessario restano aperti in 0042.

Anche l'opzione ActivityPub fatta di copie, prevista da ADR 0018 §3, **non soddisfa questo vincolo**. Non è autorizzata la sua implementazione come deroga automatica; richiede un riesame esplicito prima di essere riaperta.

### 1. Nessuna casella persistente sul destinatario

La proposta del 2026-08-28 prevedeva di cancellare la busta MLS dopo il prelievo del dispositivo. **Quella finestra di persistenza è esclusa dalla decisione del 2026-09-07.** Nessuna busta applicativa di Matteo viene scritta su A, nemmeno in attesa che Marco si colleghi.

Il percorso della cronologia è sempre la visita dell'archivio in B. Un eventuale trasporto MLS in tempo reale deve rispettare lo stesso divieto e non sostituire la richiesta alla casa dell'autore con una copia consegnata in anticipo. La sua forma e il trattamento dello stato di controllo MLS vanno risolti in ADR 0042 prima del codice. Se il dispositivo non è disponibile, la lettura successiva usa l'archivio del mittente: non si conserva una busta remota per leggerla dopo.

### 2. L'archivio è custodito da chi scrive, e si visita

**Ogni casa conserva le voci d'archivio dei messaggi scritti dai suoi membri. Nessuna replica.**

La cronologia di una conversazione è l'unione delle custodie: il client la chiede a ciascuna casa **attraverso la propria istanza** e la ricompone in memoria. In un gruppo sono N custodie, una per casa partecipante. Chi scrive deposita la propria voce nella propria casa prima di dichiarare riuscito l'invio; chi riceve non la ricifra per depositarla nella sua. Autore e casa vanno verificati dal protocollo, non accettati da un campo libero del client.

Da qui viene tutto il resto, senza forzare niente:

- **spengo la mia istanza** → nessuna nuova lettura della mia parte riesce; il client ufficiale la rimuove quando rileva la mancata disponibilità, senza riproporre una copia;
- **riaccendo** → torna intera, perché l'archivio non ratcheta e non scade;
- **elimino** → cancello le mie voci, e **non esiste un'altra copia su nessun server**. «Elimina per tutti» smette di essere una richiesta cortese ([ADR 0029](0029-un-messaggio-si-consegna.md) §3) e diventa un fatto;
- **sei stato via una settimana** → la busta è scaduta, ma leggi la voce d'archivio da casa mia. Il limite delle 4 epoch non si incontra mai, perché non si passa più di lì.

### 3. Il segnaposto si conserva, il contenuto si richiede

**La precisazione del 2026-09-07 sostituisce la proposta iniziale**, che deduceva solo una fascia di indisponibilità dalla lista dei partecipanti e vietava ogni segnaposto persistente.

Se Matteo scrive a Marco, A può conservare una riga: **Matteo, ore 22:14, messaggio da richiedere alla casa B**. Un riferimento opaco al messaggio, alla conversazione e alla casa dell'autore serve esclusivamente a ritrovare la voce e a deduplicare il segnaposto; la forma e l'autorizzazione della richiesta si definiscono in ADR 0042. Un identificatore non concede di per sé accesso al contenuto.

| Può restare su A                                                                                                             | Non può restare su A                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riferimento al mittente e alla sua casa, orario e riferimenti opachi necessari a richiedere il messaggio nella conversazione | Testo, anteprima, citazione del testo nelle risposte, allegati, miniature, nomi dei file, busta cifrata, voce d'archivio cifrata, chiavi del contenuto dentro il segnaposto |

Non si aggiungono dimensione del contenuto, tipo di allegato, hash del contenuto o altri dati derivati: l'autorizzazione è **solo per il segno, il mittente e l'orario**, con i riferimenti tecnici indispensabili. «Illeggibile» qui significa **senza contenuto da decifrare**; una busta cifrata è contenuto e non è un segnaposto.

Quando B non risponde, il segnaposto di Matteo resta al suo posto con mittente e orario, e il client mostra **«Contenuto non disponibile — l'istanza dell'autore non risponde»**. Quando B torna raggiungibile, il contenuto si ottiene con una nuova richiesta a B e non dal segnaposto. Anche una risposta a un messaggio remoto conserva il riferimento, non una copia della citazione.

Una mancata risposta non prova uno spegnimento: potrebbe essere un problema di rete. Il rilevamento non è istantaneo; il suo tempo massimo, i timeout e l'invalidazione del contenuto mostrato vanno definiti e misurati in ADR 0042. Il battito di ADR 0041 è un'indicazione, non un'autorizzazione a servire dati vecchi.

**Costo accettato:** il database e i backup di A possono rivelare che Matteo ha scritto a una certa ora in quella conversazione, e quanti segnaposto sono presenti. Non rivelano il contenuto. Ritiro e cancellazione del contenuto non promettono di cancellare questa traccia; il ciclo di vita dei riferimenti dopo cancellazione o revoca va specificato in ADR 0042.

### 4. Nessun dispositivo risponde a richieste di contenuti

Con l'app, un telefono **avrà** una NodeId iroh: è così che iroh connette, e M4 lo prevede già («i due nodi da far trovare sono un dispositivo e la sua istanza»). Averla non è il problema. Il problema sarebbe **ascoltare**.

**Un dispositivo chiama la propria casa e basta. Non accetta connessioni sull'ALPN di ESTIA, non è mai censito come custode, e nessun `remote:` punta a un telefono.**

Non è una preferenza architetturale: è **la condizione perché il ritiro funzioni.** Se il telefono servisse l'archivio, spegnere il NAS non toglierebbe niente — e sarebbe peggio di adesso, perché un telefono si sequestra più facilmente di una macchina in un armadio.

**Conseguenza per M4, da contare lì e non scoprire dopo:** una NodeId sul telefono dà all'infrastruttura di scoperta e ai relay il profilo di accensione **di una persona**, non di una macchina. [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md) §«Che cosa vede il terzo» ha argomentato che per un NAS «acceso/spento» è vicino a «c'è qualcuno in casa»; per un telefono è «questa persona è sveglia, e da quale rete». È più intimo, ed è meno di quello che concede Tailscale oggi — ma va nel bilancio di M4 con la stessa cura.

### 5. Che cosa il ritiro fa, e che cosa non può fare

Va scritto qui, per intero, perché è la differenza fra una promessa e uno slogan.

**Fa questo:**

- con la casa dell'autore irraggiungibile, **non si ottiene una nuova lettura** dei suoi contenuti;
- chi **ha letto** deve richiederli di nuovo per rileggerli nel client ufficiale;
- un **deposito dell'istanza conforme** non contiene messaggi o archivi di persone ospitate altrove, neppure cifrati.

**Non può fare questo, e nessun disegno lo può:**

- **chi ha già letto, ha letto.** Il testo è passato dai suoi occhi, e da lì non si toglie;
- screenshot, copie manuali, client modificati e una risposta già in transito non si possono ritirare a distanza;
- non si può garantire che ogni schermo si svuoti nell'istante fisico dello spegnimento: il limite è il rilevamento della mancata disponibilità (§3);
- i **metadati di trasporto** ([ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md)) restano quello che sono: chi ha parlato con chi, e quando.
- **il segnaposto remoto resta** (§3): mittente e orario possono comparire nel database e nei backup di chi riceve, anche quando il contenuto non è disponibile.

E poggia su **due assunzioni di client onesto**, che stanno qui insieme perché cadono insieme:

1. **il dispositivo di chi legge non tiene una copia in chiaro** — altrimenti «spengo e sparisce» sarebbe falso sul suo schermo;
2. **nessun dispositivo risponde a richieste di contenuti** (§4).

Sono vincoli del client ufficiale, non una garanzia di cancellazione di ciò che è già passato dalla memoria di un dispositivo. **Non** valgono contro chi si scrive un client apposta per tenersi le cose. Va detto a chi usa il prodotto con queste parole, non con «non c'è modo».

## Che cosa questo ribalta, e va detto dove sta

**[ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) è il documento che questa decisione ribalta.** È nato per rispondere a: _la forward secrecy distrugge le chiavi, come fa una persona a ritrovare la sua cronologia?_ La risposta era: **la cronologia è della conversazione**, e sopravvive a chiunque.

Adesso si dice il contrario: **la cronologia è di chi l'ha scritta, e si ritira.**

Non sono conciliabili, e la seconda vince. In particolare cade la §3 di quell'ADR — «le chiavi d'archivio sono della conversazione» resta vera come **crittografia** (il mazzo continua a viaggiare nel gruppo), ma smette di esserlo come **disponibilità**: la chiave apre, la casa serve, e la casa può spegnersi.

0029 e 0042 §4 sono corollari e si aggiornano di conseguenza.

## Conseguenze

### Positive

- Chi scrive può ritirare la propria parola, e spegnere la macchina è il gesto che la ritira.
- I depositi di un'istanza conforme non contengono i messaggi e gli archivi ricevuti da altre case; RAM e metadati restano nei limiti dichiarati sopra.
- «Elimina per tutti» diventa efficace lato server invece che cortese.
- I privati tornano coerenti con [ADR 0018](0018-federazione-fra-istanze-estia.md): **anche i messaggi si visitano.** L'eccezione di 0029 si chiude, e il modello del prodotto torna a essere uno solo.

### Negative

- **Niente chat offline.** Anche la propria cronologia richiede l'accesso alla propria casa; quella remota richiede inoltre le case degli autori.
- **Con la mia casa spenta non leggo nemmeno la mia storia.** Il ritiro vale anche verso di me — il telefono che ha scritto il messaggio non lo conserva, lo conserva casa mia.
- **I miei dispositivi non si sincronizzano se la mia casa è giù**, perché passano tutti da lì (§4) e non esiste un percorso alternativo.
- **Aggiungere un dispositivo alle conversazioni richiede commit MLS** ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md)). Se si adotta la casa che mette in fila proposta in [ADR 0042](0042-come-mls-attraversa.md) §3, il commit vuole **quella casa raggiungibile**. L'approvazione locale del telefono e il suo ingresso nelle conversazioni restano due stati distinti: l'interfaccia deve dirlo. Questo costo appartiene alla proposta 0042, non è una nuova decisione implicita di 0043.
- **Leggere significa connettersi alla casa di ogni corrispondente**, quindi il momento in cui leggi è visibile ai relay. È un segnale che prima non c'era, ed è il rovescio del bilancio di [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md).

### Neutre

- Il server resta un Delivery Service cieco: chi custodisce non legge, perché la voce d'archivio è cifrata con il mazzo del gruppo.
- [ADR 0042](0042-come-mls-attraversa.md) va completata: `archivio` diventa una **visita** e va specificato anche il recapito del segnaposto senza contenuto. Le sei operazioni della proposta originale non bastano come specifica del nuovo comportamento.

## Come si verifica

1. Marco su A e Matteo su B si scrivono: database, WAL, file, cache, log e backup di A **non contengono mai** messaggi, buste o voci d'archivio di Matteo. Si controlla anche **durante** una richiesta, prima di qualunque prelievo, con il dispositivo offline e dopo un riavvio. Prova simmetrica su B; cercare soltanto il testo in chiaro non basta, vanno riconosciuti anche i payload cifrati.
2. Il segnaposto sul server di chi riceve contiene soltanto mittente, orario e riferimenti opachi necessari (§3). Database e backup possono conservarlo, ma non contengono testo, anteprima, allegati, citazioni copiate, hash o dimensioni del contenuto, buste o voci d'archivio cifrate. Retry e riconnessione non duplicano la riga.
3. **Spengo B → nuove letture di Matteo falliscono e il contenuto viene rimosso dalla vista entro il tempo di rilevamento definito in 0042; restano i segnaposto con mittente e orario. Riaccendo B → il contenuto torna dalla visita di B.** Ogni nuova lettura contatta B; nessuna cache locale serve da ripiego. È la prova centrale, su due case vere, anche con una scheda già aperta.
4. Il testo in chiaro assente da **entrambi** i database e da entrambi i backup `age` (invariato dal gate M6).
5. Eliminare una voce nella casa dell'autore impedisce nuove letture dalle altre case. La prova comprende l'assenza di copie nei depositi remoti; non promette di cancellare screenshot o vecchi backup della casa dell'autore.
6. Con una casa già nota come irraggiungibile, l'interfaccia mostra i segnaposto del §3 senza contenuto; se la mancata disponibilità emerge dalla richiesta, aggiorna lo stato al suo esito. Nessuna dicitura presenta un timeout come prova di spegnimento.
7. Un dispositivo **non risponde** a una richiesta di contenuti fatta direttamente alla sua NodeId.
8. Il deposito di una voce attribuita a una persona di un'altra casa viene rifiutato; la ricezione non invoca un deposito locale del contenuto. Riavvio, retry, riconnessione e cambio dispositivo non introducono copie.

## Attuazione e dati esistenti

**La decisione è accettata, la garanzia fra case non è ancora attiva.** `messaggi` conserva ancora le buste remote di `ESTIA-E2E-v1`, usato dalla schermata attuale.

**Primo incremento costruito il 2026-09-08**, indipendente dalle scelte federate di 0042: `ricevi` in `apps/web/src/mls/sessione.ts` decifra senza depositare il contenuto ricevuto. `depositaArchivio` attribuisce ogni nuova voce all'account autenticato, mai a un campo del client; la migrazione 28 impone un autore locale membro anche in SQL. Un retry è ammesso solo con lo stesso autore e gli stessi dati; un conflitto annulla l'intero batch. Questo attesta il depositante, **non è una prova crittografica dell'autore del testo opaco** e non sostituisce l'autenticazione federata da costruire.

La migrazione conserva le voci precedenti con `autoreId: null`: non si conosce chi le abbia depositate, non vengono eliminate o assegnate per ipotesi e un retry non può reclamarle. Restano leggibili agli stessi membri nel percorso locale esistente; non sono dichiarate conformi alla nuova custodia e non vanno esportate come voci attribuite. Test API, migrazione su database temporaneo e riapertura verificano questo confine.

**Aggiornamento e rollback di questo incremento:** il percorso ordinario applica la migrazione 28 attraverso il backup prima delle migrazioni di ADR 0014. Non esiste una migrazione inversa: per tornare al codice precedente si ripristina un backup coerente precedente alla 28 seguendo la procedura di restore, consapevoli che si perdono le scritture successive. Il trigger impedisce al vecchio codice di depositare nuove voci prive di autore: non basta riavviare una vecchia immagine sul database aggiornato. Nessuna istanza reale è stata aggiornata da questo incarico.

Prima del taglio, il piano deve includere: provenienza autenticata delle voci e dei segnaposto, archivio del solo autore, segnaposto privi di contenuto, visite autorizzate e paginate, gestione del dispositivo rientrato senza mazzo, assenza di persistenza dei contenuti remoti e invalidazione delle viste. ADR 0042 resta da decidere per il protocollo e lo stato condiviso; il gate M6 sul NAS resta aperto.

Le copie preesistenti richiedono una migrazione verificata: preservare presso l'autore le sue voci recuperabili, censire e rimuovere le copie fuori casa, gestire WAL, backup storici e ripristini che potrebbero reintrodurle. **Un `DELETE` non dimostra la cancellazione fisica e aggiornare il software non modifica i backup già esportati.** Nessuna cancellazione di dati reali è eseguita con questo ADR. La procedura di migrazione, pulizia e rollback va preparata prima del rilascio; un rollback al vecchio trasporto reintroduce la custodia remota e non può essere dichiarato conforme.

## Quando riesaminare

- **Se nel pilot «la casa spenta» rende le conversazioni inutilizzabili**: si riesamina il prodotto con il proprietario; nessuna finestra di grazia o copia di disponibilità si introduce come ottimizzazione.
- **Prima di promettere la chat offline**: oggi non c'è, e prometterla vorrebbe dire una copia locale, cioè rinunciare al ritiro.
- **Insieme al numero di sicurezza** di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md): resta l'unica difesa contro l'istanza che si sostituisce a un membro, e questa decisione non la tocca.
- **Se il costo del punto 4 delle Negative mordesse** — dispositivi che non si riescono ad autorizzare perché una casa è spenta — va rivisto insieme a [ADR 0042](0042-come-mls-attraversa.md) §3, non da solo.
