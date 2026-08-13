# Network lab — ambiente dello spike M0.2

- Milestone: M0.2 dell'[`IMPLEMENTATION_PLAN.md`](../../docs/IMPLEMENTATION_PLAN.md)
- Decisione da istruire: [ADR 0001](../../docs/adr/0001-private-network-control-plane.md)
- Stato: **ambiente predisposto, nessun esperimento eseguito**

## 1. Che cosa deve dimostrare

M0.2 non serve a scegliere una tecnologia simpatica. Serve a rispondere a quattro domande che oggi non hanno risposta, e da cui dipende se ESTIA può mantenere la sua promessa principale:

1. Un dispositivo autorizzato raggiunge il NAS anche quando il NAS è dietro CGNAT?
2. Quando revoco un dispositivo, **quanto tempo passa** prima che perda davvero l'accesso?
3. Il tunnel sopravvive al passaggio Wi-Fi → rete mobile senza intervento dell'utente?
4. Chi vede quali metadati, in ogni topologia considerata?

Se nessuna opzione dell'ADR 0001 risponde in modo accettabile, cambia la promessa di ESTIA, non solo la sua implementazione. Per questo lo spike precede il prodotto.

## 2. Che cosa questo lab **non** è

- **Non è un deployment di ESTIA.** Non contiene `core-api` e non ne dipende.
- **Non gira sul NAS.** Il control plane va su un host pubblicamente raggiungibile: è esattamente il vincolo che l'ADR 0001 mette in discussione, e va riprodotto onestamente, non aggirato.
- **Non fissa alcuna scelta di prodotto.** Caddy compare qui perché il lab ha bisogno di TLS, non perché sia stato deciso per l'istanza.
- **Non produce codice riutilizzabile.** Tutto ciò che sta in questa cartella è usa-e-getta e va rimosso a fine spike (§7).

## 3. Topologia dell'esperimento

```text
  ┌─────────────────┐   HTTPS   ┌──────────────────────┐
  │ Telefono        │──────────▶│ Host pubblico (VPS)  │
  │ client ufficiale│           │  Caddy → Headscale   │  ← control plane
  └────────┬────────┘           │  (+ DERP se serve)   │  ← relay
           │                    └──────────┬───────────┘
           │  data plane cifrato           │ HTTPS
           │  (diretto se possibile,       │
           │   via relay altrimenti)       ▼
           │                    ┌──────────────────────┐
           └───────────────────▶│ NAS dietro NAT/CGNAT │
                                │  servizio di prova   │
                                └──────────────────────┘
```

I tre piani vanno tenuti distinti nella registrazione dei risultati: **control plane** (registrazione nodi e policy), **data plane** (traffico telefono ↔ NAS), **relay** (inoltro quando il collegamento diretto fallisce).

## 4. Prerequisiti

Questo spike non è eseguibile da una sola macchina. Servono:

- un host con IP pubblico e un nome DNS che punti a esso;
- il NAS o mini-PC di destinazione, sulla connessione domestica reale;
- almeno un telefono iOS **e** uno Android, con SIM dati attiva;
- una connessione sotto CGNAT per E6, reale o emulata.

Se manca la linea CGNAT, E6 va emulata e la limitazione va dichiarata nel risultato: una misura ottenuta in emulazione non ha lo stesso peso di una misura reale.

## 5. Protocollo sperimentale

Gli esperimenti vanno eseguiti in ordine. Ognuno produce un file in `results/`, copiato da `results/TEMPLATE.md`.

### E0 — Inventario e pinning

Prima di avviare qualsiasi container. Registrare per ogni componente: versione esatta, licenza, architetture supportate, data di verifica.

Le versioni **non sono pre-impostate in questo repository**: il compose fallisce di proposito se non le fissi tu, perché la loro scelta è un risultato dello spike, non un suo presupposto.

```bash
cd infra/network-lab
cp .env.example .env   # compila HEADSCALE_VERSION, CADDY_VERSION, LAB_DOMAIN
```

La configurazione di Headscale è specifica della versione: scarica il file di esempio della release che hai fissato e mettilo in `headscale/config.yaml`. I campi che contano per questo spike sono `server_url`, `listen_addr`, la sezione `database` e la sezione `derp`.

### E1 — Avvio del control plane

```bash
docker compose -f compose.headscale.yaml up -d
curl --fail https://$LAB_DOMAIN/health
```

Criterio: il control plane risponde su HTTPS da una rete esterna.

### E2 — Primo contatto e registrazione

Registrare il NAS e un telefono nella stessa tailnet con i client ufficiali. Misurare `t_connessione` (§6) per il telefono, a partire dal tap che avvia la connessione.

Criterio: il telefono raggiunge il servizio di prova sul NAS.

### E3 — Percorso diretto contro percorso relay

Distinguere i due casi nei log, non a intuito. Con i client Tailscale lo stato riporta esplicitamente se la connessione è `direct` o passa da una regione DERP.

Criterio: per ogni misura successiva è registrato **quale dei due percorsi era attivo**. Una latenza senza questa informazione non è utilizzabile.

### E4 — Revoca

Revocare il nodo del telefono dal control plane e misurare `t_revoca` (§6) con il metodo del §6, non osservando l'interfaccia.

Criterio di gate: `t_revoca` < 60 secondi. È il budget di prodotto di [`PRODUCT_VISION.md`](../../docs/PRODUCT_VISION.md) §4. Se non è rispettato, va documentato che cosa lo impedisce.

### E5 — Roaming Wi-Fi → rete mobile

Con il tunnel attivo e una richiesta in corso, passare da Wi-Fi a rete mobile. Misurare `t_riconnessione`.

Criterio: il ripristino avviene senza alcun intervento dell'utente. Un tunnel che richiede di riaprire l'app ha fallito, anche se si riconnette in fretta.

### E6 — Scenario CGNAT

Ripetere E2, E3 e E5 con il NAS su una connessione CGNAT.

Criterio: registrare se il collegamento diretto è possibile, e in caso contrario quale relay lo sostituisce e a quale costo di latenza e banda.

### E7 — Metadati e conservazione

Ispezionare che cosa conservano control plane e relay: chiavi pubbliche, indirizzi IP, orari di connessione, durata delle sessioni, identificatori dei nodi.

Criterio: tabella «componente → dato visto → dato conservato → per quanto tempo». Alimenta direttamente il threat model di M0.4.

### E8 — Fattibilità dell'integrazione in-app

Micro-prototipo nativo separato dall'app di prodotto, per stimare l'opzione B dell'ADR 0001 su iOS e Android: build, firma, entitlement, dimensione binaria, comportamento in background, consumo energetico.

Criterio: una stima motivata di effort e rischio, non un giudizio. L'ADR 0001 dice esplicitamente che l'opzione B non può essere scelta sulla base di un proof of concept desktop.

## 6. Definizioni delle misure

Le misure vanno definite prima di essere prese, altrimenti non sono confrontabili tra esperimenti.

| Misura            | Definizione operativa                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `t_connessione`   | Dal tap che avvia la connessione alla prima risposta applicativa ricevuta dal NAS.                                  |
| `t_riconnessione` | Dal cambio di rete alla prima risposta applicativa ricevuta di nuovo.                                               |
| `t_revoca`        | Dalla conferma della revoca sul control plane al primo tentativo di accesso che fallisce, con polling ogni secondo. |
| `latenza`         | RTT mediano su 100 richieste all'endpoint di prova, con percorso (diretto/relay) annotato.                          |
| `banda`           | Throughput su un trasferimento di dimensione fissa, stesso file in tutti gli esperimenti.                           |

`t_revoca` va misurato con un client che tenta l'accesso in loop, non guardando quando l'interfaccia mostra il nodo come revocato: sono due cose diverse, e la seconda è quella che non interessa.

## 7. Pulizia e rollback

Lo spike è usa-e-getta. A fine M0.2:

```bash
docker compose -f compose.headscale.yaml down --volumes --remove-orphans
```

Poi: rimuovere i nodi registrati, distruggere l'host pubblico usato per il lab, rimuovere il record DNS, disinstallare i client dai dispositivi di prova. Nessuna credenziale del lab deve sopravvivere allo spike, e nessuna deve finire nel repository.

Dei risultati sopravvive solo `results/`, che va conservato: è l'evidenza su cui si decide l'ADR 0001.

## 8. Che cosa questo lab non dimostrerà

Da dichiarare nel risultato finale, per non trasformare uno spike riuscito in una certezza che non ha:

- Il comportamento con decine di dispositivi contemporanei: il lab ne prova pochi.
- La sostenibilità operativa nel tempo: rotazione delle chiavi, aggiornamenti, guasti del control plane.
- L'esperienza d'uso reale dell'onboarding, che dipende dall'app di prodotto e non dai client ufficiali.
- Il costo di gestione di un relay comunitario, che è una questione di sostenibilità prima che tecnica.
