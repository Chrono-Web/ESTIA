import { writeFileSync } from "node:fs";
import path from "node:path";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { composeProjectIn, describeInstallation, updateCommands } from "./comandi.js";
import { containerIdIn, detectInstallation, volumeNameIn } from "./installazione.js";
import { DEFAULT_UPDATE_CHANNEL } from "./check.js";

const ID = "3f2a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708";

/**
 * La tabella dei mount su disco, come la trova il rilevamento: `SystemRoots`
 * porta percorsi, non contenuti.
 */
async function suUnaMacchina(
  righe: string[],
  prova: (roots: { mountInfo: string; sysBlock: string }) => void,
): Promise<void> {
  await withTempDataDir((root) => {
    const mountInfo = path.join(root, "mountinfo");

    writeFileSync(mountInfo, righe.join("\n"));
    prova({ mountInfo, sysBlock: path.join(root, "sys") });

    return Promise.resolve();
  });
}

const RESOLV = `1200 1199 0:60 /containers/${ID}/resolv.conf /etc/resolv.conf rw,relatime - ext4 /dev/sda1 rw`;
const RADICE = "1100 1099 0:59 / / ro,relatime - overlay overlay rw";

describe("detectInstallation", () => {
  it("legge l'id del container dai mount che Docker gli infila dentro", () => {
    expect(containerIdIn([RADICE, RESOLV].join("\n"))).toBe(ID);
  });

  it("non si ancora a /var/lib/docker: su Synology la radice di Docker è altrove", () => {
    const synology = `1200 1199 0:60 /@docker/containers/${ID}/hosts /etc/hosts rw - btrfs /dev/mapper/vg1 rw`;
    expect(containerIdIn(synology)).toBe(ID);
  });

  it("riconosce un volume con un nome", async () => {
    await suUnaMacchina(
      [
        RADICE,
        RESOLV,
        "1300 1100 0:61 /var/lib/docker/volumes/estia-data/_data /data rw - ext4 /dev/sda1 rw",
      ],
      (roots) => {
        expect(detectInstallation("/data", roots)).toEqual({
          kind: "volume",
          volume: "estia-data",
          containerId: ID,
        });
      },
    );
  });

  it("distingue il volume anonimo, che ha un nome di 64 esadecimali e nessun padrone", async () => {
    const anonimo = "a".repeat(64);

    await suUnaMacchina(
      [
        RADICE,
        RESOLV,
        `1300 1100 0:61 /var/lib/docker/volumes/${anonimo}/_data /data rw - ext4 /dev/sda1 rw`,
      ],
      (roots) => {
        expect(detectInstallation("/data", roots).kind).toBe("anonymous");
      },
    );
  });

  it("chiama bind una cartella della macchina montata sui dati", async () => {
    await suUnaMacchina(
      [RADICE, RESOLV, "1300 1100 0:61 /docker/estia/data /data rw - btrfs /dev/mapper/vg1 rw"],
      (roots) => {
        expect(detectInstallation("/data", roots).kind).toBe("bind");
      },
    );
  });

  it("chiama ephemeral i dati che stanno nel container e non su un volume", async () => {
    await suUnaMacchina([RADICE, RESOLV], (roots) => {
      expect(detectInstallation("/data", roots).kind).toBe("ephemeral");
    });
  });

  it("fuori da un container non c'è niente da aggiornare con Docker", async () => {
    await suUnaMacchina(["1100 1099 0:59 / / rw,relatime - ext4 /dev/sda1 rw"], (roots) => {
      expect(detectInstallation("/data", roots)).toEqual({ kind: "host" });
    });
  });

  it("il nome del volume si legge solo nel root del suo mount", () => {
    expect(volumeNameIn("/var/lib/docker/volumes/estia_estia-data/_data")).toBe("estia_estia-data");
    expect(volumeNameIn("/docker/estia/data")).toBeUndefined();
  });
});

describe("composeProjectIn", () => {
  it("vede il progetto nel prefisso che Compose appiccica ai propri volumi", () => {
    expect(composeProjectIn("estia_estia-data")).toBe("estia");
  });

  it("non inventa un progetto dove non c'è un trattino basso", () => {
    expect(composeProjectIn("estia-data")).toBeUndefined();
    expect(composeProjectIn("_iniziale")).toBeUndefined();
  });
});

describe("updateCommands", () => {
  const comandi = (installation: Parameters<typeof updateCommands>[0]): string[] =>
    updateCommands(installation, DEFAULT_UPDATE_CHANNEL).map((passo) => passo.command);

  it("mette il pull per primo e dice che da solo non aggiorna niente", () => {
    const passi = updateCommands({ kind: "volume", volume: "estia-data" }, DEFAULT_UPDATE_CHANNEL);

    expect(passi[0]?.command).toBe(`docker pull ${DEFAULT_UPDATE_CHANNEL}`);
    expect(passi[0]?.note).toContain("da solo non aggiorna niente");
  });

  it("compila il cd con l'id del container, che è la sola cosa che l'istanza sa di sé", () => {
    const cd = comandi({ kind: "bind", containerId: ID }).find((c) => c.includes("cd "));

    expect(cd).toContain(ID.slice(0, 12));
    expect(cd).toContain("com.docker.compose.project.working_dir");
    expect(cd).toContain("docker compose pull && docker compose up -d");
  });

  /**
   * `cd ""` non fallisce: resta dov'è. Senza guardia il comando andrebbe a
   * fare `docker compose pull` nella cartella in cui ti trovi, e l'errore
   * parlerebbe della cartella sbagliata.
   */
  it("non lascia che un container non-Compose finisca in un cd che non si muove", () => {
    const cd = comandi({ kind: "bind", containerId: ID }).find((c) => c.includes("cd "));

    expect(cd).toContain('if [ -n "$D" ]');
    expect(cd).toContain("non l'ha creato Compose");
  });

  it("senza id ripiega su una domanda a Docker, non su un percorso inventato", () => {
    expect(comandi({ kind: "bind" })).toContain("docker compose ls");
  });

  /**
   * Il caso del modulo del pannello: nessuna cartella Compose dove tornare, e
   * `install.sh` sarebbe il comando che fa ripartire l'istanza vuota accanto
   * ai dati veri, perché ricrea sul volume che gestisce lui.
   */
  it("su una cartella del NAS mappata a mano non propone mai install.sh", () => {
    const passi = comandi({ kind: "bind", containerId: ID });

    expect(passi.some((comando) => comando.includes("install.sh"))).toBe(false);
    expect(passi[1]).toContain("docker inspect -f 'docker run -d --name {{slice .Name 1}}");
  });

  it("la riga di ricreazione la fa scrivere a Docker: porte e cartelle non si indovinano", () => {
    const riga = comandi({ kind: "bind", containerId: ID })[1];

    expect(riga).toContain(".HostConfig.PortBindings");
    expect(riga).toContain("{{range .Mounts}}");
    expect(riga).toContain(DEFAULT_UPDATE_CHANNEL);
  });

  it("su un volume col prefisso di un progetto propone Compose per primo", () => {
    const passi = comandi({ kind: "volume", volume: "estia_estia-data", containerId: ID });

    expect(passi[1]).toContain("com.docker.compose.project.working_dir");
  });

  it("titola ogni ricreazione con il caso a cui serve, non con la sua posizione", () => {
    const passi = updateCommands({ kind: "bind", containerId: ID }, DEFAULT_UPDATE_CHANNEL);

    expect(passi[1]?.title).toMatch(/^Se l'ha creata il pannello del NAS/);
    expect(passi[2]?.title).toMatch(/^Se l'istanza l'ha creata Compose/);
  });

  it("su un volume senza prefisso propone per primo il comando di installazione", () => {
    const passi = comandi({ kind: "volume", volume: "estia-data", containerId: ID });

    expect(passi[1]).toBe(
      "curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/install.sh | sh",
    );
  });

  it("passa a install.sh il volume che non è quello che gestisce da sé", () => {
    const passi = comandi({ kind: "volume", volume: "dati-estia", containerId: ID });

    expect(passi[1]).toContain("| ESTIA_VOLUME=dati-estia sh");
  });

  /**
   * Il volume anonimo sopravvive a Compose e a nient'altro: offrire anche il
   * ricreare a mano sarebbe scrivere noi il comando che cancella i dati.
   */
  it("su un volume anonimo esclude install.sh, che lo lascerebbe orfano", () => {
    const passi = comandi({ kind: "anonymous", volume: "b".repeat(64), containerId: ID });

    expect(passi.some((comando) => comando.includes("install.sh"))).toBe(false);
    // La riga di ricreazione invece va bene: nomina il volume, quindi lo riattacca.
    expect(passi[2]).toContain("{{range .Mounts}}");
  });

  it("con i dati dentro il container manda a salvarli, non ad aggiornare", () => {
    const passi = updateCommands({ kind: "ephemeral", containerId: ID }, DEFAULT_UPDATE_CHANNEL);

    expect(passi).toHaveLength(1);
    expect(passi[0]?.command).toContain("docker cp");
  });

  it("fuori da un container non ha comandi da dare", () => {
    expect(updateCommands({ kind: "host" }, DEFAULT_UPDATE_CHANNEL)).toEqual([]);
    expect(describeInstallation({ kind: "host" })).toBeUndefined();
  });
});
