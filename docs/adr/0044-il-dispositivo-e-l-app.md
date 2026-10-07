# ADR 0044 — Il Dispositivo è l'app, e la Casa da fuori si raggiunge solo con lei

- Stato: **Proposed** — le quattro scelte di fondo sono del proprietario, il 2026-10-07 (§«Le scelte del proprietario»); resta da leggere e accettare il testo
- Data: 2026-10-07
- Proprietario: progetto ESTIA
- Riapre: [ADR 0004](0004-client-web-e-trasporto-sostituibile.md) nella sua prima metà («il primo client è web»), [ADR 0010](0010-client-web-spa-statica.md) nel ruolo del client web, e l'ordine «ESTIA 1.0 → le app» scritto in [`AGENTS.md`](../../AGENTS.md) e nella lapide di M7
- Non tocca: la seconda metà di [ADR 0004](0004-client-web-e-trasporto-sostituibile.md) — **il trasporto è uno strato sostituibile e l'API resta la stessa** — che qui diventa il meccanismo; [ADR 0003](0003-primo-contatto-in-rete-locale.md), che l'app rende più forte
- Va letta con: [ADR 0045](0045-la-rete-dei-relay-della-comunita.md), che decide da dove passa il collegamento quando il diretto non riesce

## Contesto

### Il caso che decide

Palu è a Milano, sul telefono, con la connessione dati. La sua Casa è un NAS a Campello, dietro il router di casa. Deve poterci entrare: leggere, scrivere, chattare. **Senza Tailscale, senza aprire il router, senza un server degli sviluppatori.**

Oggi non si può. Da fuori si entra solo con Tailscale ([`ACCESSO_DA_FUORI.md`](../ACCESSO_DA_FUORI.md)), che è un trasporto di prova: ogni membro apre un account con un'azienda terza, cioè la cosa che questo progetto esiste per rendere non necessaria. M4 doveva sostituirlo ed è ferma dal 2026-08-19, con l'ADR sul trasporto mai scritto.

E non è un caso raro. In un condominio il NAS sta sul router di **un** appartamento: le altre famiglie arrivano alla Casa **da fuori** anche abitando due piani sopra. «Rete locale» vuol dire soltanto: collegato allo stesso router del NAS.

### Perché il browser non può essere la risposta

Il browser abilita la crittografia (`crypto.subtle`, quindi MLS) **solo in un contesto sicuro**: HTTPS o `localhost` ([ADR 0027](0027-la-libreria-mls.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)). Su `http://192.168.1.4` la chat non funziona nemmeno a casa.

Quindi un browser che raggiunge la Casa da fuori deve arrivarci **in HTTPS con un certificato valido**, cioè con un nome di dominio e un'autorità di certificazione. È stata valutata la forma migliore di questa strada — una «porta» pubblica che inoltra il TLS senza aprirlo, con il certificato sul NAS, come fa Home Assistant Cloud — e ha un limite che non si toglie: **chi controlla il dominio può farsi rilasciare un certificato a nome tuo** e servire al browser un codice diverso. Si scopre (i registri di Certificate Transparency), non si impedisce.

Il proprietario l'ha scartata: **la Casa non deve essere raggiungibile dal web.** Da fuori si entra con l'app, dove l'identità è una chiave e nessuna autorità sta in mezzo.

### Che cosa c'è già

- La rete fra Case parla iroh dal 2026-08-20 ([ADR 0018](0018-federazione-fra-istanze-estia.md)): ci si trova **per chiave pubblica**, diretto quando i NAT si lasciano bucare, via relay altrimenti. iroh ha binding ufficiali **Swift e Kotlin**.
- Il dispositivo come portatore di chiavi esiste ([ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)), distinto dalla sessione ([ADR 0034](0034-distinzione-tra-dispositivo-fisico-e-sessione-di-login.md)), e un membro può averne più d'uno ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md)).
- Il primo contatto avviene in rete locale o con un invito che porta la chiave della Casa ([ADR 0003](0003-primo-contatto-in-rete-locale.md)).

Mancava il pezzo che li tiene insieme: **che cosa è un dispositivo**, e da dove passa.

## Le scelte del proprietario

Il 2026-10-07, in risposta a quattro domande:

1. **Il web resta solo in rete locale, e solo per amministrare** — installazione, pannello, backup. I membri usano l'app.
2. **L'app viene prima di ESTIA 1.0.** Senza, la Casa da fuori non si raggiunge, e una 1.0 che funziona solo in casa non è la 1.0.
3. **Anche sul PC**, non solo sul telefono.
4. **Un servizio push minimo è accettato**, a condizione che veda soltanto un «svegliati».

## Decisione

### 1. Quattro ruoli, una parola ciascuno

| Ruolo                                                                    | Che cos'è                                            | Dove sta                               | Chi lo controlla              |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------- | ----------------------------- |
| **Dispositivo**                                                          | L'app ESTIA installata                               | Telefono, PC                           | Il membro                     |
| **Casa** («istanza» nel codice)                                          | Il server ESTIA di una comunità, di qualunque misura | Il NAS o il mini-PC di chi la ospita   | L'amministratore              |
| **Nodo pubblico** ([ADR 0045](0045-la-rete-dei-relay-della-comunita.md)) | Un relay: passa pacchetti cifrati che non legge      | Una macchina raggiungibile da Internet | Chi lo ospita; n0 come ultimo |
| **Scoperta**                                                             | La rubrica: data una chiave, dove trovarla           | Oggi il DNS di n0                      | n0                            |

Una macchina può avere più di un ruolo — un server di un'associazione può ospitare una Casa **e** un Nodo pubblico — ma i ruoli restano distinti: chi ospita il relay non vede i contenuti della Casa accanto più di quanto li veda n0.

Le tre regole che reggono la tabella, e che erano già decise:

- **I contenuti stanno solo nelle Case** ([ADR 0043](0043-custodia-lato-mittente.md)).
- **Le chiavi dei messaggi stanno solo nei Dispositivi** ([ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md)).
- **Relay e scoperta non custodiscono niente**, ed è per questo che si sostituiscono.

### 2. Il Dispositivo è l'app installata

Non il telefono, non l'account: **l'installazione**. Custodisce, nella cassaforte del sistema (Secure Enclave, Keystore, portachiavi del sistema operativo sul PC):

- la **chiave del dispositivo** — chi è questo dispositivo;
- le **chiavi MLS** — la sua foglia in ogni conversazione;
- la **chiave di rete** — l'identità iroh con cui la Casa lo riconosce;
- la **chiave pubblica della propria Casa** — con chi deve parlare, imparata una volta.

Reinstallare l'app vuol dire essere **un dispositivo nuovo**, che un dispositivo già posseduto approva ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md), strada B). Il PC è un dispositivo come il telefono: chi usa ESTIA da tutti e due ha due foglie in ogni conversazione, che è esattamente il caso per cui 0040 esiste.

L'app **non custodisce contenuti**. Una cache per mostrare in fretta quello che si è già visto è ammessa; resta una copia di comodo, soggetta al ritiro di [ADR 0042](0042-come-mls-attraversa.md) §4 come la vista del client web oggi.

### 3. Un Dispositivo parla solo con la propria Casa

Mai con un'altra Casa, mai con un altro dispositivo. Quando Anna legge un post di Bruno, l'app chiede alla Casa di Anna, che visita quella di Bruno. È il disegno di oggi, e diventa una regola scritta: **un dispositivo si fida di una macchina sola.**

### 4. Il collegamento passa da iroh, per chiave

```
 App (Milano, dati mobili)
   │  si collega alla chiave della propria Casa
   ├── diretto, se i NAT si lasciano bucare ───────►  NAS (Campello)
   └── altrimenti attraverso un relay ─────────────►  stessa connessione, cifrata fra i due capi
```

- **Nessun dominio, nessun certificato, nessuna porta aperta.** L'identità è la chiave: un relay non può fingersi la Casa.
- **Un ALPN suo**, distinto da quello della rete fra Case ([ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md)): la Casa sa dalla connessione se sta parlando con un proprio dispositivo o con un'altra Casa, e le due porte non si confondono.
- **La stessa API di oggi**, portata su uno stream iroh invece che su una connessione HTTP. È la seconda metà di [ADR 0004](0004-client-web-e-trasporto-sostituibile.md) che si incassa: cambia il trasporto, non il contratto.
- **La Casa accetta solo dispositivi registrati.** L'handshake QUIC prova che chi bussa possiede la chiave; la Casa la confronta con quelle che ha ammesso. Una chiave sconosciuta su quell'ALPN non riceve niente — nemmeno la schermata d'ingresso.

| Chi bussa alla Casa               | Che cosa ottiene                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Un proprio dispositivo registrato | L'API dei membri                                                                                                                        |
| Un'altra Casa                     | Il protocollo fra Case, e da sconosciuta soltanto presentarsi ([ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md)) |
| Chiunque altro                    | Niente                                                                                                                                  |
| Un browser da fuori               | **Niente: non esiste una porta web su Internet**                                                                                        |

### 5. Il primo ingresso: un QR

È [ADR 0003](0003-primo-contatto-in-rete-locale.md), con un gesto migliore:

1. L'app **inquadra un QR** che porta la chiave della Casa — mostrato dal pannello in casa, o contenuto in un invito.
2. Manda alla Casa la propria chiave, sul collegamento appena aperto verso quella chiave.
3. Qualcuno dice di sì: l'amministratore o l'invito per il primo dispositivo, un dispositivo già posseduto per i successivi ([ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md)).
4. Da lì la Casa riconosce il dispositivo da ovunque.

La chiave della Casa passa dalla fotocamera, non dalla rete: chi vuole sostituirsi alla Casa deve sostituire il foglio.

### 6. Il web: in casa, e solo per amministrare

Il client web resta una SPA servita dalla Casa ([ADR 0010](0010-client-web-spa-statica.md)), **solo sulla rete locale e solo per l'amministrazione**: installazione, pannello, backup, rete, inviti. I membri non lo usano.

La conseguenza su HTTPS è voluta: il pannello non fa crittografia end-to-end e non ha bisogno di un contesto sicuro. La chat, che ne ha bisogno, vive nell'app.

**Fino a quando l'app non esiste, il client web resta il client dei membri** — compresa la chat MLS costruita il 2026-09-23 — con Tailscale come trasporto del pilot. Questo ADR non spegne niente: dice dove si va. Il client web per i membri si ritira quando l'app copre quello che fa, non prima.

### 7. Le notifiche: un «svegliati», e niente altro

Su iPhone, con l'app chiusa, l'unica strada per ricevere qualcosa sono le notifiche di Apple (APNs), e per mandarle serve la **chiave di chi pubblica l'app**. Una Casa non può averla. Quindi esiste un servizio che inoltra: il proprietario lo ha accettato, alle condizioni che seguono, che non sono rifiniture:

- **Il messaggio è vuoto.** Né contenuto, né mittente, né conversazione, né Casa nel corpo della notifica: solo «svegliati». L'app si sveglia, si collega alla propria Casa per chiave, e lì legge.
- **Non è obbligatorio.** Senza, l'app funziona: riceve quando la apri. Una Casa sceglie se usarlo.
- **Il token è per dispositivo e si revoca** con il dispositivo.
- **Che cosa vede, detto per intero:** che una certa Casa sveglia un certo dispositivo, quando, e quanto spesso. È il ritmo della vita di qualcuno, e va scritto a chi lo attiva come è scritto il battito in [ADR 0041](0041-le-istanze-si-tengono-d-occhio.md).

È l'unico componente che **gira necessariamente con la chiave di chi pubblica l'app**, quindi è il punto più vicino a «un server degli sviluppatori» che il progetto abbia mai ammesso. Regge su due fatti: non è **applicativo** (non conosce un solo contenuto, [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §4 nomina APNs/FCM fra le dipendenze dichiarabili) e non è **obbligatorio**. Chi ripubblica l'app con la propria chiave può ospitare il proprio.

Su Android la strada esiste senza nessuno in mezzo — UnifiedPush, autoospitabile — accanto a FCM. **La scelta concreta resta aperta** ed è quella elencata fra le decisioni aperte di [`AGENTS.md`](../../AGENTS.md): questo ADR fissa solo che cosa il servizio può vedere.

### 8. L'ordine: le app prima di ESTIA 1.0

L'ordine scritto il 2026-08-27 — «gate M6 → ADR 0039 → il taglio → M8 → il multi-dispositivo → ESTIA 1.0 beta → le app» — **non regge più**: se da fuori si entra solo con l'app, una 1.0 senza app funziona solo in casa. Le app diventano una milestone **prima** della 1.0, con un numero nuovo — M7 non si riusa.

Le tre precondizioni della lapide di M7 restano, e cambia il loro posto in fila:

1. **Lo spike sullo stack dell'app** — non più «React Native su MLS» soltanto. iroh ha binding Swift e Kotlin e non React Native; `ts-mls` non gira su React Native ([S1](../spike/S1-ts-mls-sotto-la-csp.md)). Un'ipotesi da misurare, non da adottare: **un nucleo in Rust** — iroh più una libreria MLS — condiviso da iOS, Android e PC, con l'interfaccia sopra. Lo spike deve provare anche che quella libreria MLS e `ts-mls` stanno nella **stessa conversazione**, perché per tutta la transizione dall'altra parte ci sarà ancora un browser.
2. **La decisione sulle notifiche** — ristretta dal §7 a una scelta di fornitore.
3. **L'ADR sul trasporto** — è questo, insieme ad [ADR 0045](0045-la-rete-dei-relay-della-comunita.md).

**Le app vengono prima di M8**, i gruppi — deciso dal proprietario il 2026-10-07. L'ordine diventa: **lo spike sullo stack → le app → M8 → ESTIA 1.0**. Il numero della milestone delle app si assegna quando la si apre; che sia più alto di 8 pur venendo prima non è un errore, è la regola per cui i numeri non si riusano.

**Il multi-dispositivo entra nella milestone delle app** — deciso dal proprietario lo stesso giorno. Con telefono e PC quasi ogni membro ha due dispositivi dal primo giorno: il meccanismo di [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md) — aggiungere la foglia a ogni conversazione, il sì da un dispositivo già posseduto, la revoca da ogni conversazione — non è più un passo dopo i gruppi, è una condizione perché l'app funzioni.

## Che cosa vede chi sta in mezzo

| Chi                             | Contenuti | Chi parla con chi                                            | Quando, quanto | Indirizzi IP                 |
| ------------------------------- | --------- | ------------------------------------------------------------ | -------------- | ---------------------------- |
| Relay (se il diretto non passa) | No        | Che la chiave del dispositivo parla con la chiave della Casa | Sì             | Sì                           |
| Scoperta (n0)                   | No        | Chi cerca quale chiave                                       | Sì             | Sì                           |
| Servizio push                   | No        | Quale Casa sveglia quale dispositivo                         | Sì             | Della Casa, non del telefono |
| Tailscale                       | —         | **Non c'è più**, una volta ritirato il pilot                 | —              | —                            |

## Conseguenze

**Positive.**

- Da Milano a Campello si entra **senza account presso terzi, senza dominio, senza toccare il router**.
- L'identità della Casa è una chiave presa da un QR: **nessuna autorità di certificazione** fra il membro e la sua Casa, che è la promessa di [ADR 0003](0003-primo-contatto-in-rete-locale.md) mantenuta anche fuori casa.
- La Casa **non espone niente di web a Internet**: la superficie d'attacco da fuori è un ALPN che risponde soltanto a chiavi registrate.
- La chat smette di dipendere dal contesto sicuro del browser.
- Telefono e PC fanno di [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md) il caso normale invece che l'eccezione.

**Negative, dette per intero.**

- **Tre app da costruire e mantenere**, firme, store, aggiornamenti. È il pezzo più costoso del progetto, ed è quello che [ADR 0004](0004-client-web-e-trasporto-sostituibile.md) aveva tolto dalla strada critica. Torna a starci.
- **La 1.0 si allontana.**
- **Entrare in ESTIA richiede di installare un'app.** Un link non basta più per i membri.
- **Il servizio push è un componente con la chiave di chi pubblica l'app.** Facoltativo e vuoto, ma esiste.
- **Il client web dei membri, appena passato a MLS, diventa transitorio.** Il lavoro del 2026-09-23 resta valido fino alla transizione e come banco di prova del protocollo, non come destinazione.

## Come si verifica

1. **Milano–Campello**: l'app su dati mobili entra nella Casa del pilot. Si registra se il collegamento è diretto o via relay, e il tempo di andata e ritorno.
2. **Una chiave sconosciuta non riceve niente** sull'ALPN dei dispositivi — nemmeno un errore che distingua «non registrato» da «non esiste».
3. **Nessuna porta web raggiungibile da fuori**: misurata dall'esterno, non dedotta dalla configurazione.
4. **Reinstallare l'app** produce un dispositivo nuovo, che entra solo con l'approvazione di uno già posseduto.
5. **Il corpo di una notifica**, catturato, non contiene nient'altro che il segnale.
6. **Stessa conversazione MLS** fra l'app e un browser, nei due versi.

## Quando riesaminare

- Se lo spike dice che nessuno stack porta iroh e MLS sulle tre piattaforme senza riscrivere tutto due volte.
- Se il collegamento dispositivo–Casa via relay risulta inutilizzabile sul campo per latenza o banda — è il caso in cui conterebbe la rete di [ADR 0045](0045-la-rete-dei-relay-della-comunita.md).
- Se i browser offrissero un modo di stabilire fiducia in una chiave senza autorità di certificazione: la ragione per cui il web è uscito da fuori casa cadrebbe.

## Fonti

Verificate il 2026-10-07.

- https://docs.iroh.computer/languages — binding ufficiali
- https://docs.iroh.computer/concepts/relays
- https://w3c.github.io/webappsec-secure-contexts/ — perché `crypto.subtle` vuole HTTPS
- `@number0/iroh` 1.1.0, `index.d.ts` — ultima versione pubblicata
