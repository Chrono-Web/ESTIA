# S5 — Quanto pesa un albero, e se attraversa

- Data: 2026-08-28
- Eseguito da: sessione di lavoro assistita, in laboratorio locale
- Domanda di [ADR 0039](../adr/0039-mls-attraversa-le-istanze.md) in prova: nodo 5 di §«Perché non è bastano cinque operazioni in più» — _«La federazione accetta buste fino a 64 kB; il canale di handshake locale ne accetta 256 kB. [S3](S3-il-rientro-di-un-dispositivo.md) ha misurato 1143 byte di `GroupInfo` per un gruppo da due e non ha misurato niente su gruppi grandi. Il tetto della federazione va rivisto sapendo quanto pesa davvero un albero, non prima.»_
- Esito: **il tetto non va rivisto.** Tutto passa, con margine, e il disegno non cambia

## La risposta in tre righe

Un Welcome cresce di **262 byte per foglia**, linearmente, e a cinquanta membri sta in **18 kB di Base64** contro un tetto di 64.
Il commit **non cresce affatto**: porta le proposte, non l'albero.
Il primo tetto che si incontrerebbe è **quello della federazione, a circa 187 foglie** — molto oltre qualunque casa.

## Ambiente

| Voce                    | Valore                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Libreria                | `ts-mls` 1.6.2, ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` |
| Costruzione             | i moduli veri del repository (`mls/gruppo.ts`), non un banco a parte  |
| Componenti ESTIA        | **nessuno avviato**: nessuna rete, nessun database                    |
| Modifiche al repository | nessuna (la sonda è stata rimossa dopo la misura)                     |

## Le misure

Un gruppo cresciuto una foglia alla volta, misurando alle tappe. I byte sono quelli **sul filo** di RFC 9420; la colonna `b64` è quello che conta davvero, perché i tetti del protocollo si applicano ai **caratteri** della stringa Base64, non ai byte grezzi.

| foglie | Welcome | Welcome b64 | commit | `GroupInfo` | `GroupInfo` b64 | messaggio |
| -----: | ------: | ----------: | -----: | ----------: | --------------: | --------: |
|      2 |     895 |       1 196 |    573 |         789 |           1 052 |       319 |
|      5 |   1 695 |       2 260 |    586 |       1 591 |           2 124 |       319 |
|     10 |   3 013 |       4 020 |    586 |       2 907 |           3 876 |       319 |
|     20 |   5 635 |       7 516 |    577 |       5 529 |           7 372 |       319 |
|     50 |  13 448 |      17 932 |    573 |      13 342 |          17 792 |       319 |

## Che cosa dicono

**1. La crescita è lineare, e la pendenza è 262 byte per foglia.** Da 2 a 50 foglie: `(13 448 − 895) / 48 = 261,5`. Non c'è nessun ginocchio, quindi l'estrapolazione oltre 50 regge — ed è l'unica estrapolazione che questo spike si permette.

**2. Il tetto della federazione conta caratteri, non byte.** `MAX_BUSTA_BYTES = 65 536` è confrontato con `value.busta.length`, cioè con la **stringa** Base64 ([`protocol.ts`](../../apps/core-api/src/federation/protocol.ts)). Il carico utile vero è quindi `65 536 × ¾ = 49 152 byte`. Il nome della costante dice «BYTES» e misura caratteri: è una svista di nome, non di comportamento, e vale la pena saperlo prima di ragionarci sopra.

**3. A cinquanta membri il margine è 3,7×.** Un Welcome da 17 932 caratteri contro un tetto di 65 536.

**4. Il primo tetto si incontra a ~187 foglie** per la federazione, e a ~750 per il canale di handshake locale. Sono numeri lontani da qualunque cosa ESTIA si proponga: [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) parla di comunità, non di piazze.

**5. Il commit non cresce.** Resta intorno ai 580 byte a qualunque dimensione, perché porta le proposte e non l'albero. È la ragione per cui il traffico ordinario di un gruppo grande non è un problema: cresce solo ciò che si scambia **una volta**, quando qualcuno entra.

**6. Il messaggio applicativo è costante a 319 byte**, come [S2](S2-la-chiave-d-archivio.md) aveva misurato: è il riempimento che nasconde la lunghezza, e non dipende dal gruppo.

## Conseguenze per ADR 0039

1. **Il nodo 5 è chiuso, e la risposta è «non cambia niente».** Il tetto della federazione non va alzato, e soprattutto **il disegno non cambia**: l'albero può viaggiare dentro una busta federata come viaggia dentro una locale. Era la domanda che poteva far ripensare tutto, e non lo fa.
2. **La differenza fra i due tetti — 64 kB e 256 kB — non morde.** ADR 0039 la registrava come sospetta; è reale ma inizia a contare a ~187 foglie, cioè mai.
3. **Vale la pena mettere un test che tenga fermo questo fatto.** Se un aggiornamento della libreria facesse crescere il Welcome di un ordine di grandezza, oggi non se ne accorgerebbe nessuno fino al campo.

## Limiti di questa prova

**È stato aggiunto un membro alla volta.** Un Welcome indirizzato a **più** persone insieme porta un blocco di segreti cifrati per ciascuna, quindi cresce con il numero di chi entra in quel commit. ESTIA aggiunge uno alla volta (`aggiungi` prende un `KeyPackage`), quindi il caso misurato è quello che si userà — ma se un giorno si aggiungessero gruppi interi, questa tabella non risponde.

**Non è stato misurato il giro federato vero.** Qui non c'è rete: si misura la dimensione di ciò che viaggerebbe, non il tempo per farlo viaggiare. Su una linea lenta 18 kB non sono niente, ma il tetto di otto secondi di [ADR 0041](../adr/0041-le-istanze-si-tengono-d-occhio.md) §6 non è stato provato contro un Welcome grande.

**Non sono stati misurati l'archivio e il mazzo che attraversano.** Sono il nodo 4 di ADR 0039 e restano aperti: qui si è misurato solo ciò che il nodo 5 chiedeva.

**Una foglia qui è un dispositivo, non una persona.** Con [ADR 0040](../adr/0040-un-membro-ha-piu-di-un-dispositivo.md) una persona con telefono e computer è **due** foglie: un gruppo da venticinque persone con due dispositivi ciascuna è la riga «50» di questa tabella, non la riga «20». È il modo giusto di leggerla.
