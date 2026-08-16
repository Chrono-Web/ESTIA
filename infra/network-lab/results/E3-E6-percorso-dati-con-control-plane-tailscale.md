# E3 / E5 / E6 (parziali) — Percorso dati con control plane Tailscale

- Data: 2026-08-13
- Eseguito su una linea domestica italiana, con assistenza
- **Anonimizzato il 2026-08-16**, in vista dell'apertura del repository: indirizzi pubblici, topologia della LAN e nomi dei dispositivi sono stati sostituiti da segnaposto. Le misure, i percorsi e le conclusioni sono quelli originali.
- Opzione ADR 0001 in prova: **nessuna in modo completo**. Vedi §Limiti.
- Esito: **parziale, con esiti solidi sul data plane**

## Che cosa è stato misurato, e che cosa no

Queste misure usano il **control plane SaaS di Tailscale**, non Headscale. Non chiudono quindi E3, E5 ed E6 come definiti nel [README](../README.md), e non decidono l'ADR 0001.

Misurano però ciò che dipende dalla **rete fisica e dai client**, non da chi ospita il control plane: capacità di attraversare i due NAT, latenza reale, comportamento di iOS in background. Questa parte trasferisce a qualunque opzione, perché il data plane e i client sarebbero gli stessi.

## Ambiente

| Voce             | Valore                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| Linea domestica  | Operatore incumbent italiano, IPv4 pubblico dinamico, **nessun IPv6**                |
| rDNS / whois     | Nome generato uno-a-uno dall'indirizzo, su dominio dell'operatore; pool DHCP diretto |
| Router           | Fornito dall'operatore — **amministrazione non accessibile** (vedi §Limiti)          |
| LAN              | Una `/24` privata, con NAS e Mac dietro lo stesso NAT                                |
| NAS              | Linux, raggiungibile via tailnet                                                     |
| Client mobile    | iPhone, iOS, client Tailscale ufficiale                                              |
| Operatore mobile | Operatore mobile italiano che instrada il traffico attraverso la Francia             |
| Control plane    | Tailscale SaaS — **non** Headscale                                                   |

## Procedura seguita

```bash
tailscale netcheck
tailscale ping --c 12 <telefono>           # con iPhone in rete mobile, app in primo piano
tailscale status | grep <telefono>
ping -c 20 -i 0.5 <ip-tailscale-telefono>  # campione a caldo
# ... iPhone bloccato, un minuto senza toccarlo ...
tailscale status | grep <telefono>         # osservazione passiva
ping -c 15 -i 0.5 <ip-tailscale-telefono>  # primo contatto a freddo
tailscale ping --c 6 <telefono>            # percorso dopo il risveglio
```

## Caratterizzazione della linea

| Voce                    | Valore              | Conseguenza                                           |
| ----------------------- | ------------------- | ----------------------------------------------------- |
| `UDP`                   | `true`              | Attraversamento NAT possibile                         |
| `MappingVariesByDestIP` | `false`             | NAT «easy»: mapping indipendente dalla destinazione   |
| `PortMapping`           | vuoto               | **Niente UPnP/NAT-PMP**: port forwarding solo manuale |
| IPv6                    | assente             | Esclusa la via più semplice all'esposizione pubblica  |
| DERP più vicino         | Nodo europeo, 54 ms | Costo del relay se il percorso diretto fallisse       |

**CGNAT: molto probabilmente assente.** L'IPv4 pubblico non è in `100.64.0.0/10`, il reverse DNS è generato uno-a-uno dall'indirizzo, e il blocco è un pool DHCP di assegnazione diretta. Non è prova formale — manca la pagina WAN del router — ma è coerente con tutte le altre misure.

## Misure

| Misura             | Valore                                            | Percorso        | Note                                                        |
| ------------------ | ------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| `t_connessione`    | ~2 s dal primo pacchetto al percorso diretto      | relay → diretto | 3 ping via DERP(par), poi promozione                        |
| `latenza` a caldo  | min 99 / **avg 151** / max 403 / dev 67 ms        | diretto         | 20 pacchetti, **0% perdita**                                |
| `latenza` a freddo | min 122 / **avg 277** / max **1280** / dev 315 ms | diretto         | 15 pacchetti, **0% perdita**, telefono bloccato da 1 minuto |
| `banda`            | non misurata                                      | —               | Richiede un servizio di prova sul NAS                       |
| `t_revoca`         | non misurata                                      | —               | Richiede il control plane di destinazione                   |

## Osservazioni

1. **Il collegamento diretto tra rete mobile e rete di casa funziona.** L'iPhone in rete mobile ha stabilito un percorso diretto verso la LAN dietro il router domestico, senza relay: endpoint pubblico raggiunto direttamente, 100 ms. È il risultato più importante della serata — significa che ESTIA non ha bisogno di un relay obbligatorio su questa coppia di reti, e che i contenuti non transitano da infrastruttura di terzi.

2. **Il primo contatto passa sempre dal relay.** Per circa due secondi il traffico va via DERP (Parigi) prima che la promozione a diretto avvenga. Non è un difetto: è il funzionamento normale della traversata NAT. Ma va progettato, non subito.

3. **Il tunnel sopravvive al background di iOS.** A telefono bloccato da un minuto, tutti i 15 pacchetti hanno risposto: zero perdita. La Network Extension resta viva anche con l'app sospesa. La promessa «tunnel sempre attivo» regge.

4. **Ma il risveglio ha un costo misurabile.** A freddo la media raddoppia (277 ms contro 151) e il primo pacchetto arriva a **1,28 secondi**. Inoltre la porta dell'endpoint pubblico è cambiata durante l'inattività: il percorso diretto viene rinegoziato, non semplicemente ripreso.

5. **La latenza di base dipende dall'operatore, non dall'architettura.** L'operatore mobile instrada il traffico attraverso la Francia. I 150 ms medi sono routing fisico: nessuna scelta di control plane, protocollo o topologia li migliora.

6. **L'amministrazione del router è essa stessa un prerequisito, ed è bloccata.** Il router dell'operatore richiede una password stampata sull'etichetta e non è stato possibile accedervi. Senza accesso al router non c'è port forwarding, quindi non c'è control plane sul NAS. Vedi §Conseguenze.

## Conseguenze per il prodotto

- **Il client deve tollerare un costo di risveglio di circa un secondo sulla prima richiesta dopo l'inattività.** La prima chiamata all'apertura dell'app non deve bloccare l'interfaccia: servono schermate scheletro e caricamento ottimistico. Requisito da portare in M2.4.
- **Il feed locale è compatibile con questa rete.** A 150 ms medi, caricare una timeline o pubblicare una foto è indistinguibile da un social commerciale.
- **La chat in tempo reale della Fase 2 è al limite.** Media 151 ms, jitter 67 ms e picchi a 403 ms si sentono su ricevute e indicatore di scrittura. Non blocca, ma va saputo prima di promettere parità con WhatsApp.

## Limiti di questa prova

- **Control plane sbagliato.** Tutto è stato misurato su Tailscale SaaS. Registrazione, revoca, propagazione della revoca e metadati conservati dipendono dall'implementazione del control plane e **non trasferiscono** a Headscale: restano E2, E4, E7.
- **Nessun test sotto CGNAT.** Questa linea non sembra esserne affetta, quindi lo scenario che più preoccupa il progetto resta non misurato. Serve un'altra linea.
- **Una sola coppia di reti e un solo operatore.** Un operatore che instrada via Francia è un caso particolare, non una media.
- **Nessuna misura di banda**, e nessuna prova con più dispositivi contemporanei.
- **Percorso misurato Mac→iPhone, non NAS→iPhone.** Mac e NAS sono dietro lo stesso NAT, quindi è un buon sostituto, ma non è la misura esatta.
- **E8 non affrontato**: nessuna stima sull'integrazione del motore di rete dentro l'app ESTIA.

## Conseguenze per l'ADR 0001

- **Il data plane non è più un rischio aperto su questa classe di reti.** Diretto, stabile, zero perdita. Il rischio residuo si concentra tutto sul control plane: dove sta, chi lo possiede, quanto è affidabile la revoca.
- **L'Opzione D diventa la candidata principale**, coerentemente con il vincolo di progetto che ESTIA si installi interamente sul NAS dell'utente senza richiedere un VPS.
- **Emerge un prerequisito non previsto dall'ADR: l'accesso amministrativo al router.** Non è un dettaglio di installazione: senza port forwarding non esiste control plane sul NAS, e in Italia i router forniti dagli operatori sono spesso bloccati o con credenziali sconosciute all'utente. Va trattato come rischio di prodotto, non come passaggio della guida di installazione.
- **Emerge un trilemma da decidere esplicitamente:** _zero porte esposte_ · _control plane sul NAS_ · _revoca affidabile_. Se ne ottengono due su tre. Ospitare il control plane sul NAS impone di esporre un endpoint HTTPS, il che rende non mantenibile alla lettera la formulazione «nessuna porta esposta, il server non esiste» del piano di progetto.
