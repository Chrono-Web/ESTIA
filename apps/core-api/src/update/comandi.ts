import type { UpdateCommand } from "@estia/contracts";

import { comeCampo, type Diagnosis, diagnosi } from "../diagnostics.js";
import { shortContainerId, type Installation } from "./installazione.js";

/**
 * A step: its title and note come from the `diagnostics` catalogue, in Italian
 * as `title` and `note` and as keys for the reader's language (ADR 0044 §5).
 */
function passo(title: Diagnosis, command: string, note?: Diagnosis): UpdateCommand {
  return {
    ...comeCampo("title", title),
    command,
    ...(note === undefined ? {} : comeCampo("note", note)),
  };
}

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

function conEstiaCli(): UpdateCommand {
  return passo(
    diagnosi("diagnostics.update.command.cli.title"),
    "estia aggiorna",
    diagnosi("diagnostics.update.command.cli.note"),
  );
}

function scarica(channel: string): UpdateCommand {
  return passo(
    diagnosi("diagnostics.update.command.pull.title"),
    `docker pull ${channel}`,
    diagnosi("diagnostics.update.command.pull.note"),
  );
}

const ETICHETTA_CARTELLA = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}';

function conCompose(installation: Installation): UpdateCommand {
  if (installation.containerId === undefined) {
    return passo(
      diagnosi("diagnostics.update.command.compose.title"),
      "docker compose ls",
      diagnosi("diagnostics.update.command.compose.note"),
    );
  }

  const id = shortContainerId(installation.containerId);

  // L'`if` non è eleganza: `cd ""` non è un errore, è un `cd` che non si muove.
  // Senza guardia il comando proseguirebbe nella cartella in cui sei, e
  // `docker compose` risponderebbe che lì non c'è nessun file — vero, e a
  // proposito della cartella sbagliata. Meglio una frase che lo dice.
  return passo(
    diagnosi("diagnostics.update.command.compose.title"),
    `D=$(docker inspect -f '${ETICHETTA_CARTELLA}' ${id}); if [ -n "$D" ]; then cd "$D" && docker compose pull && docker compose up -d; else echo "Questo container non l'ha creato Compose: vale l'altro comando."; fi`,
    diagnosi("diagnostics.update.command.compose.note_container", { id }),
  );
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

  return passo(
    diagnosi("diagnostics.update.command.recreate.title"),
    `docker inspect -f 'docker run -d --name {{slice .Name 1}} --restart unless-stopped${porte}${volumi} ${channel}' ${id}`,
    diagnosi("diagnostics.update.command.recreate.note", { id }),
  );
}

function conInstallScript(installation: Installation): UpdateCommand {
  const volume = installation.volume;
  const suo = volume === undefined || volume === VOLUME_PREDEFINITO;
  const comando = suo
    ? `curl -fsSL ${INSTALL_URL} | sh`
    : `curl -fsSL ${INSTALL_URL} | ESTIA_VOLUME=${volume} sh`;

  return passo(
    diagnosi("diagnostics.update.command.install_script.title"),
    comando,
    volume === undefined
      ? diagnosi("diagnostics.update.command.install_script.note")
      : diagnosi("diagnostics.update.command.install_script.note_volume", { volume }),
  );
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
      passo(
        diagnosi("diagnostics.update.command.save_data.title"),
        "docker cp CONTAINER:/data ./estia-data-salvata",
        diagnosi("diagnostics.update.command.save_data.note"),
      ),
    ];
  }

  const compose = conCompose(installation);
  const ricrea = conRicreazione(installation, channel);
  const passi = [conEstiaCli(), scarica(channel), ...ordina(installation, compose, ricrea)];

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
  return installationDiagnosis(installation)?.detail;
}

/** La stessa riga, con la sua chiave di catalogo (ADR 0044 §5). */
export function installationDiagnosis(installation: Installation): Diagnosis | undefined {
  switch (installation.kind) {
    case "host":
      return undefined;
    case "ephemeral":
      return diagnosi("diagnostics.update.installation.ephemeral");
    case "anonymous":
      return diagnosi("diagnostics.update.installation.anonymous");
    case "bind":
      return diagnosi("diagnostics.update.installation.bind");
    case "volume":
      return installation.volume === undefined
        ? diagnosi("diagnostics.update.installation.volume_unnamed")
        : diagnosi("diagnostics.update.installation.volume", { volume: installation.volume });
  }
}
