# ADR 0024 — Preferenze UI personali a catalogo chiuso

- Stato: **Accepted**
- Data: 2026-08-21
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0010](0010-client-web-spa-statica.md), [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md)

## Contesto

L'aspetto (chiaro / scuro / sistema) viveva solo nel browser, in `localStorage`.
Non seguiva la persona da un dispositivo all'altro, e non c'era modo di scegliere
un contrasto più alto o una palette diversa senza reinventare i token a mano.

Due domande si sovrapponevano: **dove** vive la preferenza, e **quanto** si può
cambiare. La prima è di modello; la seconda è di accessibilità e di identità
visiva delle due lenti (istanza / rete).

## Decisione

1. **Le preferenze di aspetto sono della persona, non dell'istanza.** Nessun
   amministratore le impone; nessuno le vede sul profilo pubblico; non
   attraversano la federazione. Vivono in `ui_preferences`, legate a `users.id`.

2. **Catalogo chiuso, non tema libero.** Tre assi:
   - `aspetto`: `sistema` | `chiaro` | `scuro`
   - `contrasto`: `normale` | `alto`
   - `palette`: un id da un elenco fissato nel codice (`terracotta`,
     `ambra-acqua`, `rosso-petrolio`, `neutro`)

   Ogni palette è una **coppia** Istanza/Rete già misurata (WCAG AA). Il client
   non sceglie due colori indipendenti e non spedisce CSS.

3. **API dedicata.** `appearance` entra in `AuthenticatedUser` (login e
   `/api/v1/auth/me`). Si aggiorna con `PUT /api/v1/me/appearance`. Non passa da
   `PUT /api/v1/profile`: quello resta ciò che gli altri vedono di te.

4. **Il browser applica attributi sulla radice** (`data-aspetto`,
   `data-contrasto`, `data-palette`). Dopo il login vince il server;
   `localStorage` resta solo cache pre-login.

5. **I campioni che si vedono scegliendo sono token, non colori scritti accanto
   alla card.** Una palette è una coppia _per tema_: la stessa voce è terracotta
   di giorno e più chiara di notte, perché su fondo nero il valore di giorno non
   si legge. Un campione fissato accanto al componente resta al valore chiaro
   sempre, e chi sceglie di notte sceglie su un'anteprima falsa. Vivono in
   `tokens.css` come `--sw-<palette>-istanza` / `--sw-<palette>-rete`, definiti
   per chiaro e per scuro insieme alla palette che rappresentano.

## Perché non le alternative

**Tema dell'istanza** — confonde «come vedo io» con «come appare la casa». Un
membro ipovedente non deve chiedere all'amministratore di alzare il contrasto
per tutti.

**Color picker / CSS arbitrario** — rompe i contrasti misurati e la distinzione
delle due lenti. Il modello Cursor/VS Code (preset) basta.

**Solo `localStorage`** — non è sul profilo: un secondo dispositivo riparte da
zero. Accettabile come cache, non come fonte di verità.

## Conseguenze

**Positive.** Preferenze che seguono l'account; contrasti restano verificabili;
le lenti Istanza/Rete restano riconoscibili per costruzione.

**Negative.** Aggiungere una palette costa un blocco in `tokens.css`, la sua
coppia di campioni per chiaro e per scuro, e una voce nel contratto — di
proposito. È il prezzo che tiene chiuso il catalogo.

**Da tenere presente.** Le preferenze non migrano tra istanze: restano sulla
casa in cui abiti.

**Aggiornamento del 2026-08-21.** La prima versione fissava i campioni della
scelta accanto alla card, con i valori del tema chiaro. In tema scuro le quattro
voci mostravano quindi colori che l'applicazione non avrebbe usato: la decisione
non cambia, ma il punto 5 qui sopra ne scrive il vincolo, perché era esattamente
il modo di sbagliarla.

## Quando riesaminare

Se il mobile nativo avrà un percorso di tema diverso, o se WCAG AAA diventa
requisito del pilot.
