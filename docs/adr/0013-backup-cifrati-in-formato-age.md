# ADR 0013 — I backup sono archivi `tar` cifrati in formato age

- Stato: **Accepted**
- Data: 2026-08-15
- Proprietario: progetto ESTIA
- Vincolante per: M3
- Attua: [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §6 e §8

## Contesto

`SECURITY_BASELINE.md` §6 fissa quattro requisiti per i backup, e non sono negoziabili:

1. il backup è cifrato **prima** di lasciare il NAS;
2. la chiave è **distinta** da ogni segreto dell'istanza e vive **fuori** dall'istanza;
3. il backup **include la chiave privata dell'istanza**, senza la quale il ripristino produce un'istanza che i membri non riconoscono più ([ADR 0003](0003-primo-contatto-in-rete-locale.md));
4. il ripristino va provato prima di servire dati reali.

Il punto 3 e il punto 1 sono in tensione dichiarata: il backup contiene il segreto più critico del sistema, quindi la sua cifratura non è un accessorio. E §8 aggiunge la conseguenza che rende tutto questo urgente: **il rollback di un aggiornamento è il ripristino da backup.** Senza backup non esiste un aggiornamento sicuro.

C'è poi un requisito che non viene dalla sicurezza ma dalla portabilità, ed è quello che ha deciso la scelta.

## Il requisito che ha deciso: un backup si deve poter aprire senza ESTIA

[`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §8 tratta la portabilità come un diritto, e [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §14 chiede che ogni entità persistente sia esportabile «senza dipendere da dettagli interni non documentati».

Un backup leggibile solo dal software che l'ha scritto viola quel principio nel modo peggiore, perché lo fa nel momento peggiore: quando l'istanza non c'è più. Se fra cinque anni ESTIA fosse abbandonata, il NAS morto e restasse solo un disco esterno con dentro gli archivi, l'amministratore deve poter recuperare le fotografie del quartiere **con strumenti che esistono indipendentemente da noi**.

Questo esclude qualunque formato inventato qui.

## Opzioni

| Opzione                                        | Che cosa è                                        | Il problema                                                                                        |
| ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `node:crypto`, AES-256-GCM                     | Primitiva, già nel runtime                        | AEAD in un colpo solo: per archivi da gigabyte servirebbe **inventare la suddivisione in blocchi** |
| `libsodium-wrappers` (`secretstream`)          | Primitiva progettata per flussi, in Wasm          | Risolve i blocchi, ma il **formato del file resta nostro**: si riapre solo con codice nostro       |
| **`age`**, tramite `age-encryption` (_typage_) | Un **formato specificato**, non solo una libreria | Nessuno: è l'unica opzione che un altro programma sa già leggere                                   |

`age` non è una libreria che fa cifratura: è un formato con una specifica pubblica e implementazioni indipendenti — quella di riferimento in Go, `rage` in Rust — e gestisce internamente la suddivisione in blocchi di un flusso lungo, che è esattamente la parte che non vogliamo scrivere noi.

## Decisione

**Un backup ESTIA è un archivio `tar` cifrato in formato age.**

La catena è `tar` → `age`, e la sua proprietà migliore è che si legge al contrario con strumenti standard:

```sh
age -d -i chiave-di-backup.txt estia-2026-08-15.tar.age | tar -xv
```

Nessun comando ESTIA nella riga sopra. È il punto.

**Libreria**: `age-encryption` (typage) **0.3.0**, ISC, di **Filippo Valsorda**, che è l'autore di `age` stesso — non un'implementazione di terzi di un formato altrui. **Archivio**: `tar-stream` **3.2.0**, MIT, 32 KB. Nessuna delle due porta moduli nativi, coerentemente con [ADR 0005](0005-persistenza-node-sqlite.md), [ADR 0008](0008-hashing-password-argon2id.md) e [ADR 0011](0011-immagini-in-webassembly.md).

### La chiave sta fuori, e per i backup automatici non entra mai

`age` cifra in due modi, e la differenza qui è sostanziale.

**Verso un destinatario X25519** — il modo predefinito per i backup automatici. Sull'istanza vive **solo la chiave pubblica**. La privata sta sul portatile dell'amministratore, in un gestore di password, su una chiavetta: dove ha deciso lui, purché non sul NAS.

Ne segue una proprietà che vale la pena enunciare per intero: **l'istanza produce backup che non è in grado di rileggere.** Chi si porta via il NAS trova gli archivi e la chiave pubblica, e non può farci nulla. È il requisito 2 di §6 soddisfatto in senso forte, non per convenzione.

**Con una passphrase** — per il backup manuale, una volta, quando l'amministratore preferisce ricordare una frase invece di custodire un file. Più semplice e più debole: la robustezza è quella della passphrase.

### Che cosa protegge, e che cosa no

Detto qui perché §9 vieta di mostrare protezioni che non ci sono.

**Protegge** da un backup sottratto: copiato dal NAS, trovato su un disco esterno, intercettato mentre viene sincronizzato altrove. È un blob illeggibile.

**Non protegge** i dati vivi sull'istanza: quelli sono in chiaro sul disco del NAS finché non arriva la cifratura a riposo di [ADR 0007](0007-cifratura-a-riposo-e-furto-fisico.md), che è una milestone separata. Un backup cifrato non è cifratura a riposo, e non va raccontato come tale.

**Non protegge** da chi perde la chiave privata di backup: senza quella l'archivio è perduto, e nessuno può recuperarlo — noi meno di chiunque altro. È lo stesso costo dichiarato del codice di recupero in [ADR 0009](0009-recupero-accesso-amministratore.md), e l'installazione dovrà dirlo con la stessa chiarezza.

### La coerenza dello snapshot, che è l'altra metà del problema

Un backup incoerente è peggio di nessun backup, perché si scopre al ripristino. Due accorgimenti, e l'ordine fra loro non è casuale:

**Il database si copia con `VACUUM INTO`**, che produce uno snapshot coerente a istanza viva, in un file solo e senza WAL a lato. Verificato con `node:sqlite` il 2026-08-15. Non serve più fermare l'istanza, che era la procedura di §8.

**Prima il database, poi i media.** Nel percorso di M2.3 i file di un'immagine sono scritti **prima** che esista la sua riga nel database. Quindi ogni riga presente nello snapshot ha già i propri file su disco, e la copia dei media che avviene dopo li troverà per forza. Nell'ordine inverso lo snapshot potrebbe citare un'immagine copiata mai. Eventuali file in più, appartenenti a caricamenti successivi allo snapshot, restano orfani e li raccoglie la spazzata di M2.3.

## Evidenze, raccolte il 2026-08-15

Verifiche eseguite su Node 22.22.2, con `age-encryption` 0.3.0:

- l'intestazione prodotta è letteralmente `age-encryption.org/v1`;
- round trip corretto con passphrase e con destinatario X25519;
- passphrase sbagliata: rifiutata;
- **un solo byte alterato nel mezzo del file: rilevato** — l'autenticazione fa il suo lavoro, un archivio corrotto non si ripristina in silenzio.

E la prova che regge davvero, con lo stesso metodo di ADR 0008: **un file cifrato da typage è stato decifrato dall'implementazione Go di riferimento, `age` 1.2.1**, in un container Alpine. Due implementazioni indipendenti concordano, e il formato è quello che dice di essere.

### Quanto costa in memoria, misurato il 2026-08-16

`age-encryption` 0.3.0 cifra un buffer intero, non un flusso — la libreria non espone alcuna API a flusso — quindi l'archivio esiste in memoria più di una volta mentre viene scritto. Quanto, non era noto. Adesso sì, cercando in container il limite più basso a cui tre esecuzioni su tre arrivano in fondo:

| Dati   | Limite affidabile | Rapporto |
| ------ | ----------------- | -------- |
| 200 MB | 1,25 GB           | 6,4×     |
| 400 MB | 2,5 GB            | 6,25×    |

Due cose che quel numero porta con sé, e che valgono più del numero:

1. **Sotto quella soglia il fallimento non è un errore.** C'è una fascia — fra 832 MB e 1 GB per 200 MB di dati — in cui il backup a volte riesce e a volte no, e quando non riesce è il kernel a uccidere il processo: nessun messaggio, nessuna riga nei log. Per il backup automatico, che gira dentro l'istanza, vuol dire che va giù l'istanza intera.
2. **È un tetto pratico alla dimensione di un'istanza.** Con 2 GB di fotografie servirebbero 12 GB di memoria per farsene una copia, che su un NAS non ci sono. Fino a qualche centinaio di megabyte va bene; oltre, i backup smettono di funzionare prima che qualcosa lo dica.

**Un tentativo di ridurre il costo è stato fatto e ha fallito**, e vale la pena scriverlo perché sembra ovvio: scrivere il `tar` su file invece di accumularlo in memoria toglie una copia, ma sotto un limite di cgroup non serve a niente — la page cache di quel file viene conteggiata al container esattamente come la memoria risparmiata. Misurato, non dedotto: la soglia non si è spostata. La riduzione vera passa da una cifratura a flusso, cioè da una libreria diversa o da una versione che ancora non c'è.

## Conseguenze

**Positive.** Un backup si apre con strumenti standard, oggi e fra dieci anni, anche senza ESTIA. I backup automatici non richiedono alcun segreto sull'istanza. Nessun formato inventato qui, e nessuna suddivisione in blocchi scritta da noi.

**Negative.** Due dipendenze in più, entrambe piccole. `age-encryption` è pre-1.0: il **formato** è stabile e specificato, l'API della libreria può cambiare, ed è un costo di manutenzione da mettere in conto, non da nascondere.

**Da tenere presente.** Il ripristino scrive file a partire da un archivio, quindi il percorso di ogni voce va validato in scrittura esattamente come si fa per i media: un `tar` malevolo con percorsi risalenti non deve poter scrivere fuori dalla directory di destinazione.

## Quando riesaminare

- Se `age-encryption` cambiasse API in modo incompatibile: il formato resta, e la sostituzione riguarderebbe un solo modulo.
- **Misurato il 2026-08-16, e la risposta è: prima di quanto si pensasse.** Il rapporto di sei a uno qui sopra dice che un'istanza con qualche gigabyte di fotografie non riesce più a farsi un backup. Quando il pilot ci arriverà, la strada è la cifratura a flusso — non un limite di memoria più alto, che è solo il modo di rimandare.
- Se arrivasse la cifratura a riposo di ADR 0007: cambia ciò che il backup deve proteggere da solo, non il formato.
