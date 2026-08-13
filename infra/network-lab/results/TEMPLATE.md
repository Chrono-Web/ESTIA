# E_ — <titolo dell'esperimento>

- Data:
- Eseguito da:
- Opzione ADR 0001 in prova: A / B / C / D
- Esito: **riuscito / fallito / parziale**

## Ambiente

| Voce                 | Valore                                          |
| -------------------- | ----------------------------------------------- |
| Versioni componenti  |                                                 |
| Host control plane   |                                                 |
| NAS (hardware, rete) |                                                 |
| Dispositivo client   |                                                 |
| Tipo di connessione  | LAN / rete mobile / CGNAT reale / CGNAT emulato |

## Procedura seguita

Comandi eseguiti, nell'ordine, con l'output rilevante. Deve essere ripetibile da un terzo senza chiedere chiarimenti.

## Misure

| Misura            | Valore | Percorso (diretto/relay) | Note |
| ----------------- | ------ | ------------------------ | ---- |
| `t_connessione`   |        |                          |      |
| `t_riconnessione` |        |                          |      |
| `t_revoca`        |        |                          |      |
| `latenza`         |        |                          |      |
| `banda`           |        |                          |      |

Le definizioni operative sono nel [README](../README.md) §6. Una misura senza il percorso annotato non è utilizzabile.

## Osservazioni

Che cosa è successo davvero, incluso ciò che non era previsto.

## Metadati osservati

| Componente | Dato visto | Dato conservato | Per quanto tempo |
| ---------- | ---------- | --------------- | ---------------- |
|            |            |                 |                  |

## Limiti di questa prova

Che cosa questo esperimento **non** dimostra. Emulazioni, scorciatoie, condizioni non riproducibili.

## Conseguenze per l'ADR 0001

Che cosa questa evidenza cambia: rafforza un'opzione, la esclude, o apre una domanda nuova.
