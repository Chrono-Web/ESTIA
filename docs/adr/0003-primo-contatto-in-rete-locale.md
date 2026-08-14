# ADR 0003 — Primo contatto in rete locale

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA

## Contesto

Un'istanza ESTIA è identificata da una coppia di chiavi, non da un dominio ([ADR 0004](0004-client-web-e-trasporto-sostituibile.md)). Resta però il problema più delicato di ogni sistema a chiavi: **il primo contatto**.

Quando un dispositivo incontra un'istanza per la prima volta, deve imparare la sua chiave pubblica. Se quello scambio viene intercettato, l'attaccante può sostituirsi all'istanza per sempre, e nessuna crittografia successiva se ne accorge. È il problema noto come _trust on first use_.

Le soluzioni classiche spostano la fiducia su un terzo:

- **Dominio e certificato TLS** — ci si fida di un'autorità di certificazione, che può sbagliare, essere compromessa o essere obbligata a emettere un certificato fraudolento. In più impone dominio, esposizione pubblica e rinnovi.
- **Control plane centralizzato** — ci si fida di chi lo gestisce, ed è la dipendenza che [ADR 0001](0001-private-network-control-plane.md) ha chiuso come non praticabile.

## Decisione

**Il primo contatto tra un dispositivo e un'istanza avviene sulla rete locale dell'istanza.**

Il dispositivo scopre l'istanza sulla LAN, ne apprende la chiave pubblica e, se ammesso, riceve le proprie credenziali. Da quel momento la chiave è nota e permanente: il dispositivo riconosce l'istanza ovunque si trovi, senza più dipendere da nessuna infrastruttura di fiducia.

L'installazione iniziale dell'istanza da parte dell'amministratore avviene sempre in rete locale, senza eccezioni: chi installa il NAS è fisicamente davanti al NAS.

## Perché è la scelta più sicura, non solo la più comoda

Per intercettare uno scambio di chiavi sulla rete locale, un attaccante deve trovarsi **fisicamente su quella rete**. Non basta compromettere un'autorità di certificazione, un registrar, un DNS o un fornitore di servizi: bisogna essere in casa.

È lo stesso schema di accoppiamento fuori banda usato da Chromecast, HomeKit, Sonos e dal collegamento dei dispositivi di Signal. Non è una scorciatoia: è la forma più robusta di scambio iniziale che esista in un sistema senza autorità centrale.

Coincide inoltre con la premessa del prodotto: ESTIA è il social di un luogo fisico. **Si entra nella rete del quartiere passando dal quartiere.** Il vincolo tecnico e il modello sociale dicono la stessa cosa.

## Percorso alternativo per chi non può essere presente

Il flusso «condivido il link d'invito» previsto da [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §5.1 resta valido: **il link d'invito contiene la chiave pubblica dell'istanza.**

| Percorso                 | Fiducia richiesta              | Quando usarlo                            |
| ------------------------ | ------------------------------ | ---------------------------------------- |
| **Rete locale**          | nessun terzo                   | Default. Massima garanzia.               |
| **Link con chiave**      | il canale che consegna il link | Chi non può essere presente.             |
| **Da un proprio device** | il dispositivo già ammesso     | Secondo dispositivo dello stesso utente. |

Il secondo percorso è più debole del primo — chi controlla il canale di consegna potrebbe alterare la chiave — ma resta molto più forte della fiducia in un'autorità di certificazione, perché il canale lo sceglie l'utente e può essere verificato a voce.

L'interfaccia deve **dire quale dei tre percorsi è in uso**, senza presentarli come equivalenti.

## Conseguenze

**Positive.**

- Nessun dominio, nessun certificato, nessuna autorità di certificazione nel percorso di fiducia.
- Nessuna porta esposta per far entrare un membro: il trilemma registrato in ADR 0001 si scioglie.
- M1 e M2 diventano costruibili e utilizzabili **senza alcuno strato di rete**: sono HTTP su rete locale. Il trasporto remoto diventa additivo.
- L'origine `http://localhost` e la rete locale sono sufficienti per lo sviluppo e per un pilot in un contesto con rete condivisa.

**Negative.**

- Un membro che non può raggiungere fisicamente la rete dell'istanza deve usare il percorso più debole.
- La scoperta sulla LAN va implementata (mDNS o equivalente) e va gestito il caso di reti che isolano i client tra loro — frequente sulle reti WiFi pubbliche e su alcune configurazioni condominiali.
- Un condominio non condivide necessariamente una LAN: il pilot in quel contesto richiederà comunque lo strato di trasporto remoto.

**Ciò che questa decisione non risolve.**

Il primo contatto in rete locale elimina il problema dell'**identità**, non quello della **raggiungibilità**. Un dispositivo fuori casa conosce la chiave dell'istanza ma deve ancora trovarne la posizione di rete e attraversare i NAT. Quello è compito dello strato di trasporto, deciso separatamente in [ADR 0004](0004-client-web-e-trasporto-sostituibile.md).

## Requisiti che ne derivano

1. L'istanza genera una coppia di chiavi stabile al primo avvio e la conserva come propria identità (M1.1).
2. L'istanza è individuabile sulla propria rete locale con un nome comprensibile.
3. L'ammissione di un dispositivo è sempre un atto esplicito dell'amministratore o di un invito valido: **stare sulla LAN non basta per entrare.** La rete locale autentica il canale, non autorizza la persona.
4. Ogni dispositivo ammesso registra la propria chiave presso l'istanza, e l'istanza mantiene la lista dei dispositivi autorizzati come unica fonte di verità per la revoca.
5. L'interfaccia mostra sempre con quale percorso è avvenuto il primo contatto.

Il punto 3 è il più facile da sbagliare: la rete locale è un canale attendibile, non un'autorizzazione.

## Quando riesaminare

- Se il pilot mostra che una quota rilevante di membri non riesce a essere fisicamente presente, il percorso con link diventa il default di fatto e va rafforzato — per esempio con verifica della chiave fuori banda, tipo codice di sicurezza letto a voce.
- Se le reti locali dei contesti reali isolano i client tra loro, la scoperta su LAN va ripensata.
