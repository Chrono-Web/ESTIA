# Istruzioni per i coding agent

## Contesto

Questa repository contiene ESTIA. Non assumere l'esistenza di codice, configurazioni o decisioni non presenti nei documenti: `docs/IMPLEMENTATION_PLAN.md` dichiara lo stato reale di ogni milestone, ed è l'unica fonte attendibile su che cosa esiste davvero.

Prima di intervenire, leggi nell'ordine:

1. `docs/PRODUCT_VISION.md`
2. `docs/PROJECT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. `docs/SECURITY_BASELINE.md`
6. `docs/RECONCILIATION.md`
7. tutti gli ADR pertinenti in `docs/adr/`

Il lavoro riguarda l'infrastruttura tecnologica e l'implementazione. La selezione della comunità pilota e la ricerca con utenti sono gestite fuori da questa repository; i budget di esperienza di `docs/PRODUCT_VISION.md` §4 sono invece requisiti e vanno rispettati.

Esiste un documento precedente, `ESTIA-piano-di-progetto.docx` (luglio 2026), che non fa parte della repository. Non è normativo: dove diverge da questi documenti, vale quanto scritto qui, e il rapporto voce per voce è in `docs/RECONCILIATION.md`. Se qualcuno lo cita per giustificare una scelta, verifica prima in quel documento se la voce è stata portata, riordinata, ribaltata o ritirata.

## Obiettivo corrente

Eseguire esclusivamente la prima milestone non completata di `docs/IMPLEMENTATION_PLAN.md`, con la sola eccezione parallela che quel documento dichiara per gli spike. Non anticipare relay di produzione o plugin di governance. (Chat 1:1 e federazione sono costruite, M5 e M6. **MLS e i gruppi non sono più vietati**: [ADR 0038](docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) li ha autorizzati il 2026-08-26, nell'ordine scritto lì.)

**Aggiornato il 2026-09-02. Leggi prima l'ultimo aggiornamento in fondo a questa sezione: è quello che vale.** M0, M1, M2, M3 e M5 sono complete con i gate chiusi; M6 è costruita e il suo gate è **mezzo passato** — la conversazione fra due case è avvenuta il 2026-08-27, resta l'ispezione di database e backup; M7 è **ritirata**; M8 (i gruppi) è aperta e bloccata sopra il taglio MLS, che a sua volta aspetta **due decisioni non prese** ([ADR 0042](docs/adr/0042-come-mls-attraversa.md) e [ADR 0043](docs/adr/0043-custodia-lato-mittente.md)).

Quello che segue è la storia di come ci si è arrivati, in ordine di data. Serve a capire perché certe scelte stanno dove stanno, non a dire che cosa fare oggi.

Il gate M2 è stato **chiuso il 2026-08-15 su un NAS reale**, con un membro non tecnico entrato senza assistenza. Quella prova ha detto anche da dove partire, ed è il contrario di quanto ci si aspetterebbe: **il prodotto ha retto, l'installazione no.** Ci è voluta un'ora di assistenza esperta per portare l'istanza su un NAS, mentre il gate M3 chiedeva meno di 30 minuti con la sola documentazione. La prima voce di M3 non è stata una funzione: è stata rendere ripetibile quello che quel giorno era stato improvvisato.

**Aggiornamento del 2026-08-19.** M3 è costruita per intero — nessuna voce è più aperta — ma il suo gate no: chiede **due prove su hardware vero**, un ripristino da backup cifrato su un NAS e un'installazione sotto i 30 minuti fatta da chi non ha scritto la guida. Nessuna riga di codice le sostituisce, e finché non ci sono M3 resta la milestone attiva. Il residuo è vincolato all'hardware, non al tempo: per questo **M4 avanza in parallelo**, autorizzata dal proprietario, e solo dove non dipende né da quelle due prove né dalla scelta del trasporto. Oggi vuol dire la sua prima voce, il trasporto del pilot dichiarato e documentato; le altre sei aspettano l'ADR sul trasporto. Quell'ADR tocca rete e confini di fiducia: vale la regola qui sotto, si prepara la decisione e ci si ferma, non la si prende.

**Aggiornamento del 2026-08-21.** **M5 è costruita** — testo e fotografie attraversano le istanze, in visita e non in copia — ma il suo gate no: chiede **due case, due persone, una conversazione che attraversa** sul campo. Come M3, nessuna riga di codice chiude quel cancello.

**Aggiornamento del 2026-08-22.** **M6 (I messaggi privati) è costruita** — cifratura end-to-end obbligatoria (ADR 0006), identità del dispositivo (ADR 0028), consegna federata asincrona tra case (ADR 0029, 0030) e auto-riparazione su cambio browser (ADR 0033) — ma il suo gate no: chiede **due case, due persone, una conversazione che attraversa** con verifica che il testo in chiaro non compaia nel database o nei backup. Non anticipare relay di produzione o plugin di governance.

**Aggiornamento del 2026-08-23.** **M7 è autorizzata** dal proprietario e avanza in parallelo, come M4. Il primo taglio è **iOS, sideload, HTTP in LAN**: login, feed, profilo, DM E2E. **Non include iroh** (è l'ADR di M4, non scritto: si prepara e ci si ferma). **Non include push** (su iOS il background passa da APNs; il proprietario ha scelto di non averle in questo taglio). **Non include Android.** Il codice E2E nell'app parte solo dopo l'ADR «MLS su React Native». Expo Go non è un ambiente di lavoro. Il gate di M6 resta aperto e non si chiude scrivendo l'app.

**Aggiornamento del 2026-08-26.** Due cose, decise dal proprietario dopo una revisione del codice.

**M7 è azzerata.** Il primo taglio era stato dichiarato completo con tutte le caselle `[x]`; la revisione ha trovato che **nove voci non corrispondevano al codice**, due delle quali sulla riservatezza (le chiavi E2E sopravvivono al logout e passano all'account successivo; l'auto-riparazione di ADR 0033 sul telefono non esiste). Il client mobile **si rifà dall'inizio**, e non prima che il resto del progetto stia in piedi da solo.

**Aggiornamento del 2026-08-27.** Deciso dal proprietario, ed è quello che vale oggi.

**M7 è ritirata, e il suo numero non si riusa.** Non era solo azzerata: il perimetro (solo iOS, sideload, HTTP in LAN) non è più quello voluto, la sua Fase 2 ordinava di costruire `ESTIA-E2E-v1` sul telefono contro [ADR 0038](docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md), ed era comunque bloccata dallo spike React Native mai fatto. **`apps/mobile/` è stato rimosso dall'albero** — resta nella storia di git — perché un codice trovato falso in nove punti, lasciato lì, prima o poi viene scambiato per una base di partenza. Negli ADR «M7» continua a voler dire il client mobile: quei documenti non si riscrivono.

**Le app si riaprono come programma proprio, dopo ESTIA 1.0**, per iOS e Android insieme e con un piano scritto da zero. Le tre precondizioni sono nella lapide di M7: lo spike React Native su MLS, la decisione sulle notifiche push, e l'ADR di M4 sul trasporto definitivo. Nessuna è fatta, e nessuna si anticipa.

**MLS attraversa le istanze prima del taglio.** [ADR 0039](docs/adr/0039-mls-attraversa-le-istanze.md), **strada B**, decisa il 2026-08-27. Canale di handshake, `GroupInfo`, archivio, mazzo e registro delle chiavi di firma si fermano al confine di casa, mentre `ESTIA-E2E-v1` attraversa già: tagliare adesso avrebbe tolto le conversazioni fra case **il giorno dopo** che la metà difficile del gate di M6 era passata sul campo. Quindi `ESTIA-E2E-v1` resta in servizio finché le cinque operazioni non attraversano, e **il punto 4 di [ADR 0038](docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) non si chiude prima**. Si comincia da una **misura** — quanto pesano un Welcome e un `GroupInfo` su un gruppo vero — perché se non stanno in una busta federata cambia il disegno, non il numero.

**Un membro può avere più di un dispositivo, e a dire di sì è un dispositivo che già possiedi.** [ADR 0040](docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md), **strada B**. Oggi ESTIA è **a un dispositivo per persona** e fino a ieri non lo diceva: chi scrive riceve una sola chiave, la più recente, quindi aprire ESTIA dal telefono spegne il computer — che resta collegato e smette di ricevere. MLS lo risolve (un dispositivo è una foglia), ma il **meccanismo** — aggiungere la foglia a ogni conversazione — sta sopra il taglio MLS: oggi è costruita solo la casa dove abiterà, cioè la sezione **Chat** delle impostazioni. Tre regole che ne discendono e non sono rifiniture: la strada **C** (basta il login) va **impedita dal codice**, perché è quella che si ottiene per inerzia; la frase segreta resta la via di riserva per chi ha un dispositivo solo; la revoca deve togliere la foglia **da ogni conversazione**.

**Le istanze si tengono d'occhio da sole, e il battito non si spegne.** [ADR 0041](docs/adr/0041-le-istanze-si-tengono-d-occhio.md), deciso il 2026-08-27. Fino a quel giorno la raggiungibilità di un'altra casa non era uno stato: la scopriva, ogni volta da capo, **il membro che apriva la lente «rete»**. Guardandola si è trovato il difetto vero, che non era d'interfaccia: la coda dei messaggi arretrava fino a **un'ora** e nessuno la rimetteva in partenza quando l'altra casa tornava — cioè una cosa che il gate di M6 avrebbe misurato al posto della federazione. Ora l'istanza chiede ogni **cinque minuti**, arretra invece di tacere (5→10→20→40, tetto a un'ora), tratta **qualunque contatto in arrivo** come un battito, e al passaggio spenta→accesa **risveglia la coda** verso quella casa. Tre cose che ne discendono: il battito **non è l'avviso vuoto** di ADR 0018 e non va fatto diventare quello di soppiatto; **ogni domanda a un'altra istanza ha un tetto di tempo**, perché senza, «raggiungibile» non è uno stato; e il terzo vede in più il **profilo di accensione della casa** a cinque minuti, scritto in [ADR 0018](docs/adr/0018-federazione-fra-istanze-estia.md) §«I relay pubblici di n0 sono accettati».

**M8 è aperta: i gruppi**, promossi dal punto 5 delle milestone successive. È **bloccata** e darle un numero non la sblocca: sta sopra il passaggio dell'interfaccia a MLS, che sta sopra [ADR 0039](docs/adr/0039-mls-attraversa-le-istanze.md). L'ordine è: **gate M6 sul campo → ADR 0039 → il taglio → M8 → il multi-dispositivo ([ADR 0040](docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)) → ESTIA 1.0 beta → le app.**

**La crittografia dei messaggi non è MLS, e fino al taglio netto non va chiamata così.** [ADR 0027](docs/adr/0027-la-libreria-mls.md) dichiarava framing e ratchet RFC 9420 che non sono mai stati scritti; è **Superseded** da [ADR 0036](docs/adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md), che registra `ESTIA-E2E-v1` com'è — ECDH P-256 statico più AES-GCM-256 — con quattro limiti dichiarati: niente forward secrecy, nessun KDF sull'uscita ECDH, chiave non legata alla conversazione, nessuna verifica fuori banda delle chiavi. **Nessun documento, commento o identificatore nuovo deve dichiarare MLS come implementato.** MLS resta l'obiettivo, con la condizione d'incasso scritta in ADR 0036.

**Aggiornamento del 2026-09-02.** Nessuna decisione nuova: questo registra ciò che i documenti non dicevano.

**I blocchi davanti al taglio MLS sono due, non uno.** [ADR 0042](docs/adr/0042-come-mls-attraversa.md) (come MLS attraversa: sei operazioni, la casa che mette in fila, la credenziale che porta la casa) e [ADR 0043](docs/adr/0043-custodia-lato-mittente.md) (ognuno custodisce quello che ha scritto: l'archivio si **visita** invece di essere depositato, e chi spegne la propria casa ritira la propria parola) sono **Proposed dal 2026-08-28**, e nessuna delle due compariva nel piano né qui: il piano dichiarava un blocco solo. **0043 sta sopra 0042** e ne ribalta il punto 4 — insieme ad [ADR 0037](docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md) e alla deroga di [ADR 0029](docs/adr/0029-un-messaggio-si-consegna.md) §1. L'ordine è quindi: **si decide 0043, si aggiorna 0042 di conseguenza, e solo allora si costruiscono le sei operazioni.** Costruire prima l'operazione `archivio` vuol dire sceglierne la forma senza deciderla, e riscriverla dopo.

**Il gate di M6 non lo tocca nessuna delle due.** Resta aperto per la sua metà: aprire il database dell'istanza e un backup `age` **su quel NAS** e verificare che una frase scambiata il 2026-08-27 non ci sia. È un'ispezione, non una funzione, e nessuna riga di codice la sostituisce.

## Vincoli di progetto

- Il progetto è open source e self-hosted.
- I contenuti e i dati applicativi restano sull'istanza della comunità.
- Non deve esistere un backend applicativo globale obbligatorio gestito dagli sviluppatori.
- L'istanza di riferimento deve funzionare su Linux `amd64` e `arm64` tramite Docker Compose.
- SQLite è il database iniziale; PostgreSQL è un'estensione futura, non un requisito del primo MVP.
- Il server applicativo iniziale è un monolite modulare TypeScript/Fastify. Separare servizi solo dopo una necessità misurata.
- Il client mobile previsto è React Native con codice nativo dove necessario. Non assumere che Expo Go possa ospitare estensioni VPN native.
- Il client web è una SPA statica servita dall'istanza stessa, membri e amministrazione nella stessa applicazione (`docs/adr/0010-client-web-spa-statica.md`). Next.js è stato scartato.
- ActivityPub è un protocollo di confine. Il dominio interno deve poter essere mappato ad ActivityStreams senza usare JSON-LD come schema del database. La decisione e gli invarianti che la rendono sostenibile sono in `docs/adr/0002-activitypub-confine-non-schema.md`. Dal 2026-08-19 non è più l'unica porta verso l'esterno: la federazione di base è fra istanze ESTIA e non costa un dominio (`docs/adr/0018-federazione-fra-istanze-estia.md`).
- Nessuna crittografia personalizzata. Usare protocolli e librerie mature; registrare in un ADR ogni scelta crittografica.
- Non inserire segreti, token, chiavi reali o credenziali nel repository.
- Il progetto è distribuito sotto **AGPL-3.0** ([ADR 0015](docs/adr/0015-licenza-agpl.md)). Ogni dipendenza nuova va verificata **compatibile** prima di entrare, insieme a versione e licenza, come si fa già negli ADR 0008, 0011 e 0013. Una dipendenza copyleft incompatibile si scarta: si riesamina la dipendenza, non la licenza.

## Decisioni già fissate

- Monorepo TypeScript con workspace `pnpm`.
- API HTTP con schema e documentazione OpenAPI.
- Configurazione validata all'avvio; il processo deve fallire chiaramente se mancano valori obbligatori.
- Migrazioni versionate e testate su un database temporaneo.
- Storage locale astratto dietro un'interfaccia, senza introdurre S3/MinIO nel primo MVP.
- Docker Compose come percorso di installazione principale.
- Test automatici per ogni comportamento nuovo e smoke test del deployment.
- Logging strutturato, privo di password, token, chiavi e contenuti sensibili.

## Decisioni ancora aperte

Non trasformare queste ipotesi in architettura definitiva senza completare il relativo spike o ADR:

- Trasporto per l'accesso da fuori dalla rete locale, rinviato a M4: Tailscale è dichiarato per il pilot, non scelto per il prodotto. Dal 2026-08-19 il trasporto del pilot è documentato in `docs/ACCESSO_DA_FUORI.md`, con la tabella di che cosa vede il terzo: documentarlo non lo sceglie.
- Strategia push tra APNs/FCM e alternative opzionali.
- Binding mobili per MLS. **La libreria è scelta**: `ts-mls`, [ADR 0038](docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md). Resta aperto se giri su React Native — oggi no, e va sciolto con uno spike prima di riaprire le app.
- Verifica fuori banda delle chiavi dei dispositivi e rotazione: oggi non esistono, e sono il buco più serio di `ESTIA-E2E-v1`.
- **Come MLS attraversa le istanze, e chi custodisce quello che è stato scritto.** [ADR 0042](docs/adr/0042-come-mls-attraversa.md) e [ADR 0043](docs/adr/0043-custodia-lato-mittente.md) sono **Proposed dal 2026-08-28** e nessuna delle due è decisa. 0043 sta sopra 0042 — archivio depositato oppure visitato — e finché non è sciolta l'operazione `archivio` non si costruisce. Toccano confini di fiducia e ritiro dei contenuti: si prepara la decisione e ci si ferma.

Sono invece **chiuse** e non vanno riaperte senza un nuovo ADR: control plane della rete privata (ADR 0001, nessuna opzione adottata), primo contatto (0003), primo client (0004), persistenza (0005), riservatezza dei messaggi (0006), cifratura a riposo (0007), hashing delle password (0008), recupero dell'accesso (0009), forma del client web (0010), elaborazione immagini (0011) e recupero autenticato dei media (0012), formato dei backup (0013), backup prima delle migrazioni (0014), licenza (0015), backup dal pannello (0016), scoperta sulla rete locale (0017), modello di federazione (0018), preferenze UI personali a catalogo (0024), cuori che attraversano con notifiche dedotte (0025), CLI di gestione locale per ripristino e manutenzione (0031), ri-derivazione chiavi e auto-riparazione messaggi E2E (0033), distinzione dispositivo fisico e sessione (0034) e battito fra istanze con risveglio della coda (0041).

## Metodo di lavoro

Per ogni incarico:

1. Ispeziona lo stato reale della repository e individua la milestone attiva.
2. Riassumi brevemente il piano e le assunzioni prima di modificare file.
3. Implementa il più piccolo incremento completo che soddisfa i criteri di accettazione.
4. Aggiungi o aggiorna test, documentazione e configurazioni nella stessa modifica.
5. Se tocchi l'interfaccia, verifica il pezzo contro **tutte** le euristiche di `docs/DESIGN_SYSTEM.md` §«Euristiche di usabilità» (non un sottoinsieme).
6. Esegui formatter, lint, typecheck, test e smoke test pertinenti.
7. Aggiorna lo stato delle sole attività realmente completate in `docs/IMPLEMENTATION_PLAN.md`.
8. Concludi indicando file modificati, comandi eseguiti, risultati e blocchi rimasti.

## Regole decisionali

- Per scelte locali e facilmente reversibili, adotta l'opzione più semplice coerente con i documenti.
- Per scelte che influenzano identità, rete, crittografia, portabilità o confini di fiducia, crea o aggiorna un ADR e fermati se manca una decisione autorizzata.
- Non nascondere un'incertezza dietro stub che sembrano produzione.
- Non dichiarare completata una milestone se dipende da mock nel percorso principale.
- Non ampliare il perimetro per «preparare il futuro» quando un'interfaccia minima è sufficiente.

## Qualità minima

Una milestone è completata solo se:

- parte da un clone pulito seguendo istruzioni documentate;
- ha dipendenze e versioni riproducibili;
- passa formatter, lint, typecheck e test;
- non contiene segreti o configurazioni specifiche della macchina dello sviluppatore;
- espone health check utili dove applicabile;
- include criteri di rollback o pulizia per gli esperimenti infrastrutturali;
- aggiorna la documentazione tecnica interessata.

## Interfaccia: le euristiche non sono opzionali

Ogni modifica all'interfaccia (web o mobile) deve soddisfare **tutte** le euristiche di usabilità elencate in `docs/DESIGN_SYSTEM.md` §«Euristiche di usabilità». Non se ne sceglie un sottoinsieme. Un incremento che funziona ma viola una euristica — per esempio un'azione di rete senza feedback mentre lavora — non è completo: si corregge prima di dichiararlo fatto.

I budget di esperienza di `docs/PRODUCT_VISION.md` §4 restano soglie di prodotto separate; le euristiche sono il modo in cui un'interfaccia non li sabota mentre si costruisce.
