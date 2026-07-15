# ADR 0001 — Control plane della rete privata

- Stato: **Proposed**
- Data: 2026-07-15
- Proprietario: progetto ESTIA
- Decisione: **non ancora presa; richiede spike M0.2**

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
