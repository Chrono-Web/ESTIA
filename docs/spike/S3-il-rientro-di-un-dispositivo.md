# S3 — Il rientro di un dispositivo in un gruppo MLS

- Data: 2026-08-26
- Eseguito da: sessione di lavoro assistita, in laboratorio locale
- Domanda di [ADR 0037](../adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) in prova: punto 3 di §«Che cosa resta da verificare» — _«come un dispositivo nuovo rientra in un gruppo MLS. L'identità del dispositivo è una foglia dell'albero, e ripristinarne la chiave privata non ripristina da solo la posizione nel ratchet»_
- Esito: **riuscito** — e ha trovato una differenza fra le due vie che non era prevista

## La risposta in tre righe

Con la passphrase si rientra **da soli**, senza che nessun altro sia online, e la cronologia torna intera.
Senza passphrase si rientra lo stesso — ma serve che un altro membro sia presente e agisca.
**E c'è una differenza che pesa: la seconda via lascia il telefono smarrito dentro il gruppo.**

## Ambiente

| Voce                    | Valore                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Libreria                | `ts-mls` 1.6.2, ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` |
| Archivio                | lo schema a catena di [S2](S2-la-chiave-d-archivio.md), invariato     |
| Node                    | 22.22.2                                                               |
| Componenti ESTIA        | **nessuno avviato**: lo spike è isolato, fuori dal repository         |
| Modifiche al repository | nessuna                                                               |

## La scena

Anna e Bruno hanno un gruppo, due voci in archivio, epoch 1. **Il telefono di Anna cade in mare.** Restano soltanto le cose che vivono altrove: quello che sta sul server, e il backup con passphrase di [ADR 0028](../adr/0028-il-dispositivo-portatore-di-chiavi.md).

## Parte 1 — Perché la sola identità non basta

```
── A1. La sola identità basta a leggere? ──
     il backup contiene: initPrivateKey, hpkePrivateKey, signaturePrivateKey
  ✓  il backup con passphrase NON contiene nessun segreto d'epoch: solo chiavi d'identità
  ✓  e il ClientState, che è dove vive il ratchet, è perso con il telefono
  ✓  quindi la chiave d'identità c'è e il mazzo resta chiuso
```

Il sospetto registrato in ADR 0037 era fondato, e adesso è un fatto guardando i campi: il materiale che si salva sotto passphrase sono **tre chiavi d'identità** e nient'altro. Il segreto d'epoch — quello da cui [S2](S2-la-chiave-d-archivio.md) deriva la chiave che apre il mazzo — vive nel `ClientState`, cioè esattamente nella cosa che è annegata.

Ripristinare l'identità non è inutile: è la condizione per la via A. Ma da sola non apre niente.

## Parte 2 — Via A: con la passphrase, si rientra da soli

MLS ha un meccanismo apposta, l'**ingresso esterno con risincronizzazione**: un client rientra usando un `GroupInfo` pubblicato, senza bisogno che qualcuno gli mandi un Welcome.

```
── A2. Rientro con ingresso esterno (resync) ──
  ✓  Anna rientra da sola, senza che nessuno sia online. Epoch 2
  ✓  dopo il resync il gruppo è ancora a 2: la foglia vecchia è stata sostituita, non aggiunta

── A3. E l'archivio? ──
     Anna rilegge: ["1. i preventivi del tetto","2. quello di giovedì costa meno"]
  ✓  Anna rilegge tutta la cronologia, compresa quella di prima dello smarrimento

── A4. E il traffico vecchio? ──
  ✓  NON rilegge il trasporto delle epoch precedenti: la forward secrecy regge
```

Quattro cose, e tutte quelle che servono. Anna rientra **senza dipendere da nessuno** — è la proprietà che rende questo disegno praticabile in una comunità dove non c'è un amministratore sempre sveglio. La foglia vecchia viene **sostituita**, quindi il telefono in fondo al mare smette di essere un membro. La cronologia torna intera, perché l'archivio è della conversazione. E il traffico delle epoch precedenti resta chiuso: la forward secrecy non viene barattata per il recupero.

## Parte 3 — Via B: senza passphrase si rientra, ma non da soli

Anna non aveva mai impostato la passphrase. Genera un'identità nuova di zecca, e **nessuno può riconoscerla come «la stessa Anna»**: dev'essere riammessa a mano.

```
════ VIA B — Anna non ha mai impostato la passphrase ════
  ✓  Bruno la riammette a mano; gruppo a 3, epoch 3
     Anna rilegge: ["1. i preventivi del tetto","2. quello di giovedì costa meno"]
  ✓  rilegge comunque tutta la cronologia: l'archivio è della conversazione, non del suo dispositivo
  ✓  ma serve che un altro membro sia presente e agisca
```

La buona notizia è nel mezzo: **la cronologia torna comunque.** È la conferma pratica della scelta di ADR 0037 §3 — l'archivio appartiene alla conversazione, non al dispositivo, quindi chi rientra lo riceve come lo riceve chiunque entri.

## Parte 4 — La differenza che non era prevista

Il «gruppo a 3» della via B non è un dettaglio contabile.

```
════ La differenza che conta fra le due vie ════
     foglie nel gruppo: ["anna","bruno","anna"]
  ✓  dopo la via B ci sono 2 foglie «anna»: riammettere NON rimuove il dispositivo perduto.
       Con il resync della via A la foglia vecchia era stata sostituita (gruppo rimasto a 2).
       Senza passphrase, il telefono smarrito resta membro finché qualcuno non lo toglie a mano —
       e un telefono smarrito che è ancora membro continua a poter ricevere.
```

**Il resync della via A sostituisce la foglia; l'aggiunta della via B ne affianca una seconda.** Quindi, senza passphrase, il telefono perduto **resta membro del gruppo** e continua a poter ricevere i messaggi nuovi, finché una persona non lo rimuove esplicitamente.

Non è un difetto di MLS: aggiungere un membro è un'operazione diversa dal sostituire sé stessi, e MLS non ha modo di sapere che quelle due foglie sono la stessa persona — è proprio ciò che la passphrase dimostra e che senza passphrase non si può dimostrare. Ma per ESTIA è una **conseguenza di prodotto**, e va gestita: chi riammette qualcuno deve poter rimuovere il dispositivo vecchio nello stesso gesto, e l'interfaccia deve chiederlo invece di lasciarlo al caso.

## Che cosa deve conservare l'istanza

```
GroupInfo con chiave esterna e albero: 1143 byte (gruppo da 2)
mazzo avvolto: 76 byte
```

Sono **due oggetti nuovi lato server**, che oggi l'istanza non conserva. Il `GroupInfo` è la condizione della via A: senza, l'ingresso esterno non ha da dove partire. Va tenuto aggiornato a ogni epoch, e cresce con l'albero — 1143 byte per due membri non dice quanto pesi per venti, e non è stato misurato.

## Limiti di questa prova

**Non è stata provata l'autenticazione dell'ingresso esterno.** L'ingresso esterno verifica che la credenziale sia ben formata, non che sia _tua_: chiunque ottenga un `GroupInfo` valido e sappia produrre una credenziale con quel nome può tentare di entrare. In MLS la difesa è l'`AuthenticationService` — lo stesso aggancio che [ADR 0036](../adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md) indica per il limite 4, la verifica delle chiavi. **Chi implementa deve chiudere quel punto insieme a questo**, o la via A diventa una porta.

**Non è stato provato che cosa vede il gruppo.** Un rientro produce un commit che gli altri applicano; se e come venga mostrato — «Anna è rientrata da un dispositivo nuovo» — è disegno d'interfaccia, e ADR 0037 §«Conseguenze sull'interfaccia» lo chiede già.

**Non è stata provata la concorrenza**, né il rientro quando il `GroupInfo` conservato dall'istanza è di un'epoch superata. Nel laboratorio il `GroupInfo` era sempre fresco.

**Non è stato misurato niente su gruppi grandi.** Due membri, tre foglie.

**Aggiunto il 2026-08-26, implementando: non era stato provato il mazzo d'archivio al momento del rientro.** La parte A3 legge la cronologia e la trova intera, ma non guarda sotto quale epoch fosse avvolto il mazzo. Misurato dopo, con la stessa libreria: il rientro porta all'epoch **successiva**, il mazzo depositato è avvolto sotto la **precedente**, e chi rientra non può derivarne la serratura — quell'epoch non è mai stata nella sua storia. La cronologia riappare quando un altro membro applica il commit di rientro e riavvolge. Quindi la frase «in entrambi i casi la cronologia torna intera» resta vera, e **per la via A non è immediata**: il rientro nel gruppo è autonomo, il ritorno della cronologia dipende da qualcun altro. La conseguenza è il punto 8 di [ADR 0037](../adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) §«Che cosa resta da verificare».

**Le due vie sono state provate in fila sullo stesso gruppo.** Per questo la via B parte da un gruppo che aveva già la foglia risincronizzata della via A: è ciò che rende visibili le due foglie «anna», ed è voluto.

## Conseguenze per ADR 0037

1. **Il punto 3 di §«Che cosa resta da verificare» è chiuso.** Un dispositivo nuovo rientra: con la passphrase da solo, senza passphrase con l'aiuto di un membro. In entrambi i casi **la cronologia torna intera**, il che conferma la Decisione §3 (l'archivio è della conversazione).
2. **La passphrase cambia di natura.** Non è più «come recuperare la cronologia» — la cronologia torna comunque. È **come rientrare senza dipendere da nessuno, e come far sparire il telefono perduto dal gruppo**. È una cosa diversa da quella che l'interfaccia racconta oggi, e §«Conseguenze sull'interfaccia» va aggiornata di conseguenza.
3. **Nuovo punto aperto, trovato qui**: senza passphrase, riammettere qualcuno **lascia il dispositivo perduto dentro il gruppo**. Serve che la rimozione del vecchio faccia parte del gesto di riammissione.
4. **Nuovo punto aperto, trovato qui**: l'ingresso esterno va autenticato, altrimenti è una porta. Si chiude insieme al limite 4 di ADR 0036, non separatamente.
5. **L'istanza deve conservare un `GroupInfo` per gruppo**, aggiornato a ogni epoch. È un oggetto nuovo, e il suo peso su gruppi veri non è misurato.
