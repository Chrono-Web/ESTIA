# ADR 0038 — MLS si adotta, e si comincia dal web

- Stato: **Accepted** — decisa dal proprietario il 2026-08-26
- Data: 2026-08-26
- Proprietario: progetto ESTIA
- Incassa il debito di: [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) §«Quando riesaminare»
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0010](0010-client-web-spa-statica.md), [ADR 0015](0015-licenza-agpl.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md)
- Poggia su: spike [S1](../spike/S1-ts-mls-sotto-la-csp.md), [S2](../spike/S2-la-chiave-d-archivio.md), [S3](../spike/S3-il-rientro-di-un-dispositivo.md), [S4](../spike/S4-autenticare-chi-entra.md)
- Sblocca: i gruppi (Milestone successive #5)

## Contesto

[ADR 0027](0027-la-libreria-mls.md) aveva scelto MLS il 2026-08-22 e non lo aveva costruito. La ragione registrata era la Content Security Policy: l'istanza serve `script-src 'self'` ([`static.ts:25`](../../apps/core-api/src/web/static.ts)) e una libreria MLS compilata in WebAssembly avrebbe chiesto `wasm-unsafe-eval`, indebolendo la policy che protegge i token di sessione. [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) ha registrato che cosa era stato costruito al suo posto — `ESTIA-E2E-v1` — e ha messo a MLS **tre condizioni d'incasso**.

**La seconda è stata misurata.** Lo spike [S1](../spike/S1-ts-mls-sotto-la-csp.md) ha provato `ts-mls` sotto la CSP che l'istanza serve davvero, con un controllo negativo sulla stessa origine e con gli stessi header: **il WebAssembly viene rifiutato e `ts-mls` funziona.** L'ostacolo di ADR 0027 era reale, ed è aggirato — non con una deroga, ma perché quella libreria è TypeScript puro.

Gli altri due spike hanno provato che il disegno regge anche dove è difficile: [S2](../spike/S2-la-chiave-d-archivio.md) ha trovato come la chiave d'archivio attraversa i cambi di epoch, e [S3](../spike/S3-il-rientro-di-un-dispositivo.md) che un telefono nuovo rientra in un gruppo e ritrova la cronologia intera.

E c'è una circostanza che non si ripeterà. **M7 è azzerata**: non esiste nessun client mobile da rompere, quindi l'interoperabilità — che sarebbe stata il vincolo più stretto — oggi non vincola niente.

## Decisione

1. **ESTIA adotta MLS (RFC 9420) attraverso [`ts-mls`](https://github.com/LukaJCB/ts-mls)**, licenza MIT, compatibile AGPL-3.0 ([ADR 0015](0015-licenza-agpl.md)). È il ritorno a ciò che [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) chiedeva fin dall'inizio: un protocollo standard e maturo, tramite una libreria esistente, e non una composizione di casa.

2. **Si comincia dal client web, adesso.** La finestra aperta da M7 azzerata è la ragione del «adesso»: chi rifarà il client mobile punterà a MLS dal primo giorno, invece di costruire `ESTIA-E2E-v1` e migrarlo dopo. Costruire due volte era il costo che [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) §4 voleva evitare, e questa è la mossa che lo evita davvero.

3. **La praticabilità su React Native è un cancello di M7, non un blocco di questa decisione.** [S1](../spike/S1-ts-mls-sotto-la-csp.md) ha misurato che `ts-mls` non gira su React Native: il KEM passa da `@hpke/core`, che richiede WebCrypto, e React Native non ha `crypto.subtle` (la `2.0.0-rc.16` dipende ancora da `@hpke/*`). Esistono polyfill WebCrypto per RN e la via del contributo upstream, **nessuna delle due misurata**. Va sciolto prima di riaprire M7, e con uno spike, non con un'assunzione.

4. **Taglio netto con `ESTIA-E2E-v1`.** Non si mantengono due protocolli. Le conversazioni esistenti vengono lette un'ultima volta da un client che ha le chiavi, riversate nell'archivio di [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), e poi **il trasporto `ESTIA-E2E-v1` si ritira**. È il momento più economico per farlo: il gate di M6 è ancora aperto, quindi sul campo i dati veri sono pochi o nessuno, e l'archivio esiste proprio per non perdere niente in questo passaggio.

5. **Ciphersuite: `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`**, che è quella provata nei tre spike. La ragione è la continuità: P-256 e AES-GCM sono già le primitive di ESTIA, sono native in WebCrypto e non chiedono dipendenze opzionali. X25519 sarebbe altrettanto valido e un po' più veloce; **la scelta si conferma implementando**, ed è l'unica voce di questo ADR che non costa un ADR nuovo per cambiare.

## Il rischio che si accetta, detto per intero

`ts-mls` **non ha un audit di sicurezza formale**. Il progetto lo dichiara da sé e raccomanda una revisione indipendente per usi security-critical. Ha poco più di un anno.

[ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) chiedeva una libreria «matura», e **questa condizione non è soddisfatta**: è stata soppesata e accettata dal proprietario, non aggirata. Le ragioni per cui accettarla è difendibile:

- **785 vettori ufficiali RFC 9420 passano**, su 14 file: l'insieme completo del working group. Dicono che il protocollo è implementato secondo la specifica — non che l'implementazione sia priva di falle, ed è una distinzione che va tenuta.
- **L'alternativa non è «qualcosa di più sicuro»**, è `ESTIA-E2E-v1`: crittografia di casa, senza forward secrecy, senza KDF sull'uscita ECDH, con la chiave non legata alla conversazione e senza verifica delle chiavi. Il confronto onesto è fra una libreria giovane che implementa uno standard e una composizione nostra che non lo implementa affatto.
- **Il progetto è vivo** — commit due giorni prima dello spike — e si prova già nel browser con Playwright.

**Che cosa questo obbliga a fare**, e che non è opzionale:

- **La versione si fissa**, come tutto il resto del monorepo, e si aggiorna leggendo che cosa cambia — non `^`.
- **Il rischio si dichiara a chi usa il prodotto**, con la stessa regola di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) §2: un lucchetto che non dice che cosa non protegge è peggio di nessun lucchetto.
- **Un audit indipendente resta un obiettivo**, e la §«Quando riesaminare» ne fa una condizione di uscita dal pilot.

## Che cosa cambia, e che cosa no

**Cambia:** i messaggi acquistano la **forward secrecy** — misurata in [S1](../spike/S1-ts-mls-sotto-la-csp.md), non dedotta. I **gruppi** diventano possibili, ed è la ragione per cui MLS era stato scelto. La chiave di conversazione smette di essere una funzione statica delle due chiavi di dispositivo: avanza a ogni epoch. I limiti **1, 2 e 3** di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) si chiudono.

**Non cambia:** il server resta un Delivery Service che smista buste opache e non possiede chiavi private ([ADR 0027](0027-la-libreria-mls.md) punto 3, l'unico che era stato costruito). La CSP resta `script-src 'self'`. Il backup con passphrase di [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md) resta, con il contenuto che [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) §5 gli assegna.

**Non si chiude:** il **limite 4** di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md), la verifica fuori banda delle chiavi. MLS la rende possibile con il suo `AuthenticationService`, e non la implementa da solo. Finché non c'è, un'istanza compromessa può ancora sostituire una chiave — e [S3](../spike/S3-il-rientro-di-un-dispositivo.md) ha mostrato che con l'ingresso esterno quel buco si allarga.

## Che cosa va costruito, in ordine

L'ordine non è organizzativo: ogni voce dipende dalla precedente.

1. ~~**Spike sul limite 4 e sull'ingresso esterno insieme.**~~ **Fatto il 2026-08-26** da [S4](../spike/S4-autenticare-chi-entra.md), e la premessa era esatta: `defaultAuthenticationService` **risponde sempre `true`**, quindi chiunque ottenga un `GroupInfo` entra come chi vuole. Ne restano **tre obblighi**, non uno spike:

   1. **Montare un `AuthenticationService` legato a `device_keys`** è la prima riga di codice del lavoro su MLS, non una rifinitura. Costa una quindicina di righe, respinge l'estraneo, e non respinge la persona vera — provato.
   2. **Il limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) resta, e resta chiudibile solo fuori banda.** [S4](../spike/S4-autenticare-chi-entra.md) §3 mostra che un'istanza ostile registra una chiave propria come dispositivo di Anna e passa la validazione: la difesa si fida del registro, e il registro è suo. Il rimedio è il **numero di sicurezza** da confrontare a voce, ed è più lavoro d'interfaccia che di crittografia.
   3. **Mai chiamare `resync: true` senza sapere che la propria chiave di firma è già nell'albero**: in `ts-mls` 1.6.2 quel caso non solleva un errore, **cicla all'infinito** e pianta il client. Colpisce esattamente chi ha perso la passphrase e prova a rientrare da solo.

2. ~~**Il `GroupInfo` lato istanza.**~~ **Costruito il 2026-08-26.** Migrazione 24 (`conversazione_group_info`, uno per conversazione), `GET` e `PUT /api/v1/conversazioni/:id/group-info`, nove test. Tre proprietà, e sono quelle che contano:

   - **L'istanza non guarda dentro.** Il blob è opaco come le buste dei messaggi; l'`epoch` viaggia in una colonna sua proprio perché il server possa ordinare le versioni senza dover capire il contenuto.
   - **Il diritto di leggerlo viene dall'essere membro della conversazione, non dell'albero.** È il punto: chi lo chiede **non è ancora nel gruppo MLS** — sta rientrando, ed è l'albero che si sta ricostruendo.
   - **L'epoch non torna indietro**, e la regola sta nell'`ON CONFLICT … WHERE` in SQL, non in un controllo applicativo: due client che depositano insieme non possono far vincere il più vecchio. Un `GroupInfo` vecchio manderebbe chi rientra verso un'epoch morta.

   Tetto di 256 kB (`MAX_GROUP_INFO_CHARS`): senza, un membro riempirebbe il disco un `PUT` alla volta. **Rimane da misurare** quanto pesi su gruppi grandi, che [S3](../spike/S3-il-rientro-di-un-dispositivo.md) non ha misurato.

3. ~~**L'archivio di [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md).**~~ **Costruito il 2026-08-26**, lato istanza. Migrazione 25, due oggetti e quattro rotte:

   - **Il mazzo delle chiavi**, avvolto sotto l'epoch corrente (`GET`/`PUT …/archivio/chiavi`). Stessa forma e stessa regola del `GroupInfo`: opaco, e l'epoch non torna indietro. È una **catena** e non una chiave sola perché [S2](../spike/S2-la-chiave-d-archivio.md) ha misurato che con una chiave immortale chi viene rimosso leggerebbe anche il futuro dell'archivio.
   - **Le voci** (`GET`/`POST …/archivio`), paginate dalla più vecchia. Il deposito è **ripetibile**: due dispositivi archiviano la stessa conversazione senza coordinarsi, e la stessa voce due volte non duplica.

   Nessun vincolo verso `messaggi`: l'archivio ha un ciclo di vita suo, ed è il punto di ADR 0037 — legarlo al trasporto disferebbe la separazione che quella decisione costruisce, tanto più che il trasporto poi si ritira. **Resta da fare la parte client**: è lì che il testo viene ricifrato, e senza quella l'archivio è un deposito vuoto.

4. **Il trasporto MLS nel client web**, e la ritirata di `ESTIA-E2E-v1`. **Metà fatta il 2026-08-26.**

   Costruito: il **canale di handshake** lato istanza (migrazione 26) — i messaggi applicativi hanno la loro strada, commit e Welcome vanno qui, e un Welcome lo vede **soltanto** chi entra, che non è ancora nel gruppo crittografico e non decifrerebbe niente che passi dal canale dei membri. L'ordine è quello di **arrivo**, non del tempo, perché MLS applica i commit in sequenza. E il modulo `apps/web/src/mls/gruppo.ts`, con dodici test: creazione, ingresso, cifratura, handshake, la serratura dell'archivio, e le tre regole che vengono dagli spike — l'`AuthenticationService` sempre montato, mai `resync: true` con una chiave che non è nell'albero, e un messaggio illeggibile che **resta illeggibile** invece di diventare testo.

   **Aggiornamento del 2026-08-26.** Il passaggio dell'interfaccia è stato tentato e **riportato indietro**, perché tentarlo ha mostrato che manca un pezzo a monte: **i dispositivi pubblicano ancora KeyPackage di `ESTIA-E2E-v1`**. `dispositivo.ts` genera chiavi ECDSA/ECDH e le deposita, e `App.tsx` lo chiama in quattro punti. Finché quel bootstrap non genera e pubblica **KeyPackage MLS**, agganciare la schermata romperebbe la creazione di una conversazione: non c'è un `KeyPackage` da cui partire, e ogni conversazione nuova nascerebbe senza gruppo.

   Quindi l'ordine vero è: **prima il bootstrap del dispositivo, poi la schermata.** Il resto è pronto e provato — `gruppo`, `archivio`, `sessione`, `conversazione`, gli adattatori e il registro delle chiavi.

   **Non fatto: il passaggio dell'interfaccia e la ritirata di `ESTIA-E2E-v1`.** Riscrivere `Messaggi.tsx` — 1141 righe, nessun test di componente nel progetto — sostituendo crittografia funzionante con crittografia nuova, in un colpo solo e senza modo di verificare oltre il typecheck, sarebbe esattamente il «dichiarato completo e non lo era» da cui questa revisione è partita. Va fatto con il punto 5, insieme all'interfaccia, non prima.

5. **L'interfaccia, insieme al codice e non dopo.** [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) §«Conseguenze sull'interfaccia» elenca che cosa cambia, e [S3](../spike/S3-il-rientro-di-un-dispositivo.md) ne ha aggiunta una: riammettere qualcuno **deve** poter rimuovere il suo dispositivo perduto nello stesso gesto, o il telefono smarrito resta membro.
6. **I gruppi**, che a questo punto sono un incremento e non una milestone a sé.
7. **Lo spike React Native**, che apre M7.

## Conseguenze

### Positive

- ESTIA torna ad avere la crittografia che [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) chiedeva, e i documenti smettono di descrivere un obiettivo che nessuno stava percorrendo.
- Forward secrecy e gruppi, che erano il motivo dell'intera vicenda.
- Si costruisce una volta sola: il client mobile rifatto nasce su MLS.
- La CSP non si tocca, e questo era il vincolo che aveva fatto deragliare il primo tentativo.

### Negative

- **Si dipende da una libreria giovane e non auditata** per la cosa che protegge i messaggi privati. È il costo principale, ed è dichiarato sopra.
- Il bundle del client web cresce. **Misurato il 2026-08-26 sulla build vera**: 176 kB gzip contro 130,63, cioè **+45 kB** — non i +96 che [S1](../spike/S1-ts-mls-sotto-la-csp.md) aveva stimato con esbuild, perché Vite fa tree-shaking meglio di quella sonda. Il conto vero si vedrà quando l'interfaccia userà il modulo: finché nessuno lo importa, sparisce dal bundle.
- Il taglio netto è irreversibile per il trasporto: dopo la ritirata, una busta `ESTIA-E2E-v1` non si riapre più se non è passata dall'archivio.
- M7 resta ferma finché il nodo React Native non è sciolto — ed è una dipendenza che questa decisione crea.

### Neutre

- [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md) **resta valido e accurato finché `ESTIA-E2E-v1` è in servizio**, e diventa storia il giorno del taglio netto. La sua §«Che cosa non copre» descrive quello che gira oggi, e va letta come tale fino ad allora.

## Come si verifica

1. La CSP servita resta `script-src 'self'`, senza `wasm-unsafe-eval`: un test sugli header lo blocca, come già fa `static.test.ts` per il resto.
2. I vettori RFC 9420 girano nella nostra suite, non solo in quella di monte: se un aggiornamento della libreria li rompe, deve fallire da noi.
3. Il test di M6 sull'assenza di testo in chiaro in database e backup resta, e continua a passare.
4. Un test verifica che **nessuna chiave di trasporto** finisca in `key_backups` o in qualunque altro deposito lato istanza ([ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md)).
5. Un test verifica che un dispositivo nuovo, con la sola passphrase, **non** decifri il trasporto delle epoch precedenti: la forward secrecy dev'essere reale, non dichiarata.
6. Dopo il taglio netto, **nessun codice `ESTIA-E2E-v1` resta nel percorso principale**. Se resta, la milestone non è completa ([`AGENTS.md`](../../AGENTS.md)).

## Quando riesaminare

- **Se lo spike del punto 1 mostra che l'ingresso esterno non si può autenticare** con la libreria scelta, questa decisione va riaperta prima di scrivere codice: il rientro autonomo è la proprietà che rende il disegno praticabile, e non vale una porta aperta.
- **Se `ts-mls` smette di essere mantenuta**, o se un aggiornamento rompe i vettori RFC. La versione è fissata apposta perché questo si veda.
- **Se React Native resta impraticabile** anche dopo lo spike: allora il client mobile e il web divergono sul protocollo, e questa decisione va rivalutata insieme al perimetro di M7 — non da sola.
- **Prima che ESTIA esca dal pilot**, l'assenza di un audit indipendente va rimessa sul tavolo. Fra persone che si conoscono è un rischio accettato; per un prodotto offerto a chi non ha quella fiducia, è una domanda diversa.
