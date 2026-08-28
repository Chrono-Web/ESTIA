# ADR 0039 — MLS attraversa le istanze, oppure il taglio netto aspetta

- Stato: **Accepted** — decisa dal proprietario il 2026-08-27: **strada B**, prima MLS attraversa e poi si taglia
- Data: 2026-08-26
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0018](0018-federazione-fra-istanze-estia.md), [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0029](0029-un-messaggio-si-consegna.md), [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md), [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md)
- Blocca: il punto 4 di [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md), «la ritirata di `ESTIA-E2E-v1`»
- Attuata da: [ADR 0042](0042-come-mls-attraversa.md), che decide **come** si attraversa — sei operazioni, una casa che mette in fila, e la credenziale che porta la casa

## Contesto

[ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) decide un **taglio netto**: non si mantengono due protocolli, e la sua verifica 6 dice che dopo il passaggio «nessun codice `ESTIA-E2E-v1` resta nel percorso principale». Quella decisione è stata presa guardando il client web, e **non si è accorta della federazione**.

Oggi una conversazione privata fra due case funziona: `ESTIA-E2E-v1` cifra, e due operazioni del protocollo fra istanze la reggono — `chiavi`, che va a prendere il KeyPackage del corrispondente in casa sua, e `messaggio`, che consegna la busta ([ADR 0029](0029-un-messaggio-si-consegna.md)). È il gate ancora aperto di M6: «due case, due persone, una conversazione che attraversa».

**MLS non attraversa.** Quello che è stato costruito per MLS vive tutto dentro una sola istanza:

| oggetto                        | dove sta                                       | federa? |
| ------------------------------ | ---------------------------------------------- | ------- |
| busta del messaggio            | `messaggi`, e in uscita                        | **sì**  |
| canale di handshake            | `conversazione_handshake` (m26)                | no      |
| `GroupInfo`, punto di rientro  | `conversazione_group_info` (m24)               | no      |
| voci d'archivio                | `conversazione_archivio` (m25)                 | no      |
| mazzo delle chiavi d'archivio  | `conversazione_archivio_chiavi`                | no      |
| registro delle chiavi di firma | `device_keys`, via `GET …/di/:username/chiavi` | no      |

Il commit e il Welcome che fanno nascere un gruppo MLS non lasciano la casa di chi li deposita. Ne segue una cosa sola, e va detta senza attenuazioni: **il giorno del taglio netto, una conversazione con una persona di un'altra casa smette di funzionare.** Non «funziona peggio»: non parte proprio, perché il Welcome non arriva mai a destinazione.

## Perché non è «bastano cinque operazioni in più»

Aggiungere cinque messaggi al protocollo di [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) è la parte facile. Le domande che restano toccano i confini di fiducia, ed è per questo che questo è un ADR e non una funzione.

1. **Il registro delle chiavi è di chi ospita, e adesso ce ne sono due.** L'`AuthenticationService` di [S4](../spike/S4-autenticare-chi-entra.md) ferma l'estraneo fidandosi di `device_keys`. Per un membro remoto quel registro è di **un'altra** istanza: la validazione diventa «mi fido che la casa di Bruno dica la verità su Bruno». Non è assurdo — [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) costruisce già rapporti fra istanze — ma è una fiducia nuova, che va dichiarata, e allarga esattamente il limite 4 di [ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md). Il rimedio resta lo stesso, ed è più urgente qui: il **numero di sicurezza** confrontato a voce.

2. **Chi può depositare un handshake in casa d'altri?** Un commit va a tutti i membri; un Welcome a uno solo. Lato locale il diritto viene dall'essere membro della conversazione. Lato remoto chi chiede è un'istanza, non una persona ([ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md) §1: l'identità è la chiave della connessione), e serve una regola che dica **quale istanza può scrivere sul canale di quale conversazione**. Senza, il canale di handshake è un posto dove chiunque abbia un rapporto può infilare buste.

3. **L'ordine è il protocollo.** MLS applica i commit **in sequenza**: il canale li serve per ordine di arrivo, e saltarne uno spacca lo stato del gruppo. Con due istanze ci sono due ordini di arrivo, e devono coincidere. È il problema più tecnico dei cinque e anche quello che si sbaglia più facilmente, perché in laboratorio non si vede: si vede in campo, quando due persone scrivono insieme.

4. **L'archivio è della conversazione, ma le conversazioni sono due.** Ogni istanza ha la sua riga in `conversazione_membri` e conserverebbe le sue voci. [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md) §3 dice che l'archivio è **della conversazione**: o le voci si replicano — e allora è una deroga a [ADR 0018](0018-federazione-fra-istanze-estia.md) come quella di [ADR 0029](0029-un-messaggio-si-consegna.md), da scrivere — oppure ognuno tiene la sua metà e la cronologia è diversa a seconda di dove la guardi. E il mazzo, che ha una regola di epoch che non torna indietro, con due copie ha due regole.

5. ~~**Una misura, non un'ipotesi: le buste non ci stanno.**~~ **Chiuso il 2026-08-28 da [S5](../spike/S5-quanto-pesa-un-albero.md), e la risposta è «non cambia niente»**: un Welcome cresce di 262 byte per foglia, a cinquanta foglie occupa 17 932 caratteri contro un tetto di 65 536, e il primo tetto vero si incontra a ~187 foglie. Il tetto non va alzato e il disegno non cambia. Il timore originale, per il verbale: La federazione accetta buste fino a **64 kB** (`MAX_BUSTA_BYTES`); il canale di handshake locale ne accetta **256 kB** (`MAX_HANDSHAKE_CHARS`), e la differenza non è capricciosa — un Welcome porta l'albero del gruppo con sé. [S3](../spike/S3-il-rientro-di-un-dispositivo.md) ha misurato 1143 byte di `GroupInfo` per un gruppo da due e non ha misurato niente su gruppi grandi. Il tetto della federazione va rivisto sapendo quanto pesa davvero un albero, non prima.

## Le tre strade

**A — Si taglia adesso, e la schermata lo dice.** Le conversazioni della stessa casa passano a MLS; quelle fra istanze diventano **non disponibili**, con un messaggio che dice perché e non con un errore. Rispetta il punto 4 e la verifica 6 di [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md), ed è coerente con «adesso è il momento più economico»: sul campo i dati veri sono pochi o nessuno.
_Costo:_ si ritira una capacità costruita mentre il gate di M6 è ancora aperto. Il gate chiede una conversazione che attraversa, e per un po' non ce ne sarebbe nessuna.

**B — Prima MLS attraversa, poi si taglia.** Si scrivono le cinque operazioni e si sciolgono i cinque nodi qui sopra; il taglio arriva dopo.
_Costo:_ `ESTIA-E2E-v1` resta in servizio più a lungo, con i suoi quattro limiti, e il client web resta senza MLS nel frattempo. È il lavoro più lungo delle tre, ed è quello che nessuna delle altre due evita: prima o poi va fatto comunque, perché il punto 5 delle milestone successive è **gruppi che attraversano le istanze**.

**C — Taglio locale, remoto invariato.** Stessa casa su MLS, fra case su `ESTIA-E2E-v1` finché non federa.
_Costo:_ due protocolli vivi insieme, che è precisamente ciò che il punto 4 di [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) rifiuta, e un doppio percorso dentro `Messaggi.tsx` — la schermata che quella decisione voleva semplificare. In più: una conversazione cambierebbe garanzie a seconda di chi c'è dall'altra parte, senza che nessuno lo veda.

## Decisione

**Si sceglie B: prima MLS attraversa le istanze, poi si taglia.**

La ragione non è la prudenza: è che il lavoro di B **non si evita**. I gruppi che attraversano le istanze sono il punto 5 delle milestone successive e sono il caso d'uso per cui MLS è stato scelto — membri su server diversi che non si fidano l'uno dell'altro. A rimanda quel lavoro pagandolo con una capacità ritirata; C lo rimanda pagandolo con due protocolli da mantenere e una promessa che cambia forma senza dirlo.

**E il 2026-08-27 quella capacità ha smesso di essere ipotetica.** La metà difficile del gate di M6 è passata sul campo: due case vere, due persone vere, una conversazione che attraversa. La strada A avrebbe ritirato esattamente quella, il giorno dopo averla vista funzionare.

### Che cosa questa decisione obbliga a fare

1. **`ESTIA-E2E-v1` resta in servizio più a lungo**, con i suoi cinque limiti dichiarati ([ADR 0036](0036-estia-e2e-v1-e-il-debito-verso-mls.md)), e il client web resta senza MLS nel frattempo. È il costo, ed è accettato.
2. **Il punto 4 di [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) non si chiude** finché le cinque operazioni non attraversano. Il taglio netto resta la meta, non il prossimo passo.
3. **Si comincia da una misura, non da codice.** Il nodo 5 di §«Perché non è bastano cinque operazioni in più» lo dice già: il tetto della federazione va rivisto **sapendo quanto pesa davvero un albero**, e oggi l'unico dato è 1143 byte per un gruppo da due. Se un Welcome su un gruppo realistico non sta in una busta federata, cambia il disegno e non il numero — quindi si misura prima.
4. **Il nodo 3 — l'ordine dei commit — si progetta prima di scriverlo.** È l'unico dei cinque che in laboratorio non si vede: si vede in campo, quando due persone scrivono insieme, ed è tardi.

## Come si verifica

1. Una conversazione fra due istanze nasce, porta un messaggio in entrambe le direzioni, e il testo in chiaro non compare in **nessuno** dei due database né nei backup `age`.
2. Due commit depositati insieme dalle due parti arrivano nello stesso ordine a tutti: è il punto 3, e va provato con due istanze vere, non con un doppio.
3. Un membro remoto la cui chiave non è nel registro della sua casa **non entra**: l'`AuthenticationService` regge anche attraversando.
4. Il peso di un Welcome e di un `GroupInfo` è misurato su un gruppo di dimensione realistica, e il tetto della federazione è fissato **dopo** quella misura.
5. La cronologia letta da una casa e dall'altra è la stessa.

## Quando riesaminare

- **Se si sceglie A**, prima del gate di M6: il gate chiede una conversazione che attraversa, e non si chiude senza questa decisione risolta.
- Se il peso degli alberi su gruppi veri rende impraticabile il trasporto di un Welcome intero, va riaperto **come** l'albero attraversa — non se.
- Insieme al numero di sicurezza: il punto 1 rende la verifica fuori banda più necessaria di quanto già non fosse, perché i registri di cui fidarsi diventano due.
