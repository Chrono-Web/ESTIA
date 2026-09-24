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
#
# Parla la lingua di chi lo lancia (ADR 0044 §3): `ESTIA_LANG`, poi `LC_ALL`,
# `LC_MESSAGES` e `LANG`, poi l'inglese. `curl … | ESTIA_LANG=en sh` installa
# in inglese, `… | ESTIA_LANG=it sh` in italiano, e la stessa lingua passa al
# container, che ci stampa il codice di configurazione.

set -eu

IMAGE="${ESTIA_IMAGE:-ghcr.io/chrono-web/estia:latest}"
NAME="${ESTIA_CONTAINER:-estia}"
VOLUME="${ESTIA_VOLUME:-estia-data}"
PORT="${ESTIA_PORT:-3000}"
CLI_URL="${ESTIA_CLI_URL:-https://raw.githubusercontent.com/chrono-web/estia/main/bin/estia}"
DOCS_URL="https://github.com/chrono-web/estia"

CLI_DEST=""
CLI_NEL_PATH=0

# --- Lingua (ADR 0044) -------------------------------------------------------
#
# Le frasi non stanno in questo file: stanno nei cataloghi di
# packages/i18n/locales, e il blocco fra i due segni qui sotto lo scrive
# `pnpm i18n`. Lo script ci mette i colori, le cornici e i valori.

# i18n:inizio — generato da `pnpm i18n` da packages/i18n/locales. Non modificare a mano.
ESTIA_LINGUE='it en'

# estia_frase LINGUA CHIAVE — mette la frase in ESTIA_FRASE; fallisce se quella lingua non la ha.
estia_frase() {
	case "$1" in
	it)
		case "$2" in
		installer.cli.copy_failed) ESTIA_FRASE='Non sono riuscito a copiare il comando estia in /usr/local/bin ne'\'' in ~/.local/bin.' ;;
		installer.cli.installing) ESTIA_FRASE='Installo il comando «estia»…' ;;
		installer.cli.not_in_path) ESTIA_FRASE='In questo terminale non e'\'' ancora nel PATH. Prova: {{command}}' ;;
		installer.cli.then) ESTIA_FRASE='Poi: {{command}}' ;;
		installer.cli.try) ESTIA_FRASE='Prova: {{command}}' ;;
		installer.commands.backup) ESTIA_FRASE='Esegue un backup immediato' ;;
		installer.commands.info) ESTIA_FRASE='Questa panoramica' ;;
		installer.commands.logs) ESTIA_FRASE='Visualizza i log in tempo reale' ;;
		installer.commands.restart) ESTIA_FRASE='Riavvia il container' ;;
		installer.commands.restore) ESTIA_FRASE='Ripristina un backup cifrato' ;;
		installer.commands.status) ESTIA_FRASE='Dettagli tecnici e diagnostica Docker' ;;
		installer.commands.update) ESTIA_FRASE='Aggiorna all'\''ultima versione' ;;
		installer.docker.missing) ESTIA_FRASE='Docker non c'\''e'\''. Su un NAS si installa dal centro applicazioni — Container Manager su Synology, Container Station su QNAP, Docker su UGREEN — e su Linux con: {{command}}' ;;
		installer.docker.not_responding) ESTIA_FRASE='Docker c'\''e'\'' ma non risponde. Se sei su Linux e l'\''hai appena installato, il tuo utente non e'\'' ancora nel gruppo docker: '\''{{command}}'\'', poi chiudi e riapri il terminale.' ;;
		installer.done.access) ESTIA_FRASE='ACCESSO ALL'\''ISTANZA' ;;
		installer.done.cli_failed) ESTIA_FRASE='Non e'\'' stato possibile copiarlo in /usr/local/bin ne'\'' in ~/.local/bin.' ;;
		installer.done.cli_manual) ESTIA_FRASE='L'\''istanza gira lo stesso. Per avere il comando:' ;;
		installer.done.cli_title) ESTIA_FRASE='COMANDO «estia»' ;;
		installer.done.docs) ESTIA_FRASE='Documentazione: {{url}}' ;;
		installer.done.next_terminals) ESTIA_FRASE='Poi, per i prossimi terminali:' ;;
		installer.done.not_in_path) ESTIA_FRASE='In questo terminale «estia» non e'\'' ancora nel PATH.' ;;
		installer.done.reopen) ESTIA_FRASE='chiudi e riapri il terminale, oppure:' ;;
		installer.done.running) ESTIA_FRASE='in esecuzione' ;;
		installer.done.setup_code) ESTIA_FRASE='Il codice di configurazione e'\'' in cima ai log, e vale finche'\'' il processo resta acceso:' ;;
		installer.done.title) ESTIA_FRASE='ESTIA e'\'' in piedi' ;;
		installer.done.update_again) ESTIA_FRASE='Rilancia questo stesso comando, oppure {{command}}.' ;;
		installer.done.update_title) ESTIA_FRASE='AGGIORNARE, UN DOMANI' ;;
		installer.done.update_volume) ESTIA_FRASE='I dati stanno sul volume «{{volume}}» e restano dove sono.' ;;
		installer.error) ESTIA_FRASE='ERRORE' ;;
		installer.existing.no_volume) ESTIA_FRASE='C'\''e'\'' gia'\'' un container «{{name}}» che tiene i dati dentro di se'\'', senza volume. Ricrearlo li cancellerebbe. Fermati: '\''docker cp {{name}}:/data ./estia-data-salvata'\'' li porta fuori, e da li'\'' si ripartono.' ;;
		installer.label.container) ESTIA_FRASE='Container:' ;;
		installer.label.data) ESTIA_FRASE='Dati:' ;;
		installer.label.from_here) ESTIA_FRASE='Da qui:' ;;
		installer.label.installed) ESTIA_FRASE='Installato:' ;;
		installer.label.port) ESTIA_FRASE='Porta:' ;;
		installer.label.try_now) ESTIA_FRASE='Prova ora:' ;;
		installer.label.web) ESTIA_FRASE='Web:' ;;
		installer.pull.failed) ESTIA_FRASE='Non riesco a scaricare {{image}} e qui non c'\''e'\''. Se la macchina non ha Internet, portacela da un altro computer: docker save {{image}} | gzip | ssh utente@macchina '\''docker load'\''' ;;
		installer.pull.offline) ESTIA_FRASE='(non ho raggiunto il registry: uso l'\''immagine gia'\'' presente)' ;;
		installer.pull.start) ESTIA_FRASE='Scarico l'\''immagine…' ;;
		installer.ready.timeout) ESTIA_FRASE='L'\''istanza non ha risposto entro un minuto. I log dicono perche'\'': {{command}}' ;;
		installer.ready.wait) ESTIA_FRASE='Attendo che sia pronta…' ;;
		installer.run.failed) ESTIA_FRASE='Non sono riuscito ad avviare il container. Se la porta {{port}} e'\'' gia'\'' occupata da qualcos'\''altro, rilancia scegliendone un'\''altra: ESTIA_PORT=3001 sh install.sh' ;;
		installer.run.start) ESTIA_FRASE='Avvio l'\''istanza…' ;;
		installer.sudo.explain) ESTIA_FRASE='E'\'' la password di amministratore (sudo), una volta. L'\''istanza e'\'' gia'\'' accesa:
senza questa password il comando finisce nella tua home.' ;;
		installer.sudo.needed) ESTIA_FRASE='Per il comando «estia» serve scrivere in {{dir}}.' ;;
		meta.incomplete) ESTIA_FRASE='In questa versione l'\''italiano è tradotto solo al {{percent}}%.' ;;
		meta.name) ESTIA_FRASE='Italiano' ;;
		*) return 1 ;;
		esac
		;;
	en)
		case "$2" in
		installer.cli.copy_failed) ESTIA_FRASE='Could not copy the estia command to /usr/local/bin or to ~/.local/bin.' ;;
		installer.cli.installing) ESTIA_FRASE='Installing the estia command…' ;;
		installer.cli.not_in_path) ESTIA_FRASE='It is not in this terminal'\''s PATH yet. Try: {{command}}' ;;
		installer.cli.then) ESTIA_FRASE='Then: {{command}}' ;;
		installer.cli.try) ESTIA_FRASE='Try: {{command}}' ;;
		installer.commands.backup) ESTIA_FRASE='Takes a backup right now' ;;
		installer.commands.info) ESTIA_FRASE='This overview' ;;
		installer.commands.logs) ESTIA_FRASE='Shows the logs as they happen' ;;
		installer.commands.restart) ESTIA_FRASE='Restarts the container' ;;
		installer.commands.restore) ESTIA_FRASE='Restores an encrypted backup' ;;
		installer.commands.status) ESTIA_FRASE='Technical details and Docker diagnostics' ;;
		installer.commands.update) ESTIA_FRASE='Updates to the latest version' ;;
		installer.docker.missing) ESTIA_FRASE='Docker is not here. On a NAS you install it from the app centre — Container Manager on Synology, Container Station on QNAP, Docker on UGREEN — and on Linux with: {{command}}' ;;
		installer.docker.not_responding) ESTIA_FRASE='Docker is here but does not answer. If you are on Linux and have just installed it, your user is not in the docker group yet: '\''{{command}}'\'', then close and reopen the terminal.' ;;
		installer.done.access) ESTIA_FRASE='OPENING THE INSTANCE' ;;
		installer.done.cli_failed) ESTIA_FRASE='Could not copy it to /usr/local/bin or to ~/.local/bin.' ;;
		installer.done.cli_manual) ESTIA_FRASE='The instance runs anyway. To get the command:' ;;
		installer.done.cli_title) ESTIA_FRASE='THE estia COMMAND' ;;
		installer.done.docs) ESTIA_FRASE='Documentation: {{url}}' ;;
		installer.done.next_terminals) ESTIA_FRASE='Then, for the terminals you open later:' ;;
		installer.done.not_in_path) ESTIA_FRASE='estia is not in this terminal'\''s PATH yet.' ;;
		installer.done.reopen) ESTIA_FRASE='close and reopen the terminal, or:' ;;
		installer.done.running) ESTIA_FRASE='running' ;;
		installer.done.setup_code) ESTIA_FRASE='The setup code is at the top of the logs, and it works as long as the process keeps running:' ;;
		installer.done.title) ESTIA_FRASE='ESTIA is up' ;;
		installer.done.update_again) ESTIA_FRASE='Run this same command again, or {{command}}.' ;;
		installer.done.update_title) ESTIA_FRASE='UPDATING, LATER ON' ;;
		installer.done.update_volume) ESTIA_FRASE='The data lives on the volume "{{volume}}" and stays where it is.' ;;
		installer.error) ESTIA_FRASE='ERROR' ;;
		installer.existing.no_volume) ESTIA_FRASE='There is already a container "{{name}}" that keeps its data inside itself, without a volume. Recreating it would erase them. Stop here: '\''docker cp {{name}}:/data ./estia-data-saved'\'' copies them out, and you start again from there.' ;;
		installer.label.container) ESTIA_FRASE='Container:' ;;
		installer.label.data) ESTIA_FRASE='Data:' ;;
		installer.label.from_here) ESTIA_FRASE='From here:' ;;
		installer.label.installed) ESTIA_FRASE='Installed:' ;;
		installer.label.port) ESTIA_FRASE='Port:' ;;
		installer.label.try_now) ESTIA_FRASE='Try now:' ;;
		installer.label.web) ESTIA_FRASE='Web:' ;;
		installer.pull.failed) ESTIA_FRASE='Cannot download {{image}}, and it is not here. If this machine has no Internet, bring it from another computer: docker save {{image}} | gzip | ssh user@machine '\''docker load'\''' ;;
		installer.pull.offline) ESTIA_FRASE='(could not reach the registry: using the image already here)' ;;
		installer.pull.start) ESTIA_FRASE='Downloading the image…' ;;
		installer.ready.timeout) ESTIA_FRASE='The instance did not answer within a minute. The logs say why: {{command}}' ;;
		installer.ready.wait) ESTIA_FRASE='Waiting for it to be ready…' ;;
		installer.run.failed) ESTIA_FRASE='Could not start the container. If port {{port}} is already taken by something else, run it again with another one: ESTIA_PORT=3001 sh install.sh' ;;
		installer.run.start) ESTIA_FRASE='Starting the instance…' ;;
		installer.sudo.explain) ESTIA_FRASE='It is the administrator password (sudo), asked once. The instance is already on:
without this password the command goes into your home folder.' ;;
		installer.sudo.needed) ESTIA_FRASE='The estia command needs to be written to {{dir}}.' ;;
		meta.incomplete) ESTIA_FRASE='In this version, English is only {{percent}}% translated.' ;;
		meta.name) ESTIA_FRASE='English' ;;
		*) return 1 ;;
		esac
		;;
	*) return 1 ;;
	esac
}

# estia_completezza LINGUA — quanto e' tradotta, in percentuale (ADR 0044 §4).
estia_completezza() {
	case "$1" in
	it) printf '%s' 100 ;;
	en) printf '%s' 100 ;;
	*) printf '%s' 0 ;;
	esac
}
# i18n:fine

# lingua_da_locale VALORE — `en_US.UTF-8` → `en-US`. `C` e `POSIX` non nominano
# nessuna lingua, e falliscono.
lingua_da_locale() {
	_ll="${1%%.*}"
	_ll="${_ll%%@*}"
	case "$_ll" in
	"" | C | POSIX)
		return 1
		;;
	esac
	printf '%s' "$_ll" | tr '_' '-'
}

minuscole() {
	printf '%s' "$1" | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz'
}

# lingua_disponibile DESIDERIO — il codice di ESTIA_LINGUE che gli risponde,
# prima per intero (`pt-BR`), poi per la lingua principale (`en-GB` → `en`).
lingua_disponibile() {
	_ld=$(lingua_da_locale "$1") || return 1
	_ld=$(minuscole "$_ld")
	for _lc in $ESTIA_LINGUE; do
		if [ "$(minuscole "$_lc")" = "$_ld" ]; then
			printf '%s' "$_lc"
			return 0
		fi
	done
	for _lc in $ESTIA_LINGUE; do
		if [ "$(minuscole "$_lc")" = "${_ld%%-*}" ]; then
			printf '%s' "$_lc"
			return 0
		fi
	done
	return 1
}

# scegli_lingua [PREFERITA] — ESTIA_LANG, poi PREFERITA, poi LC_ALL,
# LC_MESSAGES e LANG, poi l'inglese.
scegli_lingua() {
	for _ls in "${ESTIA_LANG:-}" "${1:-}" "${LC_ALL:-}" "${LC_MESSAGES:-}" "${LANG:-}"; do
		if lingua_disponibile "$_ls"; then
			return 0
		fi
	done
	printf '%s' en
}

# t CHIAVE [NOME VALORE]... — la frase nella lingua scelta, altrimenti in
# inglese, altrimenti in italiano, con ogni {{NOME}} sostituito da VALORE.
#
# La sostituzione la fa awk leggendo tutto da ENVIRON: un valore con `/`, `&`,
# `\` o apici resta com'e', cosa che sed con il valore dentro l'espressione non
# garantisce. Il colore di un valore lo mette chi chiama, nel valore stesso.
t() {
	_tk="$1"
	shift
	if estia_frase "$LINGUA" "$_tk" || estia_frase en "$_tk" || estia_frase it "$_tk"; then
		_tf="$ESTIA_FRASE"
	else
		_tf="$_tk"
	fi
	while [ "$#" -ge 2 ]; do
		case "$_tf" in
		*"{{$1}}"*)
			_tf=$(ESTIA_T_FRASE="$_tf" ESTIA_T_NOME="{{$1}}" ESTIA_T_VALORE="$2" awk 'BEGIN {
				s = ENVIRON["ESTIA_T_FRASE"]
				k = ENVIRON["ESTIA_T_NOME"]
				v = ENVIRON["ESTIA_T_VALORE"]
				out = ""
				while ((i = index(s, k)) > 0) {
					out = out substr(s, 1, i - 1) v
					s = substr(s, i + length(k))
				}
				printf "%s", out s
			}')
			;;
		esac
		shift 2
	done
	printf '%s' "$_tf"
}

# larghezza TESTO — le colonne che occupa: i caratteri, non i byte (di UTF-8 si
# scartano i byte di continuazione). Giusto per gli alfabeti dei cataloghi di
# oggi; le icone delle cornici le conta `cornice` a parte.
larghezza() {
	printf '%s' "$1" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' '
}

ripeti() {
	_rr=""
	_rn="$2"
	while [ "$_rn" -gt 0 ]; do
		_rr="$_rr$1"
		_rn=$((_rn - 1))
	done
	printf '%s' "$_rr"
}

# colonna MINIMO ETICHETTA... — dove comincia il valore in un elenco di
# etichette: almeno a MINIMO, e sempre uno spazio dopo la piu' lunga, perche'
# un'etichetta tradotta puo' essere piu' lunga di quella italiana.
colonna() {
	_cm="$1"
	shift
	for _ct in "$@"; do
		_cw=$(($(larghezza "$_ct") + 1))
		if [ "$_cw" -gt "$_cm" ]; then
			_cm="$_cw"
		fi
	done
	printf '%s' "$_cm"
}

# allinea COLONNA TESTO — il testo, e gli spazi che lo portano alla colonna.
allinea() {
	_aw=$(($1 - $(larghezza "$2")))
	if [ "$_aw" -lt 1 ]; then
		_aw=1
	fi
	printf '%s%s' "$2" "$(ripeti ' ' "$_aw")"
}

LINGUA=$(scegli_lingua)

# I comandi hanno un nome italiano e uno inglese (`estia stato` e `estia status`
# sono lo stesso comando): a chi legge in un'altra lingua si mostrano gli inglesi.
if [ "$LINGUA" = it ]; then
	CMD_STATO="estia stato"
	CMD_RIPRISTINO="estia ripristino-backup"
	CMD_AGGIORNA="estia aggiorna"
	CMD_RIAVVIA="estia riavvia"
else
	CMD_STATO="estia status"
	CMD_RIPRISTINO="estia restore"
	CMD_AGGIORNA="estia update"
	CMD_RIAVVIA="estia restart"
fi

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	ESC=$(printf '\033')
	C0="${ESC}[0m"
	C1="${ESC}[1m"
	CDIM="${ESC}[2m"
	CCYAN="${ESC}[1;36m"
	CBLUE="${ESC}[4;34m"
	CGREEN="${ESC}[32m"
	CYELLOW="${ESC}[33m"
	CRED="${ESC}[31m"
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

# Si stampa sempre con %s: i colori sono gia' byte veri, e un percorso o una
# frase con una barra rovesciata devono uscire come sono.
say() {
	printf '%s\n' "$*"
}

die() {
	printf '\n%s\n' "${CRED}${C1}$(t installer.error)${C0} $*" >&2
	exit 1
}

# cornice ICONA TITOLO — il riquadro dei titoli, largo 68 colonne o di piu' se
# il titolo, in quella lingua, e' piu' lungo. L'icona occupa due colonne.
cornice() {
	_cl=$(($(larghezza "$2") + 5))
	_ci=68
	if [ "$((_cl + 1))" -gt "$_ci" ]; then
		_ci=$((_cl + 1))
	fi
	_cb=$(ripeti '═' "$_ci")
	say ""
	say "${CCYAN}╔${_cb}╗"
	say "║  $1 $2$(ripeti ' ' $((_ci - _cl)))║"
	say "╚${_cb}╝${C0}"
}

# Una lingua incompleta si usa lo stesso, e lo dice per prima cosa (ADR 0044 §4),
# con la frase di quella lingua o, se non l'ha ancora tradotta, con l'inglese.
avvisa_se_incompleta() {
	_ap=$(estia_completezza "$LINGUA")
	if [ "$_ap" -lt 100 ]; then
		say "${CYELLOW}$(t meta.incomplete percent "$_ap")${C0}"
		say ""
	fi
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

	say ""
	say "${CYELLOW}$(t installer.sudo.needed dir "$dest_dir")${C0}"
	say "$(t installer.sudo.explain)"
	say ""

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

avvisa_se_incompleta

# Istanza gia' in piedi, manca solo il comando (il caso Linux Mint).
if [ "${ESTIA_SOLO_CLI:-}" = "1" ]; then
	say "${CCYAN}→${C0} $(t installer.cli.installing)"
	if install_cli; then
		say ""
		say "${CGREEN}●${C0} $(t installer.label.installed) ${CLI_DEST}"
		if [ "$CLI_NEL_PATH" = "1" ]; then
			say "  $(t installer.cli.try command "${C1}estia info${C0}")"
		else
			say "  $(t installer.cli.not_in_path command "${C1}$CLI_DEST info${C0}")"
			say "  $(t installer.cli.then command 'export PATH="$HOME/.local/bin:$PATH"')"
		fi
		exit 0
	fi
	die "$(t installer.cli.copy_failed)"
fi

# --- Istanza -----------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
	die "$(t installer.docker.missing command 'curl -fsSL https://get.docker.com | sh')"
fi

if ! docker info >/dev/null 2>&1; then
	die "$(t installer.docker.not_responding command 'sudo usermod -aG docker "$USER"')"
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
		die "$(t installer.existing.no_volume name "$NAME")"
		;;
	*)
		VOLUME="$MOUNTED"
		;;
	esac
fi

say "${CCYAN}→${C0} $(t installer.pull.start)"

# Un pull fallito non e' per forza un problema: l'immagine puo' essere gia' qui,
# portata da `docker load` su una macchina senza Internet. Fallisce solo se dopo
# il tentativo non c'e' comunque niente da avviare.
if ! docker pull "$IMAGE" >/dev/null 2>&1; then
	if docker image inspect "$IMAGE" >/dev/null 2>&1; then
		say "  ${CDIM}$(t installer.pull.offline)${C0}"
	else
		die "$(t installer.pull.failed image "$IMAGE")"
	fi
fi

# Creato esplicitamente e prima del container: cosi' esiste con un nome anche
# se il run qui sotto fallisce, e il nome e' l'unica cosa che rende dei dati
# ritrovabili sei mesi dopo.
docker volume create "$VOLUME" >/dev/null

docker rm -f "$NAME" >/dev/null 2>&1 || true

say "${CCYAN}→${C0} $(t installer.run.start)"

# La stessa postura del Compose in infra/: utente non root, filesystem in sola
# lettura tranne il volume, nessuna capability, nessun privilegio nuovo.
# ESTIA_LANG e' la lingua di questa installazione: il container ci stampa il
# codice di configurazione (ADR 0044 §3), e `estia aggiorna` la conserva.
docker run -d \
	--name "$NAME" \
	--restart unless-stopped \
	--publish "${PORT}:3000" \
	--volume "${VOLUME}:/data" \
	--env ESTIA_DATA_DIR=/data \
	--env ESTIA_HOST=0.0.0.0 \
	--env ESTIA_LANG="$LINGUA" \
	--user 10001:10001 \
	--init \
	--read-only \
	--tmpfs /tmp \
	--cap-drop ALL \
	--security-opt no-new-privileges:true \
	--pids-limit 256 \
	"$IMAGE" >/dev/null || die "$(t installer.run.failed port "$PORT")"

WAITED=0

say "${CCYAN}→${C0} $(t installer.ready.wait)"

while [ "$WAITED" -lt 60 ]; do
	if docker exec "$NAME" node -e "fetch('http://127.0.0.1:3000/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
		break
	fi

	WAITED=$((WAITED + 1))
	sleep 1
done

if [ "$WAITED" -ge 60 ]; then
	die "$(t installer.ready.timeout command "docker logs $NAME")"
fi

# Solo la prima etichetta: `hostname` su parecchie macchine risponde con il
# nome completo appiccicato dal router, e «casa.rete-del-provider.it.local» non
# risolve da nessuna parte.
HOSTNAME_LOCAL="$(hostname 2>/dev/null | cut -d. -f1)"
HOSTNAME_LOCAL="${HOSTNAME_LOCAL:-localhost}"

say "${CCYAN}→${C0} $(t installer.cli.installing)"

if install_cli; then
	:
else
	CLI_DEST=""
fi

# --- Esito, nello stesso aspetto di `estia info` -----------------------------

RAMO="   ${CCYAN}├──${C0}"
ULTIMO="   ${CCYAN}└──${C0}"

L_WEB=$(t installer.label.web)
L_CONTAINER=$(t installer.label.container)
L_PORT=$(t installer.label.port)
L_DATA=$(t installer.label.data)
L_INSTALLED=$(t installer.label.installed)
L_FROM_HERE=$(t installer.label.from_here)
L_TRY_NOW=$(t installer.label.try_now)
W=$(colonna 14 "$L_WEB" "$L_CONTAINER" "$L_PORT" "$L_DATA" "$L_INSTALLED" "$L_FROM_HERE" "$L_TRY_NOW")
RIENTRO=$(ripeti ' ' 7)

cornice "🏡" "$(t installer.done.title)"
say ""
say "📍 ${C1}$(t installer.done.access)${C0}"
say "$RAMO $(allinea "$W" "$L_WEB")${CBLUE}http://${HOSTNAME_LOCAL}.local:${PORT}${C0}"
say "$RAMO $(allinea "$W" "$L_CONTAINER")${NAME} (${CGREEN}● $(t installer.done.running)${C0})"
say "$RAMO $(allinea "$W" "$L_PORT")${PORT}"
say "$ULTIMO $(allinea "$W" "$L_DATA")${VOLUME} → /data"
say ""

if [ -n "$CLI_DEST" ]; then
	say "🛠  ${C1}$(t installer.done.cli_title)${C0}"
	say "$RAMO $(allinea "$W" "$L_INSTALLED")${CLI_DEST}"
	if [ "$CLI_NEL_PATH" = "1" ]; then
		say "$ULTIMO $(allinea "$W" "$L_FROM_HERE")${C1}estia info${C0}"
		say ""
	else
		say "$ULTIMO ${CYELLOW}$(t installer.done.not_in_path)${C0}"
		say "${RIENTRO}$(allinea "$W" "$L_TRY_NOW")${C1}$CLI_DEST info${C0}"
		say "${RIENTRO}$(t installer.done.next_terminals)"
		say ""
		say "          echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile"
		say "          # $(t installer.done.reopen)"
		say "          export PATH=\"\$HOME/.local/bin:\$PATH\""
		say ""
	fi
	say "$RAMO ${C1}$(allinea 28 "estia info")${C0}$(t installer.commands.info)"
	say "$RAMO ${C1}$(allinea 28 "$CMD_STATO")${C0}$(t installer.commands.status)"
	say "$RAMO ${C1}$(allinea 28 "$CMD_RIPRISTINO")${C0}$(t installer.commands.restore)"
	say "$RAMO ${C1}$(allinea 28 "estia backup")${C0}$(t installer.commands.backup)"
	say "$RAMO ${C1}$(allinea 28 "estia logs -f")${C0}$(t installer.commands.logs)"
	say "$RAMO ${C1}$(allinea 28 "$CMD_AGGIORNA")${C0}$(t installer.commands.update)"
	say "$ULTIMO ${C1}$(allinea 28 "$CMD_RIAVVIA")${C0}$(t installer.commands.restart)"
	say ""
else
	say "🛠  ${C1}$(t installer.done.cli_title)${C0}"
	say "   ${CYELLOW}$(t installer.done.cli_failed)${C0}"
	say "   $(t installer.done.cli_manual)"
	say ""
	say "      sudo curl -fsSL ${CLI_URL} -o /usr/local/bin/estia"
	say "      sudo chmod 755 /usr/local/bin/estia"
	say ""
fi

say "💾 ${C1}$(t installer.done.update_title)${C0}"
say "$RAMO $(t installer.done.update_volume volume "$VOLUME")"
say "$ULTIMO $(t installer.done.update_again command "${C1}${CMD_AGGIORNA}${C0}")"
say ""
say "📖 ${CDIM}$(t installer.done.setup_code)${C0}"
say ""
say "      docker logs ${NAME} | head -20"
say ""
say "${CDIM}$(t installer.done.docs url "$DOCS_URL")${C0}"
say ""
