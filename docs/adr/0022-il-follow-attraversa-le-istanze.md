# ADR 0022 — Il follow attraversa le istanze, e non promuove nessuno

- Stato: **Accepted**
- Data: 2026-08-20
- Proprietario: progetto ESTIA
- Attua: il punto 1 dell'elenco delle milestone successive, per la metà che [ADR 0018](0018-federazione-fra-istanze-estia.md) chiamava «legame sociale»
- Corregge: la riga «Collegata» di [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) §1, che conflava due permessi diversi

## Contesto: una frase che apriva un buco

[ADR 0018](0018-federazione-fra-istanze-estia.md) dice come nasce un legame fra due istanze, e ne distingue due: quello **amministrativo**, deliberato, e quello **sociale** — «quando qualcuno segue qualcuno sull'altra istanza, le due macchine cominciano a parlarsi». [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) ha poi tradotto quella frase in una riga di tabella: si è **collegata** quando «un amministratore di qua ha accettato, **oppure** un membro di qua segue qualcuno di là».

Quel «oppure» è un difetto, e si vede solo mettendoci dentro un'istanza ostile. Se un follow basta a diventare collegata, allora **qualunque istanza si promuove da sola**: dichiara che un proprio membro segue qualcuno qui, e con ciò guadagna il diritto di elencare i profili pubblici di questa istanza. Non deve nemmeno mentire bene — [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) §5 dice già che un'istanza può mentire su chi ospita, e qui quella menzogna comprerebbe un permesso.

Il difetto non stava nel follow: stava nell'aver trattato **due relazioni diverse come se fossero la stessa.**

## Decisione 1: il follow non promuove nessuno

Un legame sociale e un legame amministrativo autorizzano cose diverse, quindi sono livelli diversi.

| Livello         | Come ci si arriva                             | In più rispetto al precedente                                  |
| --------------- | --------------------------------------------- | -------------------------------------------------------------- |
| **Sconosciuta** | Ha la chiave                                  | Presentarsi, chiedere un collegamento, **chiedere di seguire** |
| **In contatto** | C'è almeno un follow **accettato** fra le due | Chiedere un profilo **per nome**                               |
| **Collegata**   | Un amministratore di qua ha accettato         | **Elencare** i profili pubblici, e la ricerca inoltrata        |
| **Bloccata**    | Decisione di qua                              | Niente, e il rifiuto precede la richiesta                      |

La linea che conta è fra le ultime due: **«in contatto» si ottiene da soli, «collegata» la concede qualcuno di qua.** Quindi tutto ciò che si ottiene da soli deve essere innocuo se chi lo ottiene mente, ed elencare le persone di un'istanza non lo è. Chiedere un profilo che si sa già nominare, invece, sì: non rivela chi esiste, perché «non trovato» e «non esiste» rispondono uguale.

**Perché chiedere di seguire è permesso a una sconosciuta.** È lo stesso ragionamento del collegamento: un rapporto deve poter cominciare da qualche parte, e il primo messaggio arriva sempre da chi non è ancora nessuno. Costa una riga, e le righe che una sconosciuta può far nascere hanno già un tetto.

## Decisione 2: le due parti conservano due fatti diversi

Non è una replica dello stesso dato in due posti, ed è la ragione per cui non c'è niente da sincronizzare.

- **L'istanza di chi è seguito conserva i propri follower**, perché è lei a decidere chi può leggere. È il dato che autorizza.
- **L'istanza di chi segue conserva chi i suoi membri seguono**, perché è lei a dover andare a prendere i contenuti. È il dato che serve a comporre un feed.

Ne discende la proprietà che [ADR 0018](0018-federazione-fra-istanze-estia.md) prometteva e che qui diventa vera per costruzione: **togliere un follower ha effetto immediato**, perché la lista che autorizza è in casa di chi decide. Non c'è nessuna revoca da spedire e nessun destinatario che possa ignorarla. L'altra parte se ne accorgerà alla prossima lettura, che fallirà — ed è il comportamento giusto, non un ritardo.

E l'inverso: **smettere di seguire** ha effetto immediato a casa propria, e viene comunicato all'altra perché tolga il follower. Se l'altra è spenta, resta un follower che non legge più: uno stato scomodo e non pericoloso, che si ripulisce alla prima occasione utile.

## Decisione 3: aperto o chiuso è una scelta della persona

Un profilo **aperto** accetta i follow senza chiedere. Un profilo **chiuso** li mette in attesa, e la persona decide.

È distinto dalla presenza in EstiaNet, e le due non vanno collassate: entrare in EstiaNet dice **se esisti fuori dall'istanza**; privato/pubblico (qui e sulla rete) dice **che cosa vede chi apre il tuo profilo** — la richiesta di follow, oppure i post. Un profilo in rete e chiuso ai follow automatici resta una combinazione sensata.

Il default è **chiuso**, come ogni altro default di questo progetto: chi non decide finisce nella posizione più protetta.

## Decisione 4: chi segue lo dice l'istanza, e vale quanto vale

L'identità dell'**istanza** viene dall'handshake e non si può mentire ([ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §1). L'identità della **persona** dentro quell'istanza no: è un nome che quell'istanza dichiara.

Non è aggiustabile senza dare a ogni persona una chiave e farle firmare le proprie azioni, che è un progetto suo e non questo. Quindi si dichiara, con le tre conseguenze:

- **un'istanza può inventarsi follower.** Ottiene di far comparire nomi falsi nella lista dei follower di qualcuno, e — quando i contenuti viaggeranno — di leggerne di destinati ai follower. La difesa è la stessa di sempre: si blocca, e il blocco è per chiave;
- **quindi il follow non è una prova di identità**, e nessuna funzione può trattarlo come tale;
- **e l'interfaccia non deve fingere il contrario**: un follower remoto si mostra con l'istanza da cui dice di venire, mai come un nome nudo che sembra verificato.

## Conseguenze

**Positive.** Il buco della promozione automatica è chiuso prima che esistesse del codice che lo sfruttasse. Le revoche sono vere per costruzione invece che per protocollo. E non c'è nessuno stato condiviso da riconciliare fra due macchine che si vedono a intermittenza: ognuna conserva il fatto che le serve.

**Negative.** Due liste invece di una, quindi due posti dove una cosa può mancare — e una lettura che fallisce è il modo in cui se ne accorge. Un follower inventato è possibile, dichiarato, e non risolvibile a questo livello. E finché i contenuti non viaggiano, il follow è una relazione che non produce ancora nulla di visibile: è una fondazione, e va detto invece di far finta che sia una funzione finita.

**Neutre.** Presenza, profili, connessioni fra istanze e il resto del protocollo non cambiano.

## Aggiornamento del 2026-08-21: la metà scoperta era di chi chiede

La decisione 2 dice che non c'è niente da sincronizzare, e regge. Quello che non diceva — e che il pilot ha trovato il primo giorno in cui due persone si sono seguite a vicenda fra due istanze — è **come chi ha chiesto viene a saperlo**.

Il meccanismo era già previsto e già costruito: **si richiede**. Rimandare un `segui` per un follow già accettato è lecito, non apre una seconda richiesta e restituisce lo stato che c'è; un test lo fissa dal lato di chi risponde fin dal 2026-08-20. Mancava dall'altra parte, e non nel codice: nell'**interfaccia**, che mostrava «richiesta in attesa» come un'etichetta invece che come un gesto. Il risultato, sul campo, è stato che due persone che si erano accettate a vicenda leggevano tutte e due «1 follower, 0 seguiti» — un conteggio giusto su uno stato che nessuno poteva più muovere.

**Perché il richiamo resta un gesto e non diventa un ciclo.** Rifiutare, qui, **cancella la riga**: non esiste uno stato «rifiutato», ed è coerente con il resto — non si conserva una decisione negativa su qualcuno. Ma ne discende che un richiamo automatico e periodico **farebbe rinascere all'infinito una richiesta respinta**, e la persona che l'ha respinta se la vedrebbe tornare per sempre. Quindi richiedere resta una cosa che fa chi ha chiesto, esattamente come ripremere «segui», e nessun timer la fa per lui.

Se un giorno quel comportamento non basterà, la cosa da riaprire è **questa**: uno stato «rifiutato» che sopravviva alla decisione, con il suo costo — conservare un no è conservare un dato su qualcuno che non ne ha chiesto la conservazione. Non è un dettaglio implementativo, ed è per questo che non è stato improvvisato scrivendo il codice.

## Quando riesaminare

- **Quando i contenuti viaggeranno**: è lì che la lista dei follower smette di essere un elenco e diventa il controllo d'accesso, e va riletta con quel peso addosso. È il lavoro di **M5**, aperto il 2026-08-21, e la decisione che lo governa è [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md).
- **Se «in attesa» diventasse un peso**: oggi si sblocca richiedendo, che è un gesto di chi ha chiesto. L'alternativa è uno stato «rifiutato» conservato, e va deciso con il suo costo davanti — vedi l'aggiornamento del 2026-08-21 qui sopra.
- Se le persone acquisteranno una chiave propria — con il client nativo, o con la chat di [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) — la decisione 4 va riaperta: allora un follow potrebbe essere firmato dalla persona, e i follower inventati sparirebbero.
- Se «in contatto» si rivelasse troppo stretto per qualcosa di legittimo, si allarga quel livello — non si torna a promuovere chi si promuove da solo.
