# Baseline di sicurezza e modello delle minacce

- Data: 2026-08-14
- Milestone: M0.4
- Vincolante per: M1.2 e successive

Questo documento fissa che cosa ESTIA protegge, da chi, e con quali mezzi. Le decisioni qui dentro sono requisiti per le milestone che seguono, non raccomandazioni.

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

## 4. Permessi su file e directory

Decisione, applicata dal codice e verificata da test:

| Percorso                    | Permessi | Perché                                          |
| --------------------------- | -------- | ----------------------------------------------- |
| Directory dei dati          | `0700`   | Contiene tutto                                  |
| `instance-identity.pem`     | `0600`   | Chiave privata                                  |
| `estia.db` e i file WAL/SHM | `0600`   | Da M1.2 contiene hash delle password e sessioni |

SQLite crea i file `-wal` e `-shm` con gli stessi permessi del database principale, quindi impostare il file principale è sufficiente purché avvenga prima della prima scrittura.

## 5. Modello delle minacce

| Scenario                             | Copertura attuale                                                                               | Stato                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| Attaccante da Internet               | L'istanza **non è raggiungibile da Internet**: nessuna porta esposta, nessun indirizzo pubblico | Coperto per costruzione          |
| Intercettazione del primo contatto   | Richiede presenza fisica sulla rete locale (ADR 0003)                                           | Coperto                          |
| Dispositivo ostile sulla rete locale | Può raggiungere l'istanza ma non entrare senza invito e approvazione                            | Coperto se la §2 è rispettata    |
| Furto del dispositivo di un membro   | Revoca di sessione e dispositivo                                                                | **Da implementare** in M1.2/M1.3 |
| Furto fisico del NAS                 | Cifratura del volume dati                                                                       | **Da implementare** in M3        |
| Backup sottratto                     | Backup cifrato con chiave distinta                                                              | **Da implementare** in M3        |
| Amministratore curioso               | Nessuna: vede tutto ciò che l'istanza conserva                                                  | **Scoperto, e dichiarato**       |
| Membro che abusa                     | Moderazione, blocco, rate limiting                                                              | M1.2 e M2.2                      |
| Furto del file del database          | Password protette da Argon2id; sessioni e inviti inutilizzabili perché salvati come hash        | Coperto dalle decisioni §3       |

Le due righe che restano scoperte sono le uniche promesse che ESTIA **non deve fare** finché non le mantiene: nessuna interfaccia può suggerire che l'amministratore non veda i contenuti, e nessuna può suggerire cifratura a riposo prima che M3 la fornisca.

## 6. Cifratura a riposo e backup

I permessi della §4 proteggono da altri utenti della stessa macchina. Non proteggono da chi ha il disco in mano.

### A riposo

**Strategia, in ordine di preferenza.** L'installazione guidata (M3) deve proporla e raccomandarla, non nasconderla in una pagina di documentazione:

1. **Cifratura del volume o del dataset** — LUKS su Linux e mini-PC, cifratura nativa dei volumi su Synology, QNAP e UGREEN, dataset cifrati su TrueNAS/ZFS. È la prima scelta perché copre database, media, identità e file temporanei con un solo meccanismo, ed è fuori dal codice di ESTIA.
2. **Cifratura a livello di database**, dove il volume non è cifrabile. Copre meno — i media e i temporanei restano in chiaro — e va dichiarata come parziale.
3. **Nessuna cifratura**, se l'amministratore la rifiuta. Ammesso, ma l'installazione deve dire esplicitamente che cosa resta esposto in caso di furto del dispositivo, e l'interfaccia non deve mostrare alcuna indicazione di protezione a riposo.

**Requisito:** ESTIA non implementa cifratura propria per questo strato. Usa ciò che il sistema ospite offre, e si limita a verificarlo e dichiararlo.

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

## 9. Cosa questo documento non copre

Da riprendere quando le milestone corrispondenti si aprono:

- **Cifratura end-to-end dei messaggi**: non esiste, e nessuna interfaccia può suggerire il contrario.
- **Metadati visti dal trasporto remoto**: dipende dalla scelta di M4.
- **Sicurezza del browser**: XSS, CSRF e politica dei cookie vanno decisi con il client web in M1.4.
- **Abuso federato**: fuori perimetro finché la federazione è opzionale e non implementata.
