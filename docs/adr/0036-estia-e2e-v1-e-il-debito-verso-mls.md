# ADR 0036 — `ESTIA-E2E-v1`, e il debito verso MLS

- Stato: **Accepted** — decisa dal proprietario il 2026-08-26
- Data: 2026-08-26
- Proprietario: progetto ESTIA
- Sostituisce: [ADR 0027](0027-la-libreria-mls.md), che descriveva un'implementazione MLS che non è stata costruita
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md), [ADR 0032](0032-payload-messaggi-strutturato-e2e.md), [ADR 0033](0033-ri-derivazione-chiavi-messaggi-e2e.md)
- Attua: Milestone M6 (I messaggi privati E2E)
- Debito incassato da: [ADR 0038](0038-mls-si-adotta-e-si-comincia-dal-web.md) il 2026-08-26. Questo ADR **resta valido e accurato finché `ESTIA-E2E-v1` è in servizio** — la sua §«Che cosa non copre» descrive quello che gira oggi — e diventa storia il giorno del taglio netto.

## Contesto

Il 2026-08-22 l'[ADR 0027](0027-la-libreria-mls.md) ha registrato una decisione precisa: framing e ratchet **MLS su standard RFC 9420**, con «i messaggi, i KeyPackage, le epoch del gruppo e i Welcome packet» conformi alle strutture dati binarie della specifica, e i DM 1:1 come gruppi MLS da due membri.

Una revisione del codice del 2026-08-26 ha trovato che **niente di tutto questo esiste**. Non c'è una dipendenza MLS in nessun `package.json`; non c'è codice di framing RFC 9420, non ci sono epoch, non ci sono Welcome packet, non c'è ratchet. La cartella `apps/web/src/mls/` contiene un modulo che di MLS ha solo il nome.

Quello che è costruito e funziona è un'altra cosa, che [ADR 0035](0035-crittografia-e2e-su-react-native.md) ha già chiamato con il suo nome — `ESTIA-E2E-v1` — senza però registrare che quel nome sostituiva MLS invece di attuarlo.

Questo ADR chiude la distanza fra i due documenti nell'unico modo onesto: descrivendo che cosa c'è, dichiarando che cosa non c'è, e lasciando MLS dove sta, cioè davanti.

L'[ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md) §«Quando riesaminare» prevedeva la riapertura esplicita «se una libreria MLS matura non risulta utilizzabile sulle piattaforme di ESTIA», con due sole uscite: un altro protocollo standard, oppure niente chat. **Quello che è successo è una terza strada, che ADR 0006 non aveva previsto**: non una libreria mancante e non il testo in chiaro, ma una composizione di primitive standard costruita in casa. Questo ADR è la riapertura esplicita che ADR 0006 chiedeva.

## Che cosa è `ESTIA-E2E-v1`

Descritto come è nel codice, non come si vorrebbe che fosse.

1. **Identità del dispositivo.** Ogni dispositivo genera due coppie di chiavi NIST P-256: una di firma (`sig`, ECDSA) e una di scambio (`kx`, ECDH). Le pubbliche viaggiano insieme, in SPKI, dentro un JSON `{kx, sig}` codificato in Base64. Le private restano sul dispositivo — IndexedDB nel browser, Keychain sul telefono ([ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)).
2. **Chiave di conversazione.** ECDH **statico-statico** fra la propria chiave `kx` e la `kx` del dispositivo del corrispondente. La chiave AES-GCM-256 è **la coordinata X grezza** del punto condiviso, presa direttamente, **senza alcun KDF**.
3. **Messaggio.** Il payload strutturato di [ADR 0032](0032-payload-messaggi-strutturato-e2e.md) (`{v, text, replyTo?}`) in JSON, cifrato AES-GCM-256 con IV casuale da 12 byte. La busta è `base64(IV ‖ ciphertext ‖ tag)`.
4. **Backup delle chiavi.** PBKDF2-SHA256 a 600.000 iterazioni sulla passphrase del membro, poi AES-GCM-256; il blob si deposita sul server, che non conosce la passphrase ([ADR 0028](0028-il-dispositivo-portatore-di-chiavi.md)).
5. **Il server.** Conserva la busta, i KeyPackage e il blob di backup. Non possiede chiavi private dei membri e non decifra mai niente.

Le primitive sono standard e mature — WebCrypto nel browser, `@noble/*` sul telefono, entrambe verificate interoperabili byte per byte. **Il protocollo che le tiene insieme, no**: quello è di casa, e questo ADR lo dice invece di lasciarlo dietro il nome di uno standard.

## Decisione

1. **`ESTIA-E2E-v1` è la crittografia dei messaggi privati di ESTIA, oggi**, così come descritta qui sopra. Nessun documento del progetto deve più dichiararla MLS o RFC 9420.
2. **I quattro limiti della §«Che cosa non copre» vanno dichiarati dove una persona li incontra**, non solo qui. Un'interfaccia che disegna un lucchetto senza dire che cosa non protegge è peggio di una che non lo disegna.
3. **MLS resta l'obiettivo**, non come aspirazione generica ma come debito con una condizione d'incasso scritta nella §«Quando riesaminare».
4. **Non si aggiungono i gruppi su questo protocollo.** Il punto 5 delle milestone successive — i gruppi che attraversano le istanze — non è raggiungibile da `ESTIA-E2E-v1` senza cambiare protocollo, ed è la ragione per cui MLS era stato scelto. Costruire i gruppi qui sopra vorrebbe dire costruirli due volte.

## Che cosa questa decisione copre, e che cosa no

Detto con la stessa precisione di [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), perché «i messaggi sono cifrati» da solo sarebbe vero e insufficiente.

**Copre: il contenuto dei messaggi, davanti a chi ospita.** Chi amministra il NAS smista buste chiuse. Nel database c'è solo la busta — è verificato da un test, non dedotto. Vale anche per i backup e per l'istanza dall'altra parte, quando il messaggio attraversa ([ADR 0029](0029-un-messaggio-si-consegna.md)).

**Non copre, e finora non era scritto da nessuna parte:**

1. **Forward secrecy: non c'è.** La chiave di una conversazione è una funzione pura delle due chiavi di dispositivo, e non ruota mai. Chi ottiene una chiave privata oggi apre **tutto il passato e tutto il futuro** di quella conversazione. È esattamente ciò che il ratchet di MLS esiste per impedire, ed è la differenza più costosa fra quello che ADR 0027 dichiarava e quello che c'è.
2. **Nessun KDF sull'uscita dell'ECDH.** La coordinata X diventa chiave AES direttamente. Non è di per sé una falla sfruttabile — le due parti concordano e il materiale è uniforme — ma è uno scostamento da ogni pratica corrente: RFC 9420, HPKE (RFC 9180) e il protocollo di Signal fanno tutti passare l'uscita ECDH per un KDF con legame al contesto. Nel progetto un HKDF esiste già, ma solo per la chiave di rete dell'istanza (`apps/core-api/src/instance/identity.ts`).
3. **La chiave non è legata alla conversazione.** La derivazione riceve soltanto le due chiavi di dispositivo: due conversazioni diverse fra la stessa coppia di dispositivi ottengono la **chiave identica**.
4. **Nessuna verifica fuori banda delle chiavi.** È l'istanza a distribuire i KeyPackage, e niente permette a chi scrive di controllare che la chiave ricevuta sia davvero quella del dispositivo del corrispondente: nessuna impronta da confrontare, nessun numero di sicurezza, nessuna schermata di verifica. **Un'istanza compromessa — o chi la amministra — può sostituire una chiave e leggere da quel momento in poi.** Questo limite non lo chiuderebbe MLS da solo: richiede un servizio di autenticazione, ed è un debito suo.

   **Precisato il 2026-08-26 da [S4](../spike/S4-autenticare-chi-entra.md).** Il servizio di autenticazione ferma l'**estraneo** e va montato comunque — senza, con MLS chiunque ottenga un `GroupInfo` entra come chi vuole. Ma **non ferma chi ospita**, perché si fonda sul registro dei dispositivi, che è dell'istanza: provato facendo entrare un'istanza ostile come «anna» attraverso la validazione. Sono due minacce diverse. La seconda si chiude soltanto **fuori banda**, con un numero di sicurezza che le due persone confrontano su un canale che l'istanza non controlla — e lo spike ha verificato che quel numero è identico per entrambe e cambia quando la chiave viene sostituita.

**Un quinto limite, trovato il 2026-08-27 e non elencato qui sopra: `ESTIA-E2E-v1` è a un dispositivo per persona.** `claimKeyPackageForUser` consegna a chi scrive **una** chiave, la più recente del destinatario, quindi un messaggio si cifra per un dispositivo solo: aprire ESTIA da un secondo dispositivo spegne il primo, che resta loggato e non riceve più. Non era fra i quattro perché il multi-dispositivo non era nel disegno. MLS lo risolve — un dispositivo è una foglia dell'albero — ma chi possa aggiungere una foglia a nome di un membro è una scelta di prodotto, ed è [ADR 0040](0040-un-membro-ha-piu-di-un-dispositivo.md).

**Non copre, e già era scritto:** l'esistenza delle conversazioni ([ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md)). Chi ospita vede chi parla con chi, quando, e quanto.

## Conseguenze

### Positive

- I documenti smettono di promettere una garanzia che il codice non dà. Era la conseguenza peggiore di ADR 0027: non il protocollo debole, ma il protocollo debole **descritto come forte**.
- `ESTIA-E2E-v1` è semplice, interoperabile fra web e client nativi, e non chiede né WebAssembly né estensioni alla CSP (`script-src 'self'` resta rigoroso, come voleva [ADR 0010](0010-client-web-spa-statica.md)).
- Il gate di M6 può essere valutato per quello che copre davvero.

### Negative

- Si accettano per ora i quattro limiti qui sopra. Il primo e il quarto sono seri e vanno detti a chi usa il prodotto.
- La cartella `apps/web/src/mls/` continua a chiamarsi così. Rinominarla è codice, non documentazione: resta come debito dichiarato, da chiudere alla prima occasione che tocca quel modulo.
- Il punto 5 delle milestone successive (chat e gruppi) resta bloccato dietro MLS, e questa decisione non lo sblocca.

### Neutre

- Nessuna modifica al codice deriva da questo ADR: registra lo stato, non lo cambia.
- Il prezzo che la forward secrecy fa pagare alla cronologia è deciso a parte, in [ADR 0037](0037-la-cronologia-e-un-archivio-non-una-chiave.md).
- [ADR 0032](0032-payload-messaggi-strutturato-e2e.md), [ADR 0033](0033-ri-derivazione-chiavi-messaggi-e2e.md) e [ADR 0035](0035-crittografia-e2e-su-react-native.md) restano validi: descrivevano già `ESTIA-E2E-v1` e non MLS.

## Come si verifica

1. Nessun file del progetto — documento, commento o identificatore — dichiara MLS o RFC 9420 come implementato. Le occorrenze legittime restano tre: la storia in ADR 0027, l'obiettivo qui, e il vincolo in [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md).
2. Il test che verifica l'assenza del testo in chiaro nel database resta e continua a passare.
3. Un test blocca l'interoperabilità della derivazione fra i client: la chiave ottenuta da `@noble/curves` e quella ottenuta da `deriveKey` di WebCrypto devono essere gli stessi 32 byte. Oggi combaciano, e niente lo trattiene.

## Quando riesaminare

MLS torna sul tavolo, e questa decisione decade, alla **prima** di queste tre:

1. **Quando i gruppi entrano nel perimetro.** Non si costruiscono i gruppi su `ESTIA-E2E-v1`: si costruisce MLS.
2. **Quando esiste una libreria MLS matura** utilizzabile nel browser senza `wasm-unsafe-eval` e su React Native senza binding binari instabili, con licenza compatibile AGPL-3.0 ([ADR 0015](0015-licenza-agpl.md)). Era il vincolo che ha fatto deragliare ADR 0027, ed è l'unico che va misurato di nuovo, non ipotizzato. **Misurato il 2026-08-26** dallo spike [S1](../spike/S1-ts-mls-sotto-la-csp.md): `ts-mls` gira nel browser sotto `script-src 'self'` — con controllo negativo — e supera 785 vettori RFC 9420, ma **non gira su React Native** (il KEM passa da `@hpke/core`, che richiede WebCrypto) e **non ha un audit di sicurezza formale**. Metà condizione soddisfatta.
3. **Quando ESTIA esce dal pilot.** I quattro limiti sono accettabili fra persone che si conoscono e che si fidano di chi ospita. Non lo sono per un prodotto che si offre a chi non ha nessuna di queste due cose.

Se nessuna delle tre si avvera, la decisione resta e i limiti restano scritti. Quello che non è più ammesso è che restino **non** scritti.
