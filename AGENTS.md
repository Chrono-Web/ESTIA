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

Eseguire esclusivamente la prima milestone non completata di `docs/IMPLEMENTATION_PLAN.md`, con la sola eccezione parallela che quel documento dichiara per gli spike. Non anticipare chat, federazione, crittografia MLS, relay di produzione o plugin di governance.

Oggi la milestone attiva è **M3**, la robustezza operativa. M2 è completa e il suo gate è stato **chiuso il 2026-08-15 su un NAS reale**, con un membro non tecnico entrato senza assistenza.

Quella prova ha detto anche da dove partire, ed è il contrario di quanto ci si aspetterebbe: **il prodotto ha retto, l'installazione no.** Ci è voluta un'ora di assistenza esperta per portare l'istanza su un NAS, mentre il gate M3 chiede meno di 30 minuti con la sola documentazione. La prima voce di M3 non è una funzione: è rendere ripetibile quello che quel giorno è stato improvvisato.

**Aggiornamento del 2026-08-19.** M3 è costruita per intero — nessuna voce è più aperta — ma il suo gate no: chiede **due prove su hardware vero**, un ripristino da backup cifrato su un NAS e un'installazione sotto i 30 minuti fatta da chi non ha scritto la guida. Nessuna riga di codice le sostituisce, e finché non ci sono M3 resta la milestone attiva. Il residuo è vincolato all'hardware, non al tempo: per questo **M4 avanza in parallelo**, autorizzata dal proprietario, e solo dove non dipende né da quelle due prove né dalla scelta del trasporto. Oggi vuol dire la sua prima voce, il trasporto del pilot dichiarato e documentato; le altre sei aspettano l'ADR sul trasporto. Quell'ADR tocca rete e confini di fiducia: vale la regola qui sotto, si prepara la decisione e ci si ferma, non la si prende.

**Aggiornamento del 2026-08-21.** **M5 è costruita** — testo e fotografie attraversano le istanze, in visita e non in copia — ma il suo gate no: chiede **due case, due persone, una conversazione che attraversa** sul campo. Come M3, nessuna riga di codice chiude quel cancello. Non anticipare chat, crittografia MLS, relay di produzione o plugin di governance.

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
- Libreria e binding mobili per MLS.

Sono invece **chiuse** e non vanno riaperte senza un nuovo ADR: control plane della rete privata (ADR 0001, nessuna opzione adottata), primo contatto (0003), primo client (0004), persistenza (0005), riservatezza dei messaggi (0006), cifratura a riposo (0007), hashing delle password (0008), recupero dell'accesso (0009), forma del client web (0010), elaborazione immagini (0011) e recupero autenticato dei media (0012), formato dei backup (0013), backup prima delle migrazioni (0014), licenza (0015), backup dal pannello (0016), scoperta sulla rete locale (0017), modello di federazione (0018), preferenze UI personali a catalogo (0024) e cuori che attraversano con notifiche dedotte (0025).

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
