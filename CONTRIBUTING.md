# Contribuire a ESTIA

Grazie per essere passato. Questo progetto lavora in un modo abbastanza preciso, e conoscerlo prima di scrivere codice ti risparmia la fatica di rifare le cose.

**Leggi [`AGENTS.md`](AGENTS.md).** Sono le regole operative, valgono per chiunque scriva qui — persone e assistenti — e questo file non le sostituisce: le riassume.

## Le tre cose che rendono diverso questo repository

**Le decisioni si scrivono prima del codice.** Ogni scelta che tocca identità, rete, crittografia, portabilità o confini di fiducia vive in un ADR in [`docs/adr/`](docs/adr/), scritto **prima** dell'implementazione. Non è burocrazia: è il motivo per cui dopo mesi i documenti dicono ancora la verità. Una pull request che introduce una di quelle scelte senza il suo ADR verrà rimandata indietro — non perché manchi un file, ma perché la decisione non è stata presa.

**Il piano dice che cosa esiste davvero.** [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) è l'unica fonte attendibile sullo stato del progetto, ed è tenuto onesto: le caselle si spuntano solo dopo una verifica reale, e ciò che non è verificato è scritto come non verificato. Si lavora **sulla milestone attiva**, non su quelle successive.

**Verificare significa provare, non credere.** Qui «funziona» ha significato finora: confrontare con un'implementazione indipendente invece che con sé stessi — Argon2id contro un'altra libreria, i backup riaperti con `age` e `tar` di sistema — e far girare le cose in un container Linux vero. Due difetti importanti di questo progetto sono usciti così, e nessun test li avrebbe trovati.

E una regola che vale la pena enunciare da sola: **niente stub che sembrano produzione**, e nessuna interfaccia che mostri una protezione che non c'è.

## In pratica

Serve Node 24.18.0 e `pnpm` (via Corepack). Da un clone pulito:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
corepack pnpm verify
```

`pnpm verify` è formatter, lint, typecheck e test. **Deve passare** prima di aprire una pull request: è lo stesso comando che gira in CI, quindi non ci sono sorprese.

Per far girare l'istanza in locale e guardarla nel browser, le istruzioni sono nel [`README`](README.md); per installarla su una macchina tua — NAS, mini-PC, vecchio portatile — in [`docs/INSTALLAZIONE.md`](docs/INSTALLAZIONE.md).

## Convenzioni

**Le lingue sono due, e non è un caso.** Documentazione, ADR e messaggi di commit in **italiano**, perché parlano a chi ospita e a chi decide. Commenti nel codice in **inglese**, come il resto dell'ecosistema in cui il codice vive.

**I commenti spiegano perché, non cosa.** Il codice dice già cosa fa. Un commento utile qui dice perché una cosa è fatta così e non nel modo ovvio, spesso citando l'ADR o il documento che lo impone.

**Ogni comportamento nuovo arriva con i suoi test**, e la documentazione toccata si aggiorna nella stessa modifica — non in una successiva che poi non arriva.

**Le dipendenze nuove vanno motivate**, con versione e licenza verificate, e devono essere compatibili con l'AGPL ([ADR 0015](docs/adr/0015-licenza-agpl.md)). Il progetto evita i moduli nativi per una ragione precisa — i NAS di destinazione sono spesso ARM e talvolta musl — decisa in [ADR 0005](docs/adr/0005-persistenza-node-sqlite.md) e difesa da allora.

## Prima di aprire una pull request grande

Aprine prima una issue e parliamone. Non per controllo: perché il perimetro di questo progetto è volutamente stretto — [`PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) §9 dice che il rischio principale, per sua stessa analisi, è lo scope creep — e sarebbe brutto vederti scrivere per giorni qualcosa che va rifiutato per una ragione che potevamo dirci prima.

Le cose che più servono adesso sono nel piano, sotto la milestone attiva. Ce n'è una che non richiede scrivere codice ed è forse la più preziosa: **installare un'istanza seguendo solo la guida, cronometrarti, e dire dove ti sei bloccato.** Il budget dichiarato è meno di trenta minuti senza assistenza; finché nessuno che non abbia partecipato ci prova davvero, resta un'ipotesi.

## Licenza dei contributi

Contribuendo accetti che il tuo contributo sia distribuito sotto **AGPL-3.0**, come il resto del progetto.

Non esiste un accordo di cessione dei diritti, ed è una scelta: significa che nessuno può cambiare la licenza senza l'accordo di tutti quelli che hanno contribuito. Il ragionamento completo, costi compresi, è in [ADR 0015](docs/adr/0015-licenza-agpl.md).

## Segnalazioni di sicurezza

Non in una issue pubblica: [`SECURITY.md`](SECURITY.md) spiega dove.
