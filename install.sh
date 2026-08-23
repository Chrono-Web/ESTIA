#!/bin/sh
#
# Installa un'istanza ESTIA, e la aggiorna.
#
# Esiste per una ragione sola, ed e' un difetto vero: un container ESTIA creato
# a mano — dal modulo di un pannello, o con `docker run` senza argomenti — mette
# i dati su un volume che Docker chiama da se'. Quel volume sopravvive a
# `docker compose`, e NON sopravvive al pulsante «aggiorna» di un pannello, che
# butta il container e ne fa un altro dall'immagine. L'istanza torna su un
# volume nuovo e vuoto: da configurare, con una chiave diversa, ogni volta.
#
# Un'immagine non puo' rimediare da se': `VOLUME` dichiara un percorso e non un
# nome, e il nome lo sceglie chi crea il container. Quindi lo sceglie questo
# script, una volta, e non lo chiede a nessuno.
#
# Lo stesso comando installa e aggiorna: rifarlo tira giu' l'immagine nuova e
# ricrea il container sullo stesso volume.
#
# La CLI `estia` non e' il container. Va copiata sull'host, in un posto del
# PATH. Da utente normale `/usr/local/bin` non e' scrivibile (Linux Mint, Ubuntu):
# per quella copia sola si chiede sudo, leggendo la password da /dev/tty perche'
# `curl | sh` occupa stdin. Se sudo non c'e' o viene rifiutato, la CLI finisce
# in ~/.local/bin. Non si avvolge tutto lo script in sudo: Docker resta
# dell'utente, e non si dice «digita estia» se il file non e' stato messo.

set -eu

IMAGE="${ESTIA_IMAGE:-ghcr.io/chrono-web/estia:latest}"
NAME="${ESTIA_CONTAINER:-estia}"
VOLUME="${ESTIA_VOLUME:-estia-data}"
PORT="${ESTIA_PORT:-3000}"
CLI_URL="${ESTIA_CLI_URL:-https://raw.githubusercontent.com/chrono-web/estia/main/bin/estia}"

CLI_DEST=""
CLI_NEL_PATH=0

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	C0="\033[0m"
	C1="\033[1m"
	CDIM="\033[2m"
	CCYAN="\033[1;36m"
	CBLUE="\033[4;34m"
	CGREEN="\033[32m"
	CYELLOW="\033[33m"
	CRED="\033[31m"
else
	C0=""
	C1=""
	CDIM=""
	CCYAN=""
	CBLUE=""
	CGREEN=""
	CYELLOW=""
	CRED=""
fi

say() {
	printf '%s\n' "$*"
}

sayb() {
	printf '%b\n' "$*"
}

die() {
	printf '\n%b\n' "${CRED}${C1}ERRORE${C0} $*" >&2
	exit 1
}

# --- CLI locale (`estia` sul PATH) -------------------------------------------

cli_sorgente() {
	if [ -n "${ESTIA_CLI_SRC:-}" ] && [ -f "$ESTIA_CLI_SRC" ]; then
		printf '%s\n' "$ESTIA_CLI_SRC"
		return 0
	fi

	# `curl | sh` ha $0 uguale a `sh`: non prendere un bin/estia a caso
	# dalla cartella corrente. Uno script su disco (./install.sh) si.
	case "$0" in
	/* | ./* | ../* | *.sh)
		dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || dir=""
		if [ -n "$dir" ] && [ -f "$dir/bin/estia" ]; then
			printf '%s\n' "$dir/bin/estia"
			return 0
		fi
		;;
	esac

	return 1
}

prepara_cli_tmp() {
	tmp="$1"
	src=""
	if src=$(cli_sorgente); then
		cp "$src" "$tmp"
		return 0
	fi
	if command -v curl >/dev/null 2>&1 && curl -fsSL "$CLI_URL" -o "$tmp"; then
		return 0
	fi
	return 1
}

# Copia $1 in /usr/local/bin/estia. Da utente normale quella cartella non e'
# scrivibile: si chiede sudo, con la password dal terminale e non dalla pipe.
installa_cli_in_usr_local() {
	src="$1"
	dest_dir=/usr/local/bin
	dest="$dest_dir/estia"

	if [ -d "$dest_dir" ] && [ -w "$dest_dir" ]; then
		cp "$src" "$dest" && chmod 755 "$dest"
		return 0
	fi

	if [ "$(id -u)" -eq 0 ]; then
		mkdir -p "$dest_dir" && cp "$src" "$dest" && chmod 755 "$dest"
		return 0
	fi

	if ! command -v sudo >/dev/null 2>&1; then
		return 1
	fi

	if sudo -n true >/dev/null 2>&1; then
		sudo mkdir -p "$dest_dir" && sudo cp "$src" "$dest" && sudo chmod 755 "$dest"
		return 0
	fi

	if [ ! -r /dev/tty ]; then
		return 1
	fi

	sayb ""
	sayb "${CYELLOW}Per il comando «estia» serve scrivere in ${dest_dir}.${C0}"
	sayb "E' la password di amministratore (sudo), una volta. L'istanza e' gia' accesa:"
	sayb "senza questa password il comando finisce nella tua home."
	sayb ""

	if sudo mkdir -p "$dest_dir" </dev/tty &&
		sudo cp "$src" "$dest" </dev/tty &&
		sudo chmod 755 "$dest" </dev/tty; then
		return 0
	fi
	return 1
}

installa_cli_in_home() {
	src="$1"
	dest_dir="$HOME/.local/bin"
	dest="$dest_dir/estia"
	mkdir -p "$dest_dir" || return 1
	cp "$src" "$dest" && chmod 755 "$dest"
}

cli_segna_path() {
	dir=$(dirname "$CLI_DEST")
	case ":$PATH:" in
	*":$dir:"*)
		CLI_NEL_PATH=1
		;;
	*)
		CLI_NEL_PATH=0
		;;
	esac
}

# Imposta CLI_DEST se il file e' al suo posto. CLI_NEL_PATH=1 se la cartella
# era gia' nel PATH di chi ha lanciato lo script (quindi «estia» funziona
# nello stesso terminale, senza export).
install_cli() {
	CLI_DEST=""
	CLI_NEL_PATH=0
	tmp=$(mktemp)
	if ! prepara_cli_tmp "$tmp"; then
		rm -f "$tmp"
		return 1
	fi
	chmod 755 "$tmp"

	if [ -n "${ESTIA_CLI_BINDIR:-}" ]; then
		mkdir -p "$ESTIA_CLI_BINDIR"
		cp "$tmp" "$ESTIA_CLI_BINDIR/estia"
		chmod 755 "$ESTIA_CLI_BINDIR/estia"
		CLI_DEST="$ESTIA_CLI_BINDIR/estia"
		rm -f "$tmp"
		cli_segna_path
		return 0
	fi

	if installa_cli_in_usr_local "$tmp"; then
		CLI_DEST=/usr/local/bin/estia
	elif installa_cli_in_home "$tmp"; then
		CLI_DEST="$HOME/.local/bin/estia"
	fi

	rm -f "$tmp"

	if [ -z "$CLI_DEST" ] || [ ! -x "$CLI_DEST" ]; then
		CLI_DEST=""
		return 1
	fi

	cli_segna_path
	return 0
}

# I test importano le funzioni qui sopra senza toccare Docker.
if [ "${ESTIA_INSTALL_LIB:-}" = "1" ]; then
	return 0 2>/dev/null || exit 0
fi

# Istanza gia' in piedi, manca solo il comando (il caso Linux Mint).
if [ "${ESTIA_SOLO_CLI:-}" = "1" ]; then
	sayb "${CCYAN}→${C0} Installo il comando «estia»…"
	if install_cli; then
		sayb ""
		ok_line="Installato: ${CLI_DEST}"
		if [ "$CLI_NEL_PATH" = "1" ]; then
			sayb "${CGREEN}●${C0} $ok_line"
			sayb "  Prova: ${C1}estia info${C0}"
		else
			sayb "${CGREEN}●${C0} $ok_line"
			sayb "  In questo terminale non e' ancora nel PATH. Prova: ${C1}$CLI_DEST info${C0}"
			sayb "  Poi: export PATH=\"\$HOME/.local/bin:\$PATH\""
		fi
		exit 0
	fi
	die "Non sono riuscito a copiare il comando estia in /usr/local/bin ne' in ~/.local/bin."
fi

# --- Istanza -----------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
	die "Docker non c'e'. Su un NAS si installa dal centro applicazioni — Container Manager su Synology, Container Station su QNAP, Docker su UGREEN — e su Linux con: curl -fsSL https://get.docker.com | sh"
fi

if ! docker info >/dev/null 2>&1; then
	die "Docker c'e' ma non risponde. Se sei su Linux e l'hai appena installato, il tuo utente non e' ancora nel gruppo docker: 'sudo usermod -aG docker \"\$USER\"', poi chiudi e riapri il terminale."
fi

# Il controllo che questo script esiste per non far saltare a nessuno.
#
# Se qui c'e' gia' un container con questo nome e i suoi dati NON stanno sul
# volume che gestiamo noi, ricrearlo li lascerebbe orfani: durano, ma l'istanza
# nuova non li vedrebbe e ripartirebbe vuota. E' esattamente il modo in cui si
# perde una configurazione, quindi ci si ferma e si dice dove sono.
if docker container inspect "$NAME" >/dev/null 2>&1; then
	MOUNTED="$(docker container inspect "$NAME" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}')"
	EXISTING_PORT="$(docker inspect -f '{{range $p, $conf := .NetworkSettings.Ports}}{{if $conf}}{{(index $conf 0).HostPort}}{{end}}{{end}}' "$NAME" 2>/dev/null || true)"

	if [ -n "$EXISTING_PORT" ] && [ "${PORT}" = "3000" ]; then
		PORT="$EXISTING_PORT"
	fi

	case "$MOUNTED" in
	"")
		die "C'e' gia' un container «${NAME}» che tiene i dati dentro di se', senza volume. Ricrearlo li cancellerebbe. Fermati: 'docker cp $NAME:/data ./estia-data-salvata' li porta fuori, e da li' si ripartono."
		;;
	*)
		VOLUME="$MOUNTED"
		;;
	esac
fi

sayb "${CCYAN}→${C0} Scarico l'immagine…"

# Un pull fallito non e' per forza un problema: l'immagine puo' essere gia' qui,
# portata da `docker load` su una macchina senza Internet. Fallisce solo se dopo
# il tentativo non c'e' comunque niente da avviare.
if ! docker pull "$IMAGE" >/dev/null 2>&1; then
	if docker image inspect "$IMAGE" >/dev/null 2>&1; then
		sayb "  ${CDIM}(non ho raggiunto il registry: uso l'immagine gia' presente)${C0}"
	else
		die "Non riesco a scaricare $IMAGE e qui non c'e'. Se la macchina non ha Internet, portacela da un altro computer: docker save $IMAGE | gzip | ssh utente@macchina 'docker load'"
	fi
fi

# Creato esplicitamente e prima del container: cosi' esiste con un nome anche
# se il run qui sotto fallisce, e il nome e' l'unica cosa che rende dei dati
# ritrovabili sei mesi dopo.
docker volume create "$VOLUME" >/dev/null

docker rm -f "$NAME" >/dev/null 2>&1 || true

sayb "${CCYAN}→${C0} Avvio l'istanza…"

# La stessa postura del Compose in infra/: utente non root, filesystem in sola
# lettura tranne il volume, nessuna capability, nessun privilegio nuovo.
docker run -d \
	--name "$NAME" \
	--restart unless-stopped \
	--publish "${PORT}:3000" \
	--volume "${VOLUME}:/data" \
	--env ESTIA_DATA_DIR=/data \
	--env ESTIA_HOST=0.0.0.0 \
	--user 10001:10001 \
	--init \
	--read-only \
	--tmpfs /tmp \
	--cap-drop ALL \
	--security-opt no-new-privileges:true \
	--pids-limit 256 \
	"$IMAGE" >/dev/null || die "Non sono riuscito ad avviare il container. Se la porta $PORT e' gia' occupata da qualcos'altro, rilancia scegliendone un'altra: ESTIA_PORT=3001 sh install.sh"

WAITED=0

sayb "${CCYAN}→${C0} Attendo che sia pronta…"

while [ "$WAITED" -lt 60 ]; do
	if docker exec "$NAME" node -e "fetch('http://127.0.0.1:3000/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
		break
	fi

	WAITED=$((WAITED + 1))
	sleep 1
done

if [ "$WAITED" -ge 60 ]; then
	die "L'istanza non ha risposto entro un minuto. I log dicono perche': docker logs $NAME"
fi

# Solo la prima etichetta: `hostname` su parecchie macchine risponde con il
# nome completo appiccicato dal router, e «casa.rete-del-provider.it.local» non
# risolve da nessuna parte.
HOSTNAME_LOCAL="$(hostname 2>/dev/null | cut -d. -f1)"
HOSTNAME_LOCAL="${HOSTNAME_LOCAL:-localhost}"

sayb "${CCYAN}→${C0} Installo il comando «estia»…"

if install_cli; then
	:
else
	CLI_DEST=""
fi

# --- Esito, nello stesso aspetto di `estia info` -----------------------------

sayb "
${CCYAN}╔════════════════════════════════════════════════════════════════════╗
║  🏡 ESTIA e' in piedi                                              ║
╚════════════════════════════════════════════════════════════════════╝${C0}

📍 ${C1}ACCESSO ALL'ISTANZA${C0}
   Web:          ${CBLUE}http://${HOSTNAME_LOCAL}.local:${PORT}${C0}
   Container:    ${NAME} (${CGREEN}● in esecuzione${C0})
   Porta:        ${PORT}
   Dati:         ${VOLUME} → /data
"

if [ -n "$CLI_DEST" ]; then
	sayb "🛠  ${C1}COMANDO «estia»${C0}
   Installato:   ${CLI_DEST}
"
	if [ "$CLI_NEL_PATH" = "1" ]; then
		sayb "   Da qui:       ${C1}estia info${C0}
"
	else
		sayb "   ${CYELLOW}In questo terminale «estia» non e' ancora nel PATH.${C0}
   Prova ora:    ${C1}$CLI_DEST info${C0}
   Poi, per i prossimi terminali:

      echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile
      # chiudi e riapri il terminale, oppure:
      export PATH=\"\$HOME/.local/bin:\$PATH\"
"
	fi
	sayb "   ${C1}estia info${C0}                  Questa panoramica
   ${C1}estia ripristino-backup${C0}     Ripristina un backup cifrato
   ${C1}estia aggiorna${C0}              Aggiorna all'ultima versione
   ${C1}estia logs${C0}                  Log, con il codice di configurazione in cima
"
else
	sayb "🛠  ${C1}COMANDO «estia»${C0}
   ${CYELLOW}Non e' stato possibile copiarlo in /usr/local/bin ne' in ~/.local/bin.${C0}
   L'istanza gira lo stesso. Per avere il comando:

      sudo curl -fsSL ${CLI_URL} -o /usr/local/bin/estia
      sudo chmod 755 /usr/local/bin/estia
"
fi

sayb "💾 ${C1}AGGIORNARE, UN DOMANI${C0}
   I dati stanno sul volume «${VOLUME}» e restano dove sono.
   Rilancia questo stesso comando, oppure ${C1}estia aggiorna${C0}.

📖 ${CDIM}Il codice di configurazione e' in cima ai log, e vale finche' il processo resta acceso:${C0}

      docker logs ${NAME} | head -20

${CDIM}Documentazione: https://github.com/chrono-web/estia${C0}
"
