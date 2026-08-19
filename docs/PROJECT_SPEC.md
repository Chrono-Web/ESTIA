# ESTIA — Specifica tecnica di prodotto

## 1. Scopo del documento

Questo documento traduce il piano progettuale di ESTIA in requisiti utilizzabili da un coding agent. Descrive cosa deve fare il sistema e quali proprietà deve conservare; l'ordine di costruzione è definito in `IMPLEMENTATION_PLAN.md`.

## 2. Visione

ESTIA è un social network open source e self-hosted in cui l'unità di base è un'istanza ospitata su un NAS o mini-PC Linux, **in un luogo che appartiene a chi la amministra**: una comunità reale, una famiglia, o una persona sola. La revisione del 2026-08-16 di [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §11 mette al centro dove stanno i dati, non quante persone condividono l'istanza.

Uno stesso account può operare su tre superfici:

1. **Feed locale** — contenuti visibili ai membri dell'istanza, cronologici e non federati.
2. **Profilo** — contenuti che escono dall'istanza: verso le altre istanze ESTIA per costruzione, e verso il Fediverso solo se si adotta un dominio e si attiva ActivityPub ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)).
3. **Gruppi** — messaggistica privata e in tempo reale, anche tra membri di istanze differenti.

Le tre superfici condividono identità, sessioni, media e impostazioni, ma hanno confini di visibilità distinti.

## 3. Invarianti

Le seguenti proprietà non possono essere sacrificate per accelerare lo sviluppo:

- I dati applicativi dell'istanza sono conservati sull'hardware scelto dall'amministratore.
- Non esiste un database globale degli utenti gestito dagli sviluppatori.
- Il feed locale non viene federato e non deve lasciare l'istanza per funzioni ordinarie.
- I contenuti non si replicano su altre istanze: chi li legge da fuori li riceve **su richiesta** dall'istanza di origine, che resta l'unico posto in cui sono conservati ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)). ActivityPub, che è fatto di copie, è l'eccezione dichiarata e volontaria.
- Ogni contenuto possiede uno scope esplicito; il default è `local`.
- L'istanza deve poter essere installata e aggiornata senza Kubernetes.
- Le funzioni di sicurezza devono descrivere precisamente ciò che proteggono; nessuna UI deve suggerire E2E prima che l'E2E sia effettiva.
- Le decisioni di rete e crittografia devono essere sostituibili senza riscrivere il dominio sociale.
- La portabilità dell'identità e dei dati è un requisito di progetto, anche se viene implementata dopo il feed locale.

## 4. Confini della promessa «senza server centrali»

Il requisito corretto è:

> Nessun server applicativo globale obbligatorio gestito dagli sviluppatori e nessun contenuto conservato centralmente.

Il progetto può dipendere, in modo dichiarato e sostituibile, da:

- DNS e autorità di certificazione;
- APNs e FCM per le notifiche push;
- relay per attraversare NAT quando non esiste un percorso diretto;
- un control plane di rete self-hosted o comunitario;
- server remoti del Fediverso per i contenuti che l'utente rende pubblici.

Questi servizi non devono diventare proprietari dei contenuti locali né un punto applicativo obbligatorio controllato dal team ESTIA.

## 5. Modello di identità

Ogni utente appartiene a una `home instance` e possiede un identificatore stabile interno, che resta l'unico identificatore stabile del sistema — invariante 1 di [ADR 0002](adr/0002-activitypub-confine-non-schema.md).

Fuori dall'istanza si è raggiungibili in due modi, e solo il secondo costa un dominio:

| Rete            | Come si è indirizzati                                | Che cosa serve |
| --------------- | ---------------------------------------------------- | -------------- |
| **Rete ESTIA**  | Per **chiave pubblica** dell'istanza, più il profilo | Niente         |
| **ActivityPub** | `@nome@dominio`                                      | Un dominio     |

Un'istanza senza dominio non è quindi un'istanza senza federazione: è il caso normale ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)).

Requisiti iniziali:

- nome utente univoco nell'istanza;
- password memorizzate con Argon2id;
- sessioni multiple e revocabili per dispositivo;
- audit minimale degli eventi amministrativi;
- inviti con scadenza, uso singolo o riutilizzabili;
- ruoli `instance_admin`, `instance_moderator`, `member`;
- nessuna dipendenza dall'identificatore ActivityPub come chiave primaria del database.

Il modello deve poter aggiungere in seguito URI ActivityPub, chiavi di firma e migrazione `Move` senza cambiare le identità interne.

## 6. Scope dei contenuti

| Scope       | Destinatari                          | Come esce dall'istanza                                                                              |
| ----------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `local`     | Membri dell'istanza                  | Mai                                                                                                 |
| `followers` | Follower locali e remoti autorizzati | Servito **su richiesta** ai follower approvati sulla rete ESTIA; con ActivityPub attivo, consegnato |
| `public`    | Chiunque                             | Servito su richiesta sulla rete ESTIA; con ActivityPub attivo, consegnato al Fediverso              |

Ogni API che crea o modifica un contenuto deve richiedere o applicare esplicitamente lo scope. L'assenza del valore equivale a `local`, mai a `public`.

La differenza fra le due colonne di destra non è di parole: **servire su richiesta** lascia il contenuto sull'istanza di origine, che può smettere di rispondere; **consegnare** ne produce una copia altrove, che non torna indietro. È la ragione per cui gli scope non cambiano quando si attiva ActivityPub, ma cambia che cosa comporta usarli.

## 7. Feed locale — primo prodotto implementato

Funzioni richieste per il primo vertical slice:

- creazione di post testuali;
- caricamento di una o più immagini;
- commenti;
- timeline cronologica e paginata;
- cancellazione logica e moderazione;
- autorizzazione basata sull'appartenenza all'istanza;
- limiti di dimensione e tipo dei media configurabili;
- metadati sufficienti per futura esportazione e federazione.

Non appartengono al primo vertical slice:

- video;
- repost;
- ranking algoritmico;
- feed follower;
- profili pubblici;
- ricerca federata;
- gruppi e messaggistica;
- notifiche push complete.

## 8. Server d'istanza

Il primo server è un monolite modulare. Deve includere moduli separati nel codice per configurazione, health, identità, inviti, sessioni, post, commenti, media e amministrazione, senza distribuirli in container applicativi distinti.

Requisiti operativi:

- esecuzione su `linux/amd64` e `linux/arm64`;
- container non-root;
- filesystem e database su volumi espliciti;
- migrazioni ripetibili;
- health check di liveness e readiness;
- arresto ordinato;
- logging JSON strutturato;
- backup e restore documentati e testabili;
- limiti di risorse configurabili;
- configurazione mediante variabili d'ambiente e file montabili;
- nessuna telemetria remota predefinita.

## 9. Storage e media

Il default è storage locale. Il codice applicativo usa un'interfaccia di storage con operazioni minime: scrittura atomica, lettura, esistenza, cancellazione e metadati.

La prima versione supporta immagini e thumbnail. Il transcoding video con `ffmpeg`, le code persistenti e storage S3-compatible vengono aggiunti solo quando richiesti da una milestone.

Il percorso dei file non deve dipendere dal nome originale caricato e non deve permettere path traversal. MIME dichiarato, contenuto effettivo, dimensione e quota devono essere verificati.

## 10. Rete privata

L'obiettivo è rendere l'istanza privata non esposta direttamente a Internet e accessibile solo da dispositivi autorizzati.

Il piano originario indica WireGuard e Headscale, ma questa combinazione richiede una decisione ulteriore: Headscale è un control server per client Tailscale, non un gestore generico di configurazioni WireGuard. Inoltre Headscale deve essere raggiungibile dai client, condizione non garantita se risiede sullo stesso NAS dietro CGNAT.

La scelta viene quindi sospesa fino al completamento di `ADR 0001`. Il dominio applicativo non deve dipendere da una specifica implementazione della rete privata.

## 11. Sicurezza

Il modello target distingue:

1. **Rete** — accesso al servizio soltanto da dispositivi autorizzati.
2. **Dati a riposo** — cifratura del volume o del database e backup cifrati.
3. **Messaggi E2E** — cifratura end-to-end per DM e gruppi, prevista con MLS dopo uno spike dedicato.

Il feed locale è leggibile dal server che lo ospita. Le chat non possono essere definite end-to-end finché le chiavi non risiedono esclusivamente sui dispositivi destinatari.

Baseline applicativa:

- Argon2id per le password;
- token di sessione revocabili e non registrati nei log;
- rate limiting sugli endpoint sensibili;
- autorizzazione testata negativamente;
- CSRF/CORS/cookie policy documentate in base al client;
- segreti caricati dall'ambiente o da file protetti;
- dipendenze bloccate da lockfile e scansione periodica;
- threat model aggiornato quando cambia un confine di fiducia.

## 12. ActivityPub

È la superficie **opzionale**, e l'unica fatta di copie: ciò che esce di qui viene archiviato su server altrui ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)). Richiede un dominio, e chi non lo vuole resta comunque federato con le altre istanze ESTIA.

Arriva dopo il feed locale, e il dominio deve conservare:

- identificatori stabili;
- autore e home instance;
- scope e destinatari;
- timestamp di creazione, modifica e cancellazione;
- relazioni tra post, commenti e media;
- capacità di associare URI e firme federate in seguito.

L'implementazione futura include WebFinger, actor, inbox/outbox, HTTP Message Signatures, code persistenti, retry idempotenti, deduplicazione e strumenti anti-abuso. Mastodon e Pixelfed sono i primi target di interoperabilità. L'interoperabilità con Threads deve essere verificata al momento della relativa milestone e non assunta dal modello interno.

## 13. Chat e gruppi

Chat e gruppi non fanno parte del primo MVP infrastrutturale. Quando inizieranno:

- il motore dovrà supportare ordering, riconnessione e sincronizzazione degli eventi mancanti;
- il modello di identità resterà quello ESTIA;
- le DM non verranno presentate come private rispetto all'amministratore prima dell'E2E;
- la scelta MLS e i binding mobili saranno oggetto di ADR e proof of concept;
- i gruppi inter-istanza richiederanno una topologia pubblica o di peering esplicita.

## 14. Portabilità

Ogni entità persistente deve poter essere esportata senza dipendere da dettagli interni non documentati. L'export futuro comprende profilo, post, commenti, media, relazioni sociali, impostazioni e appartenenze ai gruppi nei limiti del consenso degli altri partecipanti.

Il formato e la migrazione ActivityPub `Move` saranno definiti in una milestone dedicata. Finché ciò non avviene, evitare chiavi e percorsi che rendano impossibile cambiare home instance.

## 15. Requisiti non funzionali iniziali

- Installazione riproducibile da un clone pulito.
- Avvio mediante Docker Compose.
- Build multi-arch o almeno build verificabile per entrambe le architetture target.
- API versionate o compatibilità esplicitamente gestita.
- Test unitari e di integrazione eseguibili senza servizi cloud.
- Backup e ripristino testati prima dell'uso con dati reali.
- Nessun requisito di Kubernetes, Kafka, Redis o object storage nel primo vertical slice.
- Prestazioni adeguate a decine o poche centinaia di membri per istanza; ottimizzazioni distribuite rinviate a misure reali.

## 16. Fuori perimetro fino a nuova milestone

- stories;
- marketplace;
- eventi;
- analytics comportamentali;
- feed algoritmico;
- pubblicità;
- governance automatizzata;
- alta disponibilità multi-NAS;
- compatibilità Matrix;
- bridge verso altri messenger;
- feature parity con WhatsApp, Discord o Instagram.
