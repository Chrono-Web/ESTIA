# ADR 0031 — CLI di gestione locale per l'amministrazione e il ripristino

- Stato: **Accepted**
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Sopra: [ADR 0013](0013-backup-cifrati-in-formato-age.md), [ADR 0014](0014-backup-prima-delle-migrazioni.md), [ADR 0016](0016-backup-dal-pannello.md), [ADR 0019](0019-i-dati-hanno-un-posto-prima-della-configurazione.md)
- Vincolante per: M3 (Robustezza operativa e manutenzione dell'istanza)

## Contesto

L'amministrazione ordinaria e il ripristino di emergenza di un'istanza ESTIA self-hosted richiedevano fino ad oggi comandi `docker run` articolati con molteplici flag obbligatori (`-v`, `-it`, `--user 0:0`, `--entrypoint node`, mapping di cartelle e permessi `10001:10001`).

Un errore di digitazione in uno qualsiasi di questi parametri rischiava di creare volumi orfani, fallire con errori di permessi (`EACCES`), o creare database vuoti provvisori sovrapposti.

## Decisione

1. **Introduzione dello script CLI locale `bin/estia`**:
   - Uno script POSIX `/bin/sh` leggero e privo di dipendenze esterne oltre al client `docker`.
   - Installabile in `/usr/local/bin/estia` durante `install.sh` o tramite download diretto.

2. **Comandi ad alto livello**:
   - `estia info`: panoramica immediata con URL di accesso web, stato del container, porte, posizione dei volumi e dei backup sul NAS.
   - `estia ripristino-backup [archivio]`: individua automaticamente i volumi e i percorsi del container, ferma l'istanza se in esecuzione per evitare conflitti su `estia.db`, esegue il ripristino interattivo con banner a colori per la chiave privata, imposta ricorsivamente i permessi `10001:10001` e riaccende l'istanza.
   - `estia backup [destinazione]`: esegue un backup a caldo dell'istanza attiva.
   - `estia chiavi`: genera una nuova coppia di chiavi age a video.
   - `estia logs [-f]`: visualizza i log del container.
   - `estia stato`: fornisce un riepilogo dettagliato dello stato, dell'immagine in uso e dei volumi agganciati.
   - `estia riavvia` / `estia aggiorna`: gestisce il ciclo di vita dell'istanza in sicurezza.

3. **Nessun file di stato o dipendenza persistente sul NAS**:
   - Lo script non crea file di configurazione nascosti nell'host: ispeziona direttamente lo stato di Docker (`docker inspect`), preservando la massima portabilità.

## Conseguenze

### Positive

- Il tempo e la complessità cognitiva per eseguire un ripristino o consultare i log si riducono a un singolo comando immediato (`estia ripristina`).
- Eliminazione degli errori di permessi e di conflitto su `estia.db`.

### Negative / Vincoli

- Richiede che l'utente che esegue `estia` abbia i permessi di accesso al socket di Docker (gruppo `docker` o `sudo`).
