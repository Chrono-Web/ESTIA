# Installare un'istanza ESTIA su un NAS

Questa guida porta un'istanza da zero a «funziona, e ho un backup» su un NAS con Docker.

È scritta dopo un'installazione reale su un NAS UGREEN, e i suoi passaggi più noiosi esistono perché quella volta sono andati storti. Il budget di prodotto è **meno di 30 minuti** ([`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4): se ci metti molto di più, è un difetto della guida, non tuo.

## Che cosa serve

- Un NAS con **Docker** — Synology, QNAP, UGREEN, Asustor, TerraMaster, o un mini-PC Linux.
- **Accesso SSH** al NAS. Si può fare anche dall'interfaccia grafica, ma da terminale è più corto.
- Un secondo dispositivo sulla stessa rete — telefono o portatile — per completare la configurazione.

Non servono: un dominio, un certificato, il port forwarding, un indirizzo IP pubblico. ESTIA vive sulla rete locale ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)).

## 1. Guarda che macchina hai davanti

Prima di scaricare qualunque cosa. Sbagliare architettura si scopre solo quando il container non parte, con un `exec format error` che non spiega niente.

```sh
uname -m && docker --version && df -h
```

`x86_64` significa **amd64**, `aarch64` significa **arm64**. Serve fra due passi.

## 2. Decidi dove vivono i dati

È la scelta più importante di tutta l'installazione, e va fatta adesso perché spostarli dopo significa fermare l'istanza.

Dentro la directory dei dati finiscono il database, le fotografie dei membri e **la chiave privata dell'istanza**, che non è sostituibile: se la perdi, i membri non riconoscono più la loro istanza.

Guarda dove Docker tiene già le sue cose:

```sh
docker info --format '{{.DockerRootDir}}' && df -h "$(docker info --format '{{.DockerRootDir}}')"
```

**Se quel percorso è già sul pool di archiviazione** — su molti NAS è qualcosa come `/volume1/@docker` — usa un **volume Docker con nome**. È la strada più semplice: nessuna cartella da creare, nessun permesso da sistemare, e il volume nasce già con i permessi giusti.

**Se invece è sulla partizione di sistema**, che di solito è piccola, serve un bind mount su una cartella del pool:

```sh
sudo mkdir -p /volume1/estia-data && sudo chown -R 10001:10001 /volume1/estia-data && sudo chmod 700 /volume1/estia-data
```

Il `10001` non è arbitrario: è l'utente non-root con cui gira il container.

## 3. Prendi l'immagine

**Quando l'immagine è pubblicata** su un registry, non devi fare niente: la scarica il passo successivo.

**Finché non lo è**, si costruisce altrove e si trasferisce. Il modo che funziona anche quando il NAS non ti lascia scrivere da nessuna parte è farla scorrere dentro `docker load`, senza appoggiare file:

```sh
gunzip -c estia-amd64.tar.gz | ssh utente@nas 'docker load'
```

> `scp` verso molti NAS fallisce con un `Permission denied` fuorviante: `scp` recente usa il protocollo SFTP, e parecchi NAS non espongono `sftp-server`. Se ti serve comunque copiare un file, `scp -O` usa il vecchio protocollo.

## 4. Scrivi la configurazione

In una cartella a tua scelta sul NAS, per esempio `/volume1/docker/estia/docker-compose.yml`:

```yaml
name: estia
services:
  core-api:
    image: estia/core-api:amd64
    environment:
      ESTIA_DATA_DIR: /data
      ESTIA_HOST: 0.0.0.0
      ESTIA_LOG_LEVEL: info
    ports:
      - "0.0.0.0:3000:3000"
    volumes:
      - estia-data:/data
    user: "10001:10001"
    init: true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
volumes:
  estia-data:
```

**La riga da non sbagliare è `0.0.0.0:3000:3000`.** Con `127.0.0.1` l'istanza risponde solo al NAS stesso, e dal telefono in salotto non la vedi. È il default giusto per una macchina di sviluppo e quello sbagliato qui.

Se al passo 2 hai scelto il bind mount, sostituisci `estia-data:/data` con `/volume1/estia-data:/data` e togli la sezione `volumes:` in fondo.

## 5. Accendi

```sh
docker compose up -d
```

Se la porta 3000 è già occupata da qualcos'altro sul NAS, cambia solo il numero a sinistra: `"0.0.0.0:3080:3000"`.

## 6. Prendi il codice di configurazione

Viene stampato una volta sola all'avvio, e **di proposito non finisce nei log strutturati**: è una credenziale, e l'unico modo di raggiungerti prima che esista un account.

```sh
docker compose logs core-api | head -20
```

Il codice cambia a ogni riavvio del processo. Se lo perdi, riavvia e leggi il nuovo.

## 7. Configura dal browser

Ti serve l'indirizzo del NAS sulla rete locale:

```sh
ip -4 addr show scope global | grep inet
```

Apri `http://INDIRIZZO:3000` da un altro dispositivo sulla stessa rete e completa la configurazione: nome della comunità, descrizione, e il tuo account di amministratore.

**Trascrivi il codice di recupero.** Compare una volta sola. Chi perde quello e la password perde l'istanza, e non è un difetto: è una conseguenza dichiarata di non avere un server centrale che possa reimpostartela ([ADR 0009](adr/0009-recupero-accesso-amministratore.md)). Trattalo come le chiavi di casa.

## 8. Fai entrare qualcuno

Dalla sezione di amministrazione crei un invito e lo mandi come manderesti un link a un gruppo. Chi lo riceve apre il link, sceglie un nome e chiede di entrare; tu approvi. **Avere un invito permette di chiedere, mai di entrare da soli.**

A questo punto l'istanza funziona. Ma non è finita.

## 9. I backup, che sono la parte che si salta e non si dovrebbe

Un'istanza senza backup è un disco che prima o poi si rompe con dentro le fotografie di tutti.

Genera una coppia di chiavi. **La privata deve uscire dal NAS e non tornarci**:

```sh
docker run --rm --entrypoint node estia/core-api:amd64 dist/backup/cli.js chiavi
```

Metti quella privata in un gestore di password, o stampala. Poi aggiungi al `docker-compose.yml`, dentro `environment:`, **solo quella pubblica**:

```yaml
ESTIA_BACKUP_DIR: /backup
ESTIA_BACKUP_PUBLIC_KEY: "age1..."
ESTIA_BACKUP_INTERVAL_HOURS: "24"
ESTIA_BACKUP_KEEP: "7"
```

e una cartella dove scriverli, sotto `volumes:`:

```yaml
- /volume1/docker/estia-backup:/backup
```

creata prima con i permessi giusti:

```sh
sudo mkdir -p /volume1/docker/estia-backup && sudo chown 10001:10001 /volume1/docker/estia-backup && sudo chmod 700 /volume1/docker/estia-backup
```

Riavvia con `docker compose up -d`. **Il primo backup parte un minuto dopo**, non la notte seguente: così un errore di configurazione lo vedi subito.

```sh
docker compose logs core-api | grep backup_ && ls -lh /volume1/docker/estia-backup/
```

Sull'istanza vive **solo la chiave pubblica**, ed è ciò che rende i backup davvero sicuri: l'istanza produce archivi che non è in grado di rileggere. Chi si porta via il NAS trova file illeggibili.

**Copiane qualcuno altrove.** Un backup sullo stesso disco protegge da un errore, non dalla rottura del disco. È cifrato apposta perché tu possa metterlo ovunque senza pensarci.

## 10. La cifratura del disco, e la scelta che devi fare tu

Su quel NAS ora ci sono le fotografie di persone reali. **Sul disco sono in chiaro**, a meno che tu non abbia cifrato il volume.

La cifratura non la fa ESTIA: la fa il tuo NAS ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)). LUKS su Linux, cifratura nativa dei volumi su Synology, QNAP e UGREEN, dataset cifrati su TrueNAS. È la scelta con la copertura più ampia, perché protegge in un colpo solo database, media, identità e file temporanei.

**Il punto non è cifrare: è dove sta la chiave quando la macchina si accende.**

| Livello                  | Protegge da                                    | Non protegge da                               | Prezzo                        |
| ------------------------ | ---------------------------------------------- | --------------------------------------------- | ----------------------------- |
| **Passphrase all'avvio** | Furto del NAS, dischi rimossi, dischi dismessi | Chi accede al NAS mentre è acceso e sbloccato | L'istanza non riparte da sola |
| **Sblocco automatico**   | Dischi rimossi, dischi dismessi                | **Furto del NAS**                             | Nessuno                       |
| **Nessuna cifratura**    | Nulla                                          | Tutto                                         | Nessuno                       |

**Il consiglio è la passphrase all'avvio**, ed è consapevole: se il NAS deve tornare da solo dopo un blackout, la chiave deve stare sulla macchina, e chi porta via la macchina porta via anche quella. L'unica protezione che regge contro il furto dell'apparecchio è una passphrase che non risiede da nessuna parte, perché la digita una persona.

Il prezzo è reale e va detto a chi userà l'istanza: **dopo un'interruzione di corrente la bacheca resta ferma finché qualcuno non sblocca il NAS.** Su un servizio che è la bacheca di un quartiere, è un disservizio: decidilo prima, non durante.

Configurato il volume dal pannello del tuo NAS, **dichiaralo a ESTIA** aggiungendo dentro `environment:`:

```yaml
ESTIA_AT_REST_ENCRYPTION: passphrase
```

I valori sono `passphrase`, `automatic` o `none`. Se non lo dichiari, l'istanza non presume: dice «non dichiarata».

**Perché dichiararlo, se il NAS lo sa già.** Perché ESTIA verifica: guarda il volume sotto i propri dati e riconosce se è cifrato. Ma **non può vedere come viene sbloccato** — una passphrase digitata e una chiave su disco producono lo stesso dispositivo — e quella parte la sa solo chi ha configurato il NAS.

Nella sezione **Stato dell'istanza** dell'amministrazione trovi le due cose affiancate: quello che l'istanza ha osservato e quello che tu hai dichiarato. Se dichiari una cifratura che l'istanza non vede, te lo dice in rosso e lo scrive nei log. È il caso che conta davvero: **una protezione creduta e non presente è peggio di una protezione assente e nota.**

## 11. Aggiornare

L'ordine conta, perché le migrazioni del database sono **solo in avanti**: non si torna indietro, e il rollback è il ripristino da un backup ([`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §8).

```sh
docker compose exec core-api node dist/backup/cli.js backup /backup
```

```sh
docker compose pull && docker compose up -d
```

Prima il backup, poi l'aggiornamento. Se qualcosa va storto, il punto di ritorno è di due minuti fa e non di ieri notte.

### Se te lo dimentichi, ci pensa l'istanza

La riga sopra vale la pena farla lo stesso, ma non sei più solo tu a doverla ricordare. **Quando la versione nuova si accorge di avere migrazioni da applicare, prima di applicarle si scrive un backup da sola** ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)). Lo trovi nella stessa cartella degli altri, con un nome che lo distingue:

```sh
ls -lh /volume1/docker/estia-backup/estia-aggiornamento-*.tar.age
```

Ha un nome suo perché **non viene cancellato dalla rotazione dei backup notturni**: è l'archivio più prezioso che l'istanza produca, e con `ESTIA_BACKUP_KEEP=1` la notte dopo se lo sarebbe portato via.

Due cose da sapere prima che succedano:

- **L'avvio è più lento**, quel tanto che serve a cifrare tutto l'archivio, fotografie comprese. Succede una volta per aggiornamento, e nel frattempo la bacheca non risponde.
- **Se i backup non sono configurati, l'istanza si aggiorna lo stesso** invece di restare ferma, perché lasciare un quartiere senza bacheca è un danno certo. Ma te lo dice: nei log e nella sezione **Stato dell'istanza**, dove resta scritto che quell'aggiornamento non ha un punto di ritorno. Non sparisce al riavvio successivo, perché il fatto non sparisce: le migrazioni vanno solo in avanti, quindi un backup fatto dopo non riporta indietro quello schema.

Dopo l'aggiornamento, guarda la sezione **Stato dell'istanza**: dice da quale versione a quale, e se il backup c'è stato.

```sh
docker compose logs core-api | grep schema_
```

## 12. Ripristinare

Un backup mai ripristinato non è un backup. **Provalo prima che serva davvero.**

Il ripristino è l'unico momento in cui la chiave privata tocca il NAS. `read -s` evita che finisca nella cronologia della shell:

```sh
read -s -p "chiave privata: " K; echo; docker run --rm --user 10001:10001 -e ESTIA_BACKUP_PRIVATE_KEY="$K" -v /volume1/docker/estia-backup:/backup:ro -v /volume1/docker/estia-restore:/restore --entrypoint node estia/core-api:amd64 dist/backup/cli.js ripristina /backup/ARCHIVIO.tar.age /restore
```

Poi accendi un'istanza di prova sui dati ripristinati, su un'altra porta, senza toccare quella vera, e guarda se c'è tutto.

E vale la pena saperlo: **un archivio si apre anche senza ESTIA**, con strumenti standard ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)):

```sh
age -d -i chiave-privata.txt archivio.tar.age | tar -xv
```

## Quando qualcosa non va

| Sintomo                                                 | Che cosa sta succedendo                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Il container parte e muore, `exec format error`         | Immagine dell'architettura sbagliata. Torna al passo 1                                                    |
| Dal telefono non si apre, dal NAS sì                    | La porta è pubblicata su `127.0.0.1`. Deve essere `0.0.0.0`                                               |
| `scp` dà «Permission denied» su percorsi che esistono   | Il NAS non espone `sftp-server`. Usa la pipe del passo 3, o `scp -O`                                      |
| `sudo` via SSH: «a terminal is required»                | Serve `ssh -t utente@nas 'sudo ...'`                                                                      |
| `docker load` o `docker ps` danno «permission denied»   | Il tuo utente non è nel gruppo `docker`: `sudo usermod -aG docker UTENTE`, poi riapri la sessione SSH     |
| L'istanza parte ma dice `data_dir_permissions_loose`    | La cartella dei dati è leggibile da altri utenti della macchina, e il filesystem ha rifiutato `chmod`     |
| Il container si rifiuta di partire per `ESTIA_BACKUP_*` | Hai messo una sola delle due variabili, o la chiave privata al posto della pubblica. Lo dice il messaggio |
| Nei log compare `backup_not_configured`                 | Non è un errore: l'istanza ti sta dicendo che **non sta facendo backup**                                  |
| Dopo un aggiornamento l'avvio è insolitamente lento     | L'istanza sta scrivendo il backup che precede le migrazioni. Succede una volta sola, per aggiornamento    |
| Nei log compare `schema_migrated_without_backup`        | L'aggiornamento è andato, ma senza punto di ritorno: non c'erano backup configurati                       |
| Nei log compare `schema_backup_failed`                  | Peggio del precedente: i backup li hai configurati e **non funzionano**. Controllali adesso               |

## Che cosa questa installazione non protegge

Detto qui perché nessuna interfaccia deve suggerire una protezione che non c'è.

**I dati sul NAS sono in chiaro, se non hai cifrato il volume** al passo 10. Chi si porta via la macchina legge tutto: contenuti, account, fotografie. I **backup** invece sono sempre cifrati, anche su un'istanza senza cifratura a riposo.

**Chi amministra vede tutto ciò che l'istanza conserva.** È la conseguenza dell'auto-ospitalità, non un difetto da nascondere.

**Il feed locale è leggibile dal server che lo serve**, per scelta: è la bacheca di chi condivide l'istanza, non una chat privata. I messaggi privati non esistono ancora, e quando esisteranno saranno cifrati end-to-end o non esisteranno affatto ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)).
