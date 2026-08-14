# ADR 0010 — Il client web è una SPA statica servita dall'istanza

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Sostituisce: la scelta «Next.js» per il pannello amministrativo

## Contesto

Il piano di progetto prevedeva Next.js per due ragioni distinte: il pannello amministrativo, e il rendering lato server dei **profili pubblici** per l'indicizzazione dai motori di ricerca.

La seconda ragione non è più attuale. [ADR 0002](0002-activitypub-confine-non-schema.md) ha reso la federazione opzionale per istanza, e i profili pubblici sono in una milestone successiva non autorizzata. Oggi non esiste una sola pagina destinata a essere letta da un motore di ricerca: **tutto ciò che ESTIA serve è dietro autenticazione, su una rete locale.**

Resta quindi solo la prima ragione, e per quella Next.js chiede un prezzo che non ripaga: un secondo processo Node nel container, un secondo runtime da aggiornare, e un modello di rendering che non serve a nessuna delle schermate esistenti.

## Decisione

**Il client web è una single-page application statica, compilata in file e servita dall'istanza stessa.**

Un solo processo, un solo container, un solo artefatto da distribuire su un NAS. `core-api` serve i file compilati e continua a servire le API sotto `/api/v1`, con fallback a `index.html` per le rotte gestite dal browser.

Stack: **Vite, React e TypeScript**, con i tipi delle API presi da `@estia/contracts`, così una modifica al contratto rompe la compilazione del client invece di rompersi in produzione.

## Perché non le alternative

**Next.js** — risolve un problema che non abbiamo. Il costo è reale: un processo in più su hardware che è spesso un ARM da poche risorse, e una superficie di aggiornamento più larga sul componente esposto.

**Rendering lato server fatto in casa** — stesse ragioni, più codice nostro.

**Nessun framework, HTML e JavaScript a mano** — allettante, ma le schermate hanno stato reale: sessione, ruolo, liste che cambiano dopo un'azione. Riscrivere a mano la gestione dello stato è il tipo di risparmio che si paga più tardi.

## Conseguenze

**Positive.** Un container, un processo, un artefatto. La build è statica, quindi il client non aggiunge superficie di attacco lato server. I tipi condivisi legano client e API alla stessa fonte.

**Negative.** Nessun contenuto indicizzabile e nessun rendering iniziale lato server. Quando arriveranno i profili pubblici federati servirà una soluzione per quelle pagine — che sono poche, pubbliche e strutturalmente diverse dal resto, quindi affrontabili separatamente senza trascinarci dietro l'intera applicazione.

**Da tenere presente.** Servire l'interfaccia dallo stesso processo che serve le API significa che una vulnerabilità nel serving statico è una vulnerabilità dell'istanza. Il percorso dei file va confinato alla cartella compilata e il fallback non deve poter restituire nulla al di fuori di essa.

## Quando riesaminare

- Quando i profili pubblici federati diventano una milestone autorizzata: allora la domanda sull'indicizzazione torna reale, e riguarderà quelle pagine.
- Se il client crescesse al punto da rendere il caricamento iniziale percepibile sulla rete locale, cosa che a questa scala non è attesa.
