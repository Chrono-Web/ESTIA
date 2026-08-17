# ADR 0017 — La scoperta sulla rete locale la fa il NAS, non ESTIA

- Stato: **Accepted**
- Data: 2026-08-17
- Proprietario: progetto ESTIA
- Chiude: la voce «scoperta dell'istanza sulla rete locale» di M3, ereditata da M1.3
- Attua: [ADR 0003](0003-primo-contatto-in-rete-locale.md) requisito 2

## Contesto

[ADR 0003](0003-primo-contatto-in-rete-locale.md) chiede che un'istanza si trovi sulla rete locale **con un nome comprensibile**. Oggi la si raggiunge a `http://192.168.1.42:3000`: un indirizzo da farsi dire, da annotare, e che cambia se il router riassegna gli indirizzi.

La voce è stata spostata da M1.3 a M3 con una motivazione precisa — «richiede rete host sotto Docker, quindi va decisa insieme alla topologia di installazione» — ed è rimasta l'ultima cosa di M3 che non dipenda da hardware altrui.

## Che cosa serve davvero, guardando chi ne soffre

Vale la pena separare tre persone, perché hanno bisogni diversi e solo una ha un problema.

**Chi installa** ha bisogno dell'indirizzo una volta sola, e ce l'ha davanti: lo legge dal pannello del NAS mentre configura il container.

**Chi viene invitato** non cerca niente. Riceve un link e lo apre — e dal 2026-08-17 quel link è completo, costruito dall'istanza con l'indirizzo da cui l'amministratore la sta guardando. La scoperta non c'entra.

**Chi torna domani** è l'unico caso vero: ha un segnalibro su un indirizzo numerico, e se quell'indirizzo cambia il segnalibro muore.

Il bisogno, quindi, è **un nome stabile**, non una scoperta.

## Le misure che hanno deciso

**Il multicast attraversa il bridge di Docker fra container, e non arriva alla rete di casa.** Provato il 2026-08-17: due container sulla stessa rete Docker definita dall'utente si scambiano pacchetti su `224.0.0.251:5353` senza alcuna configurazione. Il confine non è il bridge, è il passaggio dal bridge alla rete fisica, che è instradato e non commutato.

Ne segue che un responder mDNS dentro un container **pubblicherebbe verso nessuno**: i telefoni di casa non lo sentirebbero. Per sentirlo servirebbe mettere il container sul dominio di broadcast della LAN, cioè `network_mode: host` oppure una rete `macvlan`.

## Il prezzo di `network_mode: host`, che è la parte che conta

Non è una riga di configurazione, è un cambio di topologia per tutti:

- **Sparisce la pubblicazione delle porte.** `ports:` viene ignorato, il processo occupa direttamente una porta del NAS, e il conflitto con qualunque altro servizio smette di essere gestibile dal file di configurazione.
- **Sparisce il confine di rete del container.** [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §2 dice che una rete di casa **non è una rete fidata**: ci sono telecamere, televisori, ospiti. Oggi ESTIA sta dietro un bridge; con la rete host starebbe _dentro_ quella rete, e raggiungerebbe direttamente tutto ciò che il NAS raggiunge, i servizi in ascolto sul suo loopback compresi. Su un NAS, che di servizi ne ospita parecchi, è un allargamento reale della superficie.
- **La guida si biforca.** `network_mode: host` e `ports:` si escludono, quindi servirebbero due file di configurazione e due percorsi di installazione da mantenere e da spiegare.
- **Chi sviluppa vedrebbe un'altra cosa.** Su Docker Desktop la rete host è emulata dentro una VM e non si comporta come su Linux: il percorso provato in sviluppo non sarebbe quello dell'installazione reale.

## E il nome, intanto, esiste già

**Un NAS pubblica il proprio nome da sé.** Synology e QNAP lo fanno con Bonjour, UGREEN e i mini-PC Linux con Avahi, TrueNAS pure. Verificato il meccanismo sulla macchina di sviluppo: `HAL-9014.local` viene pubblicato dal sistema e risolto da chiunque sulla stessa rete, senza che nessuna applicazione faccia niente.

Quindi `http://nome-del-nas.local:3000` funziona **oggi, senza scrivere una riga**, e dà entrambe le cose che servivano: un nome comprensibile e la sopravvivenza a un cambio di indirizzo.

## Decisione

**ESTIA non pubblica un proprio nome mDNS.** La scoperta sulla rete locale è delegata al sistema che ospita l'istanza, che lo fa già, e la documentazione la insegna invece di reimplementarla.

Il guadagno che resterebbe da un responder nostro — che il nome dica «estia» invece del nome del NAS, e che l'istanza compaia negli elenchi dei servizi Bonjour — è estetico, e non paga il prezzo qui sopra.

Non viene nemmeno spedito **come opzione**. Un percorso opzionale che non consigliamo è comunque una dipendenza da mantenere, una configurazione da documentare e un modo in più in cui un'installazione può differire da un'altra; `AGENTS.md` chiede di non ampliare il perimetro quando l'interfaccia minima basta, e qui l'interfaccia minima è già in mano all'amministratore.

## Che cosa cambia in pratica

1. [`INSTALLAZIONE.md`](../INSTALLAZIONE.md) insegna a raggiungere l'istanza **prima** con il nome del NAS e poi, come ripiego, con l'indirizzo numerico.
2. La stessa guida consiglia di **riservare l'indirizzo del NAS** nel router, perché è la soluzione che copre anche le reti dove il nome non funziona.
3. Il link d'invito continua a portare l'indirizzo da cui l'amministratore sta guardando: se lui usa il nome, il link contiene il nome.

## Che cosa questa decisione non copre

**Le reti dove il multicast è filtrato.** Alcuni router isolano i client fra loro, e alcune reti aziendali bloccano mDNS: lì nessun nome `.local` funziona, né il nostro né quello del NAS. Il ripiego è l'indirizzo riservato.

**I NAS che non pubblicano il proprio nome.** Se ne esistono, l'amministratore se ne accorge subito — il nome non risolve — e usa l'indirizzo. Non è un caso che valga un responder nostro: è un caso che vale una riga nella tabella dei sintomi.

## Quando riesaminare

- Se il pilot mostrasse che il nome del NAS non funziona in un numero significativo di case, la misura direbbe che la premessa è falsa e la decisione andrebbe riaperta — misurando, non ipotizzando.
- Se M4 portasse l'istanza a essere raggiungibile da fuori, il nome verrebbe da lì e questa decisione diventerebbe irrilevante invece che sbagliata.
- Se un giorno esistesse un client ESTIA nativo, la scoperta dei servizi tornerebbe utile per davvero — ma la farebbe il client cercando, non l'istanza gridando, e sarebbe un'altra decisione.
