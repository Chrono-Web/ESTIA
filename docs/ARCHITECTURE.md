# Architettura iniziale di ESTIA

## 1. Strategia

ESTIA parte come monolite modulare distribuito in un solo container applicativo. Database, file e configurazioni restano su volumi dell'istanza. I componenti di rete — trasporto remoto, rete fra istanze, eventuali relay — sono separati e introdotti soltanto dalle milestone che li richiedono.

```mermaid
flowchart TD
    Local[Browser in rete locale] --> Core[Core API]
    Remote[Dispositivo fuori casa] -. trasporto remoto, M4 .-> Core
    Core --> DB[(SQLite)]
    Core --> Media[(Media locali)]
    Core -. chiede e legge .-> Peer[Altra istanza ESTIA]
    Peer -. chiede e legge .-> Core
    Core -. opzione, per chi ha un dominio .-> AP[ActivityPub]
```

Il diagramma esprime dipendenze logiche, non container già autorizzati. Le due frecce fra istanze vanno in entrambe le direzioni e dicono la stessa cosa due volte: **si chiede e si legge**, non si consegna e si archivia (§7).

## 2. Struttura prevista della repository

```text
.
├── apps/
│   ├── core-api/          # Fastify, dominio e API dell'istanza
│   ├── web/               # client React, servito dall'istanza (ADR 0010)
│   └── mobile/            # React Native, aggiunto dopo lo spike di rete
├── packages/
│   ├── config/            # Parsing e validazione condivisa
│   ├── contracts/         # Schemi API e tipi condivisi
│   └── testing/           # Fixture e helper di test
├── infra/
│   ├── compose/           # Deployment di riferimento
│   └── network-lab/       # Esperimenti ripetibili su NAT e control plane
├── docs/
│   ├── adr/               # Architecture Decision Records
│   ├── PRODUCT_VISION.md
│   ├── PROJECT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── RECONCILIATION.md
├── AGENTS.md
└── README.md
```

`mobile` viene creata solo quando la milestone che la richiede diventa attiva. `network-lab` è materiale dello spike M0.2, ormai chiuso: va rimosso o riconvertito quando riprende il lavoro sul trasporto (M4).

## 3. Core API

Tecnologia prevista: Node.js Active LTS, TypeScript strict e Fastify.

Il core deve mantenere confini di modulo espliciti:

- `config`
- `health`
- `instance`
- `identity`
- `invites`
- `sessions`
- `feed`
- `comments`
- `media`
- `moderation`
- `admin`

Le chiamate tra moduli avvengono tramite servizi o porte interne, non importando direttamente tabelle o dettagli di persistenza di un altro modulo.

### I contenuti di un'altra istanza si visitano

Dal 2026-08-21 il feed della lente «rete» ha due sorgenti ([ADR 0023](adr/0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md)): la tabella dei post di casa, autorizzata dalla lista `followers`, e le bacheche delle istanze che i membri seguono, prese da `following` al momento della lettura. **Niente di ciò che arriva viene scritto**: non c'è una tabella dei post remoti, e non è una funzione mancante — è la decisione 2 di [ADR 0018](adr/0018-federazione-fra-istanze-estia.md), ed è ciò che rende vera la promessa che una cancellazione cancella davvero.

Le due metà stanno in `feed/rete.ts` e si parlano con il protocollo attraverso due porte, come impone §3: `BoardDirectory` è ciò che il protocollo può chiedere alle bacheche di casa, `BachecaClient` è ciò che il feed chiede alla rete. Nessuna delle due lascia passare una tabella.

Il permesso non è un argomento di quelle funzioni: sta dentro la **prova della coppia**, un segreto coniato da chi è seguito quando accetta e conservato in chiaro solo da chi lo presenta. Ne discende che togliere un follower spegne la lettura alla richiesta successiva, senza spedire niente a nessuno.

### Thread dei commenti

Un commento è un’unità completa (autore, testo, like, moderazione), non una riga sotto il post. `parentId` punta al **commento immediato** a cui si risponde; l’albero è ricorsivo. È la stessa forma che ActivityPub esprimerà con `inReplyTo` (§9): non un secondo modello, e non un livello unico schiacciato sulla radice. Nel client web la rail sull’avatar e le linee verticali sono solo presentazione: nel feed un solo commento resta inline, due o più diventano «Mostra N risposte» verso `/p/:id`.

L'API usa schemi runtime e produce OpenAPI dalla stessa fonte quando possibile. Gli errori hanno un formato stabile con codice macchina, messaggio sicuro e correlation ID.

## 4. Persistenza

SQLite è il default per le istanze piccole. La scelta di driver e query builder deve essere validata su container `linux/amd64` e `linux/arm64`, perché moduli Node nativi possono complicare la distribuzione su NAS.

Principi:

- migrazioni forward versionate;
- transazioni nei confini di caso d'uso;
- foreign key attive;
- indici derivati da query reali;
- date in UTC;
- ID interni non ricavati da username o dominio;
- soft delete dove la federazione futura richiederà tombstone;
- repository di persistenza sostituibili nei test senza duplicare la logica di dominio.

PostgreSQL non deve condizionare il primo schema. Verrà aggiunto solo se esiste un requisito reale per istanze più grandi.

## 5. Storage media

Il core usa una porta `MediaStorage` e un adapter filesystem iniziale. Database e storage devono mantenere consistenza mediante stato esplicito dell'upload e cleanup dei file orfani.

La pipeline, come è stata realizzata in M2.3. L'ordine non è di comodo: ogni passo protegge quello dopo, e il tipo e la misura vanno stabiliti prima che qualcosa allochi memoria.

1. riconosce il tipo **dai byte**, non dall'estensione né dall'intestazione dichiarata;
2. legge le dimensioni dall'intestazione, **senza decodificare**, e rifiuta oltre soglia in byte e in pixel;
3. applica la quota del membro prima di scrivere;
4. decodifica e produce la miniatura, che è anche la prova che il file è un'immagine;
5. toglie dal file i metadati che non servono a disegnarlo, Exif compreso;
6. genera un identificatore server-side, da cui — e solo da cui — deriva il percorso;
7. scrive in un file temporaneo e lo rinomina, così nessuno legge un'immagine a metà;
8. registra misure e pesi nel database, che è ciò che la quota legge;
9. elimina i temporanei, e i file già scritti, se qualcosa fallisce.

Lo stato esplicito dell'upload è il legame con il post: un'immagine caricata resta **orfana** finché un post non la reclama, e una spazzata periodica raccoglie quelle che nessuno ha usato. Il post e le sue immagini si scrivono in una sola transazione.

`ffmpeg`, code distribuite e storage S3 non fanno parte del primo percorso.

## 6. Deployment

Il deployment di riferimento usa Docker Compose con:

- immagine non-root;
- filesystem applicativo read-only dove possibile;
- volumi nominati o bind mount espliciti per database, media e configurazione;
- health check;
- limiti e restart policy documentati;
- backup eseguibile senza entrare manualmente nel container;
- configurazione di sviluppo distinta dalla configurazione di produzione.

Caddy entra quando serve TLS pubblico. Non deve essere inserito nel bootstrap soltanto come placeholder.

## 7. Rete: come si raggiunge un'istanza, e come le istanze si parlano

Sono tre percorsi distinti, con tre stati diversi. Il piano iniziale ne prevedeva uno solo — WireGuard e Headscale integrati nell'app — e quella strada è chiusa senza essere stata adottata ([ADR 0001](adr/0001-private-network-control-plane.md)): il control plane su un NAS dietro CGNAT non può coordinare il primo collegamento senza un percorso pubblico preesistente, e ottenerlo costava sette passaggi tecnici all'amministratore.

| Percorso             | A che serve                                 | Stato                                                                                       |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Rete locale**      | Primo contatto e uso quotidiano             | Costruito, è il percorso principale ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)) |
| **Trasporto remoto** | Un dispositivo raggiunge la propria istanza | M4: dichiarato nell'interfaccia, documentato per il pilot, trasporto non ancora scelto      |
| **Rete fra istanze** | Due istanze si parlano                      | Deciso e non implementato ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md))           |

I tre non vanno confusi: il secondo è un problema di dispositivi — client iOS e Android, app store, uno strato di rete sul telefono — mentre il terzo è un problema fra due server Linux, e i blocchi dell'uno non valgono per l'altro.

Per il terzo percorso valgono due proprietà architetturali, decise in ADR 0018:

- **si indirizza per chiave pubblica**, non per nome o indirizzo: nessun dominio, nessun certificato, nessuna porta aperta;
- **i contenuti si visitano, non si replicano**: un post resta sull'istanza di chi lo ha scritto e viene servito su richiesta. Il percorso è client → propria istanza → istanza di origine, e il passaggio intermedio **tiene i contenuti in memoria senza scriverli su disco**. È un vincolo, non un'ottimizzazione: da esso dipendono la cancellazione e la revoca reali.

La UI del prodotto non dipende da nessuno dei tre: usa una porta applicativa con stati espliciti, come da §8.

## 8. Client mobile

React Native resta la scelta prevista, ma l'integrazione VPN richiede componenti nativi:

- iOS: Network Extension con packet tunnel provider;
- Android: `VpnService` o API di profilo supportate dal sistema;
- motore WireGuard/Tailscale e gestione del ciclo di vita fuori dal solo runtime JavaScript.

Expo Go non è un criterio di compatibilità sufficiente. Lo spike deve verificare build, firma, permessi, riconnessione, split tunnel, cambio Wi-Fi/rete mobile e comportamento in background.

La UI del prodotto non deve dipendere direttamente dall'SDK di rete: usa una porta applicativa con stati come `unconfigured`, `connecting`, `connected`, `degraded`, `revoked` ed `error`.

## 9. ActivityPub come adapter

Il core sociale usa un modello interno. La decisione, gli invarianti di dominio che la rendono sostenibile e il modo in cui vengono verificati sono in [ADR 0002](adr/0002-activitypub-confine-non-schema.md); sostituisce la scelta opposta del piano di progetto di luglio 2026.

Un adapter ActivityPub futuro tradurrà:

- profilo interno → actor;
- post → `Note`, `Image` o altro tipo compatibile;
- commento → oggetto con `inReplyTo`;
- scope → addressing `to`/`cc`;
- cancellazione → `Delete`/tombstone;
- migrazione → `Move`.

Inbox e outbox non devono condividere direttamente i repository del feed senza un livello di validazione, autorizzazione, idempotenza e deduplicazione.

L'adapter è **la superficie fatta di copie**, e in questo si distingue dalla rete fra istanze del §7: ciò che esce di qui viene archiviato su server altrui e non torna indietro. Per questo è una scelta esplicita di chi pubblica, e non il comportamento predefinito ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)).

## 10. Osservabilità e privacy

Il sistema produce log strutturati locali con livelli configurabili. Non registra:

- password;
- token di sessione o invito completi;
- chiavi private;
- corpi di post o messaggi;
- file caricati;
- header di autorizzazione.

Metriche e telemetria remote sono opt-in e non fanno parte del bootstrap. Gli endpoint diagnostici devono distinguere informazioni sicure per l'utente da dettagli riservati all'amministratore.

## 11. Fonti tecniche per i percorsi di rete

**Rete fra istanze** (§7, [ADR 0018](adr/0018-federazione-fra-istanze-estia.md)):

- iroh, che cos'è: https://docs.iroh.computer/what-is-iroh
- Binding ufficiali: https://docs.iroh.computer/languages
- Relay: https://docs.iroh.computer/concepts/relays
- Scoperta: https://docs.iroh.computer/concepts/discovery

**Trasporto remoto e client mobile** (§7 e §8):

- Apple Packet Tunnel Provider: https://developer.apple.com/documentation/networkextension/packet-tunnel-provider
- Android VPN: https://developer.android.com/develop/connectivity/vpn

Le fonti dello spike chiuso su Headscale e DERP restano in [ADR 0001](adr/0001-private-network-control-plane.md), dove sono l'evidenza di una decisione, non un riferimento corrente.
