# ESTIA

ESTIA è un social network open source e self-hosted nel quale l'unità di base è un'istanza gestita da una comunità reale. Il prodotto combina un feed locale privato, profili pubblici federabili e gruppi di messaggistica, mantenendo i dati applicativi sull'hardware dell'istanza.

## Stato

La base tecnica M0.1 fornisce un monorepo riproducibile, il servizio `core-api` e il
deployment locale con Docker Compose. Non include ancora database, account, feed, client,
rete privata, federazione o chat.

Il prossimo rischio da verificare è lo spike della rete privata tra dispositivi mobili e NAS,
inclusi i casi con CGNAT; è una milestone separata e non è implementato qui.

## Documenti da leggere

1. [`AGENTS.md`](AGENTS.md) — regole operative per il coding agent.
2. [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) — requisiti e perimetro del prodotto.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architettura target, vincoli e decisioni ancora aperte.
4. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — ordine di implementazione e criteri di completamento.
5. [`docs/adr/0001-private-network-control-plane.md`](docs/adr/0001-private-network-control-plane.md) — decisione da validare sulla rete privata.
6. [`AI_START_PROMPT.md`](AI_START_PROMPT.md) — primo incarico da consegnare a un coding agent nella repository vuota.

## Principio di esecuzione

Ogni milestone deve produrre un risultato avviabile, testato e documentato. Le componenti future non vanno anticipate con implementazioni speculative. Le decisioni non reversibili o che modificano i confini di fiducia devono essere registrate in un ADR prima di scrivere il relativo codice.

## Formula infrastrutturale corretta

ESTIA non promette «assenza di qualunque infrastruttura centrale». DNS, autorità di certificazione, notifiche push e relay possono essere servizi esterni.

La promessa è più precisa:

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
non aprono porte TCP reali.

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

## Struttura del bootstrap

```text
apps/core-api/          Fastify, endpoint health, OpenAPI e shutdown ordinato
packages/config/        parsing e validazione della configurazione
packages/contracts/     schema e tipo condivisi delle risposte health
packages/testing/       helper riutilizzabile per chiudere risorse nei test
infra/compose/          Docker Compose dell'istanza di riferimento
```
