# Baseline di sicurezza e modello delle minacce

- Data: 2026-08-14
- Milestone: M0.4
- Vincolante per: M1.2 e successive

Questo documento fissa che cosa ESTIA protegge, da chi, e con quali mezzi. Le decisioni qui dentro sono requisiti per le milestone che seguono, non raccomandazioni.

Prima di leggere il resto conviene sapere **chi decide quanta sicurezza**: la §9 stabilisce quali scelte spettano a chi amministra un'istanza e quali no.

## 1. Confini di fiducia

Dopo [ADR 0003](adr/0003-primo-contatto-in-rete-locale.md) e [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) i confini sono cinque, e sono molto più semplici del piano originario: **non c'è esposizione pubblica, non c'è autorità di certificazione, non c'è control plane di terzi.**

| #   | Confine                    | Cosa sta dentro                                                      | Chi lo controlla                      |
| --- | -------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Istanza (NAS)**          | Contenuti, account, hash delle password, chiave privata dell'istanza | L'amministratore                      |
| 2   | **Dispositivo del membro** | Token di sessione, credenziali inserite, chiave del dispositivo      | Il membro                             |
| 3   | **Rete locale**            | Canale del primo contatto                                            | Chi controlla la rete di casa         |
| 4   | **Trasporto remoto** (M4)  | Metadati di connessione                                              | Terzo dichiarato e sostituibile       |
| 5   | **Browser**                | Interfaccia e sessione attiva                                        | Il membro, e il fornitore del browser |

Il confine 1 è totale: **chi amministra il NAS vede tutto ciò che l'istanza conserva.** Non è un difetto da nascondere, è la conseguenza dell'auto-ospitalità, ed è già dichiarata in [`PRODUCT_VISION.md`](PRODUCT_VISION.md) §6.

## 2. Che cosa protegge la rete locale, e che cosa no

È la distinzione più facile da sbagliare, e sbagliarla apre l'istanza a chiunque passi in casa.

**Protegge:** il canale del primo contatto. Per intercettare lo scambio della chiave dell'istanza bisogna essere fisicamente su quella rete.

**Non protegge, e non deve mai essere usata come se lo facesse:**

- **Non autorizza.** Stare sulla LAN non rende nessuno membro. L'ammissione resta un atto esplicito: invito valido o approvazione dell'amministratore.
- **Non è una rete fidata.** Una casa contiene telecamere, televisori, elettrodomestici connessi e ospiti. Un dispositivo compromesso sulla stessa rete è un attaccante interno a tutti gli effetti.
- **Non copre le reti condivise.** Il WiFi di un bar, di un coworking o di un condominio con rete unica è una rete locale, ma non è la _tua_ rete locale.

**Requisito:** nessun endpoint concede privilegi in base all'indirizzo IP del chiamante. La provenienza dalla rete locale non è mai, da sola, una credenziale.

## 3. Inventario dei segreti

Per ciascuno: dove vive, quanto dura, e cosa succede se esce.

| Segreto                           | Dove vive                                                  | Durata                           | Se viene compromesso                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chiave privata dell'istanza**   | `instance-identity.pem`, `0600`, fuori dal database        | Per sempre                       | Chiunque può impersonare l'istanza verso i membri che l'hanno fissata. **Non è ruotabile senza che ogni membro rifaccia il primo contatto.** È il segreto più critico del sistema. |
| **Codice di configurazione**      | Solo in memoria del processo                               | Fino al setup o al riavvio       | Un estraneo sulla rete locale può rivendicare un'istanza non ancora configurata                                                                                                    |
| **Hash delle password** (M1.2)    | Database                                                   | Vita dell'account                | Attacco offline sugli hash; Argon2id lo rende costoso, non impossibile                                                                                                             |
| **Token di sessione** (M1.2)      | In chiaro sul dispositivo, **solo come hash** nel database | Scadenza + revoca                | Chi ha il token in chiaro impersona quella sessione fino alla revoca                                                                                                               |
| **Codici d'invito** (M1.3)        | **Solo come hash** nel database                            | Scadenza, uso singolo o multiplo | Un estraneo può chiedere l'ammissione; resta necessaria l'approvazione                                                                                                             |
| **Chiavi dei dispositivi** (M1.3) | Privata sul dispositivo, pubblica nel database             | Vita del dispositivo             | Il dispositivo può autenticarsi finché non viene revocato                                                                                                                          |

### Decisioni che ne derivano, vincolanti per M1.2 e M1.3

1. **Token di sessione e codici d'invito si conservano solo come hash.** Chi legge il database non deve poterne dedurre uno utilizzabile. Un furto del file del database non deve regalare sessioni valide.
2. **Argon2id per le password**, con parametri registrati nel codice e rivedibili.
3. **Ogni segreto ha una scadenza esplicita**, tranne la chiave dell'istanza.
4. **La revoca è immediata e verificabile**: la lista dei dispositivi e delle sessioni autorizzate nel database è l'unica fonte di verità, e una connessione già aperta va chiusa attivamente, non lasciata scadere.
5. **La chiave dell'istanza non è ruotabile**: va trattata come irreperibile una volta persa. La procedura di backup deve dirlo esplicitamente all'amministratore.

### Il token di sessione nel browser (deciso in M1.4)

Il client web conserva il token in `localStorage` e lo invia come intestazione `Authorization`, **non come cookie**. È una scelta con due facce, ed entrambe vanno guardate:

- **Toglie di mezzo il CSRF.** Nulla viaggia in automatico con una richiesta, quindi un sito ostile non ha nulla da cavalcare: non servono token anti-CSRF né politiche `SameSite`.
- **Espone allo XSS.** Uno script che riuscisse a girare nella pagina potrebbe leggere il token.

Il contrappeso alla seconda faccia è strutturale, non una promessa: l'istanza serve una **Content Security Policy** che vieta ogni sorgente esterna e ogni codice inline (`default-src 'self'`, nessun `unsafe-inline`, nessun `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`), il client non inietta mai HTML grezzo, e non carica nulla da terze parti — nessun font remoto, nessuno script di analisi. Un test verifica che la politica inviata non contenga mai `unsafe-inline`.

## 4. Permessi su file e directory

Decisione, applicata dal codice e verificata da test:

| Percorso                    | Permessi | Perché                                          |
| --------------------------- | -------- | ----------------------------------------------- |
| Directory dei dati          | `0700`   | Contiene tutto                                  |
| `instance-identity.pem`     | `0600`   | Chiave privata                                  |
| `estia.db` e i file WAL/SHM | `0600`   | Da M1.2 contiene hash delle password e sessioni |

SQLite crea i file `-wal` e `-shm` con gli stessi permessi del database principale, quindi impostare il file principale è sufficiente purché avvenga prima della prima scrittura.

## 5. Modello delle minacce

| Scenario                                | Copertura attuale                                                                                                                     | Stato                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Attaccante da Internet                  | L'istanza **non è raggiungibile da Internet**: nessuna porta esposta, nessun indirizzo pubblico                                       | Coperto per costruzione                   |
| Intercettazione del primo contatto      | Richiede presenza fisica sulla rete locale (ADR 0003)                                                                                 | Coperto                                   |
| Dispositivo ostile sulla rete locale    | Può raggiungere l'istanza ma non entrare senza invito e approvazione                                                                  | Coperto se la §2 è rispettata             |
| Furto del dispositivo di un membro      | Revoca di sessione e dispositivo                                                                                                      | **Da implementare** in M1.2/M1.3          |
| Furto fisico del NAS                    | Cifratura del volume con passphrase all'avvio, proposta come default ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md))      | Deciso, **da implementare** in M3         |
| Backup sottratto                        | Backup cifrato con chiave distinta conservata altrove                                                                                 | Deciso, **da implementare** in M3         |
| Amministratore legge i messaggi privati | Cifratura end-to-end obbligatoria: DM e gruppi escono E2E o non escono ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)) | Deciso; la funzionalità non esiste ancora |
| Amministratore legge il feed locale     | Nessuna, **per scelta**: il feed è la bacheca del quartiere e l'amministratore ne è membro                                            | **Scoperto, e dichiarato**                |
| Metadati delle conversazioni            | Nessuna: chi ospita vede chi parla con chi e quando, anche con E2E attiva                                                             | **Scoperto, e dichiarato**                |
| Membro che abusa                        | Moderazione, blocco, rate limiting                                                                                                    | M1.2 e M2.2                               |
| Furto del file del database             | Password protette da Argon2id; sessioni e inviti inutilizzabili perché salvati come hash                                              | Coperto dalle decisioni §3                |

Restano scoperte due righe, e sono diverse fra loro.

**Il feed locale leggibile dall'amministratore è una scelta, non una lacuna.** Cifrarlo verso un gruppo di cui l'amministratore fa parte gli darebbe una chiave, non gliela toglierebbe, e renderebbe impossibili moderazione e ricerca. La bacheca del quartiere è pubblica dentro il quartiere: va detto agli utenti, non nascosto.

**I metadati non sono eliminabili** senza costruire un sistema di anonimizzazione, che non è ciò che ESTIA fa. Con l'E2E attiva l'amministratore non legge i messaggi, ma sa che due persone si scrivono.

Queste due sono anche l'esatta misura di ciò che l'interfaccia **non può promettere**.

## 6. Cifratura a riposo e backup

I permessi della §4 proteggono da altri utenti della stessa macchina. Non proteggono da chi ha il disco in mano.

### A riposo

Decisa in [ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md), che spiega perché il punto critico non è la cifratura ma **dove sta la chiave all'accensione**.

| Livello                              | Protegge da                              | Non protegge da                      | Costo                         |
| ------------------------------------ | ---------------------------------------- | ------------------------------------ | ----------------------------- |
| **Passphrase all'avvio** — _default_ | Furto del NAS, dischi rimossi o dismessi | Chi accede al NAS acceso e sbloccato | L'istanza non riparte da sola |
| **Sblocco automatico**               | Dischi rimossi o dismessi                | Furto del NAS intero                 | Nessuno                       |
| **Nessuna cifratura**                | Nulla                                    | Tutto                                | Nessuno                       |

**Requisiti:**

1. L'installazione guidata (M3) presenta la scelta, spiega il compromesso e **propone la passphrase all'avvio come default**. Chi non decide ottiene la protezione migliore.
2. La cifratura la esegue il sistema ospite — LUKS, cifratura nativa del NAS, dataset ZFS — non ESTIA. Copre in un colpo solo database, media, identità e file temporanei.
3. L'istanza **conosce e dichiara il proprio stato reale**. Dove la verifica automatica non è possibile lo stato è «non verificabile», mai «attiva» per ipotesi, e l'interfaccia non mostra mai protezioni che non ha.

**Vincolo da ADR 0005:** `node:sqlite` è SQLite semplice e non cifra il database. La cifratura a livello di database non è quindi disponibile con la persistenza attuale; se servisse, si riapre ADR 0005 invece di improvvisare cifratura sui singoli campi.

### Backup

1. **Il backup è cifrato prima di lasciare il NAS**, con una **chiave distinta** da quella del volume e da qualunque segreto dell'istanza. Un backup sottratto deve essere un blob illeggibile.
2. **La chiave di backup si conserva fuori dall'istanza.** Se vive solo sul NAS, non protegge dallo scenario che dovrebbe coprire.
3. **Il backup include la chiave privata dell'istanza.** Senza, il ripristino produce un'istanza che i membri non riconoscono più: la §3 lo classifica come non ruotabile.
4. **Il ripristino va provato prima di servire dati reali.** Un backup mai ripristinato non è un backup.

Il punto 3 e il punto 1 sono in tensione: il backup contiene il segreto più critico del sistema, quindi la sua cifratura non è opzionale.

## 7. Log e diagnostica

Estende [`ARCHITECTURE.md`](ARCHITECTURE.md) §10 con la pratica corrente.

**Mai nei log**, in nessun livello: password, token di sessione, codici d'invito, codici di configurazione, chiavi private, corpi dei contenuti, file caricati, header di autorizzazione.

**Una sola eccezione deliberata:** il codice di configurazione del primo avvio viene scritto su `stdout` dal processo, **non attraverso il logger**. È l'unico canale disponibile per raggiungere l'amministratore prima che esista un account, e passando fuori dal logger non finisce in nessuna raccolta di log. La distinzione è implementata, non solo dichiarata.

**Requisito per M1.2:** un test verifica che un tentativo di login fallito non registri né la password né il token presentato.

## 8. Aggiornamento e rollback

- Le migrazioni sono **solo in avanti**, applicate in transazione e idempotenti. Non esistono migrazioni inverse, e non è una dimenticanza: una migrazione inversa corretta è difficile da scrivere e raramente esercitata, quindi dà una falsa sicurezza.
- **Il rollback è il ripristino da backup.** Ne consegue che la procedura di backup è un requisito di sicurezza, non solo di continuità, e va provata prima di ogni aggiornamento con dati reali.
- **La chiave dell'istanza va inclusa nel backup e conservata con la stessa cura del database.** Un ripristino senza di essa produce un'istanza che i membri non riconoscono più.
- Prima di un aggiornamento: fermare l'istanza, copiare la directory dei dati per intero, aggiornare, verificare l'avvio e lo stato dell'istanza.

## 9. Chi decide quanta sicurezza

**Quanto vuole essere protetta un'istanza lo decidono i suoi amministratori e la sua comunità, non il progetto ESTIA.** È coerente con l'auto-ospitalità: chi si prende la responsabilità di ospitare si prende anche quella di scegliere.

Il compito del prodotto non è imporre, è **mettere in condizione di scegliere davvero**:

1. presentare la scelta al momento giusto, in parole comprensibili;
2. **proporre l'opzione più protettiva come default**, così chi non decide non finisce nella configurazione peggiore;
3. dichiarare le conseguenze del rifiuto, prima e dopo;
4. non abbassare mai una protezione in silenzio, e non mostrare mai una protezione che non c'è.

[ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md) è l'applicazione di questo principio alla cifratura a riposo.

### Il confine, che è la parte importante

Il principio vale per le protezioni **dell'istanza contro il mondo esterno**. Non vale per le protezioni che esistono **per difendere i membri da chi amministra**.

| Sceglie l'amministratore                    | Non è negoziabile                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Livello di cifratura a riposo               | Cifratura end-to-end dei messaggi privati ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)) |
| Se esporre l'istanza su Internet            | Argon2id per le password ([ADR 0008](adr/0008-hashing-password-argon2id.md))                             |
| Politica di backup e dove tenerne le chiavi | Credenziali conservate solo come hash                                                                    |
| Regole della casa e moderazione             | Che l'interfaccia dica la verità su cosa è protetto                                                      |
| Chi viene ammesso, e come                   | Che la revoca funzioni davvero                                                                           |

La ragione è semplice: **chi sceglie deve essere chi corre il rischio.** Un amministratore che rinuncia alla cifratura del volume espone i dati della propria comunità, e lo fa sapendo di farlo. Un amministratore che potesse disattivare la cifratura end-to-end esporrebbe i membri **a sé stesso** — e quella non è una sua scelta da fare, perché il rischio non ricade su di lui.

Questo confine è anche una difesa contro l'uso improprio del principio. «La comunità ha deciso che non le serve» non può diventare l'argomento per togliere ai membri una protezione che li riguarda.

## 10. Cosa questo documento non copre

Da riprendere quando le milestone corrispondenti si aprono:

- **Come si implementa la cifratura end-to-end**: la decisione è presa ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)), ma libreria MLS, gestione delle chiavi sui dispositivi, verifica e backup delle chiavi vanno progettati nella milestone della chat. Finché non esiste, nessuna interfaccia può suggerire messaggi privati.
- **Metadati visti dal trasporto remoto**: dipende dalla scelta di M4.
- **Abuso federato**: fuori perimetro finché la federazione è opzionale e non implementata.
