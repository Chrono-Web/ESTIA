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

set -eu

IMAGE="${ESTIA_IMAGE:-ghcr.io/chrono-web/estia:latest}"
NAME="${ESTIA_CONTAINER:-estia}"
VOLUME="${ESTIA_VOLUME:-estia-data}"
PORT="${ESTIA_PORT:-3000}"

say() {
	printf '%s\n' "$*"
}

die() {
	printf '\n%s\n' "$*" >&2
	exit 1
}

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
		die "C'e' gia' un container «$NAME» che tiene i dati dentro di se', senza volume. Ricrearlo li cancellerebbe. Fermati: 'docker cp $NAME:/data ./estia-data-salvata' li porta fuori, e da li' si ripartono."
		;;
	*)
		VOLUME="$MOUNTED"
		;;
	esac
fi

say "Scarico l'immagine…"

# Un pull fallito non e' per forza un problema: l'immagine puo' essere gia' qui,
# portata da `docker load` su una macchina senza Internet. Fallisce solo se dopo
# il tentativo non c'e' comunque niente da avviare.
if ! docker pull "$IMAGE" >/dev/null 2>&1; then
	if docker image inspect "$IMAGE" >/dev/null 2>&1; then
		say "  (non ho raggiunto il registry: uso l'immagine gia' presente)"
	else
		die "Non riesco a scaricare $IMAGE e qui non c'e'. Se la macchina non ha Internet, portacela da un altro computer: docker save $IMAGE | gzip | ssh utente@macchina 'docker load'"
	fi
fi

# Creato esplicitamente e prima del container: cosi' esiste con un nome anche
# se il run qui sotto fallisce, e il nome e' l'unica cosa che rende dei dati
# ritrovabili sei mesi dopo.
docker volume create "$VOLUME" >/dev/null

docker rm -f "$NAME" >/dev/null 2>&1 || true

say "Avvio l'istanza…"

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

say ""
say "ESTIA e' in piedi."
say ""
say "  Aprila da un altro dispositivo della stessa rete:"
say ""
say "      http://${HOSTNAME_LOCAL}.local:${PORT}"
say ""
say "  Il codice di configurazione e' in cima ai log, e vale finche' il"
say "  processo resta acceso:"
say ""
say "      docker logs ${NAME} | head -20"
say ""
say "  Per aggiornare, un domani: rilancia questo stesso comando o usa 'estia aggiorna'.
  I dati stanno sul volume «${VOLUME}» e restano dove sono.

  CLI locale: per gestire l'istanza digita 'estia info' (oppure 'estia ripristino-backup'
  per ripristinare un backup).
"

# Installa la CLI `estia` se /usr/local/bin e' scrivibile
if [ -w /usr/local/bin ]; then
	curl -fsSL https://raw.githubusercontent.com/chrono-web/estia/main/bin/estia -o /usr/local/bin/estia 2>/dev/null && chmod +x /usr/local/bin/estia 2>/dev/null || true
fi
