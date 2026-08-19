# Installare un'istanza ESTIA

Questa guida porta un'istanza da zero a «funziona, e ho un backup».

Serve una macchina che resti accesa: un NAS, un mini-PC, un vecchio portatile con Linux, un server in casa. Qui la chiamiamo **la macchina**; dove un NAS fa le cose in modo diverso, è scritto.

È scritta dopo installazioni reali, e i suoi passaggi più noiosi esistono perché quelle volte sono andati storti. Il budget di prodotto è **meno di 30 minuti** ([`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4): se ci metti molto di più, è un difetto della guida, non tuo.

## Come si legge questa guida

Tre cose prima di cominciare, perché sono le tre che hanno fatto inciampare l'ultima installazione.

**I blocchi grigi non sono tutti uguali.** Quelli marcati `sh` sono **comandi**: si incollano nel terminale e si preme invio. Quelli marcati `yaml` sono il **contenuto di un file**: nel terminale non funzionano, e incollarceli risponde `comando non trovato`. Dove serve un file, la guida ti dà anche il comando che lo scrive per te.

**Ci sono due strade, e ne basta una.**

| Strada                                    | Per chi                                                                       | Che cosa segui                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Terminale** (SSH, o la macchina stessa) | Qualunque macchina. È la più corta, ed è quella su cui è facile farsi aiutare | I passi da 1 a 13, in fila                                                                                           |
| **Pannello grafico**                      | Solo NAS, con Container Manager, Container Station o l'app Docker             | I passi 1 e 3, poi [dal pannello grafico](#dal-pannello-grafico-del-nas-al-posto-dei-passi-4-5-e-6), poi dal passo 7 |

Non vanno mescolate: la stessa istanza si installa in un modo **o** nell'altro. Se hai un dubbio, usa il terminale.

**Tutti i comandi si danno sulla macchina che ospiterà l'istanza**, non sul tuo portatile — da SSH, o da un terminale aperto lì davanti.

## Che cosa serve

- Una **macchina che resti accesa**: NAS (Synology, QNAP, UGREEN, Asustor, TerraMaster), mini-PC Linux, o un vecchio portatile con Linux.
- **Docker**. Se non ce l'hai, è il passo 1: non darlo per installato, quasi nessuna macchina ce l'ha già.
- **Un accesso a un terminale**: SSH è il modo più comodo. Sui NAS va abilitato dal pannello, di solito sotto «Terminale» o «SSH».
- Un **secondo dispositivo sulla stessa rete** — telefono o portatile — per completare la configurazione.

Non servono: un dominio, un certificato, il port forwarding, un indirizzo IP pubblico. ESTIA vive sulla rete locale ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)).

Leggere la bacheca **da fuori casa** è una cosa in più, che si aggiunge dopo e non cambia niente di questa installazione: [`ACCESSO_DA_FUORI.md`](ACCESSO_DA_FUORI.md).

## 1. Installa Docker

Prima cosa: guarda se c'è già.

```sh
docker --version
```

Se risponde con un numero di versione, salta al passo 2. Se risponde `comando non trovato`, Docker va installato — e come si fa dipende dalla macchina.

### Su un NAS

Docker si installa **dal pannello del NAS**, dal suo centro applicazioni, e non da terminale. Il nome cambia da marca a marca:

| NAS         | Applicazione da installare             |
| ----------- | -------------------------------------- |
| Synology    | **Container Manager** (prima «Docker») |
| QNAP        | **Container Station**                  |
| UGREEN      | **Docker**                             |
| Asustor     | **Docker Engine**                      |
| TerraMaster | **Docker Manager**                     |

Installala e aprila una volta, così finisce di configurarsi. Poi, se vuoi seguire la strada del terminale, **abilita SSH** dalle impostazioni di sistema del NAS — su Synology è Pannello di controllo → Terminale e SNMP, su UGREEN e QNAP sotto le impostazioni di rete o di sistema — e collegati:

```sh
ssh utente@nome-del-nas.local
```

### Su Linux: mini-PC, vecchio portatile, server

Lo script ufficiale di Docker riconosce la distribuzione e installa tutto quello che serve, `docker compose` compreso. Sono due comandi, uno alla volta:

```sh
curl -fsSL https://get.docker.com -o get-docker.sh
```

```sh
sudo sh get-docker.sh
```

Il primo scarica lo script, il secondo lo esegue. Se preferisci guardarlo prima di eseguirlo — abitudine sana, con qualunque script che si scarica da Internet — è un file di testo: `less get-docker.sh`.

Poi **metti il tuo utente nel gruppo `docker`**, altrimenti ogni comando qui sotto va preceduto da `sudo` e prima o poi te ne dimentichi uno:

```sh
sudo usermod -aG docker "$USER"
```

**Questo cambiamento vale dalla sessione successiva.** Chiudi il terminale — o la connessione SSH — e riaprilo. Se non lo fai, il comando dopo risponde `permission denied` sul socket di Docker, e sembra un problema di Docker mentre è solo il gruppo che non è ancora attivo.

### Su macOS o Windows

Si installa **Docker Desktop**, dal sito di Docker. Va benissimo per provare ESTIA e guardarla, ma tieni presente una cosa: un'istanza è la bacheca di una comunità, e vive su una macchina che resta accesa. Un portatile che si chiude la sera non è quella macchina.

### Controlla che sia a posto

```sh
docker --version && docker compose version && docker run --rm hello-world
```

Devono rispondere tutti e tre: due numeri di versione e un messaggio che comincia con «Hello from Docker!». Quel terzo comando è il più utile dei tre, perché scarica davvero un'immagine e la esegue: se funziona, tutto quello che viene dopo funzionerà.

Se `docker compose version` dà errore ma `docker-compose --version` risponde, hai la versione vecchia di Compose: funziona lo stesso, e in tutta la guida devi scrivere `docker-compose` (con il trattino) dove è scritto `docker compose`.

## 2. Guarda che macchina hai davanti

```sh
uname -m && df -h
```

`x86_64` significa **amd64**, `aarch64` significa **arm64**. **Se scarichi l'immagine dal registry non ti serve saperlo**: l'etichetta pubblicata contiene entrambe le architetture e Docker prende quella giusta da sé. Torna utile solo se costruisci o trasferisci l'immagine a mano (nota al passo 4), che è l'unico modo di sbagliarla — e si scopre con un `exec format error` che non spiega niente.

`df -h` elenca i dischi con lo spazio libero. Serve al passo dopo.

## 3. Decidi dove vivono i dati

**La risposta breve è: non fare niente.** Il file del passo 5 usa un **volume Docker con nome**, che Docker crea da sé al primo avvio, con i permessi giusti, dove tiene già le sue cose. Per la maggior parte delle macchine va bene così, e questo passo non richiede nemmeno un comando.

Vale comunque i trenta secondi che serve a leggerlo, perché dentro quella directory finiscono il database, le fotografie dei membri e **la chiave privata dell'istanza**, che non è sostituibile: se la perdi, i membri non riconoscono più la loro istanza. E spostarla dopo significa fermare l'istanza.

Guarda dove Docker tiene le sue cose, e quanto spazio c'è lì:

```sh
docker info --format '{{.DockerRootDir}}' && df -h "$(docker info --format '{{.DockerRootDir}}')"
```

**Se quel percorso è sul disco grande** — su molti NAS è qualcosa come `/volume1/@docker` — hai finito: vai al passo 4 e non cambiare niente.

**Se invece è sulla partizione di sistema** e lì lo spazio è poco, i dati vanno su una cartella del disco grande. Creala adesso, con i permessi giusti:

```sh
sudo mkdir -p /volume1/estia-data && sudo chown -R 10001:10001 /volume1/estia-data && sudo chmod 700 /volume1/estia-data
```

Sostituisci `/volume1` con un percorso che esiste sulla tua macchina — lo hai appena visto con `df -h`. Il `10001` invece non si tocca e non è arbitrario: è l'utente non-root con cui gira il container. Al passo 5 c'è scritta la riga da cambiare di conseguenza.

## 4. Prendi l'immagine

**Non devi fare niente: la scarica il passo 6.** L'immagine è pubblica su `ghcr.io/chrono-web/estia`, senza credenziali e senza account, e la stessa etichetta contiene sia `linux/amd64` sia `linux/arm64`.

Se vuoi portarti avanti, o semplicemente vedere che la rete funziona:

```sh
docker pull ghcr.io/chrono-web/estia:latest
```

Sono qualche centinaio di megabyte: su una connessione lenta ci mette parecchio, ed è normale che la barra stia ferma un po'.

**Quale etichetta usare.** `latest` segue `main`: ogni modifica pubblicata diventa un aggiornamento disponibile per te. Va benissimo per provare, ma su un'istanza con dentro le fotografie di persone vere è più tranquillo **agganciarsi a un'etichetta fissa**, così sei tu a decidere quando aggiornare e non il ritmo di chi sviluppa. Ne esiste una per ogni commit, e si scrive al posto di `latest` nel file del passo 5: `ghcr.io/chrono-web/estia:sha-8a1147c`.

Le trovi elencate nella pagina dei package del repository. Quando vorrai aggiornare, cambi quella riga e fai `docker compose pull && docker compose up -d` — con il passo 12 letto prima, non dopo.

> **Se la macchina non ha rete verso Internet**, o preferisci non fargliene avere, l'immagine si scarica altrove e si trasferisce. Il modo che funziona anche quando la macchina non ti lascia scrivere da nessuna parte è farla scorrere dentro `docker load`, senza appoggiare file. Qui l'architettura la scegli tu, quindi il passo 2 conta davvero — e va detta esplicitamente, perché altrimenti prendi quella del computer da cui scarichi:
>
> ```sh
> docker pull --platform linux/amd64 ghcr.io/chrono-web/estia:latest
> ```
>
> ```sh
> docker save ghcr.io/chrono-web/estia:latest | gzip | ssh utente@nas 'docker load'
> ```
>
> `scp` verso molti NAS fallisce con un `Permission denied` fuorviante: `scp` recente usa il protocollo SFTP, e parecchi NAS non espongono `sftp-server`. Se ti serve comunque copiare un file, `scp -O` usa il vecchio protocollo.

## 5. Scrivi il file `docker-compose.yml`

**Questo passo crea un file, non esegue comandi.** Il file dice a Docker come far girare l'istanza, e `docker compose` lo cerca nella cartella in cui ti trovi. È il punto in cui è più facile sbagliarsi, perché quelle righe con i due punti sembrano comandi e non lo sono: incollate da sole nel terminale non installano niente, rispondono `comando non trovato`. Qui sotto sono dentro un comando che le scrive nel file al posto tuo.

Prima la cartella che lo conterrà. Su un NAS conviene sul disco grande, per esempio `/volume1/docker/estia`; su un mini-PC va bene la tua home:

```sh
mkdir -p ~/estia && cd ~/estia
```

Poi il file. **Incolla questo comando per intero**, dalla prima riga fino all'ultima `YAML` compresa, e premi invio una volta sola: scrive il file già pronto.

```sh
cat > docker-compose.yml <<'YAML'
name: estia
services:
  core-api:
    image: ghcr.io/chrono-web/estia:latest
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
YAML
```

Se preferisci un editor, `nano docker-compose.yml` e incolla **solo le righe comprese fra `cat …` e `YAML`**, cioè da `name: estia` a `estia-data:`; poi Ctrl+O per salvare e Ctrl+X per uscire.

Controlla che sia venuto bene:

```sh
docker compose config
```

Se ti ristampa la configurazione, il file è valido. Se dà errore, quasi sempre è l'indentazione: in YAML contano gli spazi a inizio riga, e un tab non vale come spazi.

**La riga da non sbagliare è `0.0.0.0:3000:3000`.** Con `127.0.0.1` l'istanza risponde solo alla macchina stessa, e dal telefono in salotto non la vedi. È il default giusto per un computer di sviluppo e quello sbagliato qui.

Se al passo 3 hai scelto la cartella tua invece del volume, cambia due cose nel file: al posto di `- estia-data:/data` scrivi `- /volume1/estia-data:/data`, e togli le ultime due righe (`volumes:` e `estia-data:` in fondo, quelle senza indentazione).

## 6. Accendi

Dalla stessa cartella del passo 5:

```sh
docker compose up -d
```

Se risponde `no configuration file provided`, sei in un'altra cartella: torna in quella con `cd ~/estia` — o dove hai messo il file — e riprova.

Se la porta 3000 è già occupata da qualcos'altro sulla macchina, cambia **solo il numero a sinistra** nel file: `"0.0.0.0:3080:3000"`. Poi ridai `docker compose up -d`.

## Dal pannello grafico del NAS, al posto dei passi 4, 5 e 6

Salta questa sezione se hai appena acceso l'istanza da terminale: è l'altra strada per fare le stesse tre cose, e ne serve una sola.

**Se il tuo NAS sa importare un file Compose, usa quello.** Su Synology è Container Manager → **Progetto** → Crea, e nel campo del file incolli il contenuto del passo 5 (le righe da `name: estia` a `estia-data:`). È la stessa identica installazione di questa guida, con un'interfaccia sopra: tutto il resto della guida continua a valere parola per parola.

Se invece crei il container a mano, dalla schermata delle immagini e dei container, servono tre cose e nessun'altra.

**L'immagine.** Nel registro delle immagini cerca `ghcr.io/chrono-web/estia`, etichetta `latest`. Alcuni pannelli cercano solo su Docker Hub e non la trovano: in quel caso scaricala una volta da terminale con `docker pull ghcr.io/chrono-web/estia:latest`, e poi comparirà fra le immagini locali del pannello.

**La porta.** Porta locale `3000`, porta del container `3000`. Se il pannello ha un campo per l'indirizzo su cui pubblicare, lascialo vuoto o mettici `0.0.0.0`: con `127.0.0.1` l'istanza si apre solo dal NAS stesso.

**La cartella dei dati.** Nella sezione dei **volumi** o delle **cartelle**, aggiungi una riga:

| Cartella sul NAS              | Percorso nel container |
| ----------------------------- | ---------------------- |
| una cartella tua, o un volume | `/data`                |

**Gli aggiornamenti non ti fanno rifare niente nemmeno se questa riga la dimentichi**: l'immagine dichiara da sé che `/data` è un volume, quindi Docker gliene assegna uno anche se non glielo chiedi, e quel volume sopravvive alla ricreazione del container. È la stessa cosa che fa Jellyfin con `/config`. **Ma conviene dargli un nome tu**, perché un volume senza nome Docker lo chiama con sessanta caratteri a caso: sai che i tuoi dati sono al sicuro e non sai dove sono. Con un nome, o con una cartella tua, li ritrovi, li sposti su un altro disco, li copi. L'istanza te lo dice nella sezione **Stato dell'istanza**, alla riga «Dove stanno i dati».

> **Se stai leggendo questa guida dopo aver perso una configurazione**: fino al 2026-08-17 l'immagine non dichiarava quel volume, e un aggiornamento senza cartella mappata azzerava davvero l'istanza. Era un difetto di ESTIA, non del tuo NAS. Dalla versione successiva non succede più; quei dati però non sono recuperabili.

Avvia il container. Da qui in avanti segui il passo 7: dove la guida dice `docker compose logs`, tu leggi la scheda **Log** del container nel pannello, e dove dice di riavviare, usi il pulsante del pannello.

## 7. Prendi il codice di configurazione

Viene stampato una volta sola all'avvio, e **di proposito non finisce nei log strutturati**: è una credenziale, e l'unico modo di raggiungerti prima che esista un account.

```sh
docker compose logs core-api | head -20
```

Dal pannello grafico è la scheda **Log** del container, in cima.

Il codice cambia a ogni riavvio del processo. Se lo perdi, riavvia e leggi il nuovo.

## 8. Configura dal browser

Ti serve un modo per raggiungere la macchina da un altro dispositivo. **Prova prima con il suo nome**, che quasi tutti i NAS pubblicano da sé — Bonjour su Synology e QNAP, Avahi su UGREEN, TrueNAS e i mini-PC Linux ([ADR 0017](adr/0017-niente-mdns-nostro.md)):

```
http://nome-della-macchina.local:3000
```

Il nome è quello che vedi nel pannello del NAS, di solito sotto «rete» o «identificazione»; su Linux è quello che risponde `hostname`. È la strada migliore perché **non cambia**, mentre l'indirizzo numerico può cambiare quando il router riassegna gli indirizzi — e allora il segnalibro di tua mamma smette di funzionare.

Se il nome non risolve — capita su reti che filtrano il multicast, o che isolano i dispositivi fra loro — serve l'indirizzo:

```sh
ip -4 addr show scope global | grep inet
```

e in quel caso **riservalo nel router**, dalla sezione DHCP, così resta quello per sempre. Sono due minuti che ti risparmiano di rispiegare l'indirizzo a tutti fra sei mesi.

Apri l'istanza da un altro dispositivo sulla stessa rete e completa la configurazione: nome della comunità, descrizione, e il tuo account di amministratore.

> Da qualunque indirizzo la apri, quello finisce nei link d'invito che crei. Se la raggiungi con il nome, i tuoi vicini riceveranno un link con il nome.

**Trascrivi il codice di recupero.** Compare una volta sola. Chi perde quello e la password perde l'istanza, e non è un difetto: è una conseguenza dichiarata di non avere un server centrale che possa reimpostartela ([ADR 0009](adr/0009-recupero-accesso-amministratore.md)). Trattalo come le chiavi di casa.

## 9. Fai entrare qualcuno

Dalla sezione di amministrazione premi **Crea invito**: ti compare un **link completo**, pronto da incollare in un messaggio. Chi lo riceve lo apre, sceglie un nome e chiede di entrare; tu approvi. **Avere un invito permette di chiedere, mai di entrare da soli.**

Il link contiene l'indirizzo da cui **tu** stai guardando l'istanza in quel momento, perché è l'unico che si sa per certo funzionare su questa rete. Ne segue una cosa da sapere: se apri l'amministrazione da `localhost` — cioè dalla macchina stessa — il link che ottieni funziona solo lì, e a chi lo riceve non si apre. L'istanza te lo dice in rosso quando succede. Crea l'invito dall'indirizzo di rete, quello del passo 8.

A questo punto l'istanza funziona. Ma non è finita.

## 10. I backup, che sono la parte che si salta e non si dovrebbe

Un'istanza senza backup è un disco che prima o poi si rompe con dentro le fotografie di tutti.

**Si fa dal browser, senza terminale** ([ADR 0016](adr/0016-backup-dal-pannello.md)). Nella sezione **Amministrazione**, riquadro **Backup**:

1. **Genera una coppia.** La chiave privata compare **una volta sola** — mettila in un gestore di password o stampala, **fuori da questa macchina**. Sull'istanza resta solo quella pubblica, ed è ciò che rende i backup davvero sicuri: **l'istanza produce archivi che non è in grado di rileggere**. Chi si porta via la macchina trova file illeggibili.
2. **Salva.** Da quel momento i backup girano da soli, ogni tanto quanto hai scelto.
3. **Fai un backup adesso**, per vedere subito che funziona invece di scoprirlo domani.
4. **Scarica** l'archivio più recente e mettilo altrove.

L'ultimo dei quattro non è un extra. Di default gli archivi finiscono **accanto ai dati, sullo stesso disco**: ti proteggono da un errore e da un aggiornamento andato male, non dalla rottura del disco né dal furto della macchina. Il pannello te lo dice ogni volta. Sono cifrati apposta perché tu possa metterli ovunque — un disco esterno, un altro computer, una chiavetta.

### Se vuoi che gli archivi vadano su un altro disco

Quella è l'unica cosa che dal pannello non si sceglie, di proposito: un percorso scritto in un campo di testo sarebbe una scrittura arbitraria sulla macchina concessa attraverso il browser. Si dichiara nel `docker-compose.yml` del passo 5, dentro `environment:`, insieme alla chiave:

```yaml
ESTIA_BACKUP_DIR: /backup
ESTIA_BACKUP_PUBLIC_KEY: "age1..."
ESTIA_BACKUP_INTERVAL_HOURS: "24"
ESTIA_BACKUP_KEEP: "7"
```

con la cartella montata sotto `volumes:`:

```yaml
- /volume1/docker/estia-backup:/backup
```

creata prima con i permessi giusti:

```sh
sudo mkdir -p /volume1/docker/estia-backup && sudo chown 10001:10001 /volume1/docker/estia-backup && sudo chmod 700 /volume1/docker/estia-backup
```

La coppia di chiavi la generi comunque dal pannello, oppure da qui:

```sh
docker run --rm --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js chiavi
```

**Attenzione a una conseguenza**: se metti quelle variabili, la configurazione arriva dall'ambiente e **il pannello smette di poterla cambiare** — te lo dice, invece di far finta. È voluto: due posti dove cambiare la stessa cosa, con uno che vince al riavvio, sono peggio di uno solo scomodo.

Riavvia con `docker compose up -d`. **Il primo backup parte un minuto dopo**, non la notte seguente: così un errore di configurazione lo vedi subito.

### Quanta memoria vuole un backup, che è più di quanto sembri

Un archivio viene cifrato **tutto in memoria** ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)), e misurando serve **circa sei volte la dimensione dei dati**: 1,25 GB per un'istanza da 200 MB, 2,5 GB per una da 400 MB.

Serve saperlo per due motivi.

**Se metti un limite di memoria al container**, tienine conto. Sotto la soglia il backup non fallisce con un errore: è il kernel a uccidere il processo, senza scrivere niente da nessuna parte, e con `restart: unless-stopped` l'istanza si riavvia e riprova all'infinito. Per questo il Compose di riferimento **non impone un limite di memoria**: lo imposti tu, se vuoi che ESTIA non possa prendersi tutta la macchina.

```yaml
mem_limit: 2g
```

L'istanza guarda il proprio limite e i propri dati, e nella sezione **Stato dell'istanza** te lo dice quando il primo non basta per i secondi. Prima che succeda, non dopo.

**E c'è un tetto pratico alla dimensione di un'istanza**: con 2 GB di fotografie servirebbero 12 GB di memoria, che su un NAS di solito non ci sono. Fino a qualche centinaio di megabyte non è un problema. Oltre, va risolto nel prodotto, e ADR 0013 dice come.

## 11. La cifratura del disco, e la scelta che devi fare tu

Su quella macchina ora ci sono le fotografie di persone reali. **Sul disco sono in chiaro**, a meno che tu non abbia cifrato il volume.

La cifratura non la fa ESTIA: la fa il sistema della macchina ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)). LUKS su Linux, cifratura nativa dei volumi su Synology, QNAP e UGREEN, dataset cifrati su TrueNAS. È la scelta con la copertura più ampia, perché protegge in un colpo solo database, media, identità e file temporanei.

**Il punto non è cifrare: è dove sta la chiave quando la macchina si accende.**

| Livello                  | Protegge da                                           | Non protegge da                                      | Prezzo                        |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| **Passphrase all'avvio** | Furto della macchina, dischi rimossi, dischi dismessi | Chi accede alla macchina mentre è accesa e sbloccata | L'istanza non riparte da sola |
| **Sblocco automatico**   | Dischi rimossi, dischi dismessi                       | **Furto della macchina**                             | Nessuno                       |
| **Nessuna cifratura**    | Nulla                                                 | Tutto                                                | Nessuno                       |

**Il consiglio è la passphrase all'avvio**, ed è consapevole: se la macchina deve tornare da sola dopo un blackout, la chiave deve stare su di essa, e chi la porta via porta via anche quella. L'unica protezione che regge contro il furto dell'apparecchio è una passphrase che non risiede da nessuna parte, perché la digita una persona.

Il prezzo è reale e va detto a chi userà l'istanza: **dopo un'interruzione di corrente la bacheca resta ferma finché qualcuno non sblocca la macchina.** Su un servizio che è la bacheca di un quartiere, è un disservizio: decidilo prima, non durante.

Configurato il volume dal pannello del tuo NAS — o con LUKS, se è un Linux — **dichiaralo a ESTIA** aggiungendo dentro `environment:`:

```yaml
ESTIA_AT_REST_ENCRYPTION: passphrase
```

I valori sono `passphrase`, `automatic` o `none`. Se non lo dichiari, l'istanza non presume: dice «non dichiarata».

**Perché dichiararlo, se il sistema lo sa già.** Perché ESTIA verifica: guarda il volume sotto i propri dati e riconosce se è cifrato. Ma **non può vedere come viene sbloccato** — una passphrase digitata e una chiave su disco producono lo stesso dispositivo — e quella parte la sa solo chi ha configurato la macchina.

Nella sezione **Stato dell'istanza** dell'amministrazione trovi le due cose affiancate: quello che l'istanza ha osservato e quello che tu hai dichiarato. Se dichiari una cifratura che l'istanza non vede, te lo dice in rosso e lo scrive nei log. È il caso che conta davvero: **una protezione creduta e non presente è peggio di una protezione assente e nota.**

## 12. Aggiornare

L'ordine conta, perché le migrazioni del database sono **solo in avanti**: non si torna indietro, e il rollback è il ripristino da un backup ([`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §8).

### Se la tua istanza non ha ancora i backup configurati, l'ordine è questo

Vale per ogni istanza nata prima del passo 10, e va letto **prima** di aggiornare, perché è il caso in cui l'ordine sbagliato costa qualcosa che non si recupera.

Quando la versione nuova trova migrazioni da applicare si scrive un backup da sola. Ma se non c'è niente di configurato non può scriverlo, e allora **migra lo stesso**: è una decisione presa ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)), perché lasciare un quartiere senza la propria bacheca è un danno certo contro un rischio possibile. Il risultato è che quell'aggiornamento resta senza punto di ritorno, per sempre — un backup fatto dopo non riporta indietro uno schema che va solo avanti.

L'istanza non ti ferma. L'ordine giusto lo devi mettere tu, e sono tre passi:

1. **Configura i backup sull'istanza che stai per aggiornare** — passo 10, senza toccare l'immagine.
2. **Verifica che il primo archivio esista davvero.** Parte un minuto dopo il riavvio, quindi lo vedi subito.

   ```sh
   docker compose logs core-api | grep backup_ && ls -lh /volume1/docker/estia-backup/
   ```

3. **Solo adesso aggiorna.** A questo punto ne avrai due: quello periodico appena scritto e quello che l'istanza si prende da sola prima di migrare.

Se salti i primi due, non succede niente di visibile — ed è esattamente il problema.

### L'aggiornamento vero e proprio

```sh
docker compose exec core-api node dist/backup/cli.js backup /backup
```

```sh
docker compose pull && docker compose up -d
```

Prima il backup, poi l'aggiornamento. Se qualcosa va storto, il punto di ritorno è di due minuti fa e non di ieri notte.

### Se te lo dimentichi, ci pensa l'istanza

La riga sopra vale la pena farla lo stesso, ma non sei più solo tu a doverla ricordare. **Quando la versione nuova si accorge di avere migrazioni da applicare, prima di applicarle si scrive un backup da sola.** Lo trovi nella stessa cartella degli altri, con un nome che lo distingue:

```sh
ls -lh /volume1/docker/estia-backup/estia-aggiornamento-*.tar.age
```

Ha un nome suo perché **non viene cancellato dalla rotazione dei backup notturni**: è l'archivio più prezioso che l'istanza produca, e con `ESTIA_BACKUP_KEEP=1` la notte dopo se lo sarebbe portato via. Fra loro invece questi archivi si ruotano normalmente, con lo stesso `ESTIA_BACKUP_KEEP`: con il default di 7 restano gli ultimi sette aggiornamenti, quindi due aggiornamenti ravvicinati li tieni entrambi e puoi ancora tornare al primo mentre verifichi il secondo.

Due cose da sapere prima che succedano:

- **L'avvio è più lento**, quel tanto che serve a cifrare tutto l'archivio, fotografie comprese. Succede una volta per aggiornamento, e nel frattempo la bacheca non risponde.
- **Se i backup non sono configurati, l'istanza si aggiorna lo stesso** invece di restare ferma. Ma te lo dice, e due volte: nei log **prima** di migrare — `schema_migration_without_backup`, così la riga c'è anche se poi l'aggiornamento si pianta a metà e non arriva a registrare nulla — e nella sezione **Stato dell'istanza** dopo, dove resta scritto che quell'aggiornamento non ha un punto di ritorno. La seconda non sparisce al riavvio successivo, perché il fatto non sparisce.

Dopo l'aggiornamento, guarda la sezione **Stato dell'istanza**: dice da quale versione a quale, e se il backup c'è stato.

```sh
docker compose logs core-api | grep schema_
```

## 13. Ripristinare

Un backup mai ripristinato non è un backup. **Provalo prima che serva davvero.**

Il ripristino è l'unico momento in cui la chiave privata tocca la macchina. `read -s` evita che finisca nella cronologia della shell:

```sh
read -s -p "chiave privata: " K; echo; docker run --rm --user 10001:10001 -e ESTIA_BACKUP_PRIVATE_KEY="$K" -v /volume1/docker/estia-backup:/backup:ro -v /volume1/docker/estia-restore:/restore --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js ripristina /backup/ARCHIVIO.tar.age /restore
```

Poi accendi un'istanza di prova sui dati ripristinati, su un'altra porta, senza toccare quella vera, e guarda se c'è tutto.

E vale la pena saperlo: **un archivio si apre anche senza ESTIA**, con strumenti standard ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)):

```sh
age -d -i chiave-privata.txt archivio.tar.age | tar -xv
```

## Quando qualcosa non va

| Sintomo                                                            | Che cosa sta succedendo                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `comando non trovato` su righe come `name:`, `services:`, `image:` | Hai incollato nel terminale il **contenuto di un file**. Quel blocco va salvato come `docker-compose.yml`: passo 5                     |
| `docker: comando non trovato`                                      | Docker non è installato su questa macchina. Passo 1 — sui NAS si installa dal centro applicazioni, non da terminale                    |
| `docker compose` non esiste, ma `docker-compose` sì                | Compose versione 1: funziona, scrivi `docker-compose` dove la guida scrive `docker compose`                                            |
| `no configuration file provided: not found`                        | Non sei nella cartella che contiene `docker-compose.yml`. `cd` lì e riprova                                                            |
| `docker` dà «permission denied» sul socket                         | Il tuo utente non è nel gruppo `docker`: `sudo usermod -aG docker "$USER"`, poi **chiudi e riapri la sessione** — non basta il comando |
| `sudo` via SSH: «a terminal is required»                           | Serve `ssh -t utente@macchina 'sudo ...'`                                                                                              |
| Il container parte e muore, `exec format error`                    | Immagine dell'architettura sbagliata: succede solo se l'hai trasferita a mano. Torna alla nota del passo 4                             |
| Dal telefono non si apre, dalla macchina sì                        | La porta è pubblicata su `127.0.0.1`. Deve essere `0.0.0.0`                                                                            |
| `scp` dà «Permission denied» su percorsi che esistono              | Il NAS non espone `sftp-server`. Usa la pipe del passo 4, o `scp -O`                                                                   |
| L'istanza parte ma dice `data_dir_permissions_loose`               | La cartella dei dati è leggibile da altri utenti della macchina, e il filesystem ha rifiutato `chmod`                                  |
| Il container si rifiuta di partire per `ESTIA_BACKUP_*`            | Hai messo una sola delle due variabili, o la chiave privata al posto della pubblica. Lo dice il messaggio                              |
| Nei log compare `backup_not_configured`                            | Non è un errore: l'istanza ti sta dicendo che **non sta facendo backup**                                                               |
| Dopo un aggiornamento l'avvio è insolitamente lento                | L'istanza sta scrivendo il backup che precede le migrazioni. Succede una volta sola, per aggiornamento                                 |
| Nei log compare `schema_migration_without_backup`                  | L'istanza **sta per** migrare senza backup. Se la vedi in tempo, fermala e configurali (passo 12)                                      |
| Nei log compare `schema_migrated_without_backup`                   | L'aggiornamento è andato, ma senza punto di ritorno: non c'erano backup configurati                                                    |
| Nei log compare `schema_backup_failed`                             | Peggio del precedente: i backup li hai configurati e **non funzionano**. Controllali adesso                                            |

## Che cosa questa installazione non protegge

Detto qui perché nessuna interfaccia deve suggerire una protezione che non c'è.

**I dati sulla macchina sono in chiaro, se non hai cifrato il volume** al passo 11. Chi si porta via la macchina legge tutto: contenuti, account, fotografie. I **backup** invece sono sempre cifrati, anche su un'istanza senza cifratura a riposo.

**Chi amministra vede tutto ciò che l'istanza conserva.** È la conseguenza dell'auto-ospitalità, non un difetto da nascondere.

**Il feed locale è leggibile dal server che lo serve**, per scelta: è la bacheca di chi condivide l'istanza, non una chat privata. I messaggi privati non esistono ancora, e quando esisteranno saranno cifrati end-to-end o non esisteranno affatto ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)).
