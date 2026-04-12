# ESTIA

ESTIA è un social network open source e self-hosted nel quale l'unità di base è un'istanza gestita da una comunità reale. Il prodotto combina un feed locale privato, profili pubblici federabili e gruppi di messaggistica, mantenendo i dati applicativi sull'hardware dell'istanza.

## Stato

Il progetto è in fase di bootstrap tecnico. La repository non contiene ancora codice applicativo.

L'obiettivo immediato non è costruire tutte le superfici del prodotto, ma creare una base riproducibile e verificare per prima l'incognita architetturale più rischiosa: la rete privata tra dispositivi mobili e NAS domestici, inclusi i casi con CGNAT.

## Documenti da leggere

1. [`AGENTS.md`](AGENTS.md) — regole operative per il coding agent.
2. [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) — requisiti e perimetro del prodotto.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architettura target, vincoli e decisioni ancora aperte.
4. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — ordine di implementazione e criteri di completamento.
5. [`docs/adr/0001-private-network-control-plane.md`](docs/adr/0001-private-network-control-plane.md) — decisione da validare sulla rete privata.
6. [`AI_START_PROMPT.md`](AI_START_PROMPT.md) — primo incarico da consegnare a un coding agent nella repository vuota.

## Principio di esecuzione

Ogni milestone deve produrre un risultato avviabile, testato e documentato. Le componenti future non vanno anticipate con implementazioni speculative. Le decisioni non reversibili o che modificano i confini di fiducia devono essere registrate in un ADR prima di scrivere il relativo codice.

## Formula infrastrutturale corretta

ESTIA non promette «assenza di qualunque infrastruttura centrale». DNS, autorità di certificazione, notifiche push e relay possono essere servizi esterni.

La promessa è più precisa:

> Nessun server applicativo centrale gestito dagli sviluppatori e nessun contenuto della comunità conservato fuori dall'istanza, salvo una scelta esplicita dell'amministratore.

