# S2 — La chiave d'archivio, e come viaggia dentro il gruppo

- Data: 2026-08-26
- Eseguito da: sessione di lavoro assistita, in laboratorio locale
- Domanda di [ADR 0037](../adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) in prova: punto 1 di §«Che cosa resta da verificare» — _«va verificato che [la chiave d'archivio] sopravviva ai cambi di epoch senza rendere illeggibile l'archivio scritto sotto le epoch precedenti»_
- Esito: **riuscito, con una correzione all'ADR**

## La risposta in una riga

`mlsExporter` **non può essere** la chiave d'archivio — ma è esattamente ciò che serve per **avvolgerla**. E la chiave non può essere una sola: dev'essere una **catena**.

## Ambiente

| Voce                    | Valore                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| Libreria                | `ts-mls` 1.6.2, ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`   |
| Cifratura dell'archivio | AES-GCM-256 via `@noble/ciphers` 2.1.1 — le primitive che ESTIA già usa |
| Node                    | 22.22.2                                                                 |
| Componenti ESTIA        | **nessuno avviato**: lo spike è isolato, fuori dal repository           |
| Modifiche al repository | nessuna                                                                 |

## Parte 1 — I due fatti su cui poggia tutto

Prima di disegnare qualsiasi cosa, due misure. Se la prima fosse falsa la chiave non si potrebbe distribuire; se la seconda fosse falsa non ci sarebbe forward secrecy.

```
── A. Stessa epoch → stessa chiave d'avvolgimento? ──
     Anna : e0278bd97831da23664ecfe29d9778121857aba9…
     Bruno: e0278bd97831da23664ecfe29d9778121857aba9…
  ✓  Anna e Bruno derivano la stessa chiave (epoch 1)

── B. Epoch nuova → chiave diversa? ──
     epoch 2: 35b5f2b1d14ec3bbf90bee78d8455f6d0e97b402…
  ✓  la chiave cambia col cambio di epoch (forward secrecy)
  ✓  tutti e tre i membri, inclusa Carla appena entrata, derivano la stessa
```

Entrambe vere. **Ma insieme dicono anche perché la strada diretta è chiusa:**

```
── C. Il punto che decide tutto ──
  ✓  Carla NON può derivare la chiave dell'epoch 1: nella sua storia non c'è mai stata.
       → usare mlsExporter DIRETTAMENTE come chiave d'archivio NON funziona:
         l'archivio scritto prima del suo ingresso resterebbe illeggibile.
```

Questo è il risultato più importante dello spike, ed è negativo. Il candidato che [ADR 0037](../adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) indicava non regge **se usato come la lettera suggeriva**: `mlsExporter` produce un segreto legato all'epoch, quindi un archivio cifrato con quel segreto muore con l'epoch — che è ottimo per il trasporto ed è la rovina di una cronologia.

## Parte 2 — Lo schema che funziona

La correzione è piccola e cambia tutto: `mlsExporter` non cifra l'archivio, **cifra il mazzo delle chiavi d'archivio**.

1. **`A₁` nasce casuale** con la conversazione. **Non deriva da MLS**, quindi nessun cambio di epoch la tocca.
2. Il mazzo `{A₁…Aₙ}` sta sull'istanza **avvolto** sotto la chiave d'epoch corrente. Tutti i membri la derivano identica (parte 1A), quindi tutti aprono il mazzo; chi è fuori dal gruppo no.
3. **A ogni cambio di epoch il mazzo si riavvolge** sotto la chiave nuova. Il contenuto non cambia: cambia solo la serratura.
4. **Chi entra riceve il mazzo intero** → legge il pregresso.
5. **Su una rimozione nasce `Aₙ₊₁`** e si riavvolge. Chi è uscito ha le vecchie e non la nuova.

### Che cosa è stato verificato

```
  ✓  Bruno apre il mazzo con la sua chiave d'epoch

── Carla entra dopo: deve leggere il pregresso ──
     Carla legge: ["1. ciao Bruno","2. come stai","3. benvenuta Carla"]
  ✓  Carla legge anche 1 e 2, scritti prima che entrasse

── Carla esce: rotazione della chiave ──
     Carla legge: ["1. ciao Bruno","2. come stai","3. benvenuta Carla","🔒"]
  ✓  Carla NON legge la voce 4: non ha A₂
  ✓  ma conserva il pregresso — come ADR 0037 dichiara
  ✓  e non può nemmeno riaprire il mazzo riavvolto: fuori dal gruppo, fuori dall'epoch

── Dario entra dopo la rimozione: deve leggere TUTTO ──
     Dario legge: ["1. ciao Bruno","2. come stai","3. benvenuta Carla","4. detto dopo l'uscita di Carla"]
  ✓  Dario legge tutte e 4 le voci, comprese quelle prima di lui
```

Sono, una per una, le quattro cose che [ADR 0037](../adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) decide. Nessuna è stata assunta: tutte misurate.

## Parte 3 — Quanto pesa

[ADR 0013](../adr/0013-backup-cifrati-in-formato-age.md) §2 registra che un backup chiede **circa sei volte i dati** e che questo è già «un tetto pratico alla dimensione di un'istanza». ADR 0037 conserva due copie di ogni messaggio — la busta di trasporto e la voce d'archivio — quindi la domanda è d'obbligo.

| testo (byte) | trasporto MLS | archivio | totale | rapporto |
| -----------: | ------------: | -------: | -----: | -------: |
|            2 |           318 |       30 |    348 |   174,0× |
|           36 |           318 |       64 |    382 |    10,6× |
|          158 |           318 |      186 |    504 |     3,2× |

**Il trasporto MLS costa 318 byte qualunque sia la lunghezza del messaggio**: è il riempimento che nasconde la dimensione, cioè una protezione dai metadati, non uno spreco. L'archivio invece segue il testo.

**L'archivio aggiunge il 29% a quello che il trasporto pesa già.** Su 10.000 messaggi lunghi come il terzo: trasporto 3,0 MB + archivio 1,8 MB = **4,8 MB**.

Contro un tetto d'istanza di «qualche centinaio di megabyte», i messaggi non sono il problema: **le fotografie lo sono, e l'archivio non le tocca** — restano nello storage dei media e non si duplicano. La preoccupazione registrata in ADR 0037 §Negative («raddoppiare ciò che si conserva spinge dritto contro quel tetto») **si ridimensiona**: vale per i media, e i media non passano di qui.

Il mazzo avvolto pesa **123 byte con due chiavi**, e cresce di 32 byte per ogni rimozione.

## Osservazioni

**La catena è obbligatoria, non un'ottimizzazione.** Con una chiave sola e immortale, chi viene rimosso continuerebbe a leggere anche il **futuro** dell'archivio, non solo il pregresso — e sarebbe più permissivo di quanto ADR 0037 dichiara. È la ragione per cui la Decisione §3 di quell'ADR va corretta al plurale.

**Il costo della rotazione è nel mazzo, non nell'archivio.** Ruotare non richiede di ricifrare niente di quello che è già scritto: si aggiunge una chiave e si riavvolge un oggetto da poche centinaia di byte. È ciò che rende lo schema praticabile.

**Il numero di riavvolgimenti segue i cambi di epoch, non i messaggi.** In MLS l'epoch cambia sui commit — ingressi, uscite, aggiornamenti — non a ogni messaggio. Su una conversazione normale sono eventi rari.

## Limiti di questa prova

**Non è stato provato il caso «nessun dispositivo nel gruppo».** Se una persona perde tutti i dispositivi, non ha più una chiave d'epoch con cui aprire il mazzo, e il recupero deve passare dal backup con passphrase di [ADR 0028](../adr/0028-il-dispositivo-portatore-di-chiavi.md). **Come si rientra nel gruppo MLS con un dispositivo nuovo è una domanda aperta** e non banale: l'identità del dispositivo è una foglia dell'albero, e ripristinarne la chiave privata non ripristina da solo la posizione nel ratchet. È il punto 3 di ADR 0037 e **resta aperto**: questo spike non lo tocca.

**Non è stata provata la concorrenza.** Due persone che riavvolgono il mazzo nello stesso momento, o un commit che arriva mentre si sta scrivendo l'archivio, non sono stati simulati.

**Non è stato provato niente sulla consegna fra istanze.** Qui il gruppo vive in un processo solo. Come il mazzo attraversa le case, sotto [ADR 0029](../adr/0029-un-messaggio-si-consegna.md), è da verificare a parte.

**Le misure di peso sono su tre messaggi**, estrapolate linearmente. Il trasporto è costante per costruzione, quindi l'estrapolazione regge; l'archivio segue il testo, quindi dipende da come si scrive davvero nel pilot.

## Conseguenze per ADR 0037

1. **Il punto 1 di §«Che cosa resta da verificare» è chiuso**, con una correzione: `mlsExporter` non è la chiave d'archivio, è la serratura del mazzo.
2. **La Decisione §3 va corretta al plurale** — «la chiave d'archivio» diventa «la catena delle chiavi d'archivio» — perché con una chiave sola la §«Che cosa non copre» punto 2 sarebbe più permissiva di come è scritta.
3. **Il punto 2 è chiuso**: l'archivio aggiunge il 29% al trasporto, e i messaggi non sono ciò che riempie un'istanza.
4. **Il punto 4 è chiuso**: «per conversazione» funziona, ed è misurato.
5. **Il punto 3 resta aperto**, e questo spike lo rende più preciso: non è solo «chi non ha impostato la passphrase», è **come un dispositivo nuovo rientra in un gruppo MLS**. Va sciolto prima di implementare.
