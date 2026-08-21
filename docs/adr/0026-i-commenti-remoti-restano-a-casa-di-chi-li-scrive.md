# ADR 0026 — I commenti remoti restano a casa di chi li scrive

- Stato: **Accepted** — decisa dal proprietario il 2026-08-22
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md), [ADR 0025](0025-i-cuori-attraversano-e-le-notifiche-sono-una-lettura.md)
- Attua: la fondazione per la moderazione federata e le risposte tra istanze

## Contesto

L'[ADR 0025](0025-i-cuori-attraversano-e-le-notifiche-sono-una-lettura.md) ha stabilito che i cuori attraversano le istanze, ma le risposte no. Il divieto per i commenti (Decisione 5) derivava da un problema di responsabilità legale e moderazione: ospitare del testo scritto da qualcunə che non è membro della propria istanza espone a rischi, ed espande le esigenze di "moderazione federata", posticipandola a una milestone futura.

Il pilot ha chiesto la possibilità di rispondere e interagire. Serve un'architettura che risolva il problema della moderazione alla radice, senza introdurre blocchi centralizzati o l'obbligo di ospitare contenuti indesiderati.

## La domanda

Come possiamo permettere agli utenti di due istanze diverse di scambiarsi commenti senza costringere l'autore del post originale a scaricare e archiviare le parole (potenzialmente illecite o offensive) di un utente remoto sul proprio NAS? E come si garantisce il diritto di chi riceve il commento di poterlo nascondere?

## Decisione: Si salva solo un puntatore

Riprendendo la seconda proprietà fondativa della rete ESTIA stabilita in [ADR 0018](0018-federazione-fra-istanze-estia.md) ("i contenuti si visitano, non si replicano"), espandiamo questo concetto alle reazioni testuali.

**I commenti remoti restano a casa di chi li scrive.**

Quando un utente (Bob, su Istanza B) commenta il post di un altro utente (Alice, su Istanza A):

1. **Il testo sta a casa dell'autore:** Il testo del commento viene salvato **esclusivamente sul database dell'Istanza B**. Bob è l'autore, la sua istanza ospita i suoi contenuti.
2. **La destinazione salva una notifica (il puntatore):** L'Istanza B notifica l'Istanza A che è stato aggiunto un commento, fornendone solo l'identificativo. L'Istanza A registra nel proprio database una semplice traccia: `remote_comments(post_id, instance_key, remote_comment_id)`. **Non viene mai scaricato o salvato il contenuto del commento**.
3. **Visibilità asincrona e in tempo reale:** Quando chiunque chiede all'Istanza A di leggere il post di Alice, l'Istanza A fornisce il post e la lista dei `remote_comment_id`. I client che leggono il post andranno a interrogare direttamente le istanze autrici (es. l'Istanza B) per visualizzare il testo del commento in tempo reale.

### Differenza rispetto ai Cuori (Like)

Come stabilito in ADR 0025, i "cuori" vengono salvati integralmente sull'Istanza che riceve il like. Questa asimmetria è voluta ed è confermata: i cuori non contengono testo, non generano problemi legali, e il loro salvataggio locale evita chiamate di rete costose per calcolare un semplice contatore numerico.

## Conseguenze sulla Moderazione (Il vantaggio del modello)

Questa architettura riduce la moderazione federata a un'azione puramente locale, eliminando il rischio legale:

- **Rimozione del puntatore:** Se Alice trova il commento di Bob offensivo, Alice (o i moderatori dell'Istanza A) cancellano o nascondono il _puntatore_ dal database dell'Istanza A. Da quel momento, il commento sparisce dalla visualizzazione del post per tutti.
- **Nessun testo estraneo in casa propria:** L'Istanza A non avendo mai ospitato il contenuto illecito, non si assume alcuna responsabilità per i contenuti scritti da terzi.
- **Responsabilità all'origine:** Il commento di Bob resta sui dischi del NAS di Bob. Se il contenuto è illegale, la responsabilità fisica e logica è della macchina di Bob, in aderenza al principio che ESTIA non offre rifugio per dati illeciti in cloud distribuiti.

## Visibilità e Diritti di Accesso

La regola per la visibilità dei commenti e dei like remoti segue esattamente la regola del post a cui sono associati:

- **Chi può leggere il post può leggere (e scrivere) i commenti e i cuori.**
- **Post Pubblici e Prova Sentinella:** Se il profilo di Alice è pubblico, chiunque nella rete può usare la "prova sentinella" ([ADR 0025](0025-i-cuori-attraversano-e-le-notifiche-sono-una-lettura.md)) per leggere il post **anche senza seguirla**. Avendo il diritto di leggere il post, quel client riceverà anche i puntatori ai commenti remoti, che potrà poi risolvere andandoli a cercare sulle istanze rispettive.

## Quando implementare

Questo ADR traccia la rotta, ma l'implementazione pratica del sistema di commenti remoti tramite puntatori farà parte della voce **"Moderazione federata e interazione"** nelle milestone future, ovvero _dopo_ la chiusura del gate M5. Non va anticipato prima del consolidamento della base di M3, M4 e M5.
