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

### Versioni fissate e verificate il 2026-08-14

| Pacchetto         | Versione | Licenza    | Usato per                                      |
| ----------------- | -------- | ---------- | ---------------------------------------------- |
| `@jsquash/jpeg`   | 1.6.0    | Apache-2.0 | Decodifica JPEG (e codifica solo nei test)     |
| `@jsquash/png`    | 3.1.1    | Apache-2.0 | Decodifica PNG (e codifica solo nei test)      |
| `@jsquash/webp`   | 1.5.0    | Apache-2.0 | Decodifica WebP e **codifica delle miniature** |
| `@jsquash/resize` | 2.1.1    | Apache-2.0 | Ridimensionamento                              |

Nessuno dei quattro porta dipendenze native né binari per piattaforma: sono file `.wasm` identici su ogni architettura, che è esattamente la proprietà per cui questo ADR esiste. Complessivamente pesano circa 1,9 MB nell'immagine, e vengono istanziati **alla prima immagine caricata**, non all'avvio: un'istanza dove nessuno pubblica foto non paga né la memoria né il tempo di istanziazione.

### Che cosa è servito per farli girare sotto Node

jSquash nasce per il browser, e la scoperta va registrata perché non è nella sua documentazione: **il caricamento automatico del `.wasm` non funziona in Node.** Il codice generato da Emscripten recupera il binario con `fetch()`, che in Node non gestisce lo schema `file:` e fallisce con `not implemented... yet...`.

Due adattamenti, entrambi nostri e contenuti in un solo file (`media/codecs.ts`):

1. **Il modulo Wasm si compila e si passa esplicitamente.** Si legge il `.wasm` dal disco e si invoca l'`init(module)` che jSquash espone proprio per questo caso.
2. **`ImageData` non esiste in Node** e i codec la costruiscono. Serve una classe minima, definita solo se assente.

Per la codifica WebP c'è un dettaglio in più: `init()` sceglie il codice di collegamento in base al supporto SIMD, quindi va passato il `.wasm` corrispondente — la variante SIMD o quella normale. Il rilevamento si fa validando un modulo di prova che usa istruzioni `v128`, senza aggiungere una dipendenza per una riga.

## Il formato delle miniature: WebP, e la misura che lo dice

Questo ADR lasciava la scelta aperta, da decidere «misurando su un'immagine reale invece che per principio». Misura del 2026-08-14, macOS ARM, su una fotografia vera già ridotta a 1600×1600 e 298 KB — cioè esattamente ciò che il client carica:

```
decodifica                       15 ms
ridimensionamento a 640 px       32 ms
miniatura WebP  q75              33 ms      15 112 byte
miniatura JPEG  q78              33 ms      30 094 byte
                                 pipeline intera: 82 ms
```

**WebP a parità di tempo e di resa pesa la metà.** La compatibilità che avrebbe giustificato JPEG non è più un argomento: il consumatore delle miniature è il client web di ADR 0010, servito dall'istanza stessa, e WebP è supportato da ogni browser che possa eseguirlo. Le miniature sono quindi **WebP**, lato lungo 640 px.

Una nota sul ridimensionamento, perché il risultato è controintuitivo: le opzioni `premultiply` e `linearRGB` di `@jsquash/resize` sono passate per pixel in JavaScript, non in Wasm, e da sole costavano **tre quarti** del tempo di elaborazione (93 ms contro 26 ms con lo stesso filtro `lanczos3`). Restano attive solo dove servono davvero, cioè per i formati che possono portare trasparenza; per un JPEG, che è sempre opaco, la premoltiplicazione non ha nulla da fare.

Gli 82 ms sono su un portatile. La riesamina resta quella già scritta in fondo: la misura che conta si fa su hardware NAS reale.

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

**Chiuse in implementazione.** Il formato delle miniature: **WebP**, sulla misura riportata sopra e non per principio.

## Quando riesaminare

- Se M2.3 misura tempi di elaborazione percepibili su hardware NAS reale con immagini già compresse dal client. La misura va fatta lì, non su un portatile.
- Se una milestone futura richiedesse trasformazioni che le librerie Wasm non coprono — il video, per esempio, che è comunque fuori dal primo percorso.
