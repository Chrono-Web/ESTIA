# Accedere da fuori casa

ESTIA vive sulla rete locale: si installa e si usa senza dominio, senza certificati e senza aprire porte sul router ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)). Questo documento riguarda il caso in più — leggere la bacheca del quartiere dal treno — ed è **additivo**: un'istanza che non fa niente di tutto questo funziona, per tutti, dentro casa.

Il modo in cui un browser raggiunge l'istanza è **uno strato separato e sostituibile** ([ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md)): API e interfaccia sono identiche in tutti i casi. Per il pilot quello strato è **Tailscale**, cioè un'azienda terza. Dichiararlo a chi partecipa è parte della decisione, non una cortesia: è metà del motivo per cui questo documento esiste.

> **Come è nata questa pagina, perché conta.** [`INSTALLAZIONE.md`](INSTALLAZIONE.md) nasce da installazioni andate storte, ed è per questo che è affidabile. Questa no: i passaggi qui sotto vengono dalle pagine pubbliche di Tailscale, lette il 2026-08-19, più **una sola misura sul campo** (§6). Finché qualcuno non la percorre e non dice dove si è bloccato, va letta come una traccia da verificare, non come una guida provata. La differenza è la stessa che questo progetto ha già pagato due volte.

## 1. Che cosa cambia, e che cosa no

Non cambia niente dentro l'istanza. Non si tocca il `docker-compose.yml`, non si apre una porta sul router, non serve un dominio. Cambia solo **da dove arriva** il browser: prima solo dalla rete di casa, ora anche dalla rete privata.

E soprattutto: **il trasporto non è l'identità.** Essere sulla rete privata non rende nessuno membro dell'istanza. Chi arriva trova la stessa schermata d'ingresso, e serve lo stesso invito di sempre. Il trasporto porta il pacchetto fino alla porta; chi apre la porta è ESTIA.

L'istanza, dal canto suo, se ne accorge e lo dice a chi sta attraversando quel confine: chi arriva da fuori vede in cima alla pagina che i contenuti restano cifrati fino all'istanza, ma che chi gestisce quella rete vede comunque che si è collegato, quando e da dove. Sulla rete di casa tace.

## 2. Il trasporto va sulla macchina, non attorno all'istanza

Tre modi di mettere la macchina sulla rete privata, in ordine di preferenza.

| Modo                                    | Per chi                                      | Come                                                                                                         |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **App del NAS**                         | NAS che ha Tailscale nel centro applicazioni | Si installa dal pannello, si accede, fine                                                                    |
| **Pacchetto sulla macchina**            | Mini-PC, portatile, server Linux             | L'installatore ufficiale (`tailscale.com/install.sh`) o il pacchetto della distribuzione, poi `tailscale up` |
| **Container affiancato** (sconsigliato) | Chi non ha nessuna delle due                 | Un secondo container che condivide la rete con quello di ESTIA                                               |

Il terzo modo funziona, ed è documentato da Tailscale, ma **lega la rete dell'istanza al trasporto**: ESTIA smetterebbe di essere raggiungibile quando quel container non parte, compreso dalla rete di casa, che è il percorso principale del prodotto. È esattamente ciò che [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) vuole evitare tenendo il trasporto fuori dalla strada critica. Con Tailscale sulla macchina, invece, i due percorsi convivono senza sapere l'uno dell'altro: dalla rete di casa `http://IP-locale:3000`, da fuori il nome della macchina sulla rete privata.

Perché il percorso da fuori funzioni, la porta dell'istanza deve essere pubblicata su `0.0.0.0` e non su `127.0.0.1` — è già la regola del passo 5 di [`INSTALLAZIONE.md`](INSTALLAZIONE.md), per la stessa ragione.

**Da non fare: annunciare la rete di casa** (`--advertise-routes`). Trasformare la macchina in un router verso la LAN consegna al dispositivo remoto tutta la casa — la stampante, la telecamera, il pannello del NAS — quando serviva una porta sola. Il minimo privilegio qui è gratis: non farlo.

**La trappola del semestre.** La chiave di un nodo scade, per impostazione predefinita, dopo **180 giorni**: passati quelli l'istanza sparisce dalla rete privata finché qualcuno non rifà l'accesso sulla macchina. Da casa continua a funzionare, il che rende il guasto ancora più confuso. Si disattiva la scadenza per quella macchina dalla console di amministrazione, oppure ci si segna la data.

## 3. Far entrare un membro

Due strade, e non sono equivalenti.

**Condividere la singola macchina** è quella giusta. Il membro riceve un invito e ottiene accesso **solo a quella macchina**, non al resto della rete di casa e non agli altri dispositivi. La macchina condivisa resta per giunta in quarantena: può rispondere a chi la cerca, non può iniziare connessioni verso i dispositivi del membro — che per un server che serve pagine è esattamente il comportamento voluto. Il membro deve avere un proprio account Tailscale, gratuito, ed essere titolare della propria rete privata; l'invito inutilizzato scade dopo 30 giorni.

**Aggiungere il membro come utente della propria rete privata** è la strada sbagliata: gli dà, salvo regole scritte a mano, la visibilità su tutti i dispositivi di quella rete, e il piano gratuito si ferma a sei utenti. Un quartiere non ci sta, e non ci dovrebbe stare comunque.

Fatto questo, il membro apre `http://nome-macchina.nome-rete.ts.net:3000` e trova ESTIA. Da lì in poi vale l'ingresso di sempre: invito, ammissione, sessione.

## 4. Le revoche sono due, e non si sostituiscono

| Che cosa revochi          | Dove                                    | Che cosa ottieni                                                      |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| **L'accesso all'istanza** | Pannello di amministrazione di ESTIA    | La persona non entra più, da nessuna rete, nemmeno da casa            |
| **Il trasporto**          | Console di amministrazione di Tailscale | La persona non raggiunge più la macchina da fuori, ma l'account resta |

Revocare solo il trasporto lascia in piedi un account valido: da dentro casa quella persona entra ancora. Revocare solo l'istanza lascia raggiungibile la schermata d'ingresso, che è poco, ma non è niente. **Chi esce dalla comunità va tolto da entrambi**, e l'ordine giusto è prima l'istanza, che è quella che custodisce i contenuti.

Il budget dichiarato per la revoca è **60 secondi** ([`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4). Per l'istanza la revoca delle sessioni è provata dai test. Per il trasporto **non è misurata**: è una delle voci aperte di M4, e finché quella misura non esiste il tempo reale di perdita dell'accesso da fuori non lo conosce nessuno.

## 5. Che cosa vede il terzo

Verificato il 2026-08-19 sulle pagine pubbliche di Tailscale; le fonti sono in §10. Vale per il trasporto del pilot, non per un trasporto futuro.

| Componente                             | Che cosa vede                                                                                              | Che cosa conserva                 | Per quanto     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------- |
| Server di coordinamento (Tailscale)    | Chiavi **pubbliche** dei nodi, nome e sistema operativo del dispositivo, indirizzo IP pubblico, orari      | Sì                                | Non dichiarato |
| Registro del traffico fra nodi         | Quale dispositivo si è collegato a quale, quando, quanto                                                   | Sì                                | Non dichiarato |
| Relay DERP, quando il diretto fallisce | Pacchetti **cifrati** e gli indirizzi dei due capi                                                         | Dichiara di non registrare i dati | —              |
| Contenuti di ESTIA                     | Niente: il traffico è cifrato da un dispositivo all'altro, e l'azienda dichiara di non poterlo ispezionare | —                                 | —              |
| Account del membro                     | Nome ed email dell'identità con cui si è registrato                                                        | Sì                                | Non dichiarato |

Tre cose vanno dette per intero, perché sono quelle che un partecipante ha il diritto di sapere prima di installare qualcosa.

1. **Le chiavi private non escono dai dispositivi**, e i contenuti non sono leggibili dal terzo: su questo la documentazione è esplicita, e l'architettura (WireGuard fra i due capi) lo rende una proprietà, non una promessa.
2. **I metadati sì.** Chi si collega a chi, da quale indirizzo e a che ora è precisamente ciò che un server di coordinamento deve sapere per fare il suo mestiere. Non è un difetto dell'implementazione: è il confine di fiducia 4 di [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §1, ed è il motivo per cui quel confine è dichiarato «terzo dichiarato e sostituibile».
3. **Per quanto li conservi non è scritto.** La politica sulla riservatezza dice che i dati si tengono per il tempo necessario alle finalità per cui sono raccolti, senza indicare un numero. Chi partecipa al pilot lo deve sapere così com'è: senza un termine dichiarato.

E una che riguarda ESTIA più di Tailscale: **ogni membro apre un account con un'azienda terza**, cioè fa esattamente la cosa che questo progetto esiste per rendere non necessaria. Per un pilot è un compromesso accettabile e temporaneo. Come architettura definitiva sarebbe una contraddizione, ed è per questo che la scelta del trasporto definitivo è una voce aperta di M4 e non una casella spuntata.

## 6. Che cosa è stato misurato davvero

Una sola volta, il 2026-08-13, durante lo spike M0.2, con il servizio commerciale e non con un control plane proprio. Il dettaglio è in [ADR 0001](adr/0001-private-network-control-plane.md), evidenze 4–6.

- Un iPhone su rete mobile ha raggiunto la rete di casa per **percorso diretto**, senza relay: 20 pacchetti, 0% di perdita, 151 ms medi. Su quella classe di linee i contenuti non passano da infrastruttura di terzi.
- **Il risveglio costa**: a telefono bloccato da un minuto la media raddoppia a 277 ms e il primo pacchetto arriva dopo 1,28 s.
- La latenza di base dipende dall'operatore, non dalla topologia.

Non è stato misurato — ed è l'elenco delle voci aperte di M4: il comportamento **sotto CGNAT** su una linea reale, il **tempo di revoca**, Android, un **membro vero su una macchina condivisa**, e quanto costa scaricare fotografie attraverso il tunnel.

## 7. Il prezzo, detto in chiaro

- Ogni membro installa un componente su ogni dispositivo e apre un account con un terzo.
- Quel terzo sa chi si collega a chi e quando, e non dichiara per quanto lo conserva.
- Se cambia condizioni o smette, questo percorso si spegne: per questo è uno strato e non un'architettura.
- L'alternativa, l'esposizione pubblica, ha un prezzo misurato e più alto: sette passaggi tecnici, dominio, certificato e port forwarding ([ADR 0001](adr/0001-private-network-control-plane.md)), oltre a un'istanza raggiungibile da chiunque.
- La strada che non costa niente resta la prima: **da casa non serve niente di tutto questo.**

## 8. HTTPS sul nome della rete privata, se lo vuoi

Tailscale sa ottenere un certificato Let's Encrypt per il nome `.ts.net` della macchina. Serve a una cosa sola ma non piccola: con `https://` il browser considera l'origine sicura, e tornano disponibili notifiche, fotocamera, funzionamento offline e installabilità, che con `http://` su un indirizzo di rete non ci sono ([ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md)).

Il prezzo è pubblico, letteralmente: ogni certificato finisce nei registri di **Certificate Transparency**, e il nome della macchina con esso. Il nome della rete privata è una stringa casuale, il nome della macchina no — se lo hai chiamato come il quartiere, quel nome diventa pubblico. Tailscale stessa sconsiglia di attivare la funzione se i nomi delle macchine dicono qualcosa.

Non è necessario per leggere la bacheca. È opzionale, e si può decidere dopo.

## 9. Quando qualcosa non va

| Sintomo                                                      | Che cosa sta succedendo                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Da casa si apre, da fuori no                                 | Il trasporto non è attivo sulla macchina, o la porta è pubblicata su `127.0.0.1`            |
| Funzionava, ha smesso dopo mesi, da casa va ancora           | Chiave del nodo scaduta: 180 giorni, §2                                                     |
| Il nome `.ts.net` non risolve                                | Risoluzione dei nomi della rete privata disattivata: usa l'indirizzo `100.x.y.z`            |
| Il membro vede la macchina ma il browser non apre niente     | La porta 3000 non è raggiungibile da quella rete, o una regola di accesso la blocca         |
| L'istanza dice «né della rete di casa né della rete privata» | Sei arrivato senza il trasporto: o l'istanza è esposta su Internet, o c'è un proxy in mezzo |

Un limite di quest'ultimo messaggio, dichiarato invece che nascosto: l'istanza riconosce la rete privata dallo spazio di indirizzi `100.64.0.0/10`, che è quello delle mesh VPN e insieme quello del CGNAT degli operatori. È un'inferenza dal solo indirizzo del socket, non una certezza.

## 10. Fonti

Pagine pubbliche di Tailscale, lette il 2026-08-19.

- https://tailscale.com/security
- https://tailscale.com/privacy-policy
- https://tailscale.com/kb/1084/sharing
- https://tailscale.com/kb/1085/auth-keys
- https://tailscale.com/kb/1011/log-mesh-traffic
- https://tailscale.com/kb/1153/enabling-https
- https://tailscale.com/kb/1282/docker
