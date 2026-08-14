# ADR 0008 — Hashing delle password con Argon2id in WebAssembly

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA

## Contesto

`PROJECT_SPEC.md` §11 impone Argon2id per le password. Node.js non lo include: `node:crypto` offre `scrypt`, non Argon2. Serve quindi una dipendenza, e `AGENTS.md` richiede un ADR per ogni scelta crittografica.

Il vincolo che orienta la scelta è lo stesso di [ADR 0005](0005-persistenza-node-sqlite.md): **i moduli nativi complicano la distribuzione su NAS**, che sono in larga parte ARM e talvolta musl. Il bootstrap dichiara, nel README e nell'immagine, di non aggiungere moduli nativi.

## Opzioni misurate

| Pacchetto         | Natura                             | Binari per piattaforma                         | Licenza |
| ----------------- | ---------------------------------- | ---------------------------------------------- | ------- |
| **`hash-wasm`**   | WebAssembly puro                   | **Nessuno**                                    | MIT     |
| `@node-rs/argon2` | Binding Rust via napi-rs           | Uno per piattaforma, come dipendenze opzionali | MIT     |
| `argon2`          | Modulo nativo con `node-gyp-build` | Compilazione o prebuild                        | MIT     |

Misura del 2026-08-14 su macOS ARM, parametri OWASP `m=19456 KiB, t=2, p=1`:

```
hash-wasm (WASM)          35,9 ms/hash
@node-rs/argon2 (nativo)  14,5 ms/hash
                          WASM è 2,5x il nativo
```

## Decisione

**Si usa `hash-wasm`**, con parametri Argon2id `m=19456 KiB` (19 MiB), `t=2`, `p=1`, che sono il minimo raccomandato da OWASP per Argon2id.

Le password si conservano nel formato PHC (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), che incorpora parametri e sale: la verifica è autodescrittiva e i parametri possono essere irrobustiti in futuro senza invalidare gli hash esistenti.

## Perché la lentezza non è il criterio decisivo

Il costo di Argon2 è **voluto**, e i parametri — non l'implementazione — determinano quanto costa a un attaccante forzare un hash. Un attaccante usa comunque codice nativo o GPU.

La differenza fra WASM e nativo si scarica quindi **solo sul tempo di attesa del difensore**, a parità di robustezza. Trentasei millisecondi per un login su un'istanza da qualche decina di membri sono irrilevanti: i login sono rari e non sono un percorso ad alto throughput. Anche moltiplicati per il divario di CPU di un NAS debole, si resta nell'ordine delle centinaia di millisecondi.

In cambio si ottiene **un solo artefatto che gira identico su amd64, arm64, glibc e musl**, senza dipendenze opzionali che devono risolversi correttamente per piattaforma durante la build dell'immagine.

## Correttezza: verificata, non assunta

Il rischio di un'implementazione meno diffusa non è una debolezza crittografica sottile — Argon2 è specificato — ma un **errore di implementazione**, che produrrebbe hash sbagliati.

È stato verificato confrontando `hash-wasm` con `@node-rs/argon2`, che incapsula l'implementazione Rust del progetto RustCrypto: **a parità di password, sale e parametri le due implementazioni indipendenti producono lo stesso digest, byte per byte.**

Quel valore concordato è fissato nella suite di test come vettore di regressione. Serve a due cose: intercettare una regressione della libreria, e intercettare una modifica involontaria dei parametri, che è l'errore più probabile e più silenzioso dei due.

> Nota di metodo: un primo confronto era stato tentato contro un vettore RFC ricordato a memoria, e non combaciava. A sbagliare era il valore ricordato, non la libreria. Il confronto fra due implementazioni indipendenti è la verifica che regge; la memoria no.

## Conseguenze

**Positive.** Nessun modulo nativo, quindi resta vera l'affermazione del progetto sulla distribuzione multi-architettura. Nessuna dipendenza transitiva. Formato PHC che consente di irrobustire i parametri in seguito.

**Negative.** Un login costa 2,5 volte il minimo teorico in tempo di CPU. `hash-wasm` ha una base di manutentori più ristretta rispetto all'ecosistema RustCrypto: mitigato dal vettore di regressione, non annullato.

## Quando riesaminare

- Se la misura su hardware NAS reale mostra latenze di login percepibili dall'utente, si passa a `@node-rs/argon2` accettando i binari per piattaforma. La sostituzione è contenuta: un solo modulo, e il formato PHC è compatibile fra le due implementazioni.
- Se le raccomandazioni OWASP sui parametri cambiano, si aggiornano i parametri: gli hash esistenti restano verificabili perché il formato li incorpora.
