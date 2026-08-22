import { readFileSync, realpathSync } from "node:fs";

import { findMountFor, type SystemRoots } from "../instance/atrest.js";

/**
 * Come è stata installata questa istanza, per quel poco che può saperne da
 * dentro il proprio container.
 *
 * Serve a una cosa sola: stampare nel pannello **il** comando di aggiornamento
 * di questa macchina, invece di tre comandi fra cui indovinare. Chi amministra
 * un NAS non sa se il container l'ha creato Compose, il pannello o uno script,
 * e sbagliare ramo qui non è un fastidio: ricreare a mano un container nato da
 * Compose, o rilanciare `install.sh` su un volume che non è il suo, sono i due
 * modi documentati di perdere una configurazione (ADR 0019).
 *
 * Da dentro il container si vede pochissimo. Non c'è il socket di Docker — e
 * non ci sarà: montarlo darebbe all'istanza il controllo della macchina che la
 * ospita, che è esattamente ciò che il modello delle minacce esclude. Restano
 * i mount, e nei mount ci sono due cose vere:
 *
 *   - l'**id del container**, perché Docker gli monta dentro `/etc/resolv.conf`
 *     e `/etc/hosts` da `…/containers/<id>/`;
 *   - il **nome del volume** dei dati, in `…/volumes/<nome>/_data`.
 *
 * L'id è la chiave di tutto: con quello, **sull'host**, `docker inspect`
 * risponde da dove viene il container e in quale cartella sta il suo file
 * Compose. Il pannello non lo chiede a Docker — non può — ma può scrivere il
 * comando che lo chiede, già compilato con l'id giusto.
 *
 * Quello che invece NON si ricava: il nome del container, le porte pubblicate
 * e il percorso di un bind mount. Il campo `root` della tabella dei mount è
 * relativo alla radice del filesystem di origine, non a quella della macchina:
 * su un Synology una cartella `/volume1/docker/estia/data` si presenta come
 * `/docker/estia/data`, perché `/volume1` è un filesystem a sé. Stamparlo come
 * percorso da usare sarebbe una mezza verità, e su un `cd` una mezza verità
 * costa un comando che non funziona.
 */

export type InstallationKind =
  /** Volume con un nome, creato a mano, dal pannello o da `install.sh`. */
  | "volume"
  /** Una cartella della macchina montata sui dati. */
  | "bind"
  /** Volume che Docker ha chiamato da sé: nessuno se lo porta dietro. */
  | "anonymous"
  /** Nessun volume: i dati stanno nel container e muoiono con lui. */
  | "ephemeral"
  /** Non è un container: installazione da sorgente sulla macchina. */
  | "host";

export interface Installation {
  kind: InstallationKind;
  /** Id del container, quando la tabella dei mount lo lascia vedere. */
  containerId?: string;
  /** Nome del volume dei dati, per `volume` e `anonymous`. */
  volume?: string;
}

/** Docker chiama così i volumi che nessuno ha battezzato. */
const ANONIMO = /^[0-9a-f]{64}$/;

/**
 * L'id del container, dai mount che Docker gli infila dentro.
 *
 * Non si ancora a `/var/lib/docker`: la radice di Docker si sposta, e su un
 * Synology sta in `/volume1/@docker`. Quello che non si sposta è il segmento
 * `containers/<64 esadecimali>`.
 */
export function containerIdIn(mountInfo: string): string | undefined {
  return /\/containers\/([0-9a-f]{64})\//.exec(mountInfo)?.[1];
}

/** Il nome del volume, che compare solo nel `root` del suo mount. */
export function volumeNameIn(root: string): string | undefined {
  return /\/volumes\/([^/]+)\/_data/.exec(root)?.[1];
}

/** Un id da scrivere in un comando: Docker accetta qualunque prefisso. */
export function shortContainerId(id: string): string {
  return id.slice(0, 12);
}

export function detectInstallation(dataDir: string, roots: SystemRoots): Installation {
  let mountInfo: string;

  try {
    mountInfo = readFileSync(roots.mountInfo, "utf8");
  } catch {
    // Nessuna tabella dei mount: né Linux né un container. Nient'altro da dire.
    return { kind: "host" };
  }

  const containerId = containerIdIn(mountInfo);
  const dentroUnContainer =
    containerId !== undefined || findMountFor(mountInfo, "/")?.fsType === "overlay";

  if (!dentroUnContainer) {
    return { kind: "host" };
  }

  const id = containerId === undefined ? {} : { containerId };

  let target = dataDir;

  try {
    target = realpathSync(dataDir);
  } catch {
    // Una cartella non ancora creata non è un fallimento del rilevamento.
  }

  const mount = findMountFor(mountInfo, target);

  if (mount === undefined || mount.mountPoint === "/") {
    return { kind: "ephemeral", ...id };
  }

  const volume = volumeNameIn(mount.root);

  if (volume === undefined) {
    return { kind: "bind", ...id };
  }

  if (ANONIMO.test(volume)) {
    return { kind: "anonymous", volume, ...id };
  }

  return { kind: "volume", volume, ...id };
}
