# ADR 0007 — Cifratura a riposo e furto fisico del NAS

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA

## Contesto

Un'istanza ESTIA vive su un NAS in casa di qualcuno. Il furto fisico non è uno scenario esotico: è il modo più probabile in cui i contenuti di una comunità finiscono in mani estranee, insieme allo smaltimento sbagliato di un disco.

[`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) aveva classificato questo scenario come **scoperto**, con la copertura rinviata a M3. Questa decisione lo chiude.

## Il punto duro: dove sta la chiave

La cifratura di per sé è un problema risolto. Quello che decide l'esito è **dove risiede la chiave quando la macchina si accende**.

Se il NAS deve tornare da solo dopo un blackout, la chiave deve essere sulla macchina — in un keystore, in un file, in un chip. Chi porta via il NAS intero porta via anche quella. La cifratura protegge allora dal disco estratto o dismesso, non dal furto dell'apparecchio.

L'unica protezione che regge contro il furto dell'apparecchio è una **passphrase digitata da una persona a ogni avvio**, che quindi non risiede da nessuna parte. Il prezzo è che nessuna installazione è davvero non presidiata: dopo un'interruzione di corrente l'istanza resta ferma finché qualcuno non la sblocca.

I tre livelli, con etichette oneste:

| Livello                  | Protegge da                                    | Non protegge da                               | Costo                         |
| ------------------------ | ---------------------------------------------- | --------------------------------------------- | ----------------------------- |
| **Passphrase all'avvio** | Furto del NAS, dischi rimossi, dischi dismessi | Chi accede al NAS mentre è acceso e sbloccato | L'istanza non riparte da sola |
| **Sblocco automatico**   | Dischi rimossi, dischi dismessi                | Furto del NAS                                 | Nessuno                       |
| **Nessuna cifratura**    | Nulla                                          | Tutto                                         | Nessuno                       |

## Decisione

**L'installazione presenta la scelta, spiega il compromesso in parole comprensibili, e propone la passphrase all'avvio come impostazione predefinita.**

Chi preferisce che l'istanza riparta da sola disattiva la passphrase con un atto esplicito, e da quel momento l'interfaccia dichiara che i dati sono leggibili se il NAS viene sottratto. Nessuno si ritrova protetto meno di quanto crede.

Ne discendono tre requisiti vincolanti:

1. **Il default è la protezione massima.** Chi installa senza leggere ottiene la configurazione più sicura, non la più comoda.
2. **L'istanza conosce e dichiara il proprio stato reale.** Un endpoint diagnostico riporta se la cifratura a riposo è attiva e di che livello, e l'interfaccia non mostra mai un'indicazione di protezione che non corrisponde. Dove la verifica automatica non è possibile, lo stato è «non verificabile», mai «attiva» per ipotesi.
3. **Il livello scelto compare nella diagnostica dell'amministratore**, così che una modifica successiva alla configurazione del NAS non lasci il prodotto a raccontare qualcosa di vecchio.

## Chi esegue la cifratura

**Il sistema ospite, non ESTIA.** LUKS su Linux e mini-PC, cifratura nativa dei volumi su Synology, QNAP e UGREEN, dataset cifrati su TrueNAS e ZFS.

Non è pigrizia: è la scelta con la copertura più ampia, perché protegge in un colpo solo database, media, identità dell'istanza, file temporanei e file di journal, che un meccanismo applicativo lascerebbe in parte scoperti. Ed evita di scrivere crittografia in casa, che `AGENTS.md` vieta.

### Conseguenza di ADR 0005, da non perdere di vista

[ADR 0005](0005-persistenza-node-sqlite.md) ha scelto `node:sqlite`, che è SQLite semplice: **non supporta la cifratura del database**. SQLCipher è una variante distinta e non è utilizzabile dal modulo integrato nel runtime.

Significa che il livello 2 della strategia — cifrare il database dove il volume non è cifrabile — **non è disponibile con la persistenza attuale**. Se un giorno risultasse necessario, va riaperto ADR 0005, non aggirato con cifratura applicativa improvvisata sui singoli campi.

Nella pratica il vincolo pesa poco: tutti i NAS di destinazione offrono cifratura del volume, e le installazioni su mini-PC Linux hanno LUKS.

## Che cosa ESTIA protegge comunque da sé

Indipendentemente dalla scelta dell'amministratore:

- **I backup sono cifrati prima di lasciare il NAS**, con una chiave distinta conservata altrove (`SECURITY_BASELINE.md` §6). Un backup sottratto resta illeggibile anche su un'istanza senza cifratura a riposo.
- **La chiave privata dell'istanza ha permessi `0600` in un file separato dal database**, quindi non viaggia dentro un dump.
- **Le credenziali non sono recuperabili dal database**: password con Argon2id, token di sessione e inviti conservati solo come hash.

## Conseguenze

**Positive.** Lo scenario del furto fisico smette di essere scoperto. Chi non decide ottiene la protezione migliore. E il prodotto non può più raccontare una sicurezza che non ha, perché lo stato è verificato e mostrato.

**Negative.** Con il default attivo, un blackout tiene l'istanza ferma finché qualcuno non digita la passphrase — su un servizio che è la bacheca di un quartiere, è un disservizio reale e va spiegato bene in fase di installazione. Inoltre ESTIA dipende dal meccanismo di cifratura del sistema ospite, quindi la qualità della protezione varia col NAS.

**Aperte.** La verifica automatica dello stato di cifratura è specifica per piattaforma e non sarà completa su tutti i sistemi al primo rilascio: dove manca, si dichiara «non verificabile».

## Quando riesaminare

- Se emerge un requisito di cifratura a livello di database, si riapre ADR 0005 prima di scrivere qualunque cifratura applicativa.
- Se il pilot mostra che la passphrase all'avvio viene disattivata da tutti, il default è sbagliato in pratica e va ripensata la modalità di sblocco, non abbassata la protezione in silenzio.
