# ESTIA

Un social network vero — con l'anima di un quartiere, ospitato su un NAS di casa, cifrato, senza algoritmo e senza pubblicità.

L'unità di base è un'istanza amministrata da una comunità reale e collocata fisicamente in un luogo: un condominio, una via, uno spazio sociale. Sopra questa base convivono tre superfici sociali con un'unica identità utente: il **feed locale** del quartiere, un **profilo pubblico** federabile nel Fediverso e i **gruppi** di messaggistica.

La sovranità dei dati, l'assenza di ranking algoritmico e il radicamento territoriale sono conseguenze dell'architettura, non un onere quotidiano per chi usa l'app. La visione completa è in [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).

## Stato reale del progetto

|                      |                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **Fatto**            | M0.1 — monorepo riproducibile, servizio `core-api` con health e OpenAPI, deployment Docker Compose |
| **In corso**         | M0.2 — spike della rete privata · M0.3 — spike SQLite e multi-arch                                 |
| **Non implementato** | database, account, feed, client mobile, rete privata, federazione, chat                            |

Il progetto è a una milestone su tredici. Le tredici milestone coprono, tutte insieme, la sola Fase 1 del piano di progetto di luglio 2026.

**Il rischio aperto è la rete privata.** Rendere un'istanza dietro CGNAT raggiungibile dai soli dispositivi autorizzati, con revoca affidabile e senza esporre porte, non ha ancora una soluzione decisa: le opzioni sono in [ADR 0001](docs/adr/0001-private-network-control-plane.md) e vanno istruite con esperimenti reali prima di scrivere prodotto. Finché non è risolto, tutto il resto è costruito su un'ipotesi.

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
- `GET /health/ready` — il processo può servire richieste; M0.1 non ha ancora dipendenze
  esterne da verificare.
- `GET /openapi.json` — documento OpenAPI generato dagli schemi delle route.

## Configurazione

Nessun segreto è richiesto nella milestone M0.1. Il processo valida tutti i valori che usa
all'avvio e termina con un errore esplicito se uno è invalido.

| Variabile         | Default   | Vincolo                                                       |
| ----------------- | --------- | ------------------------------------------------------------- |
| `ESTIA_HOST`      | `0.0.0.0` | non vuota                                                     |
| `ESTIA_PORT`      | `3000`    | intero tra 1 e 65535                                          |
| `ESTIA_LOG_LEVEL` | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |

`.env.example` è un punto di partenza locale e non contiene credenziali.

## Docker Compose e smoke test

Il deployment di riferimento usa un'immagine multi-stage basata su Node 24.18.0, eseguita con
UID/GID `10001`, filesystem in sola lettura, `/tmp` temporaneo e capability Linux rimosse. La
base ufficiale Node usata dall'immagine è multi-arch per `linux/amd64` e `linux/arm64`; il
bootstrap non aggiunge moduli nativi.

```sh
docker compose --env-file .env -f infra/compose/compose.yaml up --build --wait
curl --fail --silent http://127.0.0.1:3000/health/ready
docker compose --env-file .env -f infra/compose/compose.yaml down --volumes --remove-orphans
```

`--wait` attende l'health check di Compose. Eseguire sempre il comando `down` anche se build o
smoke test falliscono: M0.1 non crea volumi persistenti, quindi il cleanup è sicuro.

## Struttura

```text
apps/core-api/          Fastify, endpoint health, OpenAPI e shutdown ordinato
packages/config/        parsing e validazione della configurazione
packages/contracts/     schema e tipo condivisi delle risposte health
packages/testing/       helper riutilizzabile per chiudere risorse nei test
infra/compose/          Docker Compose dell'istanza di riferimento
infra/network-lab/      ambiente usa-e-getta dello spike M0.2, non di prodotto
docs/                   visione, requisiti, architettura, piano e decisioni
```

`apps/admin-web` e `apps/mobile` non esistono ancora: vengono creati dalle milestone che li
richiedono, rispettivamente M1.4 e M2.4.
