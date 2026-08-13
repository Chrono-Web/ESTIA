# Prompt corrente per il coding agent

Questo file contiene l'incarico attivo. Va aggiornato quando una milestone si chiude.

## Storico

- **M0.1 — Bootstrap riproducibile.** Completata il 2026-07-15, chiusa il 2026-08-13. Il prompt che l'ha generata non è più applicabile: la repository non è più vuota.

## Incarico attivo — M0.2 e M0.3

---

Stai lavorando alla fase M0 di ESTIA, che riduce i rischi architetturali prima di scrivere prodotto.

Leggi integralmente `AGENTS.md`, `docs/PRODUCT_VISION.md`, `docs/PROJECT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/RECONCILIATION.md` e tutti gli ADR in `docs/adr/` prima di modificare qualsiasi file.

Sono attive due milestone in parallelo, autorizzate dall'eccezione dichiarata nelle regole di avanzamento del piano. **Nessuna delle due autorizza a scrivere codice di prodotto.** Non implementare account, feed, media, client mobile, chat o federazione.

### M0.2 — Spike della rete privata

L'ambiente è predisposto in `infra/network-lab/` e il protocollo sperimentale è nel suo `README.md`. Esegui gli esperimenti da E0 a E8 nell'ordine, registrando ciascuno in `infra/network-lab/results/` a partire da `results/TEMPLATE.md`.

Vincoli:

- Non saltare E0: le versioni dei componenti sono un risultato dello spike, non un presupposto, e il compose fallisce di proposito senza di esse.
- Ogni misura deve riportare se il percorso era diretto o via relay. Una misura senza questa informazione non è utilizzabile.
- `t_revoca` va misurato con un client che tenta l'accesso in loop, non osservando quando l'interfaccia mostra il nodo come revocato.
- Se una condizione non è riproducibile — tipicamente la linea CGNAT — dichiaralo nel risultato invece di emularla in silenzio.
- Al termine aggiorna `docs/adr/0001-private-network-control-plane.md` con le evidenze e con una decisione, **oppure** con i blocchi espliciti che impediscono di prenderla. Un ADR che resta `Proposed` con motivazione documentata è un esito accettabile; un ADR deciso senza evidenze non lo è.

Questa milestone richiede hardware e reti reali. Se l'ambiente non li rende disponibili, fermati, dichiara quali esperimenti non sono eseguibili e perché, e procedi con M0.3.

### M0.3 — Spike SQLite e multi-arch

Non condivide superfici di decisione con M0.2 e non richiede hardware di rete.

- Confronta i driver e i query builder SQLite compatibili con TypeScript, valutando esplicitamente il costo dei moduli nativi sulla build `linux/arm64`.
- Prova migrazione, transazione, foreign key attive e backup consistente su un database temporaneo.
- Verifica build o esecuzione su `linux/amd64` e `linux/arm64`.
- Verifica che gli invarianti dell'ADR 0002 — identificatori opachi, scope obbligatorio con default `local`, soft delete, timestamp UTC — siano esprimibili come vincoli reali dello schema, non come convenzioni.
- Registra la scelta in un nuovo ADR.

### Metodo

Vale il metodo di lavoro di `AGENTS.md`. In particolare: non dichiarare completata una milestone che dipende da mock, non nascondere un'incertezza dietro stub che sembrano produzione, e aggiorna lo stato in `docs/IMPLEMENTATION_PLAN.md` solo per le attività realmente verificate.

Al termine fornisci: sintesi, file modificati, comandi eseguiti con esito, esperimenti non eseguibili con motivo, e stato aggiornato degli ADR.

---

## Incarico successivo

Quando M0.2 e M0.3 sono chiuse, l'incarico è **M0.4 — Baseline di sicurezza e threat model**, che dipende dalle evidenze di entrambe: il modello delle minacce non è scrivibile finché non è noto dove risiedono control plane e relay, e quali metadati conservano.
