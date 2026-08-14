# Istruzioni per i coding agent

## Contesto

Questa repository contiene ESTIA. Non assumere l'esistenza di codice, configurazioni o decisioni non presenti nei documenti: ciò che è stato costruito finora è soltanto la milestone M0.1, e `docs/IMPLEMENTATION_PLAN.md` ne dichiara lo stato reale.

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

Oggi la milestone attiva è **M1.1** (istanza, identità e persistenza), con due voci residue. La successiva è **M1.2** (account, sessioni e ruoli), che deve rispettare i vincoli elencati in fondo alla sezione M0.4 del piano: token e inviti conservati solo come hash, nessun privilegio basato sull'indirizzo IP, revoca che chiude le connessioni aperte.

## Vincoli di progetto

- Il progetto è open source e self-hosted.
- I contenuti e i dati applicativi restano sull'istanza della comunità.
- Non deve esistere un backend applicativo globale obbligatorio gestito dagli sviluppatori.
- L'istanza di riferimento deve funzionare su Linux `amd64` e `arm64` tramite Docker Compose.
- SQLite è il database iniziale; PostgreSQL è un'estensione futura, non un requisito del primo MVP.
- Il server applicativo iniziale è un monolite modulare TypeScript/Fastify. Separare servizi solo dopo una necessità misurata.
- Il client mobile previsto è React Native con codice nativo dove necessario. Non assumere che Expo Go possa ospitare estensioni VPN native.
- Il pannello amministrativo previsto è Next.js, ma non va creato prima che esistano API reali da amministrare.
- ActivityPub è un protocollo di confine. Il dominio interno deve poter essere mappato ad ActivityStreams senza usare JSON-LD come schema del database. La decisione e gli invarianti che la rendono sostenibile sono in `docs/adr/0002-activitypub-confine-non-schema.md`.
- Nessuna crittografia personalizzata. Usare protocolli e librerie mature; registrare in un ADR ogni scelta crittografica.
- Non inserire segreti, token, chiavi reali o credenziali nel repository.

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

- Headscale con client Tailscale, motore Tailscale incorporato o control plane WireGuard proprietario.
- Posizione e proprietà del control plane quando il NAS è dietro CGNAT.
- Strategia dei relay e dipendenza eventuale da DERP.
- ORM/query builder per SQLite e compatibilità `linux/arm64`.
- Strategia push tra APNs/FCM e alternative opzionali.
- Libreria e binding mobili per MLS.

## Metodo di lavoro

Per ogni incarico:

1. Ispeziona lo stato reale della repository e individua la milestone attiva.
2. Riassumi brevemente il piano e le assunzioni prima di modificare file.
3. Implementa il più piccolo incremento completo che soddisfa i criteri di accettazione.
4. Aggiungi o aggiorna test, documentazione e configurazioni nella stessa modifica.
5. Esegui formatter, lint, typecheck, test e smoke test pertinenti.
6. Aggiorna lo stato delle sole attività realmente completate in `docs/IMPLEMENTATION_PLAN.md`.
7. Concludi indicando file modificati, comandi eseguiti, risultati e blocchi rimasti.

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
