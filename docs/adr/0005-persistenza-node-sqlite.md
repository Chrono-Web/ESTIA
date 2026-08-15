# ADR 0005 — Persistenza con `node:sqlite`

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Chiude: la scelta di persistenza richiesta da M0.3

## Contesto

SQLite è il database dell'istanza. La domanda aperta era **quale driver**, e il criterio dominante non era la velocità: era che la dipendenza non rendesse fragile o opaca la build su `linux/arm64`, dato che i NAS di destinazione sono in larga parte ARM.

I moduli nativi sono il rischio: richiedono binari precompilati per ogni architettura, oppure una toolchain di compilazione dentro l'immagine, e sono la causa più comune di installazioni che funzionano sul portatile dello sviluppatore e falliscono sul NAS.

## Opzioni

| Opzione           | Natura                | ARM64                           | Nota                                         |
| ----------------- | --------------------- | ------------------------------- | -------------------------------------------- |
| **`node:sqlite`** | Integrato nel runtime | Nessun problema: è dentro Node  | Nessuna dipendenza da installare             |
| `better-sqlite3`  | Modulo nativo         | Binari precompilati disponibili | Maturo e diffuso; aggiunge un passo di build |
| `node-sqlite3`    | Modulo nativo         | Binari precompilati disponibili | API a callback, meno adatta                  |

## Decisione

**Si usa `node:sqlite`, il modulo SQLite integrato in Node.js.**

Zero dipendenze da installare, zero compilazione, zero binari per architettura. Il problema che rendeva M0.3 uno spike **non esiste più**: se il runtime gira, il database gira.

## Evidenze

Verificato localmente su Node 22.22.2 il 2026-08-14:

- creazione di tabelle con chiavi esterne;
- `PRAGMA foreign_keys = ON` effettivamente applicato — l'inserimento con riferimento inesistente viene **rifiutato**, non ignorato;
- API sincrona `DatabaseSync` / `StatementSync`, adatta a un'istanza di poche decine di membri.

Stato di stabilità: il modulo è arrivato in Node 22.5 dietro flag, il flag è stato rimosso in 22.13, e su Node 24 è classificato **Release Candidate** — API considerata assestata. Sul runtime di riferimento del progetto non richiede quindi flag.

## Rischi e come sono contenuti

**Il modulo non è ancora dichiarato stabile.** È l'unico svantaggio reale rispetto a `better-sqlite3`, che è maturo da anni.

Il rischio è contenuto da una regola già in vigore: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4 impone repository di persistenza sostituibili senza duplicare la logica di dominio. Se `node:sqlite` cambiasse in modo incompatibile o si rivelasse inadeguato, la sostituzione con `better-sqlite3` tocca l'implementazione dei repository, non il dominio sociale.

**Verifica completata il 2026-08-15.** Le prime prove erano su Node 22.22.2; sono state ripetute nell'immagine container di riferimento, su **Node v24.18.0** e su **`linux/arm64` nativo** — Docker su Apple Silicon esegue arm64 senza emulazione — e poi su `linux/amd64`. Su entrambe: creazione dello schema, `PRAGMA foreign_keys = ON` che **rifiuta** l'inserimento con riferimento inesistente invece di ignorarlo, e migrazioni applicate una volta sola.

Il rischio che rendeva M0.3 uno spike — la fragilità della build su ARM — non si è presentato perché non poteva presentarsi: non c'è niente da compilare. L'immagine si costruisce per entrambe le architetture senza toolchain né binari per piattaforma.

Resta fuori da questa verifica una sola cosa, e va detta: **non è hardware NAS.** Un ARM da NAS è più lento di un Apple Silicon, il che riguarda le prestazioni, non la correttezza né la costruibilità.

## Conseguenze

- Nessuna dipendenza aggiunta al `package.json` per la persistenza.
- L'immagine container non ha bisogno di toolchain di compilazione, e resta valida l'affermazione del bootstrap secondo cui non sono stati aggiunti moduli nativi.
- Le migrazioni, le transazioni e i vincoli si scrivono in SQL esplicito, senza ORM. Un ORM resta aggiungibile in seguito, ma non è richiesto dal primo schema.
- L'API sincrona è accettabile per la scala di progetto — decine o poche centinaia di membri — e va riesaminata solo su misure reali, non per principio.

## Quando riesaminare

- Se la verifica su Node 24 e ARM64 rivela problemi.
- Se una milestone futura introduce carichi concorrenti che l'API sincrona non regge, misurati e non ipotizzati.
- Se il modulo venisse deprecato o modificato in modo incompatibile.
