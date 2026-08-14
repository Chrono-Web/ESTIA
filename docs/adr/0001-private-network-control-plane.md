# ADR 0001 — Control plane della rete privata

- Stato: **Closed** — nessuna delle opzioni è stata adottata
- Data: 2026-07-15 · chiuso il 2026-08-14
- Proprietario: progetto ESTIA
- Esito: **tutte le opzioni scartate.** Il problema è stato risolto altrove, cambiando il modello di accesso: vedi [ADR 0003](0003-primo-contatto-in-rete-locale.md) e [ADR 0004](0004-client-web-e-trasporto-sostituibile.md).

## Contesto

ESTIA vuole rendere un'istanza su NAS accessibile ai dispositivi autorizzati senza esporre direttamente il server applicativo a Internet. Il piano originario propone «WireGuard + Headscale integrati nell'app».

Headscale è però un'implementazione self-hosted del control server Tailscale. Coordina client compatibili con il protocollo Tailscale; non distribuisce automaticamente configurazioni a client WireGuard generici.

Inoltre, i client devono raggiungere il control server. Se Headscale si trova sul NAS dietro CGNAT, il bootstrap presenta una dipendenza circolare: il telefono avrebbe bisogno della rete privata per raggiungere il componente che deve inserirlo nella rete privata.

## Requisiti

La soluzione deve:

- autorizzare e revocare un singolo dispositivo;
- supportare iOS e Android;
- usare split tunnel verso le sole risorse ESTIA;
- funzionare dopo il cambio tra Wi-Fi e rete mobile;
- gestire NAS dietro NAT e CGNAT;
- distinguere control plane, data plane e relay;
- non affidare contenuti applicativi al control plane;
- permettere un deployment comunitario o sostituibile;
- documentare metadati, punti di fallimento e procedura di recovery;
- avere licenze compatibili con il progetto.

## Opzione A — Client Tailscale esterno + Headscale pubblico

Il telefono usa il client Tailscale ufficiale configurato verso Headscale. Il NAS entra nella stessa tailnet. Headscale e l'eventuale DERP risiedono su un host pubblico gestito dalla comunità o usato temporaneamente per lo sviluppo.

Vantaggi:

- prova rapidamente con componenti esistenti;
- revoca, NAT traversal e DERP sono già implementati;
- consente di validare il data plane prima del client mobile ESTIA.

Svantaggi:

- onboarding non integrato;
- seconda applicazione e secondo flusso di configurazione;
- il control plane deve essere pubblicamente raggiungibile;
- non rappresenta l'esperienza finale.

Uso consigliato: baseline dello spike e primo ambiente di sviluppo, non decisione definitiva.

## Opzione B — Motore Tailscale incorporato nell'app ESTIA

L'app incorpora o integra il motore Tailscale e usa Headscale come control plane.

Vantaggi:

- conserva le capacità Tailscale/DERP;
- permette onboarding e stato della rete nell'app;
- evita di progettare un nuovo protocollo di coordinamento.

Svantaggi:

- integrazione nativa complessa su iOS e Android;
- build, licenze, aggiornamenti e compatibilità da verificare;
- richiede comunque un Headscale raggiungibile;
- aumenta molto il perimetro di sicurezza del client.

Questa opzione non può essere scelta sulla sola base di un proof of concept desktop.

## Opzione C — WireGuard nativo + control plane ESTIA

L'app integra un motore WireGuard e ESTIA sviluppa provisioning, distribuzione degli endpoint, revoca, rotazione, NAT traversal e relay.

Vantaggi:

- controllo completo del flusso;
- protocollo applicativo minimo potenzialmente adattato a una singola istanza;
- nessuna dipendenza dal protocollo di controllo Tailscale.

Svantaggi:

- ESTIA diventa anche un prodotto di networking;
- revoca e distribuzione degli aggiornamenti non sono proprietà native di una configurazione WireGuard statica;
- NAT traversal, roaming e relay diventano responsabilità del progetto;
- rischio e tempi sono sensibilmente maggiori.

Questa opzione richiede una giustificazione forte dopo il confronto con B.

## Opzione D — NAS pubblico quando possibile, relay negli altri casi

Il control plane può risiedere sul NAS solo quando il NAS è raggiungibile tramite IPv6 o port forwarding. Le installazioni CGNAT usano un relay/control host esterno.

Vantaggi:

- massima autonomia per connessioni compatibili;
- infrastruttura esterna solo dove necessaria.

Svantaggi:

- due topologie operative;
- installazione, supporto e threat model più complessi;
- il prodotto deve diagnosticare correttamente la rete disponibile.

Questa è una topologia possibile da combinare con A o B, non un protocollo client autonomo.

## Evidenze raccolte finora

Aggiornato al 2026-08-13. Dettaglio e metodo in [`infra/network-lab/results/`](../../infra/network-lab/results/).

**Da E0 — inventario e pinning.**

1. **Nessuna opzione è esclusa per motivi di licenza.** Headscale è BSD-3-Clause, il motore Tailscale e `libtailscale` BSD-3-Clause, i componenti WireGuard MIT e Apache-2.0. Il requisito «licenze compatibili con il progetto» non discrimina tra A, B e C.
2. **L'Opzione A non richiede profili di configurazione sui client.** L'app Tailscale ufficiale espone nativamente la scelta di un coordination server personalizzato su iOS, Android e macOS. Era il rischio principale della baseline: se avesse richiesto MDM o sideloading, A non sarebbe stata utilizzabile nemmeno come ambiente di sviluppo.
3. **Headscale è pre-1.0 con rilasci frequenti** (quattro versioni tra il 17 giugno e il 29 luglio 2026). Introduce un costo ricorrente di aggiornamento per un control plane gestito da una comunità non tecnica.

Il punto 3 aggiunge un criterio che questo ADR non considerava: il criterio di decisione attuale pesa «il minor codice di networking mantenuto da ESTIA», ma un componente pre-1.0 sposta il costo dalla scrittura alla manutenzione. Va tenuto presente nel confronto tra A/B e D, e verificato in E7 misurando quanto è invasivo un aggiornamento con nodi già registrati.

**Da E3/E5/E6 parziali — misure sulla linea del pilot.** Ottenute con il control plane SaaS di Tailscale, quindi valide per il data plane e i client, non per la scelta del control plane.

4. **Il collegamento diretto tra rete mobile e rete domestica funziona.** Un iPhone su operatore mobile ha stabilito un percorso diretto verso la LAN dietro il router domestico, senza relay, con 20 pacchetti a 0% di perdita e latenza media 151 ms. Su questa classe di reti il relay non è obbligatorio: i contenuti non devono transitare da infrastruttura di terzi.
5. **Il tunnel sopravvive alla sospensione di iOS**, ma il risveglio costa: a telefono bloccato da un minuto la media raddoppia a 277 ms e il primo pacchetto arriva a 1,28 s, con rinegoziazione dell'endpoint. È un requisito per il client, non un difetto della rete.
6. **La latenza di base dipende dall'operatore.** operatore mobile instrada via Francia; nessuna scelta di topologia la migliora.
7. **L'accesso amministrativo al router è un prerequisito non previsto da questo ADR, e sulla linea del pilot è bloccato.** Senza port forwarding non esiste control plane sul NAS. In Italia i router forniti dagli operatori sono spesso bloccati o con credenziali ignote all'utente: va trattato come rischio di prodotto, non come passaggio della guida di installazione.
8. **Lo scenario CGNAT resta non misurato**, perché la linea del pilot non sembra esserne affetta. È il caso che più preoccupa il progetto e richiede un'altra linea.

## Vincolo di progetto sopravvenuto

Il 2026-08-13 è stato posto un vincolo che questo ADR non considerava: **ESTIA deve installarsi interamente sul NAS o mini-PC dell'utente finale, control plane incluso.** Nessuna architettura può presupporre che una comunità si procuri un VPS, perché reintrodurrebbe un costo fisso e un punto di dipendenza per ogni istanza.

Il vincolo riordina le opzioni:

- **A e B non sono più candidate come architettura finale.** Entrambe presuppongono un control plane su host pubblico. Restano utilizzabili come baseline di sviluppo e come banco di misura, ed è in questa veste che hanno prodotto le evidenze 4–6.
- **D diventa la candidata principale:** control plane sul NAS quando la linea lo permette, percorso alternativo dichiarato per le linee che non lo permettono.
- **C resta l'ultima risorsa**, con la riserva già espressa: renderebbe ESTIA anche un prodotto di networking.

## Trilemma da decidere esplicitamente

Le misure hanno reso visibile una tensione che il piano di progetto non aveva messo a fuoco:

> **Zero porte esposte · Control plane sul NAS · Revoca affidabile** — se ne ottengono due su tre.

Ospitare il control plane sul NAS impone di esporre un endpoint HTTPS raggiungibile da internet, perché un dispositivo in rete mobile deve poterlo contattare per registrarsi. Ne segue che questa formulazione del piano di progetto non è mantenibile alla lettera:

> «Non ha porte esposte, non ha un indirizzo pubblico, non compare in nessuna scansione: per chi non possiede una chiave valida, il server non esiste.»

La formulazione sostenibile è: _nessuna porta applicativa esposta; un solo endpoint di controllo esposto, che non serve contenuti_. Feed, media e API restano irraggiungibili da fuori. Cambia la comunicazione, non la sostanza della protezione — ma va cambiata prima che qualcuno la legga come una garanzia.

## Chiusura (2026-08-14)

**Nessuna delle quattro opzioni è stata adottata.** Lo spike ha raggiunto il suo scopo: ha dimostrato che la domanda era mal posta.

### Che cosa ha dimostrato lo spike

1. **Il data plane non è un rischio.** Su una linea domestica senza CGNAT, un telefono in rete mobile raggiunge la rete di casa in modo diretto, con 0% di perdita e 151 ms medi. Questa parte è risolta e la misura vale per qualunque opzione.

2. **L'Opzione D è stata provata sul campo e ha fallito il test di usabilità.** Ospitare il control plane sul NAS richiede: accesso amministrativo al router, indirizzo statico in LAN, port forwarding, un dominio a pagamento, un DNS dinamico, l'assenza di CGNAT, e la consapevolezza di non esporre per errore il pannello del NAS. **Sette passaggi tecnici**, contro un budget di prodotto che dichiara zero passaggi tecnici per un membro non tecnico. Il tentativo si è fermato al quarto passaggio, condotto dal proprietario del progetto con assistenza diretta.

3. **A e B sono escluse dal vincolo di progetto**: presuppongono un control plane su host pubblico, e ESTIA deve installarsi interamente sul NAS dell'utente.

4. **C resta sproporzionata**: renderebbe ESTIA anche un prodotto di networking.

### Come è stato risolto il problema

Non scegliendo un control plane migliore, ma **eliminando la ragione per cui serviva**.

Il control plane esisteva per risolvere il primo contatto: come fa un dispositivo a scoprire e riconoscere l'istanza. [ADR 0003](0003-primo-contatto-in-rete-locale.md) sposta quel momento sulla **rete locale**, dove non serve alcuna infrastruttura di fiducia — ed è per giunta più sicuro, perché non delega a un'autorità di certificazione.

Quel che resta è la raggiungibilità da fuori casa, che [ADR 0004](0004-client-web-e-trasporto-sostituibile.md) tratta come **strato sostituibile**, fuori dalla strada critica: Tailscale per il pilot, trasporto peer-to-peer a chiavi come obiettivo.

### Che cosa resta non misurato

Da recuperare nella milestone che affronterà il trasporto remoto, e da non dimenticare:

- **comportamento sotto CGNAT** su una linea reale — è il caso che riguarda una quota crescente di utenti italiani;
- **revoca**: tempo effettivo di perdita dell'accesso, che nel modello a chiavi funziona in modo completamente diverso e va progettato;
- **metadati** conservati dal trasporto scelto;
- **integrazione del motore di rete in un'app mobile**.

Il trilemma emerso in questo ADR — _zero porte esposte · control plane sul NAS · revoca affidabile_ — si scioglie con ADR 0003: senza esposizione pubblica per l'ammissione, i tre vincoli smettono di competere.

## Esperimenti richiesti da M0.2

1. Avviare Headscale su un endpoint HTTPS raggiungibile e collegare un NAS Linux e almeno un client mobile ufficiale.
2. Verificare collegamento diretto e fallback DERP, identificandoli nei log.
3. Revocare il telefono e misurare quando perde effettivamente accesso.
4. Ripetere con cambio Wi-Fi → rete mobile.
5. Ripetere con NAS sotto CGNAT.
6. Verificare quali dati e chiavi sono conservati da Headscale e DERP.
7. Creare un micro-prototipo mobile nativo separato dall'app prodotto per stimare l'integrazione B su iOS e Android.
8. Valutare licenze, dimensione binaria, consumo energetico e comportamento in background.

## Criterio di decisione

Scegliere l'opzione che soddisfa i requisiti con il minor codice di networking mantenuto da ESTIA. La purezza architetturale non prevale su revoca affidabile, connettività mobile e verificabilità.

Se nessuna integrazione in-app è sostenibile, l'opzione A può diventare un prerequisito dichiarato per il primo pilot tecnico, mantenendo separata la roadmap del client definitivo.

## Fonti

- https://headscale.net/
- https://headscale.net/stable/usage/getting-started/
- https://headscale.net/stable/ref/derp/
- https://headscale.net/stable/usage/connect/android/
- https://developer.apple.com/documentation/networkextension/packet-tunnel-provider
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension
- https://developer.android.com/develop/connectivity/vpn
