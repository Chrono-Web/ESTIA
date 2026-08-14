# ADR 0012 — Le immagini si scaricano autenticate, non da URL che valgono da soli

- Stato: **Accepted**
- Data: 2026-08-14
- Proprietario: progetto ESTIA
- Vincolante per: M2.3, M2.4
- Modifica: la Content Security Policy fissata in [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §3

## Contesto

Il feed è chiuso: nessuna sua API risponde senza una sessione viva, e l'autorizzazione viene dalla sessione e mai dalla provenienza della richiesta ([`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §2). Le immagini di M2.3 sono contenuto del feed, quindi devono stare dentro lo stesso confine.

Il problema è che un'immagine, in una pagina, si carica in un modo che non passa dal nostro codice: il browser mette `<img src="…">` e va a prendere l'URL **senza intestazioni nostre**. Il token di sessione vive in `localStorage` e viaggia in `Authorization` (M1.4): un `<img>` non lo porta con sé.

O si trova il modo di far passare la credenziale, o le immagini finiscono fuori dal confine che protegge tutto il resto.

## Opzioni

| Opzione                                   | Che cosa comporta                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Token nell'URL** (`?token=…`)           | Il segreto entra in un URL: log del server, cronologia del browser, `Referer`, copia-incolla di un link     |
| **URL firmati a scadenza breve**          | Non espone la sessione, ma introduce un secondo schema di credenziali da emettere, far scadere e revocare   |
| **Cookie solo per i media**               | Rimette in gioco il CSRF che M1.4 aveva tolto di mezzo scegliendo `Authorization`                           |
| **Recupero autenticato e `blob:` locale** | L'immagine si scarica con `fetch` e `Authorization`, poi si mostra da un URL che vive solo dentro la pagina |

## Decisione

**Il client scarica le immagini con `fetch` e l'intestazione `Authorization`, e le mostra da un URL `blob:` creato nella pagina.** Nessun token compare mai in un URL, e non esiste un secondo tipo di credenziale.

Ne discendono tre vincoli, che sono la parte vincolante di questa decisione:

1. **Gli endpoint dei media rispondono solo a una sessione viva**, come ogni altra rotta del feed. Un id di media non è una credenziale: conoscerlo non basta.
2. **Il token non entra mai in una query string**, in nessuna forma e per nessuna comodità.
3. **La cache degli URL `blob:` è per sessione.** Al logout la pagina viene ricaricata e gli oggetti muoiono con essa: revocare una sessione non deve lasciare immagini leggibili in una scheda aperta.

### La conseguenza sulla Content Security Policy

Perché il browser accetti di mostrare un `blob:` in un `<img>`, la direttiva `img-src` deve elencarlo. La politica passa quindi da `img-src 'self' data:` a `img-src 'self' data: blob:`.

Vale la pena dire con precisione **che cosa si sta e che cosa non si sta allentando**, perché è il tipo di modifica che si accetta per abitudine:

- `blob:` **non è una sorgente esterna.** Un URL `blob:` può essere creato solo da codice già in esecuzione nella pagina, ha l'origine della pagina, e non è raggiungibile da fuori. Non apre alcun canale verso terze parti: la regola di [`SECURITY_BASELINE.md`](../SECURITY_BASELINE.md) §3 secondo cui l'istanza non carica nulla da nessun altro resta intatta.
- **Non c'è alcun `unsafe-inline` e nessuna esecuzione in più.** `img-src` governa immagini, non script: uno script iniettato non guadagna nulla da questa riga. Il test che verifica l'assenza di `unsafe-inline` resta, e resta vero.
- Ciò che si concede davvero è che uno script già capace di eseguire nella pagina possa **mostrare** dati che ha già raccolto. Ma uno script in quella posizione ha già il token in `localStorage`: `img-src` non era ciò che lo tratteneva.

L'alternativa a `blob:` sarebbe stata la codifica `data:` — già ammessa e più permissiva, visto che è consentita anche a contenuto costruito interamente in memoria. Non ci sarebbe stato niente da modificare nella politica, ma ogni immagine sarebbe passata per una stringa base64 un terzo più grande, tenuta in memoria per intero. Si è scelta la forma più efficiente e non quella che evitava di toccare un documento.

## Conseguenze

**Positive.** Le immagini stanno nello stesso confine di tutto il resto del feed. Un solo tipo di credenziale in tutto il sistema. Nessun URL che, copiato in una chat, mostri a chiunque una foto del quartiere.

**Negative.** Il browser non può usare la propria cache HTTP per le immagini nel modo consueto, perché ogni recupero passa da `fetch`: il client deve tenere una piccola cache propria degli oggetti già scaricati, altrimenti ogni ricomposizione della bacheca li riscaricherebbe. È qualche riga in più nel client, non un meccanismo.

**Accettata consapevolmente.** Una scheda già aperta continua a mostrare le immagini che ha in memoria anche dopo la revoca della sessione, finché non viene ricaricata: come per ogni contenuto già disegnato nella pagina. La revoca impedisce di **prenderne altre**, ed è ciò che significa e ciò che l'interfaccia dice.

## Quando riesaminare

- Se arriverà un client mobile: lì il caricamento delle immagini passa da un livello di rete che le intestazioni le può mettere, e il problema semplicemente non si pone.
- Se i contenuti `public` federati diventassero una milestone autorizzata: quelli sono pubblici per definizione, escono da questo confine, e vorranno un percorso di servizio distinto — non un allentamento di questo.
