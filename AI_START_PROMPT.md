# Primo prompt per il coding agent

Incolla questo incarico nella repository vuota dopo avervi copiato tutti i file di questo pacchetto.

---

Stai avviando da zero la repository di ESTIA.

Leggi integralmente `AGENTS.md`, `docs/PROJECT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md` e `docs/adr/0001-private-network-control-plane.md` prima di modificare qualsiasi file.

Esegui soltanto la milestone **M0.1 — Bootstrap riproducibile della repository**. Non implementare ancora feed, account, app mobile, Headscale, WireGuard, chat o ActivityPub.

Obiettivi:

1. Inizializzare un monorepo `pnpm` minimale e riproducibile.
2. Creare soltanto i workspace necessari alla base:
   - `apps/core-api`
   - `packages/config`
   - `packages/contracts`
   - `packages/testing`
   - `infra/compose`
3. Configurare TypeScript strict, formatter, lint, typecheck e test.
4. Implementare in `apps/core-api` un server Fastify minimale con:
   - `GET /health/live`
   - `GET /health/ready`
   - logging strutturato;
   - configurazione validata;
   - arresto ordinato.
5. Aggiungere test automatici degli endpoint senza aprire porte reali quando Fastify consente l'injection.
6. Creare un'immagine container multi-stage non-root per `core-api` e un Compose minimale con health check.
7. Documentare i comandi locali in `README.md` senza sostituire il contesto di progetto già presente.
8. Aggiungere `.env.example`, `.gitignore` ed eventuali file di versione necessari, senza segreti.
9. Eseguire tutti i controlli disponibili e uno smoke test del container/Compose se Docker è presente nell'ambiente.
10. Aggiornare `docs/IMPLEMENTATION_PLAN.md` marcando M0.1 come completata soltanto se tutti i criteri di accettazione risultano soddisfatti.

Prima di lavorare:

- verifica le versioni effettivamente disponibili nell'ambiente;
- scegli e fissa una versione Node Active LTS compatibile, motivandola nella risposta finale;
- evita dipendenze non necessarie e non aggiungere Turborepo, database o framework frontend in questa milestone.

Al termine fornisci:

- sintesi dell'implementazione;
- albero dei file principali;
- comandi eseguiti e relativo esito;
- eventuali limiti dell'ambiente;
- prossima milestone suggerita, senza implementarla.

---

## Prompt successivo

Quando M0.1 è realmente conclusa, il secondo incarico dovrà essere:

> Esegui M0.2, lo spike della rete privata, senza ancora collegarlo al prodotto. Tratta l'ADR 0001 come `Proposed`, produci prove ripetibili per le opzioni ammesse e non scegliere un'architettura definitiva senza evidenze sui casi LAN, rete mobile e CGNAT.

