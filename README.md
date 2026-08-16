# ESTIA

Un social network vero, in cui **i tuoi contenuti stanno fisicamente in un posto che è tuo** — casa tua, o lo spazio comune della tua comunità — cifrato, senza algoritmo e senza pubblicità.

L'unità di base è un'istanza ospitata su un NAS in un luogo reale: un appartamento, un condominio, una via, uno spazio sociale. Sopra questa base convivono tre superfici sociali con un'unica identità: il **feed locale** di chi condivide l'istanza, il **profilo** — chiuso o aperto e federabile nel Fediverso — e i **gruppi** di messaggistica.

Cinque parole tenute insieme: **proprietario, condiviso, comunitario, protetto e connesso con chiunque**. Ognuna da sola descrive qualcosa che esiste già; la cosa nuova è pretenderle contemporaneamente. La visione completa è in [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md), e la §11 spiega che cosa comporta — compreso il perché questo è anche uno strumento politico.

## Stato reale del progetto

|                      |                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **Fatto**            | M0, M1 e **M2 complete**: post, commenti, like e immagini, provate su un NAS reale con membri reali |
| **In corso**         | M3 — robustezza operativa, a partire dall'installazione                                             |
| **Non implementato** | accesso da fuori casa, federazione, chat, client mobile                                             |

**Il primo contatto avviene sulla rete locale.** Un'istanza si installa e si usa senza dominio, senza certificati, senza port forwarding e senza aprire porte: chi entra lo fa dalla rete di casa, e da quel momento riconosce l'istanza dalla sua chiave. È la decisione che ha sciolto il nodo più difficile del progetto — vedi [ADR 0003](docs/adr/0003-primo-contatto-in-rete-locale.md).

L'accesso da fuori dalla rete locale è una milestone additiva (M4): il prodotto è utilizzabile senza di essa.

## Documenti

Da leggere in quest'ordine.

| Documento                                                    | Risponde a                                            |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| [`docs/INSTALLAZIONE.md`](docs/INSTALLAZIONE.md)             | Come si installa su un NAS, e cosa fare quando non va |
| [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)           | Perché ESTIA esiste, per chi, come deve sentirsi      |
| [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md)               | Che cosa deve fare e quali proprietà conservare       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)               | Come è costruito, e cosa non è ancora deciso          |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | In che ordine si costruisce, e quando è finito        |
| [`docs/SECURITY_BASELINE.md`](docs/SECURITY_BASELINE.md)     | Che cosa protegge, da chi, e che cosa resta scoperto  |
| [`docs/RECONCILIATION.md`](docs/RECONCILIATION.md)           | Che rapporto c'è con il piano di progetto iniziale    |
| [`docs/adr/`](docs/adr/)                                     | Perché una decisione è stata presa così               |
| [`AGENTS.md`](AGENTS.md)                                     | Regole operative per chi scrive codice qui            |

Le decisioni che danno forma al progetto:

| ADR                                                            | Decisione                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [0001](docs/adr/0001-private-network-control-plane.md)         | Control plane della rete privata — **chiuso, nessuna opzione adottata** |
| [0002](docs/adr/0002-activitypub-confine-non-schema.md)        | ActivityPub è un confine, non lo schema del dominio                     |
| [0003](docs/adr/0003-primo-contatto-in-rete-locale.md)         | Primo contatto in rete locale                                           |
| [0004](docs/adr/0004-client-web-e-trasporto-sostituibile.md)   | Client web, trasporto sostituibile                                      |
| [0005](docs/adr/0005-persistenza-node-sqlite.md)               | Persistenza con `node:sqlite`                                           |
| [0006](docs/adr/0006-messaggi-privati-end-to-end-o-niente.md)  | I messaggi privati sono end-to-end, o non esistono                      |
| [0007](docs/adr/0007-cifratura-a-riposo-e-furto-fisico.md)     | Cifratura a riposo con passphrase all'avvio come default                |
| [0008](docs/adr/0008-hashing-password-argon2id.md)             | Argon2id in WebAssembly, senza moduli nativi                            |
| [0009](docs/adr/0009-recupero-accesso-amministratore.md)       | Recupero dell'accesso con codice trascrivibile                          |
| [0010](docs/adr/0010-client-web-spa-statica.md)                | Client web come SPA statica servita dall'istanza                        |
| [0011](docs/adr/0011-immagini-in-webassembly.md)               | Elaborazione delle immagini in WebAssembly, non nativa                  |
| [0012](docs/adr/0012-immagini-autenticate-non-indovinabili.md) | Le immagini si scaricano autenticate, mai da URL che valgono da soli    |
| [0013](docs/adr/0013-backup-cifrati-in-formato-age.md)         | I backup sono `tar` cifrati in formato age, riapribili senza ESTIA      |

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
- `POST /api/v1/join/request` — chiede di entrare con un codice d'invito.
- `GET`/`POST /api/v1/posts` — timeline paginata e pubblicazione; lo scope assente vale `local`.
  Un post può portare fino a quattro immagini già caricate, indicate in `media`.
- `PUT`/`DELETE /api/v1/posts/:id/like` · `/comments` — reazioni e commenti.
- `POST /api/v1/media` — carica un'immagine: il corpo della richiesta **è** l'immagine, senza
  multipart e senza nome di file. Restituisce l'identificatore e le misure.
- `GET /api/v1/media/:id` · `/thumb` — l'immagine e la sua miniatura, solo a chi ha una sessione.
- `POST /api/v1/auth/login` — restituisce un token di sessione.
- `POST /api/v1/auth/recover` — reimposta la password con il codice di recupero.
- `GET /api/v1/auth/me` — chi sta chiamando.
- `POST /api/v1/auth/logout` — revoca la sessione corrente.
- `GET /api/v1/auth/sessions` — dispositivi collegati, con quello corrente marcato.
- `DELETE /api/v1/auth/sessions/:id` — revoca un proprio dispositivo.
- `GET /api/v1/admin/diagnostics` · `/invites` · `/join-requests` · `/audit` — solo `instance_admin`.
- `GET /openapi.json` — documento OpenAPI generato dagli schemi delle route.

Le rotte autenticate vogliono `Authorization: Bearer <token>`. L'autorizzazione viene sempre
dalla sessione: **essere sulla rete locale non è mai una credenziale.**

### Primo avvio

Al primo avvio l'istanza genera la propria **coppia di chiavi** e resta in stato
`unconfigured`. Il processo stampa a schermo un **codice di configurazione** monouso, che serve
a completare il setup:

Il setup crea l'istanza **e** il suo amministratore, in un'unica transazione: un'istanza
configurata senza amministratore non sarebbe recuperabile.

```sh
curl --fail --silent -X POST http://127.0.0.1:3000/api/v1/instance/setup \
  -H 'content-type: application/json' \
  -d '{
        "name": "Via Roma",
        "description": "Il feed del quartiere",
        "setupToken": "<codice>",
        "adminUsername": "palu",
        "adminPassword": "una-password-lunga"
      }'
```

Il codice viene stampato solo sulla console, **non finisce nei log**, e cambia a ogni riavvio.
Stare sulla rete locale autentica il canale, non autorizza la persona: senza codice non si
configura nulla.

La chiave privata dell'istanza è in `instance-identity.pem` dentro la directory dei dati, con
permessi `0600`, **fuori dal database**: un dump del database non porta con sé l'identità.
Perderla significa che i membri non riconoscono più l'istanza.

## Configurazione

Nessun segreto va passato dall'ambiente: l'istanza genera da sé la propria identità e il
codice di configurazione. Il processo valida tutti i valori che usa all'avvio e termina con un
errore esplicito se uno è invalido.

| Variabile                  | Default     | Vincolo                                                       |
| -------------------------- | ----------- | ------------------------------------------------------------- |
| `ESTIA_HOST`               | `0.0.0.0`   | non vuota                                                     |
| `ESTIA_PORT`               | `3000`      | intero tra 1 e 65535                                          |
| `ESTIA_LOG_LEVEL`          | `info`      | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `ESTIA_DATA_DIR`           | `./.data`   | non vuota; contiene database, identità e media dell'istanza   |
| `ESTIA_MEDIA_MAX_BYTES`    | `5242880`   | 5 MiB; dimensione massima di un'immagine caricata             |
| `ESTIA_MEDIA_MAX_PIXELS`   | `12000000`  | 12 Mpixel; limite separato, contro le bombe di decompressione |
| `ESTIA_MEDIA_QUOTA_BYTES`  | `268435456` | 256 MiB per membro, originali e miniature insieme             |
| `ESTIA_AT_REST_ENCRYPTION` | vuota       | `passphrase`, `automatic` o `none`: cosa dichiari sul volume  |

`.env.example` è un punto di partenza locale e non contiene credenziali.

### Backup, in breve

Un backup ESTIA è un **`tar` cifrato in formato [age](https://age-encryption.org)**, e la sua
proprietà migliore è che si riapre **senza ESTIA** ([ADR 0013](docs/adr/0013-backup-cifrati-in-formato-age.md)):

```sh
age -d -i chiave-privata.txt estia-2026-08-15T09-30-00Z.tar.age | tar -xv
```

Si genera una coppia di chiavi una volta sola. La **pubblica** va sull'istanza, la **privata**
esce dal NAS e non ci torna più:

```sh
node apps/core-api/dist/backup/cli.js chiavi
```

```sh
ESTIA_BACKUP_PUBLIC_KEY=age1... node apps/core-api/dist/backup/cli.js backup /percorso/backup
```

```sh
ESTIA_BACKUP_PRIVATE_KEY=AGE-SECRET-KEY-... node apps/core-api/dist/backup/cli.js ripristina archivio.tar.age /directory/vuota
```

Ne segue la proprietà che rende il backup sicuro davvero: **l'istanza produce archivi che non è
in grado di rileggere**, perché la chiave privata non è mai stata sul NAS. Chi si porta via il
NAS trova backup illeggibili.

Due cose vanno dette con chiarezza. **Un backup cifrato non è cifratura a riposo**: i dati vivi
sul NAS restano in chiaro finché non arriva [ADR 0007](docs/adr/0007-cifratura-a-riposo-e-furto-fisico.md).
E **chi perde la chiave privata perde gli archivi**, senza recupero possibile.

Il backup non ferma l'istanza: lo snapshot del database si prende con `VACUUM INTO`, coerente
anche mentre qualcuno sta pubblicando.

**Automatico.** Impostando queste due variabili l'istanza fa da sé, senza che tu debba imparare
lo scheduler del NAS. Il primo backup parte un minuto dopo l'avvio — così un errore di
configurazione si vede subito e non la notte dopo — e poi ogni `ESTIA_BACKUP_INTERVAL_HOURS`.

| Variabile                     | Default | Che cosa fa                                                  |
| ----------------------------- | ------- | ------------------------------------------------------------ |
| `ESTIA_BACKUP_DIR`            | vuota   | Dove scrivere gli archivi; vuota significa **nessun backup** |
| `ESTIA_BACKUP_PUBLIC_KEY`     | vuota   | La chiave **pubblica** `age1...`, mai quella privata         |
| `ESTIA_BACKUP_INTERVAL_HOURS` | `24`    | Ogni quante ore                                              |
| `ESTIA_BACKUP_KEEP`           | `7`     | Quanti archivi tenere; i più vecchi vengono rimossi          |

Le due variabili vanno impostate **insieme**: una sola delle due fa fallire l'avvio con un
errore esplicito, invece di produrre un'istanza che sembra protetta e non lo è. Se ci metti per
sbaglio la chiave privata, l'istanza si rifiuta di partire e ti dice perché.

Senza configurazione l'istanza **scrive nei log che non sta facendo backup**: un amministratore
che crede di averli è messo peggio di uno che sa di non averli.

La rotazione tocca soltanto i file che ha scritto lei — `estia-*.tar.age` — perché una cartella
di backup è spesso una cartella condivisa, e il resto non è roba sua.

**Prima di una migrazione.** Il backup periodico non basta a coprire un aggiornamento: parte un
minuto dopo l'avvio, quando le migrazioni sono già state applicate, e fotografa lo schema nuovo.
Perciò, quando l'istanza si accorge di avere migrazioni da applicare su uno schema che esiste
già, **si scrive un backup prima di applicarle** ([ADR 0014](docs/adr/0014-backup-prima-delle-migrazioni.md)).
Quell'archivio si chiama `estia-aggiornamento-*.tar.age` e ha una rotazione sua, perché è
l'unico punto di ritorno di quell'aggiornamento e la rotazione notturna se lo porterebbe via.

Se il backup non è configurato, o fallisce, **l'istanza si aggiorna lo stesso**: rifiutarsi di
partire proteggerebbe i dati lasciando un quartiere senza la propria bacheca. Ma lo dichiara nei
log e nella diagnostica dell'amministratore, e continua a dichiararlo dopo il riavvio — perché
le migrazioni vanno solo in avanti, quindi un aggiornamento senza punto di ritorno resta senza
punto di ritorno.

### Le immagini, in breve

Il lavoro pesante lo fa il browser ([ADR 0011](docs/adr/0011-immagini-in-webassembly.md)): ridimensiona
a 1600 pixel di lato lungo e ricomprime prima di caricare, così l'istanza riceve immagini già
piccole e le elabora in poche decine di millisecondi, in WebAssembly e senza moduli nativi.

L'istanza però non si fida di quel lavoro, perché chiunque può scrivere all'endpoint ignorando il
browser. Quindi, sempre: riconosce il tipo dai byte e non dall'estensione, legge le dimensioni
dall'intestazione **prima** di decodificare, rifiuta oltre soglia in byte e in pixel, applica la
quota prima di scrivere, scrive in un file temporaneo e lo rinomina, e costruisce il percorso da un
identificatore proprio — il nome del file caricato non arriva nemmeno al server.

Dai file conservati toglie tutto ciò che non serve a disegnarli, **Exif compreso**: una foto
scattata col telefono porta con sé le coordinate di dove è stata scattata, e non è roba da
pubblicare per sbaglio nella bacheca del quartiere. È una riscrittura del contenitore, non dei
pixel: nessuna perdita di qualità.

Le immagini si leggono solo con una sessione viva, e il client le scarica con l'intestazione
`Authorization` invece di metterle dietro un URL che varrebbe da solo
([ADR 0012](docs/adr/0012-immagini-autenticate-non-indovinabili.md)).

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
  src/db/               migrazioni versionate, transazioni, backup
  src/instance/         identità dell'istanza e configurazione al primo avvio
  src/identity/         account, password, sessioni, recupero, autorizzazione
  src/admission/        inviti, richieste di ammissione, registro
  src/feed/             post, commenti, like, moderazione
  src/media/            immagini: validazione, miniature in Wasm, quote, storage
  src/web/              serving del client compilato e politica di sicurezza
apps/web/               client React servito dall'istanza (ADR 0010)
packages/config/        parsing e validazione della configurazione
packages/contracts/     schemi e tipi condivisi delle API
packages/testing/       helper per test su risorse e directory temporanee
infra/compose/          Docker Compose dell'istanza di riferimento
infra/network-lab/      materiale dello spike M0.2, chiuso: da rimuovere all'inizio di M4
docs/                   visione, requisiti, architettura, piano e decisioni
```

Il client mobile è una milestone successiva ([ADR 0004](docs/adr/0004-client-web-e-trasporto-sostituibile.md)).

## Lavorare sul client

`pnpm build` compila anche il client, che finisce in `apps/core-api/public` e viene servito
dall'istanza: un solo processo, un solo container.

Per lavorarci con ricarica automatica servono due terminali — l'istanza da una parte, il client
dall'altra, con le chiamate API inoltrate all'istanza:

```sh
node apps/core-api/dist/server.js
pnpm --filter @estia/web dev
```
