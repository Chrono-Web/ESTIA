# ADR 0011 — Elaborazione delle immagini in WebAssembly

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Vincolante per: M2.3

## Contesto

M2.3 chiede miniature, validazione e metadati per le immagini del feed. La libreria che chiunque sceglierebbe è `sharp`, ed è **un modulo nativo**.

Adottarla contraddirebbe una proprietà che il progetto ha già difeso due volte, con motivazioni identiche: [ADR 0005](0005-persistenza-node-sqlite.md) ha scelto `node:sqlite` per non avere binari da compilare, e [ADR 0008](0008-hashing-password-argon2id.md) ha scelto Argon2id in WebAssembly accettando di essere 2,5 volte più lento pur di avere **un solo artefatto, identico su amd64, arm64, glibc e musl**.

I NAS di destinazione sono in larga parte ARM, talvolta musl. Una terza deroga trasformerebbe una proprietà del progetto in un caso particolare.

## Decisione

**L'elaborazione delle immagini avviene in WebAssembly.**

La famiglia [jSquash](https://github.com/jamsinclair/jSquash) — i codec di Squoosh compilati in Wasm, Apache-2.0 — è la candidata: `@jsquash/jpeg`, `@jsquash/webp` e `@jsquash/resize` sono moduli separati, quindi si importa solo ciò che serve. `wasm-vips` resta l'alternativa se servisse un ventaglio di operazioni più ampio, al prezzo di un artefatto molto più grande.

**La verifica delle versioni e delle licenze è parte dell'implementazione, non un suo presupposto**, come è stato per Headscale in E0 e per Argon2id in ADR 0008: si fissano al momento di scrivere il codice, con la data della verifica.

## Il lavoro pesante lo fa il client

Questo è il punto che rende la scelta sostenibile invece che soltanto coerente.

M2.3 prescrive già la **compressione lato client prima dell'invio**, ed è una mitigazione che il piano di progetto elencava contro un rischio classificato a probabilità alta: «CPU NAS insufficiente per i media». Il browser ridimensiona e ricomprime con `canvas`, che usa il codice nativo del sistema operativo e non costa nulla all'istanza.

Ne segue una divisione netta:

| Chi         | Che cosa fa                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| **Client**  | Ridimensiona e comprime prima di caricare. È qui che si spende la CPU, ed è la CPU di chi pubblica.                |
| **Istanza** | Verifica che il contenuto sia davvero un'immagine, ne legge le dimensioni, produce la miniatura, rifiuta il resto. |

Il server tocca quindi immagini **già piccole**. La lentezza del WebAssembly si applica a un lavoro che è stato reso leggero a monte, il che è esattamente il motivo per cui la si può accettare.

## Che cosa l'istanza deve fare comunque da sé

La compressione lato client è un'ottimizzazione, **non un controllo di sicurezza**: chiunque può inviare ciò che vuole all'endpoint, ignorando il browser.

L'istanza quindi, sempre:

1. **Verifica il tipo dal contenuto**, non dall'estensione né dall'intestazione dichiarata. Un file che dice di essere un'immagine e non lo è va rifiutato.
2. **Rifiuta oltre una soglia di dimensione**, sia in byte sia in pixel: una immagine di poche centinaia di kilobyte può decomprimersi in gigabyte di memoria, ed è un modo classico di far cadere un servizio.
3. **Applica le quote per utente** prima di scrivere.
4. **Scrive in area temporanea e sposta atomicamente** solo a validazione superata, così un fallimento non lascia file orfani.
5. **Non usa mai il nome del file caricato** per costruire il percorso, che è l'origine più comune di path traversal (PROJECT_SPEC §9).

## Conseguenze

**Positive.** Resta vera l'affermazione del progetto: nessun modulo nativo, un artefatto solo per tutte le architetture di destinazione. Coerenza con due decisioni già prese, invece di un'eccezione da spiegare.

**Negative.** Le operazioni sull'immagine costano più tempo di CPU del nativo, e il pacchetto Wasm pesa sull'immagine del container. Le operazioni disponibili sono meno di quelle di `sharp`: per il primo percorso servono decodifica, ridimensionamento e codifica, e tanto basta.

**Aperte.** Il formato delle miniature — WebP per la resa, JPEG per la compatibilità — si decide in implementazione, misurando su un'immagine reale invece che per principio.

## Quando riesaminare

- Se M2.3 misura tempi di elaborazione percepibili su hardware NAS reale con immagini già compresse dal client. La misura va fatta lì, non su un portatile.
- Se una milestone futura richiedesse trasformazioni che le librerie Wasm non coprono — il video, per esempio, che è comunque fuori dal primo percorso.
