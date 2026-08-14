# ADR 0009 — Recupero dell'accesso con codice trascrivibile

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA

## Contesto

Recuperare l'accesso di un membro è semplice: lo reimposta l'amministratore. Il caso difficile è **l'amministratore stesso**, che non ha nessuno sopra di sé.

Le vie normali non sono disponibili, e non per caso:

- **L'email** presuppone un canale centrale e un fornitore terzo, che [ADR 0003](0003-primo-contatto-in-rete-locale.md) ha tolto dal percorso di fiducia. Reintrodurla per il recupero significherebbe che chi controlla la casella controlla l'istanza.
- **Un servizio di recupero del progetto** sarebbe il server centrale che ESTIA nega.
- **L'accesso fisico al server come prova di possesso** è allettante, ma equivale a dire che chiunque entri in casa diventa amministratore. Contraddice `SECURITY_BASELINE.md` §2: la presenza fisica autentica un canale, non autorizza una persona.

## Decisione

**Un codice di recupero, generato dall'istanza, mostrato una volta sola, che l'amministratore trascrive e conserva fuori dall'istanza.**

Su un foglio di carta, su una chiave USB, in un gestore di password: la scelta è di chi amministra. È lo stesso schema dei codici di recupero dell'autenticazione a due fattori, ed è l'unico che non introduce né un terzo né un varco fisico.

Regole vincolanti:

1. **Mostrato una volta.** Alla configurazione dell'istanza, insieme alla creazione dell'amministratore. Non è più recuperabile in seguito da nessuna interfaccia.
2. **Conservato solo come hash**, come token di sessione e inviti (`SECURITY_BASELINE.md` §3). Chi legge il database non ottiene un codice utilizzabile.
3. **Uso singolo.** Usarlo lo consuma e ne emette immediatamente uno nuovo, mostrato una volta sola: un amministratore non resta mai senza via di recupero.
4. **L'uso revoca tutte le sessioni.** Chi arriva a usare il codice potrebbe aver subito una compromissione; le sessioni aperte altrove vanno chiuse.
5. **Trascrivibile senza ambiguità.** Alfabeto senza caratteri confondibili, raggruppato in blocchi. Va copiato a mano da una persona, di fretta, magari male illuminata.
6. **Fortemente limitato in frequenza**, e mai privilegiato dalla provenienza di rete: valgono le stesse regole di ogni altra credenziale.

## Perché non serve Argon2 qui

Il codice è generato dall'istanza con 100 bit di entropia, non scelto da una persona. Non esiste un dizionario da provare: un hash veloce come SHA-256 è la scelta corretta, esattamente come per i token di sessione ([ADR 0008](0008-hashing-password-argon2id.md) spiega la distinzione).

## Conseguenze

**Positive.** Nessun terzo nel percorso di recupero. Nessun varco basato sulla presenza fisica. Il segreto vive dove l'amministratore decide, fuori dall'istanza, quindi un furto del NAS non lo porta con sé.

**Negative.** **Chi perde il codice e la password perde l'istanza**, e non c'è rimedio: è la stessa proprietà che rende il meccanismo sicuro. L'installazione deve dirlo con chiarezza, non in una nota a piè di pagina, ed è il motivo per cui l'emissione di un nuovo codice a ogni uso non è un dettaglio.

**Aperte.** La rotazione volontaria del codice, per chi sospetta di averlo esposto, è un'aggiunta ragionevole e non fa parte di questa milestone.

## Quando riesaminare

- Se il pilot mostra che gli amministratori perdono il codice con frequenza, il problema è la comunicazione al momento dell'installazione, non il meccanismo. Prima di indebolire il modello si migliora quella.
- Se ESTIA introdurrà più amministratori per istanza, il recupero fra pari diventa possibile e va valutato come alternativa meno fragile.
