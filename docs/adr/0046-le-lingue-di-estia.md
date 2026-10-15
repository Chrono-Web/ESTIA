# ADR 0046 — Le lingue di ESTIA: una tabella scritta a mano, aperta a chi traduce

- Stato: **Accepted**. Il proprietario ha deciso i punti 1, 3, 4 e 5 il 2026-10-14 («ESTIA voglio sia almeno in inglese e abbia la possibilità di avere una traduzione»; «B, sì»), e ha confermato i punti 2 e 6 il 2026-10-15 («i due punti ci stanno bene»).
- Data: 2026-10-14
- Proprietario: progetto ESTIA
- Estende: [ADR 0024](0024-preferenze-ui-personali.md), con un quarto asse fra le preferenze personali
- Va letta con: [ADR 0044](0044-il-dispositivo-e-l-app.md), perché la stessa tabella deve servire il web e l'app

## Contesto

### Che cosa c'è oggi

ESTIA parla una lingua sola, e non lo dichiara da nessuna parte. Nessun documento, nessuna voce del piano e nessun budget di esperienza parla della lingua dell'interfaccia. L'unica regola sulle lingue è in [`CONTRIBUTING.md`](../../CONTRIBUTING.md): riguarda chi scrive il codice, non chi usa il prodotto.

- **Il client web** ha l'italiano scritto direttamente nei 61 file `.tsx`. Non ha una libreria di traduzione né un catalogo, e `index.html` dichiara `lang="it"`.
- **Le date** sono formattate con `"it-IT"` scritto a mano in almeno cinque punti (`tempo.ts`, `Profilo.tsx`, `Dispositivi.tsx`, `useChiavi.ts`).
- **I messaggi d'errore li scrive l'istanza.** `DomainError` porta un `code` stabile e un `message`, e il client mostra il `message` così com'è ([`errori.ts`](../../apps/web/src/errori.ts)). Le chiamate sono 142, e **le lingue sono già due**: circa un terzo dei messaggi è in italiano («Il nome da mostrare non può essere vuoto.»), il resto in inglese («This username is already in use.»). Lo stesso membro, nella stessa schermata, può leggerli tutti e due.

### Perché adesso

[ADR 0044](0044-il-dispositivo-e-l-app.md) porta un secondo client: l'app, su telefono e PC. Se le frasi restano scritte nel codice, tradurre ESTIA più avanti vorrebbe dire estrarle da due client invece che da uno. In più, con l'app una persona parla con Case che non sono la sua, e ognuna può essere installata in una lingua diversa.

### Le due strade per gli errori

Le frasi le scrive sempre una persona, in tutte e due le strade: nessuna macchina traduce niente. Cambia **chi apre la tabella**.

- **A. La apre l'istanza.** L'istanza manda la frase già pronta, nella lingua scelta all'installazione.
- **B. La apre il client.** L'istanza manda il codice dell'errore e il client mostra la frase nella lingua di chi guarda.

Esempio: Marco installa la Casa in italiano e Sara, che ci vive, preferisce l'inglese. Con A, Sara legge i pulsanti in inglese e gli errori in italiano. Con B, legge tutto in inglese. Il proprietario ha scelto **B**.

## Decisione

1. **ESTIA esce almeno in inglese e in italiano, e chiunque può aggiungere una lingua.** Aggiungere una lingua vuol dire riempire una tabella di frasi, senza toccare il codice. L'**inglese è la lingua di riferimento**: è sempre completo, ed è quello che chi traduce copia. L'italiano è l'altra lingua completa che una versione deve avere per uscire.

2. **Una sola tabella per tutti i client**, in un pacchetto del workspace (`packages/lingue`) che il web e l'app importano tutti e due.
   - **Un file per lingua** (`en.json`, `it.json`, …), con chiavi piatte e stabili: `accesso.password_errata`, `errori.username_taken`. Un file per lingua, e non un foglio unico con una colonna per lingua, perché due persone che traducono due lingue diverse non devono toccare lo stesso file.
   - **Le chiavi descrivono il posto, non la frase.** Usare la frase inglese come chiave costringerebbe a cambiare tutte le traduzioni ogni volta che si corregge una virgola dell'inglese.
   - **I valori variabili si scrivono fra graffe** (`{nome}`, `{quanti}`). I plurali passano da `Intl.PluralRules`, e date e numeri da `Intl.DateTimeFormat` e `Intl.NumberFormat`, che il browser e Node hanno già. **Nessuna dipendenza nuova**: la ricerca di una chiave in un oggetto non giustifica una libreria, e così il punto di AGENTS.md sulle licenze non ha niente da verificare.

3. **L'istanza manda il codice, il client sceglie la frase.** La risposta d'errore resta `{ code, message }` e acquista un campo facoltativo `params`, per i valori che la frase contiene (un limite, un nome). Il `message` resta come **frase di riserva in inglese**, e smette di essere la frase mostrata. Il client mostra la frase di `errori.<code>` nella lingua di chi guarda. Se manca nella sua lingua mostra quella inglese, e se manca anche quella mostra il `message`. **Mai un codice grezzo**, per l'euristica 9 di [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Lo stesso vale per un errore che arriva da un'altra Casa: viaggia come codice.

4. **Ogni membro sceglie la propria lingua.** È un quarto asse delle preferenze personali di [ADR 0024](0024-preferenze-ui-personali.md), accanto ad aspetto, contrasto e palette, con le stesse regole. È della persona e non dell'istanza. Non compare sul profilo e **non attraversa la federazione**. Il catalogo è chiuso: i valori possibili sono le lingue che la tabella contiene. Un valore vuoto vuol dire «quella della Casa».

5. **La Casa ha una lingua predefinita, scelta all'installazione.** È la lingua delle pagine prima del login, quella di chi installa e quella con cui entra un membro nuovo. Non è una lingua imposta: ognuno la cambia per sé con il punto 4.

6. **Come si sceglie la lingua della Casa.**
   - **`install.sh` la chiede.** È la prima domanda, scritta in inglese e in italiano insieme, e si legge da `/dev/tty` come già si fa per `sudo`, perché `curl | sh` occupa l'ingresso standard. Elenca le lingue che la tabella contiene. Dopo la risposta, l'installatore parla nella lingua scelta.
   - **La risposta diventa `ESTIA_LINGUA`** sul container, validata all'avvio come ogni altra configurazione: un codice di lingua che non esiste nella tabella ferma l'avvio con un errore chiaro.
   - **Rilanciare `install.sh` per aggiornare non la richiede.** La legge dal container che esiste già, perché un aggiornamento non è il momento di rifare le scelte.
   - **Senza terminale la domanda non c'è.** Senza `/dev/tty`, con Docker Compose o con il modulo di un pannello NAS, `ESTIA_LINGUA` vale `en` se nessuno la imposta. Il file Compose d'esempio la mostra commentata, con l'elenco delle lingue.
   - **Cambiarla dopo** vuol dire cambiare la variabile e riavviare, come ogni altra configurazione. Un selettore nel pannello d'amministrazione è fuori da questa decisione: si aggiunge quando qualcuno lo chiede.

7. **Una traduzione incompleta si usa lo stesso.** Le frasi che mancano si mostrano in inglese. Una frase sbagliata non ferma niente, ma un file di lingua con una chiave che l'inglese non ha è un errore di build: vuol dire che la chiave è stata rinominata e la traduzione è rimasta indietro.

## Che cosa resta fuori

- **La documentazione resta in italiano**, come dice [`CONTRIBUTING.md`](../../CONTRIBUTING.md). Questa decisione riguarda l'interfaccia, non i documenti.
- **I contenuti dei membri non si traducono.** Post, commenti e messaggi sono di chi li scrive.
- **La CLI `estia`** parla ancora la lingua in cui è scritta oggi. Passarla alla tabella è un incremento successivo, non una condizione di questo ADR.
- **Nessun servizio di traduzione ospitato.** Chi traduce propone il file della propria lingua con una pull request. Una piattaforma come Weblate si può aggiungere dopo, se le traduzioni diventano tante, e non sarebbe obbligatoria per nessuno.

## Conseguenze

**Positive.**

- Chi vuole ESTIA nella propria lingua apre un file, lo copia e lo riempie, senza scrivere codice.
- Sara legge tutto nella propria lingua, compresi gli errori, anche quando arrivano da un'altra Casa.
- I messaggi del server smettono di essere metà in inglese e metà in italiano.
- L'app nasce leggendo la tabella, invece di doverla adottare dopo.

**Negative.**

- **È un lavoro lungo e meccanico.** Vanno estratte tutte le frasi dei 61 file `.tsx` e date chiavi e frasi alle 142 chiamate a `DomainError`, controllando che ogni codice esista. Finché l'estrazione non è finita, il web ha frasi in due posti.
- **Il contratto API cambia** con il campo `params`, e il `message` cambia significato: non è più la frase mostrata.
- **Ogni frase nuova costa due righe**, una in inglese e una in italiano, invece di una sola nel componente.
- **Le parole dell'interfaccia cambiano lunghezza da una lingua all'altra.** Le schermate vanno provate anche con la lingua dalle frasi più lunghe, non solo in italiano.

## Come si verifica

1. **Ogni codice d'errore ha una frase.** Un test raccoglie i `code` di tutte le chiamate a `DomainError` e fallisce se uno manca in `en.json` o in `it.json`.
2. **Nessuna chiave orfana.** Un test fallisce se un file di lingua contiene una chiave che `en.json` non ha.
3. **Nessuna frase scritta nel codice.** Un controllo di lint sui `.tsx` segnala il testo visibile scritto nel componente invece che preso dalla tabella.
4. **Il caso di Sara.** Con la Casa in italiano e il membro in inglese, un errore provocato dal server si legge in inglese, e così una data.
5. **Una lingua parziale.** Con un file di prova che traduce una frase sola, le altre si leggono in inglese e nessuna schermata mostra una chiave.
6. **L'installatore.** Con `/dev/tty` chiede la lingua e la scrive nel container. Senza `/dev/tty` non si blocca e usa `en`. Rilanciato su un container esistente, non la richiede e la conserva.

## Quando riesaminare

- Se lo stack scelto per l'app con lo spike di ADR 0044 non può leggere un pacchetto del workspace così com'è.
- Se arriva una lingua scritta da destra a sinistra: il layout va rivisto, non solo le frasi.
- Se le traduzioni proposte diventano abbastanza da rendere le pull request un ostacolo per chi traduce.
