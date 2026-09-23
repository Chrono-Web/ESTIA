# ADR 0044 — L'interfaccia parla più lingue: cataloghi semplici, nessuna libreria, la lingua è della persona

- Stato: **Accepted** — il 2026-09-23 il proprietario ha chiesto di prendere le quattro decisioni del livello I0 e di costruire I0 e I1 ([`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §«Internazionalizzazione»); la regola sulle lingue incomplete è sua, parola per parola
- Data: 2026-09-23
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0010](0010-client-web-spa-statica.md), [ADR 0024](0024-preferenze-ui-personali.md)
- Non decide: la traduzione dei contenuti delle persone, che resta esclusa (§7), e se gli ADR nuovi si scrivono in inglese

## Contesto

Fino al 2026-09-23 ESTIA parlava solo italiano, e non per una scelta: i testi erano scritti dentro i componenti, diverse centinaia di frasi in `apps/web/src`, più quelle che il server manda da sé — i messaggi degli errori, le frasi della diagnostica, il codice di configurazione stampato all'avvio — e quelle di `install.sh` e del comando `estia`. Tradurre voleva dire toccare ogni file, e ogni modifica successiva avrebbe riportato testo nel codice.

Il proprietario ha chiesto una cosa precisa: alla fine del lavoro, **un'istanza installabile in inglese e una in italiano**, e **tutte le scritte dell'interfaccia in un catalogo semplice e facile da tradurre**, anche quelle che verranno. Chi vuole portare ESTIA in un'altra lingua deve poterlo fare copiando una cartella, senza sapere programmare.

Le quattro domande che il piano lasciava aperte erano: il formato dei cataloghi, se serve una libreria, dove sta la scelta della lingua, e che cosa fa una lingua incompleta.

## Decisione

### 1. I cataloghi: una cartella per lingua, file JSON piatti, in un pacchetto solo

Tutto il testo traducibile di ESTIA sta in `packages/i18n/locales/<lingua>/`, un file JSON per area (`feed.json`, `settings.json`, `errors.json`, `installer.json`…). Per portare ESTIA in una lingua nuova si copia la cartella `it/` in `de/` e si traduce ogni valore.

- **Chiavi piatte e in inglese**, dentro il file: `"compose.placeholder": "Scrivi qualcosa"`. Nel codice la chiave porta davanti il nome del file: `feed.compose.placeholder`. Inglese perché le legge chi traduce, da qualunque lingua parta.
- **Segnaposto** con le doppie graffe: `"Ciao {{name}}"`.
- **Plurali** con i suffissi delle categorie di `Intl.PluralRules`: `"posts_one": "{{count}} post"`, `"posts_other": "{{count}} post"`. Ogni lingua usa le categorie che le servono — il polacco ne ha quattro, il giapponese una.
- **Testo ricco** con tag nominati e niente HTML: `"Premi <b>Salva</b> quando hai finito"`. Il codice decide che cosa diventa `<b>`; il catalogo non può iniettare markup, e non esiste un `dangerouslySetInnerHTML`.
- **Ogni lingua dice chi è** in `meta.json`: il proprio nome («English», «Italiano») e la frase che annuncia una traduzione incompleta, scritta in quella lingua (§4).

Sono le convenzioni del formato «i18next JSON v4», che le piattaforme di traduzione — Weblate, fra le libere — leggono già: adottare una piattaforma, un giorno, non chiederà di convertire niente.

**L'italiano è la lingua d'origine.** Ogni chiave esiste in `it/`, e il resto si misura su quello. **L'inglese è la lingua ponte**: è completo per regola (§6), e una frase che manca in un'altra lingua ricade prima sull'inglese, poi sull'italiano — chi legge tedesco ha più probabilità di capire l'inglese.

### 2. Nessuna libreria: un modulo di poche righe sopra `Intl`

Il runtime è scritto qui, in `packages/i18n`: cercare una chiave, sostituire i segnaposto, scegliere il plurale con `Intl.PluralRules`, spezzare il testo ricco. Date, numeri e tempi relativi passano da `Intl.DateTimeFormat`, `Intl.NumberFormat` e `Intl.RelativeTimeFormat`, che ogni browser e Node hanno già.

Lo stesso modulo serve il client web, il server (codice di configurazione, CLI dei backup) e il generatore che scrive le tabelle degli script di shell. Un catalogo solo, tre consumatori.

### 3. La lingua è della persona

Come l'aspetto in [ADR 0024](0024-preferenze-ui-personali.md): una preferenza di chi usa ESTIA, salvata sull'istanza, che non compare sul profilo e non attraversa la federazione.

**Nel client web**, in quest'ordine:

1. la lingua che la persona ha scelto nelle impostazioni (sul server; in cache nel browser per le pagine prima dell'accesso);
2. altrimenti la prima delle lingue del browser che ESTIA ha;
3. altrimenti la **lingua predefinita dell'istanza**, che l'amministratore sceglie nella configurazione iniziale e può cambiare dopo;
4. altrimenti l'inglese.

L'attributo `lang` della pagina segue la lingua in uso, perché chi usa un lettore di schermo la sente pronunciata con quella voce.

**Negli strumenti da riga di comando**: `ESTIA_LANG` se c'è; poi, per `estia`, la lingua predefinita dell'istanza a cui parla; poi le variabili di sistema (`LC_ALL`, `LC_MESSAGES`, `LANG`); poi l'inglese. L'installatore passa la lingua che ha usato al container (`ESTIA_LANG`), così il codice di configurazione stampato nel log parla la stessa lingua dell'installazione. Le istanze configurate prima di questa decisione hanno come lingua predefinita l'italiano, che è quella in cui sono state configurate.

### 4. Una lingua incompleta si usa lo stesso, e lo dice

È la regola del proprietario. Una lingua non si nasconde perché manca qualche frase: si offre, e si dichiara quanto è completa.

- **La completezza** è la quota di chiavi della lingua d'origine che quella lingua traduce, su tutti i cataloghi insieme: interfaccia, errori, installatore, comandi. Un gruppo di plurali conta come una chiave. Si arrotonda per difetto: «100%» vuol dire davvero tutto.
- **Sotto il 100%**, la frase di `meta.json` — «In questa versione, l'italiano è tradotto solo al {{percent}}%», scritta nella lingua di cui parla — compare:
  - **nell'installatore**, quando è quella la lingua che sta usando;
  - **nella documentazione**: [`docs/TRANSLATIONS.md`](../TRANSLATIONS.md) riporta la percentuale di ogni lingua, e la tabella la scrive il generatore, non una persona;
  - **nell'interfaccia**, accanto alla lingua, dove la si sceglie: nella configurazione iniziale e nelle impostazioni.
- **Se una lingua non ha ancora tradotto nemmeno quella frase**, si usa quella inglese.

### 5. Il server manda codici, il client scrive le frasi

`DomainError` ha già un codice stabile per ogni rifiuto. Da qui la risposta d'errore porta anche i **parametri** (`params`), e il client mostra la frase del catalogo `errors.<codice>`. Il messaggio del server resta nella risposta: è il ripiego per un codice che il client non conosce — un client più vecchio dell'istanza — e per gli errori di validazione, che non hanno un codice di ESTIA.

Lo stesso per le frasi della diagnostica (`detail` nei rapporti su cifratura, backup, aggiornamenti, rete): accanto al testo arrivano una chiave e i suoi parametri, e il testo resta per compatibilità.

**I log strutturati restano in inglese e non si traducono**: servono a chi fa manutenzione, si cercano per parola, e non li legge nessun membro.

### 6. Il controllo che impedisce al testo di tornare nel codice

Un catalogo che si riempie una volta e poi si svuota a ogni modifica non è un catalogo. Tre controlli girano in `pnpm verify`, cioè in CI:

- **una regola ESLint del repository**, `estia/no-ui-literal`, che fallisce quando il codice del client contiene testo visibile: il testo fra i tag JSX, gli attributi che si leggono (`aria-label`, `title`, `placeholder`, `alt`…), le stringhe che hanno l'aspetto di una frase. Un'eccezione si dichiara sulla riga, con il perché;
- **i test del catalogo**: una lingua non ha chiavi che l'italiano non ha, i segnaposto coincidono, i plurali usano solo categorie che quella lingua ha, **l'inglese è completo**;
- **i file generati sono aggiornati**: i tipi delle chiavi, le tabelle degli script di shell e la tabella di `docs/TRANSLATIONS.md` escono da `pnpm i18n`, e un test fallisce se qualcuno ha cambiato un catalogo senza rigenerarli.

I tipi generati fanno il resto: una chiave che non esiste, o un segnaposto dimenticato, è un errore di compilazione.

### 7. Che cosa non si traduce

- **Quello che le persone scrivono.** Post, commenti e messaggi non vanno mai a un servizio di traduzione: li porterebbe fuori dall'istanza, e per i messaggi privati romperebbe la cifratura end-to-end. Una traduzione dei contenuti, se mai ci sarà, girerà sul dispositivo.
- **Il nome e la descrizione dell'istanza**, che sono contenuto della comunità.
- **I log**, come al §5.
- **I registri** — ADR, spike, piano — per la ragione scritta nel piano: due versioni di un testo che fa fede aprono una domanda che non deve esistere.

## Perché non le alternative

- **i18next con react-i18next** (MIT). Maturo e diffuso, ma porta con sé plugin, rilevatori di lingua e un'API molto più larga di quello che serve, per fare quello che qui fanno poche righe. Il suo formato di file lo adottiamo lo stesso (§1), quindi passarci, se un giorno servisse, costerebbe poco.
- **FormatJS e la sintassi ICU.** Più potente — selezioni annidate, generi — ma è la sintassi più difficile per chi traduce senza essere tecnico, e porta un parser nel client. Le frasi di ESTIA non ne hanno bisogno.
- **Lingui.** Estrae i testi con macro in fase di compilazione: comodo per chi scrive codice, ma aggiunge un passaggio alla build e lega il formato allo strumento.
- **gettext e i file PO.** Lo standard storico e ben supportato dalle piattaforme, ma nel browser serve un parser, e i file PO sono meno leggibili del JSON per chi apre il file a mano.
- **Una lingua per istanza invece che per persona.** Più semplice, e sbagliato: una comunità può avere membri che parlano lingue diverse, e la lingua è una preferenza come l'aspetto, non una proprietà del posto.
- **Nascondere le lingue incomplete.** È il contrario della regola del proprietario, e toglie a chi traduce il modo di vedere il proprio lavoro in uso.

## Conseguenze

**Positive.**

- Portare ESTIA in una lingua nuova è copiare una cartella e tradurre dei valori, senza toccare codice. Il generatore la trova da solo e la mette nell'elenco, con la sua percentuale.
- Il testo non può tornare nel codice senza che la CI lo dica.
- Il client mostra gli errori del server nella lingua di chi legge, e smette di mostrare metà frasi in inglese e metà in italiano.
- Nessuna dipendenza nuova.

**Negative.**

- Ogni frase nuova si scrive due volte, in italiano e in inglese, nella stessa modifica: la regola che tiene l'inglese completo costa esattamente questo.
- Il runtime è nostro, quindi i suoi difetti sono nostri. Lo tengono piccolo i test e il fatto che fa poco.
- Una frase che cambia in italiano non segnala da sola che la sua traduzione è vecchia: le chiavi dicono che cosa manca, non che cosa è superato. Per la documentazione vale il commit dichiarato in testa a ogni traduzione ([`TRANSLATIONS.md`](../TRANSLATIONS.md)); per i cataloghi, per ora, la revisione di chi cambia una frase.

## Quando riesaminare

- Se arrivano più traduttori attivi: si adotta una piattaforma di traduzione sugli stessi file (Weblate, che è software libero e si può ospitare da sé).
- Se una lingua ha bisogno di una costruzione che plurali e segnaposto non esprimono — il genere grammaticale, per esempio — si valuta la sintassi ICU per quelle sole frasi.
- Quando nasceranno le app: useranno gli stessi cataloghi, e questo ADR va riletto per quello che chiedono in più (le lingue di sistema del telefono, le stringhe native degli store).
