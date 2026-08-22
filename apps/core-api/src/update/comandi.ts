import type { UpdateCommand } from "@estia/contracts";

import { shortContainerId, type Installation } from "./installazione.js";

/**
 * I comandi con cui si aggiorna **questa** istanza, non un'istanza in generale.
 *
 * Il pannello mostrava tre possibilità e lasciava indovinare quale fosse la
 * propria. Qui l'istanza dice la sua, perché sa dove tiene i dati e conosce il
 * proprio id di container: da lì `docker inspect`, sull'host, ricava la
 * cartella del file Compose. È il `cd` già compilato, che è la cosa che manca
 * a chi apre il terminale del NAS e non sa dove guardare.
 *
 * Due cose che questi comandi dicono a voce alta, perché sono i due modi in cui
 * un aggiornamento «riuscito» non aggiorna niente:
 *
 *   - `docker pull` da solo scarica e basta. Il container continua a girare con
 *     l'immagine vecchia finché non lo si ricrea.
 *   - la cartella non c'entra con il pull. `docker pull` parla con Docker; è
 *     `docker compose` che cerca un file dove sei.
 */

const INSTALL_URL = "https://raw.githubusercontent.com/chrono-web/estia/main/install.sh";

/** Il volume che `install.sh` gestisce senza che glielo si chieda. */
const VOLUME_PREDEFINITO = "estia-data";

/**
 * Compose battezza i propri volumi `<progetto>_<volume>`: un trattino basso nel
 * nome è il solo indizio, da dentro, che a creare il container sia stato lui.
 * È un indizio e non una prova — si può creare a mano un volume con quel nome —
 * quindi decide soltanto quale comando viene per primo, mai quale si vede.
 */
export function composeProjectIn(volume: string): string | undefined {
  const separatore = volume.lastIndexOf("_");
  return separatore > 0 ? volume.slice(0, separatore) : undefined;
}

function scarica(channel: string): UpdateCommand {
  return {
    title: "Scarica l'immagine nuova",
    command: `docker pull ${channel}`,
    note: "Questo scarica e basta: da solo non aggiorna niente, il container continua a girare con l'immagine vecchia finché non lo ricrei — è il comando qui sotto a farlo. E non dipende dalla cartella in cui ti trovi: `docker pull` parla con Docker, non con i file che hai lì.",
  };
}

const TITOLO_COMPOSE = "Se l'istanza l'ha creata Compose — ricreala dalla sua cartella";

const ETICHETTA_CARTELLA = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}';

function conCompose(installation: Installation): UpdateCommand {
  if (installation.containerId === undefined) {
    return {
      title: TITOLO_COMPOSE,
      command: "docker compose ls",
      note: "La colonna CONFIG FILES dice dove sta il file di questa istanza. Poi, in quella cartella: `cd LA_CARTELLA && docker compose pull && docker compose up -d`.",
    };
  }

  const id = shortContainerId(installation.containerId);

  // L'`if` non è eleganza: `cd ""` non è un errore, è un `cd` che non si muove.
  // Senza guardia il comando proseguirebbe nella cartella in cui sei, e
  // `docker compose` risponderebbe che lì non c'è nessun file — vero, e a
  // proposito della cartella sbagliata. Meglio una frase che lo dice.
  return {
    title: TITOLO_COMPOSE,
    command: `D=$(docker inspect -f '${ETICHETTA_CARTELLA}' ${id}); if [ -n "$D" ]; then cd "$D" && docker compose pull && docker compose up -d; else echo "Questo container non l'ha creato Compose: vale l'altro comando."; fi`,
    note: `La cartella se la ricava da sola: questa istanza conosce il proprio id di container (${id}), e Docker sa dove l'ha creata. Se invece non è stato Compose a farla, non prova nemmeno: te lo scrive e si ferma.`,
  };
}

/**
 * Il ramo che mancava: un container costruito nel modulo del pannello del NAS.
 *
 * Non l'ha fatto Compose, quindi non c'è nessuna cartella dove tornare; e non
 * l'ha fatto `install.sh`, quindi rilanciarlo sarebbe **il** modo di sbagliare:
 * quello script ricrea sul volume che gestisce lui, e i dati di un container
 * del pannello stanno quasi sempre su una cartella del NAS mappata a mano. Il
 * container nuovo ripartirebbe vuoto accanto ai dati vecchi.
 *
 * Ricrearlo a mano vuole le porte e le cartelle esatte, che da dentro non si
 * vedono — il `root` di un bind mount è relativo al filesystem di origine, e su
 * un Synology `/volume1/docker/estia/data` si presenta come
 * `/docker/estia/data`. Quindi non le indoviniamo: le chiediamo a Docker, che
 * le sa, e stampiamo la riga già scritta. Chi amministra la legge prima di
 * darla, il che è anche l'unico momento in cui guarda davvero dove stanno i
 * propri dati.
 */
function conRicreazione(installation: Installation, channel: string): UpdateCommand | undefined {
  if (installation.containerId === undefined) {
    return undefined;
  }

  const id = shortContainerId(installation.containerId);
  const porte =
    "{{range $p, $b := .HostConfig.PortBindings}}{{range $b}} -p {{.HostPort}}:{{$p}}{{end}}{{end}}";
  const volumi =
    "{{range .Mounts}} -v {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}:{{.Destination}}{{end}}";

  return {
    title: "Se l'ha creata il pannello del NAS o `docker run` — rifallo com'è",
    command: `docker inspect -f 'docker run -d --name {{slice .Name 1}} --restart unless-stopped${porte}${volumi} ${channel}' ${id}`,
    note: `Questo non ricrea niente: **stampa** il comando che rifà questo container esattamente com'è — nome, porte e cartelle prese da Docker invece che dalla tua memoria. Leggi la riga: dopo ogni \`-v\` ci deve essere il posto in cui stanno davvero i tuoi dati. Poi \`docker rm -f ${id}\` e incolla la riga stampata.`,
  };
}

function conInstallScript(installation: Installation): UpdateCommand {
  const volume = installation.volume;
  const suo = volume === undefined || volume === VOLUME_PREDEFINITO;
  const comando = suo
    ? `curl -fsSL ${INSTALL_URL} | sh`
    : `curl -fsSL ${INSTALL_URL} | ESTIA_VOLUME=${volume} sh`;

  return {
    title: "Se l'hai installata con il comando solo — rilancialo",
    command: comando,
    note: `È lo stesso comando con cui si installa: scarica l'immagine nuova e rifà il container${volume === undefined ? "" : ` sullo stesso volume «${volume}»`}, quindi i dati restano dove sono. Si ferma da solo, senza toccare niente, se trova un container che tiene i dati altrove.`,
  };
}

/**
 * Vengono mostrati **sempre**, non solo quando il registry dice che c'è una
 * versione nuova.
 *
 * Il caso che ha fatto nascere questa funzione è l'opposto: un'istanza nata da
 * un'immagine che non dichiara da quale commit viene non può confrontarsi con
 * niente, il verdetto è «non verificabile», e il pannello — che mostrava i
 * comandi solo su «disponibile» — non diceva più come si aggiorna proprio a chi
 * ne aveva più bisogno. Aggiornare è utile anche senza sapere se serve; e dopo
 * un aggiornamento l'immagine dichiara il commit, quindi la volta dopo si sa.
 */
export function updateCommands(installation: Installation, channel: string): UpdateCommand[] {
  if (installation.kind === "host") {
    return [];
  }

  if (installation.kind === "ephemeral") {
    return [
      {
        title: "Prima i dati, poi l'aggiornamento",
        command: "docker cp CONTAINER:/data ./estia-data-salvata",
        note: "I dati di questa istanza stanno dentro il container: ricrearlo per aggiornarlo li cancella — account, contenuti, fotografie e la chiave privata, che non è sostituibile. Portali fuori, monta un volume con un nome, e solo allora aggiorna. Il passo è nella guida di installazione.",
      },
    ];
  }

  const compose = conCompose(installation);
  const ricrea = conRicreazione(installation, channel);
  const passi = [scarica(channel), ...ordina(installation, compose, ricrea)];

  return passi;
}

/**
 * Quale ricreazione viene prima. Sono tutte condizionali nel titolo — l'ordine
 * dice soltanto quale è più probabile qui, e nessuna delle tre è nascosta.
 *
 * Le esclusioni invece non sono questione di ordine, e sono due:
 *
 *   - `install.sh` non compare mai dove i dati non stanno sul volume che quello
 *     script gestisce. Ricrea sul **suo** volume: su un bind mount o su un
 *     volume anonimo farebbe ripartire l'istanza vuota accanto ai dati veri.
 *   - Compose non compare su un volume il cui nome non ha il prefisso di un
 *     progetto, perché Compose quel prefisso lo mette sempre.
 */
function ordina(
  installation: Installation,
  compose: UpdateCommand,
  ricrea: UpdateCommand | undefined,
): UpdateCommand[] {
  const ricreazione = ricrea === undefined ? [] : [ricrea];

  // Una cartella del NAS mappata a mano: è il container del modulo del
  // pannello, il caso che `install.sh` non deve toccare.
  if (installation.kind === "bind") {
    return [...ricreazione, compose];
  }

  // Un volume anonimo sopravvive a Compose, e a una ricreazione che lo chiami
  // per nome — che è ciò che la riga stampata fa. A nient'altro.
  if (installation.kind === "anonymous") {
    return [compose, ...ricreazione];
  }

  const daCompose =
    installation.volume !== undefined && composeProjectIn(installation.volume) !== undefined;

  return daCompose ? [compose, ...ricreazione] : [conInstallScript(installation), ...ricreazione];
}

/** Una riga su come questa istanza risulta installata, per quel che può sapere. */
export function describeInstallation(installation: Installation): string | undefined {
  switch (installation.kind) {
    case "host":
      return undefined;
    case "ephemeral":
      return "Questa istanza gira in un container e tiene i dati dentro di sé.";
    case "anonymous":
      return "Questa istanza gira in un container, con i dati su un volume anonimo.";
    case "bind":
      return "Questa istanza gira in un container, con i dati su una cartella della macchina.";
    case "volume":
      return `Questa istanza gira in un container, con i dati sul volume «${installation.volume ?? "senza nome"}».`;
  }
}
