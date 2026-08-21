# Sistema di design

Questo documento descrive come è fatta l'interfaccia di ESTIA: i valori da cui
dipende, i componenti che esistono, le regole che valgono per tutti e i vincoli
che non vengono dal gusto ma dall'istanza.

Serve a due cose. La prima: non ridecidere ogni volta un raggio, un grigio o
l'altezza di un pulsante. La seconda, che conta di più: **rendere difficile
sbagliare le cose che qui costano care** — un contrasto insufficiente, un
bersaglio troppo piccolo per un pollice, un colore scritto a mano che il giorno
dopo non segue il tema scuro.

## I quattro file, in quest'ordine

`apps/web/src/styles.css` non contiene regole: importa e basta.

| File             | Che cosa c'è                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `tokens.css`     | I valori. Nessuna regola che disegni qualcosa                    |
| `base.css`       | Il documento: azzeramenti, tipografia, fuoco, salto al contenuto |
| `layout.css`     | Dove stanno le cose alle quattro larghezze                       |
| `components.css` | I componenti, uno per blocco                                     |

C'è stato un quinto file, `legacy.css`, che ha tenuto in piedi le schermate non
ancora rifatte mentre il rifacimento procedeva una fase per volta. È nato
dichiarato in scadenza ed è stato **cancellato** quando l'ultima è passata al
sistema, che era la condizione scritta il giorno in cui è comparso.

## I token

### Il colore, e il contrasto misurato

I nomi dicono **il ruolo, non il colore**: `--accent` resta `--accent` il giorno
che smette di essere terracotta, mentre `--arancione` andrebbe rinominato in
quaranta file.

Ogni coppia che porta testo ha il suo rapporto di contrasto verificato e scritto
accanto, in `tokens.css`. Le soglie sono quelle di WCAG 2.1 AA: **4.5:1** per il
testo normale, **3:1** per il testo grande e per i bordi dei controlli e le
grafiche che veicolano informazione (criterio 1.4.11).

Due conseguenze che si vedono nei nomi:

- **`--accent-text` è separato da `--accent`.** L'accento pieno su sfondo dà
  4.54:1: passa e non avanza niente, quindi per i link e il testo esiste una
  variante più scura a 6.1:1. `--accent` resta il fondo dei pulsanti.
- **`--on-accent` cambia verso fra chiaro e scuro.** Sul terracotta chiaro il
  testo bianco dà 4.9:1 e va bene; sull'arancione del tema scuro crolla a 2.8:1,
  quindi lì il testo sopra l'accento è **scuro**. Un pulsante che si scrive
  `color: white` è un pulsante che in tema scuro non si legge.
- **`--border` non basta a delimitare un campo.** Serve `--border-strong`, che è
  a 3.8:1 sulla superficie: è il bordo di input, textarea e select.

### Lo spazio, la scala, la forma

- **Spazio** — base 4, da `--s-1` (4px) a `--s-16` (64px). Non esistono valori
  fuori scala.
- **Tipografia** — otto misure, da `--t-xs` a `--t-3xl`, in `rem`, così l'utente
  che ingrandisce il testo di sistema ottiene un'interfaccia più grande.
  Interlinea 1.5 per il corpo, 1.2 per i titoli. Stack di sistema, nessun font
  scaricato.
- **Forma** — quattro raggi e due sole ombre. Se serve una terza ombra, quasi
  sempre serviva un bordo.
- **Movimento** — due durate e una sola curva. Sotto
  `prefers-reduced-motion: reduce` diventano zero, e le animazioni si fermano.

### I punti di rottura

`600` e `1240`. Sotto i 600px: top bar (menù · lente · cerca) e tab in basso.
Da 600px: sidebar desktop con etichette. Da 1240px: terza colonna di contesto.

## La modalità, e perché ridipinge tutto da sola

ESTIA ha due superfici sociali sulla stessa identità
([ADR 0018](adr/0018-federazione-fra-istanze-estia.md)): l'**istanza**, che non
esce di casa, e la **rete**, che raggiunge chi ti segue. L'interfaccia le
distingue con una lente, non con due account.

L'implementazione è una riga:

```css
[data-modo="rete"] {
  --accent: var(--accent-rete);
  --accent-text: var(--accent-rete-text);
  /* … */
}
```

Un attributo sulla radice e **ogni componente che usa `--accent` si sposta senza
saperlo**. È esattamente il motivo per cui nessun componente ha il permesso di
scrivere un colore: il giorno che serve una terza modalità — il Fediverso, che
ADR 0018 prevede — costa un altro blocco come questo e nient'altro.

**Nelle impostazioni la lente non c'entra.** Non si mostra il toggle
Istanza/Rete, e `data-neutro` riporta `--accent` al contrasto del testo (nero su
chiaro, chiaro su scuro): terracotta e petrolio restano alle superfici sociali,
dove sbagliare la lente ha un prezzo.

La variazione cromatica non è decorazione. Una modalità è il difetto di
usabilità classico: si dimentica in quale si è, e qui sbagliare significa
pubblicare al pubblico sbagliato. Il colore è la difesa che agisce prima della
lettura; le altre due — la destinazione ripetuta a parole sotto il composer, e
l'etichetta che il post si porta addosso — agiscono dopo.

## I componenti

Stanno in `apps/web/src/ui/` e si importano da `apps/web/src/ui/index.ts`.

| Componente                   | Quando                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `Button`, `IconButton`       | Ogni azione. `IconButton` **pretende** una `label`: senza, non si sa cos'è  |
| `TextField`, `TextAreaField` | Campi con etichetta, aiuto ed errore già legati con `aria-describedby`      |
| `Choice`                     | Una scelta con la sua **conseguenza** scritta sotto, non la sua ripetizione |
| `Avatar`                     | La faccia di una persona: iniziali, con lo slot per l'immagine già pronto   |
| `Alert`, `Badge`             | Un avviso, un'etichetta di stato                                            |
| `EmptyState`                 | Un vuoto che dice che cosa si può fare adesso (classe `.empty`)             |
| —                            | Un commento eliminato che regge risposte è una **lapide**: `.thread-lapide` |
| —                            | Messaggio corto in una lista: `.empty-inline`, non `.empty`                 |
| `SkeletonPost`               | L'attesa di qualcosa la cui struttura è nota                                |
| `ListRow`                    | La riga di un elenco. È la primitiva delle impostazioni                     |
| `SegmentedControl`, `Tabs`   | Scegliere fra due o tre cose che stanno tutte a schermo                     |
| `Sheet`                      | Una scheda modale: `<dialog>`, quindi fuoco e Esc funzionano da soli        |
| `Icon`                       | Venti tracciati disegnati qui, senza nessuna dipendenza                     |

Tre note che valgono più delle altre.

**`ListRow` cambia elemento in base a che cosa fa.** Con `to` è un link, e il
browser sa aprirlo in una scheda nuova; con `onClick` è un pulsante, e la
tastiera lo attiva con Invio e con la barra; senza nessuno dei due è una riga di
sola lettura e resta fuori dal percorso del Tab. Non è una sottigliezza: una
riga cliccabile fatta con un `<div>` è invisibile a chi non usa il mouse.

**`Sheet` esiste perché `<dialog>` porta con sé quattro comportamenti** — il
livello più alto, la trappola del fuoco, l'inerzia del resto della pagina e la
chiusura con Esc — che riscritti a mano si sbagliano quasi sempre.

**`Tabs` implementa le frecce.** Se un elemento si dichiara `role="tab"`, chi
usa la tastiera si aspetta che le frecce spostino la selezione. Dichiarare il
ruolo senza il comportamento è dire una cosa non vera.

## Le icone

Venti tracciati in `apps/web/src/ui/icons/Icon.tsx`, disegnati qui.

**Nessuna libreria**, e la ragione è in `AGENTS.md`: ogni dipendenza nuova va
verificata compatibile con AGPL-3.0 prima di entrare, e va poi aggiornata per
sempre. Venti tracciati non valgono quel prezzo.

Tutte sulla griglia da 24, tratto e non riempimento, `currentColor` ovunque —
così un'icona prende il colore del testo accanto e la modalità la ridipinge da
sé. Sono **decorative**: `aria-hidden`, perché il significato sta nel testo o
nell'`aria-label` di chi le contiene. Un'icona che si annuncia da sola raddoppia
ogni voce di menu per chi ascolta la pagina.

## Le regole che valgono per tutti

- **Bersaglio tattile ≥ 44px.** Dove una riga sembra più bassa, è l'area
  cliccabile a restare alta.
- **Icona con etichetta.** Nella barra di navigazione la parola sta sotto
  l'icona, piccola ma presente. `aria-label` in ogni caso. Vale anche per la
  lente: due icone astratte per il controllo che decide chi leggerà quello che
  scrivi sono una difesa che bisogna già conoscere per riconoscerla.
- **Lo stato attivo non è solo colore.** Nella barra in basso la voce corrente ha
  anche un fondo, perché chi non distingue i colori deve comunque sapere dov'è.
  È il criterio 1.4.1 di WCAG, e nella barra in basso è l'unico posto dove
  sbagliarlo lascia senza nessun'altra indicazione.
- **`:focus-visible`, mai `:focus`.** Chi arriva col mouse non ha bisogno
  dell'anello; chi arriva col Tab non può farne a meno.
- **Un salto al contenuto** come primo elemento focalizzabile del documento.
- **`100dvh`, mai `100vh`.** Sul telefono la barra del browser compare e sparisce,
  e `100vh` mente.
- **`env(safe-area-inset-bottom)`** sotto la barra di navigazione. Funziona solo
  perché `index.html` dichiara `viewport-fit=cover`: senza, l'inset vale zero.
- **Scheletro, non rotella,** dove la struttura è nota.

## Il permesso di leggere, e dove vive

Un post `local` è di tutta l'istanza; uno `followers` è di chi lo scrive e di chi
lui ha **accettato**. Quella condizione sta in **un posto solo** — `leggibileDa`
in `feed/repository.ts` — e la usano sia il feed sia la lettura di un post per
indirizzo.

Il motivo per cui vive in un posto solo è che per un giorno è vissuta in due: il
feed filtrava e `GET /posts/:id` no, quindi un post di rete si leggeva, si
commentava e si metteva mi piace aprendone l'indirizzo. Chi non ha il permesso
riceve **404 e non 403**: distinguere «non esiste» da «non puoi» direbbe a
chiunque, un indirizzo per volta, chi ha scritto che cosa.

Chi modera passa comunque, per una porta separata e dichiarata: altrimenti la
superficie di rete non sarebbe moderabile affatto.

## I vincoli che vengono dall'istanza

Non sono preferenze. Vengono dalla policy che l'istanza serve con la propria
interfaccia (`apps/core-api/src/web/static.ts`).

**Niente attributi `style`.** La policy è `style-src 'self'` senza
`unsafe-inline`, e l'attributo `style` di un elemento ricade sotto quella
direttiva: il browser lo scarta. Quindi niente `style={{…}}` e niente custom
property impostata sull'elemento. Le due esigenze che lo chiederebbero si
risolvono altrimenti:

- **un colore per persona** — una classe fra sei, scelta con un hash dello
  username (`Avatar`);
- **le proporzioni di un'immagine** — gli attributi `width` e `height`
  sull'`<img>`, da cui il browser deriva `aspect-ratio` da solo; e per un
  segnaposto un `<svg>` vuoto con `viewBox`, che è un attributo e non stile
  (`MediaImage`).

**Niente font esterni.** `font-src 'self'`: stack di sistema, oppure un file
dentro la build. Sulla rete di casa lo stack di sistema è anche il più veloce.

**Niente dipendenze di stile.** Nessuna libreria di CSS, di componenti o di
icone: `AGENTS.md` chiede una verifica di licenza per ognuna, e nessuna di queste
la ripaga.

## Come si aggiunge qualcosa

1. **Prima si cerca.** Quasi tutto è una composizione di `card`, `row`, `cluster`
   e `stack`.
2. **Nessun valore fuori dai token.** Niente `#hex`, niente `12px`, niente
   `0.7rem` scritti dentro un componente.
3. **Si verifica il contrasto**, e si scrive il numero accanto al token, come già
   fanno tutti gli altri.
4. **Si prova con la sola tastiera** prima di considerarlo finito.
5. **Si prova alle tre larghezze** — 375, 768, 1440 — e nei due temi.
6. **Si guarda la console** cercando violazioni della policy: è il modo in cui si
   scopre un attributo `style` sfuggito.

## Le schermate, e dove stanno

| Percorso                               | Che cos'è                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/`                                    | La bacheca, nella lente corrente                                                         |
| `/cerca`                               | La ricerca, nell'ambito della lente corrente                                             |
| `/p/<id>`, `/p/<id>/c/<id>`            | Un post, e il fuoco su una sua risposta                                                  |
| `/messaggi`, `/notifiche`              | Destinazioni vere, funzioni ancora da costruire                                          |
| `/scrivi`                              | Pubblicare un post                                                                       |
| `/modifica-profilo`                    | Nome e bio: non è una voce delle impostazioni                                            |
| `/@nome`                               | La pagina di una persona di questa istanza                                               |
| `/r/:istanza/:nome`                    | La pagina di una persona di un'altra istanza                                             |
| `/profilo`                             | Reindirizza al proprio `/@nome`                                                          |
| `/impostazioni`                        | Guscio: lista a sinistra, dettaglio a destra (≥840px); sul telefono lista oppure sezione |
| `/impostazioni/<sezione>`              | Una sezione per argomento                                                                |
| `/impostazioni/amministrazione/<sez.>` | Le sezioni di chi amministra (EstiaNet al posto di Rete + Istanze collegate)             |
| `/accedi`, `/entra`, `/recupera`       | Fuori dalla cornice: non c'è ancora una sessione                                         |

Le sezioni delle impostazioni non si scrivono a mano in tre posti: stanno in
`screens/impostazioni/registro.ts`, e da lì escono insieme la nav, il filtro che
la cerca e le rotte.

## Che cosa non c'è

- **Le foto profilo.** Non esistono nello schema né nelle API. `Avatar` ha già lo
  slot; il resto è un incremento a sé.
- **La terza modalità (Fediverso).** Prevista da ADR 0018, richiede un dominio.
  Il componente regge _n_ modalità e oggi ne rende due.
- **Una scheda «Foto» sul profilo.** Filtrerebbe solo la pagina già caricata, e
  un elenco che vale per un pezzo solo dei dati è peggio di una scheda che
  manca. Serve un filtro sul server.
- **Test dell'interfaccia.** `apps/web` non ne ha: si verifica facendola girare,
  con la lista qui sopra.
