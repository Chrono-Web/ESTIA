# ADR 0002 — ActivityPub è un confine, non lo schema del dominio

- Stato: **Accepted**
- Data: 2026-08-13
- Proprietario: progetto ESTIA
- Sostituisce: la «decisione chiave» §4 di `ESTIA-piano-di-progetto.docx`

## Contesto

Il piano di progetto di luglio 2026 contiene una decisione esplicita e motivata:

> Anche se la federazione pubblica arriva solo in Fase 3, il data model interno è ActivityPub fin dalla Fase 1: ogni utente è un actor, ogni post un oggetto `Note`/`Image` con addressing esplicito. Questo evita il retrofit più doloroso possibile.

I documenti tecnici del 15 luglio affermano il contrario, in tre punti diversi e senza mai citare la decisione che stanno ribaltando:

- `AGENTS.md`: «ActivityPub è un protocollo di confine. Il dominio interno deve poter essere mappato ad ActivityStreams senza usare JSON-LD come schema del database.»
- `PROJECT_SPEC.md` §5: «nessuna dipendenza dall'identificatore ActivityPub come chiave primaria del database».
- `ARCHITECTURE.md` §9: ActivityPub come adapter di traduzione.

La contraddizione è rimasta implicita per un mese. Poiché tocca identità e portabilità — due confini che `AGENTS.md` sottopone a obbligo di ADR — va risolta esplicitamente.

## Decisione

**Il dominio sociale di ESTIA usa un modello proprio. ActivityPub è un adapter di confine.**

Nessuna tabella, chiave primaria o vincolo di integrità deriva da ActivityStreams o da JSON-LD. La traduzione avviene in un livello dedicato, attivato dalla milestone che introduce la federazione.

## Perché non il modello AP-nativo

L'obiezione del piano di progetto è seria e va affrontata, non ignorata: il retrofit di un social chiuso verso la federazione è storicamente il lavoro più doloroso di questa categoria di prodotti. Tre ragioni la superano.

1. **JSON-LD non è uno schema, è un formato di scambio.** Ha tipizzazione aperta, `@context` remoti, proprietà polimorfe e alias multipli per lo stesso concetto. Usarlo come schema di persistenza significa rinunciare a vincoli di integrità reali su SQLite proprio nella fase in cui il dominio cambia più spesso.

2. **Il costo è permanente, il beneficio è puntuale.** Un modello AP-nativo si paga a ogni query, migrazione e test da M1 in poi, per un vantaggio che si riscuote una volta sola, alla milestone della federazione. Su un progetto a risorse limitate questo scambio è sfavorevole.

3. **Il retrofit doloroso ha una causa precisa, ed è evitabile a costo quasi nullo.** Non è l'assenza di JSON-LD nel database: è la perdita di informazione — identificatori instabili, autore implicito, scope assente, cancellazioni fisiche senza tombstone. Sono proprietà che si possono garantire fin da M1 senza adottare lo schema AP.

Il prototipo di aprile 2026 offre un'evidenza a favore: aveva profili e post modellati in stile ActivityPub fin dall'inizio e non ha reso l'apertura al Fediverso più vicina di un giorno, perché il blocco reale era altrove — nella rete privata.

## Invarianti che rendono la traduzione possibile

Sono le condizioni che sostituiscono lo schema AP-nativo. Valgono da M1.1 e non sono negoziabili.

1. **Identificatori interni stabili e opachi**, non derivati da username, dominio o URI federati.
2. **Autore e istanza di casa espliciti** su ogni entità pubblicabile.
3. **Scope obbligatorio** su ogni contenuto, con default `local` e mai `public` per assenza.
4. **Timestamp di creazione, modifica e cancellazione** in UTC.
5. **Cancellazione logica** dove la federazione richiederà un tombstone.
6. **Relazioni esplicite** tra post, commenti e media.
7. **Spazio per gli attributi federati** — URI, chiavi di firma, `Move` — aggiungibili senza toccare le identità interne.

L'invariante 1 è la più importante: è quella che tiene aperta sia la federazione sia la portabilità.

## Come si verifica

Non basta scriverlo. Da M1.1 il rispetto degli invarianti è oggetto di test, non di revisione a vista:

- un test verifica che nessuna chiave primaria o vincolo di unicità dipenda da username o dominio;
- un test verifica che la creazione di un contenuto senza scope esplicito produca `local`;
- da M2.1, un test di mappatura traduce un post e un commento reali in `Note` e oggetto con `inReplyTo`, senza accedere alla persistenza, dimostrando che l'informazione necessaria esiste già.

L'ultimo è il vero criterio: se la mappatura è scrivibile come funzione pura sul modello di dominio, il retrofit temuto dal piano di progetto non si verificherà.

## Conseguenze

**Positive.** Schema relazionale con vincoli reali; migrazioni comprensibili; test di dominio senza dipendenze di protocollo; libertà di correggere il modello sociale prima che la federazione lo cristallizzi; nessun vincolo verso AT Protocol o altri protocolli futuri.

**Negative.** Va scritto e mantenuto un livello di traduzione che il modello AP-nativo non richiederebbe. Gli invarianti vanno difesi attivamente: un singolo `UNIQUE(username)` usato come chiave esterna basta a violarli in silenzio — da qui i test.

**Neutre.** La scelta non anticipa nulla su WebFinger, HTTP Signatures, code di consegna e deduplicazione, che restano interamente nella milestone della federazione.

## Quando riesaminare

- Se la milestone della federazione mostra che la mappatura non è esprimibile senza accedere ai repository di persistenza, l'ADR ha fallito e va riaperto.
- Se ESTIA decide di supportare un secondo protocollo di federazione, la decisione si rafforza e va confermata, non rivista.

## Fonti

- https://www.w3.org/TR/activitypub/
- https://www.w3.org/TR/activitystreams-core/
- https://www.w3.org/TR/json-ld11/
