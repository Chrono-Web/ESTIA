# E0 — Inventario e pinning

- Data: 2026-08-13
- Eseguito da: sessione di lavoro assistita, su fonti pubbliche
- Opzione ADR 0001 in prova: inventario trasversale ad A, B, C, D
- Esito: **riuscito**

## Ambiente

E0 è ricerca documentale: **nessun componente è stato avviato**. Non richiede il laboratorio, e infatti è l'unico esperimento di M0.2 eseguibile senza VPS, NAS, telefoni e linea CGNAT.

| Voce                   | Valore                                                         |
| ---------------------- | -------------------------------------------------------------- |
| Metodo                 | API GitHub e API registry Docker Hub, documentazione ufficiale |
| Componenti avviati     | nessuno                                                        |
| Verifica riproducibile | sì, con i comandi in §Procedura                                |

## Procedura seguita

```bash
gh release list --repo juanfont/headscale --limit 12
gh api repos/juanfont/headscale --jq '.license.spdx_id'
gh release view v0.29.3 --repo juanfont/headscale --json assets --jq '.assets[].name'
gh release list --repo caddyserver/caddy --limit 6
gh api repos/caddyserver/caddy --jq '.license.spdx_id'
gh api repos/tailscale/tailscale --jq '.license.spdx_id'
gh api repos/tailscale/libtailscale --jq '.license.spdx_id'
gh api repos/WireGuard/wireguard-go --jq '.license.spdx_id'
gh api repos/WireGuard/wireguard-apple --jq '.license.spdx_id'
gh api repos/WireGuard/wireguard-android --jq '.license.spdx_id'

curl -s "https://hub.docker.com/v2/repositories/headscale/headscale/tags/0.29.3"
curl -s "https://hub.docker.com/v2/repositories/library/caddy/tags/2.11.4"
```

## Inventario

### Componenti del laboratorio (Opzione A)

| Componente | Versione fissata | Rilascio   | Licenza      | Architetture immagine                        |
| ---------- | ---------------- | ---------- | ------------ | -------------------------------------------- |
| Headscale  | `0.29.3`         | 2026-07-29 | BSD-3-Clause | linux/amd64, linux/arm64                     |
| Caddy      | `2.11.4`         | 2026-06-03 | Apache-2.0   | linux/amd64, linux/arm64, linux/arm, e altre |

Binari ufficiali Headscale disponibili anche per `darwin/amd64`, `darwin/arm64` e `freebsd/amd64`; per ESTIA rilevano solo le due architetture Linux.

### Client (Opzione A)

| Piattaforma | Client                                    | Licenza motore | Configurazione verso control plane self-hosted       |
| ----------- | ----------------------------------------- | -------------- | ---------------------------------------------------- |
| iOS         | Tailscale ufficiale, App Store            | BSD-3-Clause   | «Use custom coordination server» dal menu di login   |
| Android     | Tailscale ufficiale, Play Store o F-Droid | BSD-3-Clause   | «Use an alternate server», oppure auth key           |
| macOS       | Tailscale ufficiale                       | BSD-3-Clause   | `tailscale login --login-server <URL>`, o menu Debug |

### Componenti delle altre opzioni

| Opzione | Componente principale        | Licenza      | Nota                                                 |
| ------- | ---------------------------- | ------------ | ---------------------------------------------------- |
| B       | `tailscale/tailscale`        | BSD-3-Clause | Motore Tailscale da incorporare nell'app             |
| B       | `tailscale/libtailscale`     | BSD-3-Clause | Libreria C, percorso di binding nativo               |
| C       | `wireguard-go`               | MIT          | Implementazione userspace                            |
| C       | `wireguard-apple`            | MIT          | Componenti iOS/macOS                                 |
| C       | `wireguard-android`          | Apache-2.0   | Componenti Android                                   |
| D       | nessun componente aggiuntivo | —            | È una topologia, non uno stack: si combina con A o B |

## Misure

Non applicabili a E0. Le misure definite nel [README](../README.md) §6 richiedono un tunnel attivo e iniziano da E2.

## Osservazioni

1. **Nessun blocco di licenza su alcuna opzione.** Tutto ciò che ESTIA dovrebbe integrare o distribuire è BSD-3-Clause, MIT o Apache-2.0. Il criterio «licenze compatibili con il progetto» dell'ADR 0001 è soddisfatto da A, B e C: la scelta si decide su altri assi.

2. **Su iOS non serve alcun profilo di configurazione.** L'app Tailscale ufficiale espone nativamente «Use custom coordination server». Questo era il rischio maggiore dell'Opzione A — se avesse richiesto profili MDM o sideloading, A sarebbe stata inutilizzabile come baseline. Non è così.

3. **Trappola operativa sul tag.** La release GitHub è `v0.29.3`, ma il tag dell'immagine su Docker Hub è `0.29.3`, senza `v`. `.env.example` è stato compilato con la forma corretta per il compose.

4. **Headscale è pre-1.0 e rilascia spesso.** Quattro rilasci in sei settimane (0.29.0 il 17 giugno, 0.29.3 il 29 luglio). Per un control plane self-hosted da una comunità non tecnica questo è un costo ricorrente di aggiornamento, non un dettaglio: va pesato nell'ADR insieme alla revoca e alla connettività, e verificato in E7 rispetto a quanto è invasivo un upgrade con nodi già registrati.

## Metadati osservati

Rinviato a E7, che richiede un'istanza avviata con nodi reali.

## Limiti di questa prova

- Le versioni sono verificate alla data indicata; vanno riconfermate se M0.2 riprende dopo settimane.
- Nulla è stato avviato: non è verificato che `0.29.3` funzioni con la configurazione del laboratorio, né che Caddy ottenga il certificato per il dominio del lab. Sono E1.
- La procedura di connessione dei client è letta dalla documentazione ufficiale, non eseguita. Vale come istruzione, non come evidenza: la conferma è E2.
- Nessuna conclusione su effort e rischio dell'Opzione B: la licenza è compatibile, ma il costo di integrazione nativa resta la domanda di E8.

## Conseguenze per l'ADR 0001

- **L'Opzione A è confermata come baseline dello spike.** Componenti reperibili, licenze compatibili, e nessun ostacolo alla configurazione dei client su iOS e Android. L'ADR può continuare a trattarla come primo ambiente di sviluppo.
- **Nessuna opzione viene esclusa da E0.** Le licenze non discriminano; la decisione resta appesa alle evidenze di E2–E8, cioè a revoca, mobilità e CGNAT.
- **Emerge un criterio nuovo, non previsto dall'ADR:** il costo di manutenzione del control plane nel tempo. L'ADR valuta oggi «il minor codice di networking mantenuto da ESTIA», ma un componente pre-1.0 con rilasci frequenti sposta il costo dalla scrittura alla gestione. Da considerare quando si sceglie tra A/B (Headscale, gestito) e D (topologia mista).
