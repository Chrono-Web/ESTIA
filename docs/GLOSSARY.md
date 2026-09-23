# Glossary

Most of ESTIA's documents are in Italian, and the code uses Italian names for many domain concepts: `archivio`, `segnaposto`, `battito`. This page maps those words to English.

A term may look like an everyday word. Here it means one precise thing, which the linked document defines. When in doubt, the ADR wins over this page.

## Places and people

| Italian            | English         | Meaning                                                                                                                                                                                                            |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **istanza**        | instance        | One ESTIA installation: one container, one SQLite database, one key pair.                                                                                                                                          |
| **casa**           | home            | An instance seen as the physical place it runs in. "Two homes" means two instances in two buildings. In MLS contexts it is also the instance a member belongs to ([ADR 0042](adr/0042-come-mls-attraversa.md) §0). |
| **comunità**       | community       | The people who share an instance: a flat, a building, a street, a social space. The interface avoids "quartiere" (neighbourhood), which fits only one of those.                                                    |
| **membro**         | member          | A person with an account on an instance.                                                                                                                                                                           |
| **amministratore** | administrator   | A member with the `instance_admin` role.                                                                                                                                                                           |
| **il terzo**       | the third party | Whoever a feature relies on outside the instance, such as a relay or Tailscale. Documents list what the third party sees.                                                                                          |
| **pilot**          | pilot           | The first real communities using ESTIA. Recruiting them happens outside this repository.                                                                                                                           |

## Joining and identity

| Italian                       | English       | Meaning                                                                                                                                                                                                     |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **primo contatto**            | first contact | The first time a device meets an instance. It happens on the home network ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)).                                                                          |
| **codice di configurazione**  | setup code    | One-time code printed at start-up that authorises the first-run setup. Changes at every restart.                                                                                                            |
| **invito**                    | invite        | A link that lets someone ask to join.                                                                                                                                                                       |
| **richiesta di ammissione**   | join request  | What an invite produces. An administrator accepts or refuses it.                                                                                                                                            |
| **codice di recupero**        | recovery code | A transcribable code that resets a password ([ADR 0009](adr/0009-recupero-accesso-amministratore.md)).                                                                                                      |
| **dispositivo**               | device        | A physical device that holds keys. It is not the same thing as a **sessione** (session), which is a login ([ADR 0034](adr/0034-distinzione-tra-dispositivo-fisico-e-sessione-di-login.md)).                 |
| **frase segreta**, passphrase | passphrase    | Protects the backup of a device's keys; the fallback for someone with a single device ([ADR 0028](adr/0028-il-dispositivo-portatore-di-chiavi.md), [0040](adr/0040-un-membro-ha-piu-di-un-dispositivo.md)). |
| **presenza**                  | presence      | Whether a member exists outside the instance: `non_presente`, `presente_privato`, `presente_pubblico`.                                                                                                      |
| **aspetto**                   | appearance    | Personal interface preferences, chosen from a closed catalogue ([ADR 0024](adr/0024-preferenze-ui-personali.md)).                                                                                           |

## The feed and the network

| Italian                             | English                     | Meaning                                                                                                                                                               |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bacheca**, feed                   | board, feed                 | A timeline of posts. The **feed locale** is the instance's own.                                                                                                       |
| **lente**, **modo**                 | lens, mode                  | What you are looking at: **istanza** (nothing leaves home) or **rete** (the network, reaching people who follow you). One identity in both.                           |
| **cuore**                           | heart, like                 | A like. Likes cross instances; notifications are derived from them ([ADR 0025](adr/0025-i-cuori-attraversano-e-le-notifiche-sono-una-lettura.md)).                    |
| **si visita, non si replica**       | visited, not copied         | A post is fetched from its author's instance when read, never stored elsewhere ([ADR 0023](adr/0023-come-si-legge-la-bacheca-di-una-persona-di-un-altra-istanza.md)). |
| **istanze collegate**, collegamento | linked instances, link      | The administrative relationship between two instances: requested by one, accepted by the other, stored as a row keyed by the other's public key.                      |
| **legame sociale / amministrativo** | social / administrative tie | A tie born from a follow, versus one an administrator creates on purpose ([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)).                                     |
| **EstiaNet**                        | EstiaNet                    | The admin panel for the network: switch it on, share the instance's key, manage linked instances.                                                                     |
| **relay**                           | relay                       | A server that forwards encrypted packets between two instances whose routers cannot connect directly. Sees no content, keeps nothing.                                 |
| **battito**                         | heartbeat                   | Every five minutes an instance asks each linked instance whether it is there, backing off up to one hour ([ADR 0041](adr/0041-le-istanze-si-tengono-d-occhio.md)).    |
| **risveglio della coda**            | queue wake-up               | When a silent instance answers again, the outgoing queue towards it restarts at once.                                                                                 |
| **tetto di tempo**                  | time cap                    | Every request to another instance has a timeout; without one, "reachable" would not be a state.                                                                       |
| **profilo di accensione**           | power-on profile            | When a home's machine is on, as visible to a relay at five-minute resolution. A cost of the heartbeat, declared in ADR 0018.                                          |

## Private messages

| Italian                    | English                 | Meaning                                                                                                                                                                                                       |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **messaggi privati**, chat | private messages, chat  | End-to-end encrypted conversations. There is no plaintext version ([ADR 0006](adr/0006-messaggi-privati-end-to-end-o-niente.md)).                                                                             |
| **`ESTIA-E2E-v1`**         | `ESTIA-E2E-v1`          | The first protocol: static ECDH P-256 plus AES-GCM-256, with four declared limits ([ADR 0036](adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md)). The web client stopped using it on 2026-09-23; it is not MLS. |
| **busta**                  | envelope                | How `ESTIA-E2E-v1` delivered a message to another instance. The MLS chat no longer sends content in envelopes.                                                                                                |
| **custodia lato mittente** | sender-side custody     | Each person's words are kept only by their own home. Other homes hold placeholders and visit for content ([ADR 0043](adr/0043-custodia-lato-mittente.md)).                                                    |
| **casa custode**           | custodian home          | The home that holds an entry and serves it on request. Normally the author's.                                                                                                                                 |
| **archivio**, **voce**     | archive, entry          | Where the custodian home keeps encrypted entries of a conversation. One entry is one message.                                                                                                                 |
| **segnaposto**             | placeholder             | What other homes store instead of content: seven fields (id, conversation, sender, custodian home, sent at, received at, `seq`), no length, no hash ([ADR 0042](adr/0042-come-mls-attraversa.md) §4.1).       |
| **`segnaposto-da`**        | placeholders-since      | The recovery operation: "give me what exists after this cursor". Inside the window it declares, anything not listed must be deleted by the receiver.                                                          |
| **ritiro**, ritirare       | withdrawal, to withdraw | An author's words leave with their home. A withdrawn message leaves no tombstone and does not come back.                                                                                                      |
| **casa che ordina**        | sequencing home         | The home that puts a group's MLS handshake messages in order: the one where the conversation was created ([ADR 0042](adr/0042-come-mls-attraversa.md) §3).                                                    |
| **trasloco**               | relocation              | When the sequencing home is lost (over 30 days silent), an administrator elsewhere creates a declared **gruppo successore** (successor group); the old one becomes read-only.                                 |
| **punto di rientro**       | re-entry point          | The MLS `GroupInfo` of the current epoch, which lets a device rejoin a conversation.                                                                                                                          |
| **catena**                 | chain                   | The chain of archive keys `{A₁…Aₙ}`. The last one encrypts new entries ([ADR 0037](adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)).                                                                  |
| **mazzo**                  | deck                    | The chain wrapped under the current epoch's key, travelling inside the group so members can read history.                                                                                                     |
| **riavvolgere il mazzo**   | rewrap the deck         | Re-encrypting the deck for a new epoch. A device without the chain must not do it: it would replace everyone's history.                                                                                       |
| **numero di sicurezza**    | safety number           | Out-of-band verification of a contact's keys. Not built yet.                                                                                                                                                  |
| **credenziale**            | credential              | An MLS member's name: `<username>@<home's key>` ([ADR 0042](adr/0042-come-mls-attraversa.md) §0).                                                                                                             |
| **il taglio**              | the cut                 | Switching a client from `ESTIA-E2E-v1` to MLS. Done for the web client on 2026-09-23.                                                                                                                         |

## Operations

| Italian                             | English            | Meaning                                                                                                                                                         |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **backup**, **archivio `.tar.age`** | backup, archive    | A `tar` encrypted with age to a public key whose private half is kept off the NAS ([ADR 0013](adr/0013-backup-cifrati-in-formato-age.md)).                      |
| **ripristino**, ripristinare        | restore            | Done from the terminal only (`estia ripristina`), because it is needed when the interface does not open ([ADR 0016](adr/0016-backup-dal-pannello.md)).          |
| **cifratura a riposo**              | encryption at rest | Done by the host's volume, not by ESTIA; the instance reports what it can verify ([ADR 0007](adr/0007-cifratura-a-riposo-e-furto-fisico.md)).                   |
| **diagnostica**                     | diagnostics        | The admin view where the instance says what is wrong or unprotected.                                                                                            |
| **aggiornamento**                   | update             | A new image. Migrations only go forward, and a backup is taken before them when backups are configured ([ADR 0014](adr/0014-backup-prima-delle-migrazioni.md)). |

## How the project talks about its own work

| Italian               | English                        | Meaning                                                                                                               |
| --------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **milestone**, M0…M8  | milestone                      | A step of [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Numbers are never reused: M7 is withdrawn and stays M7. |
| **gate**              | gate                           | A milestone's acceptance test, done on real hardware with real people. No code closes a gate.                         |
| **sul campo**         | in the field                   | On real machines in real homes, not in a lab or a test.                                                               |
| `[ ]` / `[~]` / `[x]` | not started / built / verified | `[~]` has code, tests and docs but not yet the field proof, and does not count towards a gate.                        |
| **spike**             | spike                          | A measurement taken before a decision, recorded in [`spike/`](spike/). A spike decides nothing on its own.            |
| **lapide**            | tombstone                      | The section that records a withdrawn milestone and why (M7).                                                          |
| **deroga**            | declared exception             | A written, bounded exception to a rule, such as working on two milestones in parallel.                                |
| **euristiche**        | heuristics                     | The usability rules of [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). Every interface change must satisfy all of them.       |
