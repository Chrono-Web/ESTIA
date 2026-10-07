# ADR 0045 — La rete dei relay è della comunità, e n0 resta l'ultima spiaggia

- Stato: **Proposed** — riapertura decisa dal proprietario il 2026-10-07 («riapriamo e correggiamo, la visione resta identica, priorità sicurezza»); i punti 3, 4 e 6 della decisione sono **proposte da confermare**
- Data: 2026-10-07
- Proprietario: progetto ESTIA
- Riapre: [ADR 0018](0018-federazione-fra-istanze-estia.md) §«I relay pubblici di n0 sono accettati»
- Non tocca: la gerarchia di ADR 0018 — **il diretto resta la strada, il relay il ripiego** — e il vincolo «l'installazione di una Casa non cresce di un passo»
- Va letta con: [ADR 0044](0044-il-dispositivo-e-l-app.md), che fa passare dai relay anche il collegamento fra un dispositivo e la sua Casa

## Contesto

### Che cosa aveva deciso ADR 0018, e su quale premessa

Il 2026-08-20 i relay pubblici di n0 sono stati accettati come **compromesso dichiarato**, con un argomento preciso: il relay è l'ultima spiaggia, ed è **la garanzia che la connessione arriva comunque**. Il relay autoospitato era escluso perché vuole una macchina raggiungibile, cioè una porta aperta, cioè il passo che ESTIA non chiede a nessuno.

### Le tre cose che quella premessa non reggono più

1. **n0 non offre quella garanzia.** La documentazione di iroh, letta il 2026-10-07, dice che i relay pubblici **limitano il traffico per prevenire abusi, non hanno garanzie di disponibilità né di prestazioni, e sono condivisi globalmente**: li raccomanda per sviluppo e prova, e per la produzione vende relay condivisi o dedicati. Una garanzia appoggiata su un servizio che si dichiara da sviluppo non è una garanzia.
2. **Il relay non è l'eccezione.** Il 2026-08-20, fra due linee domestiche italiane, il diretto **non è riuscito in nessuno dei cinque tentativi**. E il traffico che passa di lì è cresciuto: un battito ogni cinque minuti ([ADR 0041](0041-le-istanze-si-tengono-d-occhio.md)), una chat aperta che rilegge le altre Case ogni dieci secondi ([ADR 0042](0042-come-mls-attraversa.md)), e da [ADR 0044](0044-il-dispositivo-e-l-app.md) **ogni membro fuori casa**.
3. **I documenti si contraddicevano.** [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11 dice che «una rete che nessuno può spegnere con una decisione aziendale» vale **solo** con scoperta su una DHT senza proprietario e **relay molti, ospitabili da chiunque**. [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) la chiamava condizione di adozione. ADR 0018 accettava n0. E il codice ([`endpoint.ts`](../../apps/core-api/src/federation/endpoint.ts)) chiama `applyN0()`: relay **e** scoperta di n0. Il proprietario ha scelto: **la visione resta identica**, si corregge la decisione.

### Perché una Casa non può fare da relay

È la prima idea, ed è giusta nello spirito: ogni Casa aiuta la rete. Ma un relay serve proprio quando due macchine non si lasciano raggiungere, quindi deve stare dove **tutti** lo raggiungono. La guida al relay autoospitato di iroh chiede una macchina raggiungibile da Internet, un **dominio**, le porte **80 e 443** e un certificato Let's Encrypt.

Un NAS dietro un router non riceve connessioni; dietro **CGNAT** — l'operatore che condivide un indirizzo pubblico fra molti clienti, frequente sulla fibra di alcuni operatori, sulle linee FWA e sempre sulla rete mobile — non le riceve **nemmeno aprendo il router**, perché il blocco sta in centrale. E la regola di ESTIA è che chi installa una Casa non tocca il router.

### Che cosa c'è già nel binding

`@number0/iroh` 1.1.0, l'ultima versione pubblicata, permette una **mappa di relay propria** (`RelayMode.custom`, `RelayMap`) e di aggiungere o togliere relay **a istanza accesa** (`insertRelay`, `removeRelay`). La sostituibilità a caldo promessa da ADR 0018 è vera nell'API.

**La scoperta no.** Il binding offre soltanto tre preset — n0, minimale, n0 senza relay — e nessuna opzione per la DHT Mainline. Oggi una Casa raggiungibile con la sola chiave è una Casa che usa il DNS di n0.

## Decisione

### 1. Il Nodo pubblico della comunità

Un ruolo nuovo, accanto a Dispositivo e Casa ([ADR 0044](0044-il-dispositivo-e-l-app.md) §1): una macchina **raggiungibile da Internet** che fa girare un relay iroh. La ospita **chi può**: un'associazione, un circolo, un hackerspace, un comune, una biblioteca, un volontario con un server o con una linea senza CGNAT e la porta aperta.

È lo stesso principio di un server di gioco: chi lo apre sa farlo, e chi lo usa non configura niente. Non contraddice la regola sulla rete, che vale per **chi installa una Casa** e resta intatta: ospitare un Nodo pubblico è una scelta in più, mai un requisito.

Un relay passa soltanto pacchetti, quindi una macchina sola ne serve molte: di Nodi pubblici ne servono **pochi, sparsi e indipendenti**, non uno per condominio.

Si distribuisce come immagine propria accanto a quella della Casa, costruita sull'immagine ufficiale `n0computer/iroh-relay` (iroh: `MIT OR Apache-2.0`, compatibile con l'AGPL — da riverificare sulla versione che si adotta).

### 2. La mappa di una Casa: i relay adottati, e n0 per ultimo

Ogni Casa ha una mappa di relay: quelli che il suo amministratore ha adottato, e **n0 sempre in fondo, mai tolto**. n0 smette di essere la garanzia e torna a essere quello che sa essere: l'ultima spiaggia quando tutto il resto tace.

La Casa tiene d'occhio i relay adottati con lo stesso ritmo del battito ([ADR 0041](0041-le-istanze-si-tengono-d-occhio.md)): se uno sparisce, la connessione ripiega sul successivo e **il pannello dice quale relay è in uso**, come già dice se un collegamento è diretto o via relay.

### 3. Come un relay arriva in una Casa — _da confermare_

**Proposta: lo suggerisce una Casa amica, lo adotta l'amministratore.**

- Una Casa con cui c'è già un rapporto può far sapere quale relay usa, e chi lo gestisce. Nel pannello: «la Casa di Marco usa il relay del Circolo, gestito da Luca».
- L'amministratore lo adotta **con un gesto**. Mai in automatico.
- In alternativa si incolla o si inquadra l'indirizzo di un relay a mano.

Perché mai in automatico: un relay che una Casa adotta come proprio diventa il posto dove **gli altri la cercano**. Un relay ostile non legge niente, ma può lasciar cadere tutto — e rendere irraggiungibile una Casa senza che se ne accorga. Una Casa compromessa che lo suggerisce non deve poterlo imporre.

### 4. Il relay è aperto, con limiti — _da confermare_

**Proposta: aperto a chiunque, con limiti di connessioni e di banda** che l'operatore regola.

L'alternativa — «solo Case ESTIA» — suona più sicura e non lo è. Il relay vede **chiavi**, non Case: per ammettere soltanto quelle conosciute dovrebbe ricevere l'elenco di chi può parlare con chi, cioè **il grafo sociale** di tutte le Case che lo usano, che è l'enumerazione vietata da [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md). Senza quell'elenco, chi vuole raggiungere una Casa servita da quel relay verrebbe respinto senza una ragione visibile.

Il controllo d'accesso di un relay protegge **la banda di chi lo ospita**, non la riservatezza dei membri: quella la tiene la cifratura fra i due capi, in ogni caso. I limiti bastano al primo scopo.

### 5. L'operatore lo gestisce da ESTIA

Chi ospita un Nodo pubblico lo collega alla **propria Casa** come si installa ESTIA: un codice dai log, incollato nel pannello. Da lì, nelle impostazioni:

- una **guida** — dominio, porte, certificato, e che cosa vedrà e che cosa no — scritta per chi sa aprire un server, non per chi installa una Casa;
- i **limiti** di banda e di connessioni;
- lo **stato**: quanto traffico passa, quante Case lo usano come relay principale.

**Nessun elenco di chi parla con chi.** Il relay quell'informazione la vede; l'interfaccia di ESTIA non la raccoglie, non la conserva e non la mostra.

### 6. La porta aperta, facoltativa — _da confermare_

Basta che **una** delle due macchine sia raggiungibile perché il diretto passi, anche se l'altra è dietro CGNAT. Ogni Casa raggiungibile toglie il relay a tutte quelle che le parlano.

**Proposta, a tre livelli, nessuno obbligatorio:**

| Livello | Chi          | Che cosa                                                                                                                  |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 0       | Tutti        | Niente. Funziona sempre, a volte via relay                                                                                |
| 1       | Automatico   | iroh prova da solo la mappatura delle porte (UPnP, NAT-PMP, PCP) dove il router la permette. Da verificare nel binding    |
| 2       | Chi sa farlo | Il pannello, **solo se i collegamenti passano per relay**, offre una guida per aprire una porta UDP — mai il pannello web |

Il livello 2 non viola la regola sulla rete per la stessa ragione del §1: è un'offerta a chi la vuole, e l'installazione resta quella di sempre.

### 7. La scoperta: resta di n0, e lo diciamo

La DHT chiesta da [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11 **non è raggiungibile dal binding Node**. Finché non lo è, la scoperta resta il DNS di n0, e la frase della visione è vera **a metà**: i relay non hanno più un padrone solo, la rubrica sì.

Due strade, nessuna scelta qui: chiedere a monte che il binding esponga la scoperta, o costruire un binding proprio sul crate Rust. La seconda è un modulo nativo nostro, cioè la deroga di ADR 0018 §«La deroga sui moduli nativi» fatta da noi invece che da chi pubblica il pacchetto.

## Che cosa vede chi

|                      | Legge i contenuti? | Può fingersi una Casa? | Vede chi parla con chi, e quando? | Sa a chi corrispondono le chiavi?                    |
| -------------------- | ------------------ | ---------------------- | --------------------------------- | ---------------------------------------------------- |
| Relay di n0          | No                 | No                     | Sì                                | No, di norma                                         |
| Relay della comunità | No                 | No                     | Sì                                | **Forse sì**: chi lo ospita può conoscere le persone |
| Scoperta (n0)        | No                 | No                     | Chi cerca chi                     | No, di norma                                         |

La riga del relay della comunità è il prezzo vero di questa decisione, ed è il contrario dell'intuizione: **un operatore vicino conosce le persone**, quindi i metadati che vede valgono di più dei metadati che vede un'azienda lontana. Va detto all'amministratore **nel momento in cui adotta** un relay, con il nome di chi lo gestisce.

## Conseguenze

**Positive.**

- La frase di [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11 torna vera per la metà relay: nessuna decisione aziendale da sola spegne le connessioni fra Case dietro CGNAT.
- La stessa infrastruttura serve i due collegamenti — Casa con Casa, dispositivo con Casa ([ADR 0044](0044-il-dispositivo-e-l-app.md)) — invece di due trasporti diversi.
- Chi installa una Casa non fa un passo in più.

**Negative.**

- **Senza volontari, niente cambia**: la rete è buona quanto chi la ospita. Il primo Nodo pubblico va trovato prima di costruire l'interfaccia per adottarlo.
- Un'immagine in più da mantenere, una guida in più da tenere vera.
- Un operatore vicino vede metadati riconoscibili (§«Che cosa vede chi»).
- La scoperta resta di n0 (§7).

## Prima di costruire

1. **Due Case con relay principali diversi si raggiungono.** Per come iroh pubblica l'indirizzo, chi chiama dovrebbe raggiungere il relay dell'altro anche se non è nella propria mappa: va provato sul filo vero, non dedotto.
2. **I limiti dell'`iroh-relay`** — connessioni e banda — esistono come configurazione nella versione che si adotta.
3. **Il livello 1 del §6**: il binding lascia attiva la mappatura delle porte, e su quale porta.
4. **Il primo Nodo pubblico**, ospitato da qualcuno, collegato a due Case vere.

## Documenti da aggiornare all'accettazione

- [ADR 0018](0018-federazione-fra-istanze-estia.md): annotata in testa, il 2026-10-07, che §«I relay pubblici di n0 sono accettati» è riaperta qui.
- [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §1: la riga sul **trasporto fra Case** (relay e scoperta), che mancava e descrive già oggi n0 — aggiunta il 2026-10-07 perché è vera indipendentemente da questa decisione.
- [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §11: non cambia.

## Fonti

Verificate il 2026-10-07.

- https://docs.iroh.computer/concepts/relays — limiti dei relay pubblici
- https://docs.iroh.computer/deployment/dedicated-infrastructure
- https://docs.iroh.computer/iroh-services/relays/self-hosted — requisiti del relay autoospitato
- https://github.com/n0-computer/iroh/tree/main/iroh-relay — controllo d'accesso (`everyone`, liste, token, richiamo HTTP)
- `@number0/iroh` 1.1.0, `index.d.ts` — `RelayMode`, `RelayMap`, `insertRelay`; preset di scoperta
