# ADR 0004 — Client web e trasporto sostituibile

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Sostituisce: la scelta «client mobile React Native» come primo client

## Contesto

Il piano prevedeva come primo client un'app React Native con motore di rete nativo integrato (Network Extension su iOS, `VpnService` su Android). Era il pezzo più costoso e più rischioso dell'intero percorso: build native, firma, entitlement, comportamento in background, e dipendenza dagli app store.

Nel frattempo [ADR 0001](0001-private-network-control-plane.md) ha chiuso senza una soluzione di trasporto praticabile, il che rendeva quel client bloccato su una decisione non presa.

Un social network che nasce solo web non è un'anomalia: è la norma storica. E rinviare il mobile toglie dalla strada critica sia le build native sia gli app store — che restano, peraltro, il punto di spegnimento più concreto per un progetto che vuole essere difficile da fermare.

## Decisione

**Il primo client di ESTIA è un'applicazione web.** Il client mobile è una milestone successiva.

**Il modo in cui un browser raggiunge l'istanza è uno strato separato e sostituibile**, che non influenza né l'API né l'interfaccia.

### I tre modi di raggiungere un'istanza

Sono alternative operative, non varianti di prodotto: l'API e l'interfaccia sono identiche in tutti e tre.

| Modo                     | Cosa fa l'utente                                                        | Costo                                                                  |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Rete locale**          | Apre l'indirizzo dell'istanza dal browser                               | Nulla. È il caso di [ADR 0003](0003-primo-contatto-in-rete-locale.md). |
| **Trasporto di rete**    | Installa un componente che unisce il dispositivo alla rete dell'istanza | Un'installazione, una volta                                            |
| **Esposizione pubblica** | Apre un indirizzo pubblico                                              | Dominio, certificato, port forwarding                                  |

Il terzo modo resta disponibile per chi lo vuole, ma **non è il percorso previsto per l'utente ordinario**: è la strada che ADR 0001 ha misurato costare sette passaggi tecnici.

### Trasporto del pilot

Per il pilot il trasporto è **Tailscale**, come dipendenza dichiarata e sostituibile ai sensi di [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) §4. È già disponibile, ed è stato misurato sul campo il 2026-08-13: percorso diretto tra rete mobile e rete domestica, 0% di perdita, 151 ms medi.

Non è la scelta definitiva: è il modo di non scrivere codice di rete finché il prodotto non esiste. La sostituzione con un trasporto peer-to-peer basato su chiavi resta l'obiettivo, istruita in una milestone dedicata.

## Perché il trasporto può essere rinviato senza rischio

Perché il prodotto non lo vede. [`ARCHITECTURE.md`](../ARCHITECTURE.md) §8 già impone che l'interfaccia non dipenda dall'SDK di rete ma da una porta applicativa con stati espliciti. Finché quella regola vale:

- l'API sul NAS è la stessa in tutti e tre i modi;
- l'interfaccia web è la stessa;
- cambiare trasporto non tocca il dominio sociale.

Il rischio che si correrebbe rinviando è costruire il prodotto su un'ipotesi di rete sbagliata. Ma il feed locale non fa assunzioni di rete: è un'API HTTP.

## Struttura del client

**Una sola applicazione web**, non due. Login, feed e amministrazione vivono nello stesso client, con le sezioni amministrative protette dal ruolo. La dashboard separata prevista in origine avrebbe significato due basi di codice, due deployment e due sistemi di sessione per un'istanza da poche decine di membri.

Nota tecnica che conviene conservare: se in futuro il trasporto sarà un componente locale che serve l'interfaccia su `http://localhost`, il browser tratta quell'origine come sicura. Notifiche, fotocamera, funzionamento offline e installabilità restano quindi disponibili senza un certificato TLS. Un indirizzo di rete qualunque servito in chiaro non darebbe la stessa cosa.

## Conseguenze

**Positive.**

- Esce dalla strada critica il pezzo più costoso e più incerto del piano.
- Nessuna dipendenza dagli app store per il primo prodotto utilizzabile.
- Una sola base di codice per interfaccia e amministrazione.
- Il percorso verso «dieci persone reali che pubblicano nel feed del quartiere» si accorcia in modo sostanziale.

**Negative.**

- L'esperienza da telefono resta quella di un sito in un browser mobile finché non arriva l'app: niente notifiche push affidabili, niente integrazione di sistema.
- Il pilot dipende da Tailscale, quindi da un'azienda terza. È accettabile per un pilot e va dichiarato ai partecipanti; sarebbe inaccettabile come architettura definitiva.
- Rinviare il mobile rinvia anche la verifica di fattibilità dell'integrazione di rete nell'app, che resta un rischio non misurato.

## Quando riesaminare

- Quando il feed locale è usato da persone reali e la mancanza dell'app mobile diventa il limite principale segnalato.
- Se il trasporto peer-to-peer si dimostra praticabile prima del previsto, il componente locale può anticipare l'app mobile e sostituire Tailscale nel pilot.
