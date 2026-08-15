# Conciliazione tra il piano di progetto e il piano tecnico

- Data: 2026-08-13
- Stato: **normativo** — questo documento chiude il disallineamento tra i due percorsi

## 1. Perché questo documento esiste

ESTIA ha prodotto due piani in tre giorni, e per un mese sono rimasti entrambi validi senza che nessuno dei due dichiarasse il rapporto con l'altro.

| Data       | Documento                                                             | Natura                                                       |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| ~2026-04   | Prototipo non versionato (rimosso)                                    | Implementazione rapida di quasi tutto il piano, poi scartata |
| 2026-07-12 | `ESTIA-piano-di-progetto.docx`                                        | Piano di progetto: visione, prodotto, 4 fasi in 12 mesi      |
| 2026-07-15 | `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, ADR 1 | Piano tecnico: requisiti, vincoli, ordine di costruzione     |

Il piano tecnico non è una traduzione del piano di progetto: ne corregge apertamente alcune parti («il piano originario indica…», «il piano iniziale va corretto su tre punti») e ne ribalta silenziosamente altre. Finché le due letture convivono senza gerarchia, ogni scelta futura può essere giustificata citando il documento più comodo.

Questo documento fissa quale delle due letture vale, voce per voce.

## 2. Il rapporto corretto tra i due piani

Il piano tecnico **non copre** le quattro fasi del piano di progetto. Copre la Fase 1 e la espande.

```text
Piano di progetto        Piano tecnico
─────────────────        ─────────────
FASE 1 (mesi 1–3)   →    M0 (fondazioni e spike)  ← fase nuova, non presente nel docx
                         M1 (istanza e identità)
                         M2 (feed locale verticale)
                         M3 (robustezza operativa)

FASE 2 (gruppi)     →    «milestone successive, non autorizzate ora»
FASE 3 (federazione)→    «milestone successive, non autorizzate ora»
FASE 4 (E2E, port.) →    «milestone successive, non autorizzate ora»
```

Ne discendono due conseguenze da accettare esplicitamente:

1. **Le 13 milestone del piano tecnico valgono, tutte insieme, la sola Fase 1 del docx.** Il piano tecnico ha inserito davanti una fase M0 di riduzione del rischio che nel docx non esiste (lì gli spike sono attività laterali in §14, non gate bloccanti).
2. **Il perimetro autorizzato oggi non include la chat.** Nel docx i gruppi sono la seconda cosa costruita e una delle tre superfici fondanti; nel piano tecnico sono fuori roadmap. Il prodotto a breve termine è «feed locale + amministrazione», non «feed + chat».

Entrambe sono scelte difendibili — la prima molto, vista la storia del prototipo di aprile — ma vanno dette, non subite.

## 3. Vocabolario degli esiti

| Esito          | Significato                                                 |
| -------------- | ----------------------------------------------------------- |
| **Portato**    | Requisito recepito nel piano tecnico con la stessa sostanza |
| **Riordinato** | Recepito, ma in una posizione diversa nel tempo             |
| **Ribaltato**  | Il piano tecnico decide il contrario; richiede un ADR       |
| **Recuperato** | Era caduto per omissione; reintegrato con questo documento  |
| **Rinviato**   | Fuori perimetro attuale, con destinazione dichiarata        |
| **Ritirato**   | Deliberatamente non fatto, con motivo registrato            |

## 4. Le tre decisioni ribaltate

Sono le uniche divergenze che cambiano l'architettura, non l'ordine dei lavori.

### 4.1 ActivityPub-nativo dal giorno 1 → ActivityPub come confine

|                   |                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docx §4**       | «Decisione chiave: ActivityPub-nativo dal primo giorno». Il data model interno è AP dalla Fase 1: ogni utente un actor, ogni post un `Note`/`Image`. Motivazione: evitare «il retrofit più doloroso possibile». |
| **Piano tecnico** | «ActivityPub è un protocollo di confine» (`AGENTS.md`); «nessuna dipendenza dall'identificatore ActivityPub come chiave primaria» (`PROJECT_SPEC` §5); AP come adapter (`ARCHITECTURE` §9).                     |
| **Esito**         | **Ribaltato.** Registrato in [ADR 0002](adr/0002-activitypub-confine-non-schema.md).                                                                                                                            |

Il piano tecnico ha ragione sul merito — JSON-LD come schema di database è un costo permanente per un beneficio che si manifesta una volta sola — ma non può cavarsela senza rispondere all'obiezione del docx. ADR 0002 elenca gli invarianti di dominio che rendono il retrofit un lavoro di mappatura e non una riscrittura, e li rende verificabili con test da M1.1.

### 4.2 Chat e gruppi in Fase 2 → fuori roadmap

|                   |                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Docx**          | Fase 2, mesi 3–6, priorità CORE. Milestone: «un gruppo di amici usa ESTIA al posto di WhatsApp per una settimana». |
| **Piano tecnico** | «Milestone successive, non autorizzate ora», posizione 3–4 di una lista dichiaratamente indicativa.                |
| **Esito**         | **Rinviato**, con una condizione di riapertura ora esplicita (§7).                                                 |

Non serve un ADR: è una decisione di sequenza, non di architettura. Serve però ammettere il costo: fino a M3 compreso, ESTIA non è «un mix tra Instagram, Threads e WhatsApp». È la bacheca di un quartiere. La comunità pilota va reclutata su quella promessa, non sull'altra.

### 4.3 Rete privata decisa → rete privata sospesa

|                        |                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Docx §5.1, §7, §13** | «WireGuard + Headscale, integrati nell'app». Deciso, Fase 1, CORE.                                       |
| **Piano tecnico**      | Decisione sospesa fino a M0.2; quattro opzioni in [ADR 0001](adr/0001-private-network-control-plane.md). |
| **Esito**              | **Ribaltato, e correttamente.**                                                                          |

È l'unica divergenza che il piano tecnico dichiara con chiarezza, ed è quella con la motivazione più forte: ADR 0001 individua nel docx una dipendenza circolare reale — un Headscale ospitato solo sul NAS dietro CGNAT non può coordinare il primo collegamento, perché il telefono avrebbe bisogno della rete privata per raggiungere il componente che deve inserirlo nella rete privata. Nessuna riformulazione del docx risolve il problema; serve lo spike.

## 5. Fase 1 del docx, voce per voce

| Componente docx (Fase 1)            | Esito          | Dove vive adesso                                     |
| ----------------------------------- | -------------- | ---------------------------------------------------- |
| Installazione istanza, Compose      | Portato        | M0.1 (fatto), M3 (installazione guidata)             |
| Wizard con cifratura volume         | **Recuperato** | M0.4 (requisito), M3 (wizard che la propone)         |
| Identità, account, Argon2id         | Portato        | M1.2                                                 |
| Sessioni multi-device               | Portato        | M1.2                                                 |
| Recovery account                    | **Recuperato** | M1.2                                                 |
| Rete privata in-app                 | Riordinato     | M0.2 (spike, chiuso) → **M4**                        |
| Onboarding via link                 | Portato        | M1.3                                                 |
| Vetrina istanza senza elenco membri | **Recuperato** | M1.3                                                 |
| Feed locale, post e commenti        | Portato        | M2.1, M2.2                                           |
| Like                                | **Recuperato** | M2.2                                                 |
| Timeline cronologica                | Portato        | M2.1                                                 |
| Pipeline media, thumbnail           | Portato        | M2.3                                                 |
| Compressione client-side            | **Recuperato** | M2.3 (accettazione), M2.4 (implementazione)          |
| App mobile v1                       | Riordinato     | Successive #1 (il primo client è web, ADR 0004)      |
| Sblocco biometrico                  | **Recuperato** | Successive #1, con il client mobile                  |
| Dashboard admin                     | Portato        | M1.4                                                 |
| Video brevi                         | Ritirato       | Fuori dal primo slice (`PROJECT_SPEC` §7)            |
| Repost interni                      | Ritirato       | Fuori dal primo slice                                |
| Notifiche push                      | **Recuperato** | Milestone successive, ora con destinazione esplicita |

Tre destinazioni sono state **corrette il 2026-08-15**, alla chiusura di M2, perché erano rimaste indietro rispetto alla riorganizzazione: rete privata in-app, app mobile v1 e sblocco biometrico risultavano dentro M1 o M2. Non ci sono mai state — [ADR 0003](adr/0003-primo-contatto-in-rete-locale.md) ha tolto la rete da M1 e M2, e [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) ha reso web il primo client. Lasciarle lì avrebbe fatto dire a questo documento che con M2 è arrivata anche l'app mobile.

Le sei voci **Recuperate** erano cadute per omissione, non per decisione: nessun documento del piano tecnico le esclude, semplicemente non le nomina. Due meritano attenzione particolare:

- **Compressione client-side.** Nel docx §12 è la mitigazione dichiarata del rischio «CPU NAS insufficiente per i media», classificato impatto Medio e probabilità **Alta**. Perderla significa perdere la risposta a un rischio ad alta probabilità.
- **Vetrina d'istanza senza elenco membri.** È un requisito di privacy (docx §9.1), non di grafica: la schermata che un invitato vede prima di essere approvato non deve rivelare chi fa parte della comunità.

## 6. Fasi 2–4 del docx: destinazione dichiarata

| Blocco docx                       | Destinazione nel piano tecnico     |
| --------------------------------- | ---------------------------------- |
| Chat engine, gruppi, DM           | Successive #3, previo ADR          |
| Notifiche push FCM/APNs           | Successive #3 (arriva con la chat) |
| Membri esterni nei gruppi         | Successive #3                      |
| Federazione AP completa           | Successive #1                      |
| Profilo pubblico, scope per post  | Successive #1                      |
| Interop Mastodon/Pixelfed/Threads | Successive #1                      |
| Esposizione HTTPS, Caddy          | Successive #2                      |
| Relay comunitari, peering istanze | Successive #2                      |
| Anti-abuso federazione            | Successive #2                      |
| E2E con MLS (DM, poi gruppi)      | Successive #4, previo spike e ADR  |
| Export/import, `Move`             | Successive #5                      |
| Governance plugin                 | Successive #6                      |

Nessuna di queste è cancellata. Tutte richiedono un nuovo piano tecnico prima dell'implementazione, come già stabilito.

## 7. Condizioni di riapertura

Il rinvio della chat è la scelta più costosa dal lato prodotto. Va riesaminato — non automaticamente riaperto — quando si verifica una di queste condizioni:

1. Il gate M2 è superato su hardware reale e la comunità pilota chiede la chat come mancanza principale.
2. Il feed locale da solo non regge la retention nel pilot: il docx §12 lo prevede come rischio («il feed+chat deve valere da solo, senza federazione»), e la verifica è misurabile.
3. Un secondo sviluppatore rende sostenibile il doppio stack, che il docx §12 classifica impatto Alto.

Fino ad allora, `PRODUCT_VISION.md` descrive le tre superfici come visione, e il piano tecnico ne implementa una. La distanza è dichiarata, non nascosta.

## 8. Che cosa fa fede, da adesso

| Domanda                                          | Documento che risponde        |
| ------------------------------------------------ | ----------------------------- |
| Perché esiste ESTIA, per chi, come deve sentirsi | `docs/PRODUCT_VISION.md`      |
| Che cosa deve fare e quali proprietà conservare  | `docs/PROJECT_SPEC.md`        |
| Come è costruito                                 | `docs/ARCHITECTURE.md`        |
| In che ordine si costruisce                      | `docs/IMPLEMENTATION_PLAN.md` |
| Perché una decisione è stata presa così          | `docs/adr/`                   |

`ESTIA-piano-di-progetto.docx` diventa un **documento storico**: resta la fonte della visione di prodotto e del linguaggio verso l'esterno, ma non è più normativo sulle scelte tecniche né sulla sequenza. Dove il docx e questi documenti divergono, vale quanto scritto qui; dove il docx dice qualcosa che qui non c'è, è una lacuna da segnalare, non un requisito implicito.
