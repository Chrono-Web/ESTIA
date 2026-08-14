# ADR 0006 — I messaggi privati sono end-to-end, o non esistono

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Sostituisce: la sequenza del piano di progetto, che collocava la chat in Fase 2 e la cifratura end-to-end in Fase 4

## Contesto

Il piano di progetto di luglio 2026 prevedeva chat e gruppi nella Fase 2 (mesi 3–6) e la cifratura end-to-end nella Fase 4 (mesi 9–12). Tra le due fasi ci sarebbero stati **sei mesi di messaggi privati leggibili da chi amministra il NAS**.

Il piano ne era consapevole e prescriveva onestà: «niente lucchetti finti», e l'app avrebbe dovuto dichiarare che i messaggi erano cifrati solo in transito e a riposo. Ma dichiarare un limite non lo elimina. Chi scrive un messaggio diretto si comporta come se fosse privato, indipendentemente da quello che c'è scritto nelle impostazioni.

[`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) aveva classificato «amministratore curioso» come scenario **scoperto**. Questa decisione lo copre.

## Decisione

**Messaggi diretti e messaggi di gruppo vengono rilasciati con cifratura end-to-end, oppure non vengono rilasciati.**

Non esiste uno stato intermedio: nessuna beta, nessuna anteprima, nessun «per ora è in chiaro fra amici». Se l'implementazione E2E non è pronta, la funzionalità non compare nel prodotto.

La cifratura usa un protocollo standard e maturo — MLS, RFC 9420, tramite una libreria esistente. **Nessuna crittografia scritta in casa**, come già impone `AGENTS.md`.

## Che cosa questa decisione copre, e che cosa no

Va detto con precisione, perché «l'amministratore non vede niente» sarebbe falso.

**Copre: il contenuto dei messaggi privati.** Chi amministra il NAS smista buste chiuse. Non può leggere DM né messaggi di gruppo, nemmeno con accesso completo al server, al database e ai backup.

**Non copre: l'esistenza delle conversazioni.** Chi ospita l'istanza vede necessariamente chi è membro, quali dispositivi si collegano, quando, e la dimensione del traffico. Da questi metadati si deduce che due persone si parlano, e con che frequenza. È una conseguenza dell'ospitare, non un difetto rimediabile: nasconderla richiederebbe un sistema di anonimizzazione che non è ciò che ESTIA costruisce.

**Non copre, per scelta: il feed locale.** E la ragione è che non avrebbe senso.

Il feed è la bacheca del quartiere: è indirizzato a tutti i membri dell'istanza, e **l'amministratore è uno di quei membri**. Cifrarlo end-to-end verso un gruppo di cui l'amministratore fa parte non gli impedirebbe di leggerlo — gli darebbe una chiave, non gliela toglierebbe. In più renderebbe impossibili moderazione, ricerca e anteprime.

Il feed resta quindi leggibile dal server che lo serve, e [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §6 lo dichiara già. La distinzione da comunicare all'utente è netta: **la bacheca del quartiere è pubblica dentro il quartiere; i messaggi privati non lo sono per nessuno.**

## Conseguenze

**Positive.**

- Elimina lo scenario «amministratore curioso» per i contenuti che gli utenti considerano privati.
- Elimina anche la finestra di sei mesi in cui il prodotto avrebbe avuto una promessa più debole di quella percepita.
- Rende impossibile la scorciatoia più probabile in assoluto: rilasciare la chat perché «serve», con l'E2E rimandata a dopo.

**Negative.**

- **La chat costa di più e arriva più tardi.** MLS, gestione delle chiavi sui dispositivi, verifica dei dispositivi, backup delle chiavi e ingressi/uscite dai gruppi sono un blocco di lavoro serio.
- Alcune funzionalità comode diventano difficili o impossibili: ricerca lato server nei messaggi, anteprime generate dal server, moderazione dei contenuti privati.
- La chat resta fuori dal perimetro autorizzato più a lungo. Dato che è già rinviata, il costo aggiuntivo oggi è nullo.

**Neutre.**

- Non cambia nulla per M1, M2 e M3: non esistono messaggi privati in quelle milestone.

## Come si verifica

1. Nessuna milestone può introdurre un endpoint per messaggi diretti o di gruppo senza il livello E2E nello stesso rilascio.
2. Il server non deve mai avere accesso al testo in chiaro: un test verifica che ciò che viene persistito per un messaggio privato non contenga il contenuto originale.
3. L'interfaccia non mostra alcuna indicazione di riservatezza su canali che non sono E2E — e il feed non ne mostra nessuna.

## Quando riesaminare

- Se una libreria MLS matura non risulta utilizzabile sulle piattaforme di ESTIA, la decisione va riaperta **esplicitamente**, con la conseguenza dichiarata: o si sceglie un altro protocollo standard, o la chat non si fa. Non si ripiega su messaggi in chiaro.
