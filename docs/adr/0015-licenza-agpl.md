# ADR 0015 — ESTIA è distribuita sotto AGPL-3.0

- Stato: **Accepted**
- Data: 2026-08-16
- Proprietario: progetto ESTIA
- Vincolante per: l'apertura del repository e ogni contributo successivo

## Contesto

Il repository sta per diventare pubblico, e finora non ha una licenza.

Non è un dettaglio rimandabile: **un repository pubblico senza licenza è «tutti i diritti riservati»**. Chiunque può leggere il codice e nessuno ha il diritto di usarlo, modificarlo o ridistribuirlo. Per un progetto il cui senso è che ogni comunità si ospiti la propria istanza, sarebbe il peggiore dei mondi possibili: visibile e inutilizzabile.

`AGENTS.md` dichiara da sempre che il progetto è open source. Aprire il repository senza scegliere una licenza renderebbe quella dichiarazione falsa proprio nel momento in cui diventa verificabile.

## Che cosa ESTIA chiede a una licenza

Due cose, e vengono dai documenti, non dai gusti.

**Che chiunque possa ospitarsela.** [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) §8 tratta la portabilità come un diritto: se un'istanza degenera, i membri se ne vanno con il proprio archivio. Quel diritto è vuoto se non esiste anche il diritto di **far girare altrove** il software che regge l'archivio. Una licenza che non consente di eseguire, modificare e ridistribuire contraddice il prodotto.

**Che nessuno possa chiuderla.** La §11 dice che una rete i cui contenuti stanno su macchine di chi li scrive è una rete che nessuno può spegnere con una decisione aziendale, e che per chi si organizza è la differenza fra avere una voce e averla in prestito. Se qualcuno può prendere ESTIA, modificarla, e offrirla come servizio chiuso, quella promessa si può aggirare in un pomeriggio: nasce un «ESTIA gestita» comoda, la gente ci va, e il punto del progetto è perso senza che nessuno abbia violato nulla.

## Opzioni

| Opzione              | Chi può ospitarla | Chi la modifica deve condividere     | Il buco                                                       |
| -------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------- |
| Nessuna licenza      | Nessuno           | —                                    | Pubblico e inutilizzabile                                     |
| **MIT / Apache-2.0** | Chiunque          | No                                   | Una versione chiusa offerta come servizio è pienamente lecita |
| **GPL-3.0**          | Chiunque          | Solo se **distribuisce** il software | **Far girare non è distribuire**: vedi sotto                  |
| **AGPL-3.0**         | Chiunque          | Anche se lo offre **solo via rete**  | Nessuno rispetto ai due requisiti                             |

### Perché la GPL non basta, ed è il punto tecnico della decisione

La GPL fa scattare l'obbligo di condividere le modifiche quando il software viene **distribuito**. Ma un servizio in rete non si distribuisce: gli utenti lo usano senza mai riceverne una copia. Chi prende un programma GPL, lo modifica e lo offre come servizio non distribuisce nulla, e non deve nulla. È noto come _ASP loophole_, ed è esattamente il caso di un social network — dove il software si usa **solo** attraverso la rete.

L'AGPL esiste per chiudere quel buco, e lo fa nella **§13, «Remote Network Interaction»**: chi modifica il programma e lo mette a disposizione di utenti attraverso una rete deve offrire a quegli utenti il codice sorgente della propria versione.

Per un prodotto che è un servizio di rete e nient'altro, la differenza fra GPL e AGPL non è una sfumatura: è la differenza fra una tutela che si applica e una che non si applica mai.

## Decisione

**ESTIA è distribuita sotto GNU Affero General Public License, versione 3** (`AGPL-3.0-only`), testo completo in [`LICENSE`](../../LICENSE), copiato verbatim dalla Free Software Foundation.

La licenza copre l'intero repository, codice e documentazione insieme. Separare la documentazione sotto una licenza da contenuti avrebbe una sua logica, ma introdurrebbe due regimi in un progetto dove i documenti **sono** parte dell'ingegneria — gli ADR spiegano il codice e il codice li cita — e due regimi si sbagliano.

### Verifica di compatibilità, 2026-08-16

Un progetto AGPL non può incorporare dipendenze con licenze incompatibili. Le dipendenze di produzione attuali sono state controllate una per una:

| Licenza          | Dipendenze                                                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MIT**          | `fastify`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/swagger`, `hash-wasm`, `tar-stream`, `react`, `react-dom`, `react-router-dom`, `expo`, `expo-dev-client`, `expo-secure-store`, `expo-status-bar`, `react-native`, `@noble/curves`, `@noble/ciphers`, `@noble/hashes` |
| **Apache-2.0**   | `@jsquash/jpeg`, `@jsquash/png`, `@jsquash/webp`, `@jsquash/resize`                                                                                                                                                                                                                 |
| **BSD-3-Clause** | `age-encryption`                                                                                                                                                                                                                                                                    |

Tutte permissive, tutte compatibili con AGPL-3.0 — Apache-2.0 lo è nella direzione che serve, cioè verso GPLv3 e AGPLv3. Nessuna dipendenza copyleft, nessun conflitto.

**Estesa il 2026-08-23/24** (M7, client iOS & crittografia mobile): `expo`, `expo-dev-client`, `expo-secure-store`, `expo-status-bar`, `react-native`, `@noble/curves` 2.3.0, `@noble/ciphers` 2.3.0, `@noble/hashes` 2.3.0. Tutte MIT, stesse regole. Elenco con versione in [`apps/mobile/README.md`](../../apps/mobile/README.md).

**Estesa il 2026-08-24** (M7, fase 1): `expo-secure-store` 15.0.8, MIT — sessione e indirizzo dell'istanza nel Keychain, non in chiaro sul disco. Stesso elenco nel README del client mobile.

**Ne discende un vincolo permanente**: ogni dipendenza aggiunta d'ora in poi va verificata compatibile prima di entrare, come già si verificano versione e licenza in ADR 0008, 0011 e 0013. È una riga in più nel lavoro, non un cambiamento di metodo.

## Che cosa questo significa in concreto

**Per chi ospita un'istanza senza modificarla**: nulla. Nessun obbligo, nessun adempimento. È il caso della quasi totalità degli amministratori.

**Per chi la modifica e la usa in casa propria**: nulla. L'uso privato non fa scattare niente.

**Per chi la modifica e la offre ad altri attraverso la rete**: deve offrire a quegli utenti il codice della propria versione. Qui è un vantaggio e non un costo — significa che **un membro ha il diritto di sapere quale codice sta tenendo le proprie fotografie**, che per un prodotto costruito attorno alla fiducia nell'amministratore è coerente fino in fondo.

**Per i contenuti dei membri**: la licenza riguarda il software, non ciò che le persone scrivono e pubblicano. I contenuti restano di chi li ha scritti, e nessuna clausola di questa licenza li tocca. Va detto perché è la confusione più comune sulle licenze copyleft.

## Conseguenze

**Positive.** L'affermazione «open source» diventa verificabile. Chiunque può ospitare, modificare e biforcare il progetto — il diritto di uscita di §8 diventa esercitabile anche sul software e non solo sui dati. E la promessa di §11 acquista un meccanismo legale invece di restare un auspicio.

**Negative, e reali.** L'AGPL è la licenza che più spaventa gli uffici legali: diverse aziende ne vietano l'uso interno per policy. Questo riduce il bacino di chi può contribuire da un contesto aziendale, e ridurrebbe l'adozione se un giorno ESTIA volesse entrare in organizzazioni. È un costo accettato consapevolmente: il progetto non nasce per essere adottato dalle aziende, nasce per non dipenderne.

**Da sapere per il futuro.** Cambiare licenza dopo richiede l'accordo di **tutti** i contributori, non solo del proprietario. Finché l'autore è uno solo la porta resta aperta; dal primo contributo esterno si chiude di fatto. Chi volesse tenerla aperta dovrebbe introdurre un accordo di cessione dei diritti sui contributi — cosa che ha un costo di fiducia per chi contribuisce, e che questo ADR **non** adotta.

## Quando riesaminare

- Se emergesse una dipendenza necessaria e incompatibile: si riesamina la dipendenza per prima, non la licenza.
- Se il modello a istanze cambiasse al punto che il servizio di rete non è più la forma d'uso principale, la §13 smetterebbe di essere il punto decisivo. Oggi lo è.
