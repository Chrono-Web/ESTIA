> Translation of [`INSTALLAZIONE.md`](INSTALLAZIONE.md) at commit `58be5f9`. If the two differ, the original is right.

# Installing an ESTIA instance

This guide takes an instance from nothing to "it works, and I have a backup".

You need a machine that stays on: a NAS, a mini-PC, an old laptop running Linux, a server at home. Here we call it **the machine**; where a NAS does things differently, the guide says so.

It was written after real installations, and its most tedious steps are there because, on those occasions, they went wrong. The product budget is **under 30 minutes** ([`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4): if it takes you much longer, that is a flaw in the guide, not in you.

## How to read this guide

Three things before you start, because they are the three that tripped up the last installation.

**The grey blocks are not all the same.** The ones marked `sh` are **commands**: you paste them into the terminal and press Enter. The ones marked `yaml` are the **contents of a file**: they don't work in the terminal, and pasting them there answers `command not found`. Where a file is needed, the guide also gives you the command that writes it for you.

**There are three routes, and you need only one.**

| Route                | For whom                                                               | What you follow                                                                                                            |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **A single command** | Anyone with a terminal. It is the shortest and asks for no choices     | Step 1, then [the command](#installing-with-a-single-command), then from step 7                                            |
| **Step by step**     | Anyone who wants to see every piece, or change something along the way | Steps 1 to 13, in order                                                                                                    |
| **Graphical panel**  | NAS only, if you would rather not open a terminal                      | Steps 1 and 3, then [from the graphical panel](#from-the-nas-graphical-panel-instead-of-steps-4-5-and-6), then from step 7 |

Don't mix them: an instance is installed one way **or** the other. If in doubt, use the first.

**Every command is run on the machine that will host the instance**, not on your laptop — over SSH, or from a terminal opened right there.

## Installing with a single command

If Docker is already on the machine — and if it isn't, that is step 1 — this installs the instance and switches it on:

```sh
curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/install.sh | sh
```

It usually asks nothing. On a desktop Linux (Mint, Ubuntu, …) it may ask **once** for the administrator password: it is needed only to copy the `estia` command into `/usr/local/bin`, because that folder is not writable by a normal user. Don't wrap the whole thing in `sudo` (`curl … | sudo sh`): Docker has to stay with your user. If you don't give the password, the instance starts anyway and the command ends up in `~/.local/bin`.

It downloads the image, prepares the place where the data will live, starts the instance, installs `estia` and prints the address to open it at. From there, go to **step 7**.

**The language.** The installer speaks your system's language. To choose it yourself, put it before `sh` — `ESTIA_LANG=it` for Italian, `ESTIA_LANG=en` for English:

```sh
curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/install.sh | ESTIA_LANG=en sh
```

That is the language of the installation. The instance's own language is asked for by the setup in the browser, at [step 8](#8-set-it-up-from-the-browser).

**If the instance is already running and only the command is missing** (`estia: command not found` on Linux Mint, after an installation done as a normal user):

```sh
curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/install.sh | env ESTIA_SOLO_CLI=1 sh
```

**The same command updates**, when the time comes: running it again pulls down the new version and puts the instance back on its feet with the same things inside. If it finds something on the machine that it didn't put there itself, it stops and tells you instead of running over it. The details — and how to update if you installed another way — are in [step 12](#12-updating).

> If you prefer to read a script before running it — a healthy habit, with anything downloaded from the Internet — it is a text file: open the same address in the browser, or `curl -fsSL … -o install.sh` and then `less install.sh`.

The rest of this guide is for when you want to do the same things by hand, one piece at a time.

## What you need

- A **machine that stays on**: a NAS (Synology, QNAP, UGREEN, Asustor, TerraMaster), a Linux mini-PC, or an old laptop running Linux.
- **Docker**. If you don't have it, that is step 1: don't assume it is installed, almost no machine has it already.
- **Access to a terminal**: SSH is the most convenient way. On a NAS it has to be enabled from the panel, usually under "Terminal" or "SSH".
- A **second device on the same network** — a phone or a laptop — to complete the setup.

You don't need: a domain, a certificate, port forwarding, a public IP address. ESTIA lives on the local network ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)).

Reading the board **from outside home** is an extra, added later, and it changes nothing in this installation: [`ACCESSO_DA_FUORI.en.md`](ACCESSO_DA_FUORI.en.md).

## 1. Install Docker

First thing: check whether it is already there.

```sh
docker --version
```

If it answers with a version number, skip to step 2. If it answers `command not found`, Docker needs installing — and how you do it depends on the machine.

### On a NAS

Docker is installed **from the NAS's panel**, from its app centre, not from the terminal. The name changes from brand to brand:

| NAS         | App to install                            |
| ----------- | ----------------------------------------- |
| Synology    | **Container Manager** (formerly "Docker") |
| QNAP        | **Container Station**                     |
| UGREEN      | **Docker**                                |
| Asustor     | **Docker Engine**                         |
| TerraMaster | **Docker Manager**                        |

Install it and open it once, so it finishes setting itself up. Then, if you want to follow the terminal route, **enable SSH** in the NAS's system settings — on Synology it is Control Panel → Terminal & SNMP, on UGREEN and QNAP it is under the network or system settings — and connect:

```sh
ssh utente@nome-del-nas.local
```

Replace `utente` with your user on the NAS, and `nome-del-nas` with the NAS's name.

### On Linux: mini-PC, old laptop, server

Docker's official script recognises the distribution and installs everything that is needed, `docker compose` included. It is two commands, one at a time:

```sh
curl -fsSL https://get.docker.com -o get-docker.sh
```

```sh
sudo sh get-docker.sh
```

The first downloads the script, the second runs it. If you would rather look at it before running it — a healthy habit, with any script downloaded from the Internet — it is a text file: `less get-docker.sh`.

Then **add your user to the `docker` group**, otherwise every command below has to be preceded by `sudo` and sooner or later you will forget one:

```sh
sudo usermod -aG docker "$USER"
```

**This change takes effect from the next session.** Close the terminal — or the SSH connection — and open it again. If you don't, the next command answers `permission denied` on the Docker socket, and it looks like a Docker problem when it is only the group that is not active yet.

### On macOS or Windows

You install **Docker Desktop**, from Docker's website. It is perfectly fine for trying ESTIA and looking at it, but bear one thing in mind: an instance is a community's board, and it lives on a machine that stays on. A laptop that gets closed in the evening is not that machine.

### Check that it works

```sh
docker --version && docker compose version && docker run --rm hello-world
```

All three must answer: two version numbers and a message that begins with "Hello from Docker!". The third command is the most useful of the three, because it actually downloads an image and runs it: if it works, everything that comes after will work.

If `docker compose version` gives an error but `docker-compose --version` answers, you have the old version of Compose: it works just the same, and throughout the guide you have to write `docker-compose` (with the hyphen) where it says `docker compose`.

## 2. Look at the machine in front of you

```sh
uname -m && df -h
```

`x86_64` means **amd64**, `aarch64` means **arm64**. **If you download the image from the registry you don't need to know this**: the published tag contains both architectures and Docker picks the right one by itself. It matters only if you build or transfer the image by hand (note in step 4), which is the only way to get it wrong — and you find out through an `exec format error` that explains nothing.

`df -h` lists the disks with their free space. You will need it in the next step.

## 3. Decide where the data lives

**The short answer is: do nothing.** The file in step 5 uses a **named Docker volume**, which Docker creates by itself at the first start, with the right permissions, where it already keeps its own things. For most machines that is fine, and this step does not even require a command.

It is still worth the thirty seconds it takes to read, because that directory is where the database, the members' photos and **the instance's private key** end up, and the key cannot be replaced: if you lose it, the members no longer recognise their instance. And moving it later means stopping the instance.

See where Docker keeps its things, and how much space there is there:

```sh
docker info --format '{{.DockerRootDir}}' && df -h "$(docker info --format '{{.DockerRootDir}}')"
```

**If that path is on the big disk** — on many NAS it is something like `/volume1/@docker` — you are done: go to step 4 and change nothing.

**If instead it is on the system partition** and space there is short, the data should go in a folder on the big disk. Create it now, with the right permissions:

```sh
sudo mkdir -p /volume1/estia-data && sudo chown -R 10001:10001 /volume1/estia-data && sudo chmod 700 /volume1/estia-data
```

Replace `/volume1` with a path that exists on your machine — you have just seen it with `df -h`. The `10001`, on the other hand, is not to be touched and is not arbitrary: it is the non-root user the container runs as. Step 5 gives the line to change to match.

## 4. Get the image

**You don't have to do anything: step 6 downloads it.** The image is public at `ghcr.io/chrono-web/estia`, with no credentials and no account, and the same tag contains both `linux/amd64` and `linux/arm64`.

If you want to get ahead, or simply see that the network works:

```sh
docker pull ghcr.io/chrono-web/estia:latest
```

It is a few hundred megabytes: on a slow connection it takes quite a while, and it is normal for the progress bar to sit still for a bit.

**Which tag to use.** `latest` follows `main`: every published change becomes an update available to you. That is perfectly fine for trying things out, but on an instance holding the photos of real people it is calmer to **pin a fixed tag**, so that you decide when to update, not the pace of whoever is developing. There is one for every commit, and it goes in place of `latest` in the file of step 5: `ghcr.io/chrono-web/estia:sha-8a1147c`.

You will find them listed on the repository's packages page. When you want to update, you change that line and run `docker compose pull && docker compose up -d` — having read step 12 first, not after.

> **If the machine has no network access to the Internet**, or you would rather not give it any, the image is downloaded elsewhere and transferred. The way that works even when the machine won't let you write anywhere is to stream it into `docker load`, without putting a file down anywhere. Here you choose the architecture, so step 2 really matters — and it has to be stated explicitly, because otherwise you get the one of the computer you are downloading from:
>
> ```sh
> docker pull --platform linux/amd64 ghcr.io/chrono-web/estia:latest
> ```
>
> ```sh
> docker save ghcr.io/chrono-web/estia:latest | gzip | ssh utente@nas 'docker load'
> ```
>
> `scp` to many NAS fails with a misleading `Permission denied`: recent `scp` uses the SFTP protocol, and quite a few NAS don't expose `sftp-server`. If you still need to copy a file, `scp -O` uses the old protocol.

## 5. Write the `docker-compose.yml` file

**This step creates a file, it does not run commands.** The file tells Docker how to run the instance, and `docker compose` looks for it in the folder you are in. It is the point where it is easiest to go wrong, because those lines with colons look like commands and are not: pasted on their own into the terminal they install nothing, they answer `command not found`. Here they are inside a command that writes them into the file for you.

First the folder that will hold it. On a NAS it is best on the big disk, for example `/volume1/docker/estia`; on a mini-PC your home directory is fine:

```sh
mkdir -p ~/estia && cd ~/estia
```

Then the file. **Paste this command in full**, from the first line to the last `YAML` included, and press Enter only once: it writes the file, ready to use.

```sh
cat > docker-compose.yml <<'YAML'
name: estia
services:
  core-api:
    container_name: estia
    image: ghcr.io/chrono-web/estia:latest
    environment:
      ESTIA_DATA_DIR: /data
      ESTIA_HOST: 0.0.0.0
      ESTIA_LOG_LEVEL: info
    ports:
      - "0.0.0.0:3000:3000"
    volumes:
      - estia-data:/data
      - estia-backup:/data/backup
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
  estia-backup:
YAML
```

If you prefer an editor, `nano docker-compose.yml` and paste **only the lines between `cat …` and `YAML`**, that is from `name: estia` to `estia-data:`; then Ctrl+O to save and Ctrl+X to exit.

Check that it came out right:

```sh
docker compose config
```

If it prints the configuration back to you, the file is valid. If it gives an error, it is almost always the indentation: in YAML the spaces at the start of a line matter, and a tab does not count as spaces.

**The line not to get wrong is `0.0.0.0:3000:3000`.** With `127.0.0.1` the instance answers only the machine itself, and you can't see it from the phone in the living room. It is the right default for a development computer and the wrong one here.

If in step 3 you chose your own folder instead of the volume, change two things in the file: instead of `- estia-data:/data` write `- /volume1/estia-data:/data`, and remove the last two lines (`volumes:` and `estia-data:` at the bottom, the ones without indentation).

## 6. Switch it on

From the same folder as step 5:

```sh
docker compose up -d
```

If it answers `no configuration file provided`, you are in another folder: go back to the right one with `cd ~/estia` — or wherever you put the file — and try again.

If port 3000 is already taken by something else on the machine, change **only the number on the left** in the file: `"0.0.0.0:3080:3000"`. Then run `docker compose up -d` again.

## From the NAS graphical panel, instead of steps 4, 5 and 6

Skip this section if you have just switched the instance on from the terminal: it is the other route to the same three things, and you need only one.

**If your NAS can import a Compose file, use that.** On Synology it is Container Manager → **Project** → Create, and in the file field you paste the contents of step 5 (the lines from `name: estia` to `estia-data:`). It is exactly the same installation as this guide, with an interface on top: all the rest of the guide keeps applying word for word.

**If your panel can't import a Compose file, don't build the container by hand in the form**: that is where the volumes line gets forgotten, and that is how two instances were lost. Open an SSH terminal and run a single command, which carries everything it needs with it:

```sh
docker run -d --name estia --restart unless-stopped -p 3000:3000 -v estia-data:/data ghcr.io/chrono-web/estia:latest
```

The container then shows up in the panel like all the others, and from there you stop it, restart it and read its logs. `-v estia-data:/data` is the part not to touch: it creates a volume **with a name**, which Docker carries along every time the container is recreated. To update, three commands in a row:

```sh
docker pull ghcr.io/chrono-web/estia:latest && docker rm -f estia && docker run -d --name estia --restart unless-stopped -p 3000:3000 -v estia-data:/data ghcr.io/chrono-web/estia:latest
```

If you really do create the container from the panel's form, you need three things and nothing else.

**The image.** In the image registry, search for `ghcr.io/chrono-web/estia`, tag `latest`. Some panels search only Docker Hub and don't find it: in that case download it once from the terminal with `docker pull ghcr.io/chrono-web/estia:latest`, and it will then appear among the panel's local images.

**The port.** Local port `3000`, container port `3000`. If the panel has a field for the address to publish on, leave it empty or put `0.0.0.0`: with `127.0.0.1` the instance opens only from the NAS itself.

**The data folder, which is the line you don't skip.** In the **volumes** or **folders** section, add a row:

| Folder on the NAS                                              | Path in the container |
| -------------------------------------------------------------- | --------------------- |
| a folder of your own, for example `/volume1/docker/estia/data` | `/data`               |

**Without this row the instance won't let you set it up** ([ADR 0019](adr/0019-i-dati-hanno-un-posto-prima-della-configurazione.md)): it opens a page that tells you so, and doesn't show you the form. This is not a theoretical precaution, it is the flaw that wiped two real instances.

The reason, if you are interested: the image declares `/data` as a volume, so Docker assigns it one anyway — but it is an **anonymous** volume, which nobody asked for and so nobody carries along. `docker compose` reattaches it to the new container; **the panel's "update" button doesn't.** It deletes the container, creates another one from the image, and Docker gives it a new, empty volume: an instance to set up from scratch, a new key, every time.

> **If you are reading this guide after losing a configuration**, the old data is almost certainly still on the NAS: an orphaned volume is not deleted, it stays there with nothing using it. How to recover it is further down, in ["I lost my configuration during an update"](#i-lost-my-configuration-during-an-update).

Start the container. From here on, follow step 7: where the guide says `docker compose logs`, you read the container's **Log** tab in the panel, and where it says to restart, you use the panel's button.

## 7. Get the setup code

It is printed only once, at start-up, and **on purpose it does not end up in the structured logs**: it is a credential, and the only way to reach you before an account exists.

```sh
docker compose logs core-api | head -20
```

From the graphical panel it is the container's **Log** tab, at the top.

The code changes every time the process restarts. If you lose it, restart and read the new one.

## 8. Set it up from the browser

You need a way to reach the machine from another device. **Try its name first**, which almost every NAS publishes by itself — Bonjour on Synology and QNAP, Avahi on UGREEN, TrueNAS and Linux mini-PCs ([ADR 0017](adr/0017-niente-mdns-nostro.md)):

```
http://nome-della-macchina.local:3000
```

The name is the one you see in the NAS's panel, usually under "Network" or "Identification"; on Linux it is what `hostname` answers. It goes in place of `nome-della-macchina`. It is the best route because it **doesn't change**, whereas the numeric address can change when the router reassigns addresses — and then your mum's bookmark stops working.

If the name doesn't resolve — it happens on networks that filter multicast, or that isolate devices from each other — you need the address:

```sh
ip -4 addr show scope global | grep inet
```

and in that case **reserve it in the router**, in the DHCP section, so that it stays the same for good. It takes two minutes, and saves you explaining the address to everyone all over again six months from now.

Open the instance from another device on the same network and complete the setup: community name, description, instance language and your administrator account.

The instance language applies to people who arrive with a browser in a language ESTIA doesn't have. Otherwise everyone uses their own: to begin with it follows the browser, and each member can change it whenever they like in **Settings → Language**.

> Whatever address you open it from is the one that ends up in the invite links you create. If you reach it by name, your neighbours will get a link with the name.

**Write down the recovery code.** It appears only once. Whoever loses both that and the password loses the instance, and that is not a flaw: it is a declared consequence of not having a central server that could reset it for you ([ADR 0009](adr/0009-recupero-accesso-amministratore.md)). Treat it like your house keys.

## 9. Let someone in

In the administration section, press **Create invite**: a **complete link** appears, ready to paste into a message. Whoever receives it opens it, chooses a name and asks to join; you approve. **Having an invite lets someone ask, never walk in on their own.**

The link contains the address from which **you** are looking at the instance at that moment, because it is the only one known for certain to work on this network. One thing follows from that: if you open the administration from `localhost` — that is, from the machine itself — the link you get works only there, and it won't open for whoever receives it. The instance tells you so in red when that happens. Create the invite from the network address, the one from step 8.

At this point the instance works. But you are not done.

## 10. Backups, the part people skip and shouldn't

An instance without backups is a disk that will break sooner or later with everyone's photos on it.

**It is done from the browser, without a terminal** ([ADR 0016](adr/0016-backup-dal-pannello.md)). In the **Administration** section, **Backups** panel:

1. **Generate a key pair.** The private key appears **only once** — put it in a password manager or print it, **off this machine**. Only the public one stays on the instance, and that is what makes the backups truly safe: **the instance produces archives that it cannot read back**. Whoever carries the machine away finds unreadable files.
2. **Save.** From that moment on, backups run by themselves, as often as you chose.
3. **Back up now**, to see straight away that it works instead of finding out tomorrow.
4. **Download** the most recent archive and put it somewhere else.

The last of the four is not an extra. By default the archives end up **next to the data, on the same disk**: they protect you from a mistake and from an update gone wrong, not from the disk breaking or the machine being stolen. The panel tells you so every time. They are encrypted precisely so that you can put them anywhere — an external disk, another computer, a USB stick.

### If you want the archives to go to another disk

That is the only thing you can't choose from the panel, on purpose: a path typed into a text field would be an arbitrary write on the machine, granted through the browser. It is declared in the `docker-compose.yml` of step 5, inside `environment:`, together with the key:

```yaml
ESTIA_BACKUP_DIR: /backup
ESTIA_BACKUP_PUBLIC_KEY: "age1..."
ESTIA_BACKUP_INTERVAL_HOURS: "24"
ESTIA_BACKUP_KEEP: "7"
```

with the folder mounted under `volumes:`:

```yaml
- /volume1/docker/estia-backup:/backup
```

created beforehand with the right permissions:

```sh
sudo mkdir -p /volume1/docker/estia-backup && sudo chown 10001:10001 /volume1/docker/estia-backup && sudo chmod 700 /volume1/docker/estia-backup
```

You still generate the key pair from the panel, or from here:

```sh
docker run --rm --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js chiavi
```

**Mind one consequence**: if you set those variables, the configuration comes from the environment and **the panel can no longer change it** — it tells you so, instead of pretending. That is intended: two places to change the same thing, with one of them winning at restart, are worse than a single inconvenient one.

Restart with `docker compose up -d`. **The first backup starts a minute later**, not the following night: that way you see a configuration mistake straight away.

### How much memory a backup needs, which is more than it seems

An archive is encrypted **entirely in memory** ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)), and measurements show it needs **about six times the size of the data**: 1.25 GB for a 200 MB instance, 2.5 GB for a 400 MB one.

You need to know this for two reasons.

**If you put a memory limit on the container**, take it into account. Below the threshold the backup doesn't fail with an error: the kernel kills the process, without writing anything anywhere, and with `restart: unless-stopped` the instance restarts and tries again for ever. That is why the reference Compose file **imposes no memory limit**: you set one yourself, if you want ESTIA to be unable to take over the whole machine.

```yaml
mem_limit: 2g
```

The instance looks at its own limit and its own data, and in the **Instance status** section it tells you when the first is not enough for the second. Before it happens, not after.

**And there is a practical ceiling on the size of an instance**: 2 GB of photos would need 12 GB of memory, which a NAS usually doesn't have. Up to a few hundred megabytes it is not a problem. Beyond that, it has to be solved in the product, and ADR 0013 says how.

## 11. Disk encryption, and the choice you have to make

That machine now holds photos of real people. **On the disk they are in plain text**, unless you have encrypted the volume.

ESTIA doesn't do the encryption: the machine's system does ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)). LUKS on Linux, native volume encryption on Synology, QNAP and UGREEN, encrypted datasets on TrueNAS. It is the choice with the widest coverage, because it protects the database, media, identity and temporary files in one go.

**The point is not encrypting: it is where the key is when the machine switches on.**

| Level                  | Protects against                                     | Does not protect against                                   | Cost                                      |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| **Passphrase at boot** | Theft of the machine, removed disks, discarded disks | Anyone who gets at the machine while it is on and unlocked | The instance does not come back by itself |
| **Automatic unlock**   | Removed disks, discarded disks                       | **Theft of the machine**                                   | None                                      |
| **No encryption**      | Nothing                                              | Everything                                                 | None                                      |

**The recommendation is the passphrase at boot**, and it is a deliberate one: if the machine has to come back by itself after a power cut, the key has to be on it, and whoever carries the machine off carries the key off too. The only protection that holds against the device being stolen is a passphrase that is stored nowhere, because a person types it.

The cost is real and must be told to the people who will use the instance: **after a power cut the board stays down until someone unlocks the machine.** For a service that is a neighbourhood's board, that is an outage: decide it beforehand, not during.

Once the volume is set up from your NAS's panel — or with LUKS, if it is a Linux machine — **declare it to ESTIA** by adding inside `environment:`:

```yaml
ESTIA_AT_REST_ENCRYPTION: passphrase
```

The values are `passphrase`, `automatic` or `none`. If you don't declare it, the instance doesn't assume anything: it says "not declared".

**Why declare it, if the system already knows.** Because ESTIA checks: it looks at the volume under its own data and recognises whether it is encrypted. But it **cannot see how it is unlocked** — a typed passphrase and a key on disk produce the same device — and only whoever set up the machine knows that part.

In the **Instance status** section of the administration you find the two side by side: what the instance has observed and what you have declared. If you declare an encryption the instance cannot see, it tells you so in red and writes it in the logs. That is the case that really matters: **a protection believed in and not there is worse than a protection that is absent and known.**

## 12. Updating

**You update the same way you installed.** The three routes from the beginning stay three: don't mix them. `install.sh` does not take over an instance born from Compose, and Compose does not update a container created by the script.

In the panel, **Settings → Instance status → Check for updates** compares this image with the published one: if there is something new, it shows the commands below. It doesn't download or restart anything by itself — that remains something you do on the machine's Docker.

You still need Docker: none of the commands below installs it for you. The order matters, because database migrations go **forward only**: there is no going back, and the rollback is restoring from a backup ([`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §8).

### Before you touch the image

If backups are not configured yet, do it **now** — step 10, without changing version. This applies to every instance that came into being before that step, and it should be read before updating, because it is the case where the wrong order costs something that cannot be recovered.

When the new version finds migrations to apply, it writes itself a backup. But if nothing is configured it cannot write one, and then **it migrates anyway**: that is a decision taken ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)), because leaving a neighbourhood without its own board is certain harm set against a possible risk. The result is that such an update is left without a way back, for good — a backup made afterwards does not bring back a schema that only goes forward.

The instance doesn't stop you. You have to put things in the right order yourself:

1. **Configure backups** on the instance you are about to update.
2. **Check that the first archive really exists.** It starts a minute after the restart, so you see it straight away — in the Backups section of the panel, or in the folder where you keep them.
3. **Only now update**, by the route you used to install.

If you skip the first two, nothing visible happens — and that is exactly the problem.

### You don't know which of the three cases is yours

It happens, and more often than you would think: whoever installs does it once and then doesn't think about it for months. Two ways out, without guessing.

**From the panel.** In **Settings → Administration → Instance status**, "Check for updates" writes out the right commands **for this installation**, with the container's id in them. They always appear, even when the comparison with the registry fails.

**From the terminal.** The container knows its own id, and Docker knows which folder it created it from. This goes to the right folder from anywhere on the machine, if the instance was created by Compose:

```sh
cd "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' estia)" && docker compose pull && docker compose up -d
```

In place of `estia` goes the name — or the id — of the container, which `docker ps` lists. If it answers with a `cd` error, that folder doesn't exist: the container was not created by Compose, and one of the other two cases applies.

**If you built the container in the panel's form.** There is no folder to go back to, and **don't rerun `install.sh`**: it recreates the instance on the volume it manages itself, while your data is in the folder you mapped at the volumes step — the instance would start again empty, right next to it. Nobody remembers the exact ports and folders, so you have Docker write them out for you:

```sh
docker inspect -f 'docker run -d --name {{slice .Name 1}} --restart unless-stopped{{range $p, $b := .HostConfig.PortBindings}}{{range $b}} -p {{.HostPort}}:{{$p}}{{end}}{{end}}{{range .Mounts}} -v {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}:{{.Destination}}{{end}} ghcr.io/chrono-web/estia:latest' estia
```

This **prints** a command, it doesn't run any. Read the line that comes out: after each `-v` there must be the place where your data really is. If it is right, `docker rm -f estia` and paste the line. In place of `estia` goes the container's name, which `docker ps` lists.

**One thing `docker pull` doesn't do.** It doesn't update anything by itself: it downloads the image and that is all, and the container keeps running the old one until you recreate it. That is why every case below has a second command. And it doesn't depend on the folder you are in: `docker pull` talks to Docker, it is `docker compose` that looks for a file where you are.

### The simplest way: with the `estia` command

If you installed with `install.sh`, or you have the `estia` CLI on your machine's PATH ([ADR 0031](adr/0031-cli-di-gestione-locale-estia.md)), a single command is enough:

```sh
estia aggiorna
```

It does everything itself: it downloads the updated image, detects whether the instance is managed by Compose (and in that case runs the update in the right folder) or is a standalone container, and recreates it, keeping ports and data volume.

### Or by hand: if you installed with a single command (install.sh)

You rerun the same command. Docker has to be there already; the script downloads the new image, recreates the `estia` container and remounts the `estia-data` volume with everything that was in it:

```sh
curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/install.sh | sh
```

If it finds a container on the machine with its data somewhere else — not on the volume it manages itself — **it stops and tells you**, instead of wiping your instance. It is the same check as at installation.

### If you installed step by step with Compose

From the same folder as step 5:

```sh
docker compose exec core-api node dist/backup/cli.js backup /backup
```

```sh
docker compose pull && docker compose up -d
```

The backup first, then the update. If something goes wrong, your way back is from two minutes ago, not from last night.

### If you installed from the panel or with `docker run`

Three commands in a row, **with the same volume you already had** — if you leave out `-v estia-data:/data` (or the folder you were using), the data doesn't follow you:

```sh
docker pull ghcr.io/chrono-web/estia:latest && docker rm -f estia && docker run -d --name estia --restart unless-stopped -p 3000:3000 -v estia-data:/data ghcr.io/chrono-web/estia:latest
```

The details and the reasons are in the section [from the graphical panel](#from-the-nas-graphical-panel-instead-of-steps-4-5-and-6).

### If you forget, the instance takes care of it

The manual backup before the pull is still worth doing, but you are no longer the only one who has to remember it. **When the new version notices it has migrations to apply, it writes itself a backup before applying them.** You find it in the same folder as the others, with a name that sets it apart:

```sh
ls -lh /volume1/docker/estia-backup/estia-aggiornamento-*.tar.age
```

It has a name of its own because **it is not deleted by the rotation of the nightly backups**: it is the most precious archive the instance produces, and with `ESTIA_BACKUP_KEEP=1` the following night would have taken it away. Among themselves, though, these archives rotate normally, with the same `ESTIA_BACKUP_KEEP`: with the default of 7 the last seven updates are kept, so if two updates come close together you keep both, and can still go back to the first while you check the second.

Two things to know before they happen:

- **Start-up is slower**, by as much as it takes to encrypt the whole archive, photos included. It happens once per update, and meanwhile the board doesn't answer.
- **If backups are not configured, the instance updates anyway** instead of staying stopped. But it tells you, twice: in the logs **before** migrating — `schema_migration_without_backup`, so that the line is there even if the update then hangs halfway and never gets to record anything — and afterwards in the **Instance status** section, where it stays written that this update has no way back. The second does not go away at the next restart, because the fact does not go away. Backups are set up from **Settings → Backups**; the environment variables remain an alternative for those who already had them.

After the update, look at the **Instance status** section: it says from which version to which, and whether the backup happened. In the logs, depending on how you installed:

```sh
docker logs estia | grep schema_
```

```sh
docker compose logs core-api | grep schema_
```

## 13. Restoring

A backup that has never been restored is not a backup. **Try it before you really need it.**

Restoring is the only moment when the private key touches the machine.

If you have the `estia` CLI installed on the machine ([ADR 0031](adr/0031-cli-di-gestione-locale-estia.md)), a single interactive command is enough: it asks for the path of the file (you can paste it or drag it into the terminal), asks for confirmation, takes the key on screen and restarts the instance:

```sh
estia ripristino-backup
```

Alternatively, with Docker directly (the key is asked for on screen, interactively, so that it doesn't end up in the shell history; add `--sovrascrivi`, "overwrite", if the destination folder already contains data):

```sh
docker run --rm -it --user 0:0 -v /cartella/del/file:/backup:ro -v /volume1/docker/estia-restore:/restore --entrypoint node ghcr.io/chrono-web/estia:latest dist/backup/cli.js ripristina /backup/ARCHIVIO.tar.age /restore
```

Replace `/cartella/del/file` with the folder that holds the archive, and `ARCHIVIO.tar.age` with the archive's name.

**Why this command runs as root, when nothing else in the guide does.** You created the destination folder, so it belongs to your user; the instance, on the other hand, runs as user `10001`, and with its permissions it cannot write in there. The container restores and then **automatically hands the files over to the instance's user** with `chown`. It is a throwaway container that serves nothing to anyone and dies right afterwards — that is the whole difference from the instance, which stays on and answers from the network.

If the command answers `EACCES: permission denied`, it is almost always the archive: downloaded from the browser, it may be readable only by you, and the container is a different user. You fix it with `chmod 644 ARCHIVIO.tar.age`.

Then switch on a test instance on the restored data, on another port, without touching the real one, and see whether everything is there. **Actually tested on 2026-08-19** on a Linux mini-PC: the restored instance comes back with the same public key, the same password and its content in place.

And it is worth knowing: **an archive can be opened without ESTIA too**, with standard tools ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)):

```sh
age -d -i chiave-privata.txt archivio.tar.age | tar -xv
```

Here `chiave-privata.txt` is the file holding your private key, and `archivio.tar.age` the archive.

## I lost my configuration during an update

It happened to people who had created the container **by hand from the NAS's panel**, without mapping a folder to `/data`. It was a flaw in ESTIA and not in your NAS, and it is told in full in [ADR 0019](adr/0019-i-dati-hanno-un-posto-prima-della-configurazione.md).

**The old data is almost certainly still there.** Every update left a copy of it in an orphaned volume: nobody uses it any more, but nobody deletes it either.

### 1. See what the container mounts now

```sh
docker inspect ESTIA --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
```

If the name is a string of 64 letters and numbers, it is an anonymous volume: that is the case this section is about.

### 2. Find all the instances you lost

This lists the volumes that contain an ESTIA database, with the date of the last write:

```sh
for v in $(docker volume ls -q); do docker run --rm -v "$v":/v alpine test -f /v/estia.db 2>/dev/null && echo "== $v  $(docker run --rm -v "$v":/v alpine stat -c '%y' /v/estia.db)"; done
```

One shows up for every time the instance started again from scratch. **The one with the most recent date is the last configuration you were using**; if you are looking for older content, look at the others too.

### 3. Bring them into a folder of your own

Stop the instance before copying, so that nothing writes while you copy:

```sh
docker stop ESTIA
```

Then create the permanent folder and copy the volume you chose into it — replace `VOLUME_SCELTO` with the name you read above, and `/volume1` with the path that exists on your machine:

```sh
sudo mkdir -p /volume1/docker/estia/data && docker run --rm -v VOLUME_SCELTO:/from -v /volume1/docker/estia/data:/to alpine cp -a /from/. /to/
```

```sh
sudo chown -R 10001:10001 /volume1/docker/estia/data && sudo chmod 700 /volume1/docker/estia/data
```

Check that everything is there: you need the database, the instance's private key and the photos folder.

```sh
sudo ls -la /volume1/docker/estia/data
```

`estia.db` and `instance-identity.pem` must be there. **The second is the one that cannot be made again**: it is what makes the instance recognisable to those who had already seen it.

### 4. Attach the folder, once and for all

From the panel, open the container for editing and add the volumes row: `/volume1/docker/estia/data` → `/data`. Then restart.

**Better still, switch to a Compose Project** — on Synology it is Container Manager → Project → Create, and you paste in the file from step 5. From then on, updates are `pull` and `up`, and they no longer ask you where the data is, because the volume has a name written in the file.

When the instance starts again, open **Administration → Instance status**: the "Where the data lives" row must say that it is on a volume, with no red warnings. From then on updates won't make you redo anything — and if something were not right, the instance refuses to let you set up a new board, rather than letting you find out afterwards.

### 5. When you can delete the old volumes

Only after checking that the instance has come back with your content in it, and not before. A volume is deleted with `docker volume rm NOME` (`NOME` being its name), and there is no going back from that: if you have the space, leave them alone for a few weeks.

## When something goes wrong

| Symptom                                                          | What is happening                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `estia: command not found`                                       | The CLI is not on the PATH. On desktop Linux `install.sh` cannot write to `/usr/local/bin` as a normal user: rerun it with `ESTIA_SOLO_CLI=1` (section [A single command](#installing-with-a-single-command)), or give the sudo password when it asks. The instance may already be on. |
| `command not found` on lines like `name:`, `services:`, `image:` | You pasted the **contents of a file** into the terminal. That block has to be saved as `docker-compose.yml`: step 5                                                                                                                                                                    |
| `docker: command not found`                                      | Docker is not installed on this machine. Step 1 — on a NAS it is installed from the app centre, not from the terminal                                                                                                                                                                  |
| `docker compose` doesn't exist, but `docker-compose` does        | Compose version 1: it works, write `docker-compose` where the guide writes `docker compose`                                                                                                                                                                                            |
| `no configuration file provided: not found`                      | You are not in the folder that contains `docker-compose.yml`. `cd` there and try again                                                                                                                                                                                                 |
| `docker` gives "permission denied" on the socket                 | Your user is not in the `docker` group: `sudo usermod -aG docker "$USER"`, then **log out and back in** — the command alone is not enough                                                                                                                                              |
| `sudo` over SSH: "a terminal is required"                        | You need `ssh -t utente@macchina 'sudo ...'`                                                                                                                                                                                                                                           |
| The container starts and dies, `exec format error`               | An image for the wrong architecture: it happens only if you transferred it by hand. Go back to the note in step 4                                                                                                                                                                      |
| It won't open from the phone, but it does from the machine       | The port is published on `127.0.0.1`. It must be `0.0.0.0`                                                                                                                                                                                                                             |
| `scp` gives "Permission denied" on paths that exist              | The NAS does not expose `sftp-server`. Use the pipe from step 4, or `scp -O`                                                                                                                                                                                                           |
| The instance starts but says `data_dir_permissions_loose`        | The data folder is readable by other users of the machine, and the filesystem refused `chmod`                                                                                                                                                                                          |
| The container refuses to start because of `ESTIA_BACKUP_*`       | You set only one of the two variables, or the private key instead of the public one. The message says which                                                                                                                                                                            |
| `backup_not_configured` appears in the logs                      | It is not an error: the instance is telling you that it **is not making backups**. Set them up from Settings → Backups                                                                                                                                                                 |
| After an update, start-up is unusually slow                      | The instance is writing the backup that comes before the migrations. It happens only once per update                                                                                                                                                                                   |
| `schema_migration_without_backup` appears in the logs            | The instance **is about to** migrate without a backup. If you see it in time, stop it and configure backups (step 10)                                                                                                                                                                  |
| `schema_migrated_without_backup` appears in the logs             | The update went through without a way back: there were no backups, neither from the panel nor from the environment                                                                                                                                                                     |
| `schema_backup_failed` appears in the logs                       | Worse than the previous one: you configured backups and **they don't work**. Check them now                                                                                                                                                                                            |
| `EACCES: permission denied` during a restore                     | The archive is readable only by your user (`chmod 644`), or you changed the command in step 13: it is needed exactly as it is                                                                                                                                                          |

## What this installation does not protect

Said here because no interface should suggest a protection that isn't there.

**The data on the machine is in plain text, if you have not encrypted the volume** in step 11. Whoever carries the machine off reads everything: content, accounts, photos. **Backups**, on the other hand, are always encrypted, even on an instance without encryption at rest.

**Whoever administers the instance sees everything it keeps.** That is the consequence of self-hosting, not a flaw to hide.

**The local feed is readable by the server that serves it**, by choice: it is the board of the people who share the instance, not a private chat. Private messages don't exist yet, and when they do they will be end-to-end encrypted or they won't exist at all ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)).
