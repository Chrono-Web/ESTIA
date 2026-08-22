# ADR 0030 — Chi può scrivere a chi: permessi di consegna e anti-spam

- Stato: **Accepted** — decisa dal proprietario il 2026-08-22
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md), [ADR 0021](0021-la-forma-del-protocollo-fra-istanze.md), [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md), [ADR 0029](0029-un-messaggio-si-consegna.md)
- Attua: Milestone M6 (Sicurezza e permessi di recapito federato)

## Contesto

In una rete decentralizzata dove le istanze possono consegnarsi buste binarie, consentire a chiunque (compreso un server sconosciuto o malevolo) di recapitare messaggi privati trasformerebbe la consegna in un canale incontrollato per spam e attacchi Denial of Service (DoS) verso lo spazio disco dei NAS domestici.

Inoltre, [ADR 0020](0020-che-cosa-puo-chiedere-un-istanza-che-non-conosciamo.md) stabilisce quattro livelli di confidenza tra istanze (Sconosciuta, In contatto, Collegata, Fidata).

## Decisione

1. **Permesso basato su relazione stabilita (La prova di coppia)**:
   - Un'istanza remota può consegnare una busta privata per un utente locale solo se le due persone hanno stabilito una relazione reciproca di contatto (o follow accettato con la **prova di coppia** coniata secondo [ADR 0023](0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md)).
   - La richiesta di consegna (`messaggio`) include la prova crittografica della coppia autorizzata.
2. **Indistinguibilità dell'errore (Nessun oracle per lo spam)**:
   - Se l'istanza ricevente rifiuta la consegna (perché l'istanza chiamante è sconosciuta, non ha il permesso, o l'utente destinatario non esiste), l'istanza risponde con **la medesima risposta generica / vuota** (`404` / `rifiutato`), impedendo a terzi di enumerare quali utenti o conversazioni esistono.
3. **Limiti di flusso e budget separati per la messaggistica**:
   - In [`limits.ts`](../../apps/core-api/src/federation/limits.ts), viene introdotto un tetto massimo di dimensione per busta (`MAX_BUSTA_BYTES` = 64 kB per i messaggi testuali) e un rate limit dedicato per connessione federata, separato dalle letture di bacheca.

## Conseguenze

### Positive

- Nessuno spam da istanze arbitrarie non autorizzate.
- Protezione dello spazio disco e della banda delle istanze self-hosted.

### Negative / Vincoli

- Due persone su istanze diverse devono prima trovarsi (es. tramite QR code, ricerca o follow reciproco) prima di poter aprire una chat 1:1.
