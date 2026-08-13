# Configurazione di Headscale per il lab

`config.yaml` **non è versionato**: è specifico della versione fissata in E0 e contiene il dominio reale del lab.

Durante E0, scaricare il file di esempio della release che si è deciso di usare e salvarlo qui come `config.yaml`. I campi che contano per questo spike:

| Campo         | Perché conta                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `server_url`  | Deve essere l'URL HTTPS pubblico servito da Caddy. È il vincolo che l'ADR 0001 mette in discussione. |
| `listen_addr` | Deve restare interno alla rete Compose: TLS lo termina Caddy.                                        |
| `database`    | SQLite è sufficiente per il lab. Annotare il percorso, serve per E7.                                 |
| `derp`        | Determina se e quale relay viene usato. Da annotare in E3 e E6.                                      |

Registrare in `results/E0-*.md` la versione esatta, la licenza e le architetture supportate, con la data di verifica.
