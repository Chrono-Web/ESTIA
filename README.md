# ESTIA

Un social network vero — con l'anima di un quartiere, ospitato su un NAS di casa, cifrato, senza algoritmo e senza pubblicità.

L'unità di base è un'istanza amministrata da una comunità reale e collocata fisicamente in un luogo: un condominio, una via, uno spazio sociale. Sopra questa base convivono tre superfici sociali con un'unica identità utente: il **feed locale** del quartiere, un **profilo pubblico** federabile nel Fediverso e i **gruppi** di messaggistica.

La sovranità dei dati, l'assenza di ranking algoritmico e il radicamento territoriale sono conseguenze dell'architettura, non un onere quotidiano per chi usa l'app. La visione completa è in [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).

## Stato reale del progetto

|                      |                                                                             |
| -------------------- | --------------------------------------------------------------------------- |
| **Fatto**            | M0.1 bootstrap · M0.2 spike di rete (chiuso) · M0.3 persistenza             |
| **In corso**         | M0.4 baseline di sicurezza · M1.1 istanza, identità e persistenza           |
| **Non implementato** | account, inviti, feed, client web, accesso da fuori casa, federazione, chat |

**Il primo contatto avviene sulla rete locale.** Un'istanza si installa e si usa senza dominio, senza certificati, senza port forwarding e senza aprire porte: chi entra lo fa dalla rete di casa, e da quel momento riconosce l'istanza dalla sua chiave. È la decisione che ha sciolto il nodo più difficile del progetto — vedi [ADR 0003](docs/adr/0003-primo-contatto-in-rete-locale.md).

L'accesso da fuori dalla rete locale è una milestone additiva (M4): il prodotto è utilizzabile senza di essa.

## Documenti

Da leggere in quest'ordine.

| Documento                                                    | Risponde a                                         |
| ------------------------------------------------------------ | -------------------------------------------------- |
| [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)           | Perché ESTIA esiste, per chi, come deve sentirsi   |
| [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md)               | Che cosa deve fare e quali proprietà conservare    |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)               | Come è costruito, e cosa non è ancora deciso       |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | In che ordine si costruisce, e quando è finito     |
| [`docs/RECONCILIATION.md`](docs/RECONCILIATION.md)           | Che rapporto c'è con il piano di progetto iniziale |
| [`docs/adr/`](docs/adr/)                                     | Perché una decisione è stata presa così            |
| [`AGENTS.md`](AGENTS.md)                                     | Regole operative per chi scrive codice qui         |

Le decisioni che danno forma al progetto:

| ADR                                                          | Decisione                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [0001](docs/adr/0001-private-network-control-plane.md)       | Control plane della rete privata — **chiuso, nessuna opzione adottata** |
| [0002](docs/adr/0002-activitypub-confine-non-schema.md)      | ActivityPub è un confine, non lo schema del dominio                     |
| [0003](docs/adr/0003-primo-contatto-in-rete-locale.md)       | Primo contatto in rete locale                                           |
| [0004](docs/adr/0004-client-web-e-trasporto-sostituibile.md) | Client web, trasporto sostituibile                                      |
| [0005](docs/adr/0005-persistenza-node-sqlite.md)             | Persistenza con `node:sqlite`                                           |

`ESTIA-piano-di-progetto.docx` (luglio 2026) è un documento storico: resta la fonte della visione e del linguaggio verso l'esterno, ma non è normativo su scelte tecniche e sequenza. Il rapporto è fissato voce per voce in [`RECONCILIATION.md`](docs/RECONCILIATION.md).

## Principio di esecuzione

Ogni milestone deve produrre un risultato avviabile, testato e documentato. Le componenti future non vanno anticipate con implementazioni speculative. Le decisioni non reversibili o che modificano i confini di fiducia vanno registrate in un ADR prima di scrivere il relativo codice.

Una milestone non è completata se il percorso principale dipende da mock.

## La promessa infrastrutturale, formulata con precisione

ESTIA non promette «assenza di qualunque infrastruttura centrale»: DNS, autorità di certificazione, notifiche push e relay possono essere servizi esterni.

> Nessun server applicativo centrale gestito dagli sviluppatori e nessun contenuto della comunità conservato fuori dall'istanza, salvo una scelta esplicita dell'amministratore.

## Requisiti locali

Il runtime di riferimento è Node.js `24.18.0`, fissato in [`.node-version`](.node-version),
[`.nvmrc`](.nvmrc) e nell'immagine Docker. È la linea LTS attiva scelta per il progetto.

Il range supportato dagli strumenti locali è Node.js `>=22.22.0 <25`; questo rende possibile
eseguire i controlli anche su Node 22.22.2, la versione disponibile durante il bootstrap. pnpm
è fissato a `11.7.0` dal campo `packageManager`.

- Node.js 24.18.0 e Corepack
- Docker Engine e Docker Compose, per il percorso di deployment e smoke test

## Installazione e verifiche

Da un clone pulito:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
corepack pnpm verify
```

I comandi possono essere eseguiti singolarmente:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` esegue prima la build TypeScript e usa l'iniezione Fastify: i test degli endpoint
non aprono porte TCP reali. `pnpm format` controlla anche la documentazione.

Per avviare il servizio senza Docker:

```sh
pnpm build
set -a
. ./.env
set +a
node apps/core-api/dist/server.js
```

Gli endpoint disponibili sono:

- `GET /health/live` — il processo Fastify è vivo.
- `GET /health/ready` — il processo può servire richieste.
- `GET /api/v1/instance` — vetrina dell'istanza: stato, nome, descrizione e chiave pubblica.
  Non espone l'elenco dei membri.
- `POST /api/v1/instance/setup` — configurazione al primo avvio, una volta sola.
- `GET /openapi.json` — documento OpenAPI generato dagli schemi delle route.

### Primo avvio

Al primo avvio l'istanza genera la propria **coppia di chiavi** e resta in stato
`unconfigured`. Il processo stampa a schermo un **codice di configurazione** monouso, che serve
a completare il setup:

```sh
curl --fail --silent -X POST http://127.0.0.1:3000/api/v1/instance/setup \
  -H 'content-type: application/json' \
  -d '{"name":"Via Roma","description":"Il feed del quartiere","setupToken":"<codice>"}'
```

Il codice viene stampato solo sulla console, **non finisce nei log**, e cambia a ogni riavvio.
Stare sulla rete locale autentica il canale, non autorizza la persona: senza codice non si
configura nulla.

La chiave privata dell'istanza è in `instance-identity.pem` dentro la directory dei dati, con
permessi `0600`, **fuori dal database**: un dump del database non porta con sé l'identità.
Perderla significa che i membri non riconoscono più l'istanza.

## Configurazione

Nessun segreto è richiesto nella milestone M0.1. Il processo valida tutti i valori che usa
all'avvio e termina con un errore esplicito se uno è invalido.

| Variabile         | Default   | Vincolo                                                       |
| ----------------- | --------- | ------------------------------------------------------------- |
| `ESTIA_HOST`      | `0.0.0.0` | non vuota                                                     |
| `ESTIA_PORT`      | `3000`    | intero tra 1 e 65535                                          |
| `ESTIA_LOG_LEVEL` | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `ESTIA_DATA_DIR`  | `./.data` | non vuota; contiene database e identità dell'istanza          |

`.env.example` è un punto di partenza locale e non contiene credenziali.

## Docker Compose e smoke test

Il deployment di riferimento usa un'immagine multi-stage basata su Node 24.18.0, eseguita con
UID/GID `10001`, filesystem in sola lettura, `/tmp` temporaneo e capability Linux rimosse. La
base ufficiale Node usata dall'immagine è multi-arch per `linux/amd64` e `linux/arm64`; il
bootstrap non aggiunge moduli nativi.

```sh
docker compose --env-file .env -f infra/compose/compose.yaml up --build --wait
curl --fail --silent http://127.0.0.1:3000/health/ready
docker compose --env-file .env -f infra/compose/compose.yaml down --remove-orphans
```

`--wait` attende l'health check di Compose.

> **Attenzione al volume.** Database e identità dell'istanza vivono nel volume `estia-data`.
> Il comando `down` senza `--volumes` lo conserva, ed è quello che serve normalmente.
> Aggiungere `--volumes` **cancella l'identità dell'istanza**: i membri che l'avevano
> memorizzata al primo contatto non la riconoscerebbero più. Usarlo solo su installazioni
> di prova, consapevolmente.

## Struttura

```text
apps/core-api/
  src/db/               migrazioni versionate e apertura del database
  src/instance/         identità, persistenza e API dell'istanza
packages/config/        parsing e validazione della configurazione
packages/contracts/     schemi e tipi condivisi delle API
packages/testing/       helper per test su risorse e directory temporanee
infra/compose/          Docker Compose dell'istanza di riferimento
infra/network-lab/      materiale dello spike M0.2, chiuso: da rimuovere all'inizio di M4
docs/                   visione, requisiti, architettura, piano e decisioni
```

Il client web viene creato da M1.4. Il client mobile è una milestone successiva ([ADR 0004](docs/adr/0004-client-web-e-trasporto-sostituibile.md)).
