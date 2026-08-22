# Guida alle Notifiche e agli Avvisi UI in ESTIA

Questo documento stabilisce lo standard architetturale e le linee guida operative per la gestione di notifiche, avvisi di stato ed errori nell'interfaccia web di ESTIA. È pensato come guida per sviluppatori e per coding agent (AI).

---

## 1. Architettura dei Segnali UI

In ESTIA i messaggi per l'utente sono categorizzati in quattro livelli distinti, ognuno con il proprio componente e ciclo di vita:

| Tipo                   | Meccanismo / Componente                  | Scopo                                                                                                    | Esempio                                                  |
| :--------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| **Notifiche Toast**    | `useAvvisi()` / `<AvvisiProvider>`       | Notifiche transitorie (successo, errore azione, info). Non bloccano l'interfaccia e si chiudono da sole. | «Conversazione eliminata», «Passphrase non corretta»     |
| **Avvisi di Contesto** | `<Alert tone="neutral\|error\|ok">`      | Avvisi contestuali persistenti legati a un form o a una configurazione fissa.                            | Schermate di login/setup, warning permanenti di sistema. |
| **Accessibilità**      | `<Live>`                                 | Annuncio vocale dello stato dell'operazione per screen reader (`aria-live="polite"`).                    | «Salvo l'aspetto…»                                       |
| **Notifiche Social**   | `useNotifiche()` / `<NotificheProvider>` | Conteggio attività di rete (like, risposte, richieste follow) per il badge di navigazione.               | Pallino rosso e contatore nella barra di navigazione.    |

---

## 2. Notifiche Toast (`useAvvisi`)

Per tutte le azioni utente asincrone (invio messaggio, ripristino chiavi, eliminazione chat, salvataggio impostazioni, copia link), usare **`useAvvisi`**.

### Perché i Toast?

In precedenza, gli errori venivano salvati in stati locali `useState` e mostrati tramite `<Alert>`. Se l'utente cambiava schermata o conversazione, lo stato locale non ripulito lasciava l'errore permanentemente visibile (es. _"The user has no registered active devices"_ che rimaneva su tutte le chat). `useAvvisi` risolve questo problema gestendo le notifiche in modo globale e a scomparsa automatica.

### Utilizzo nel codice

```tsx
import { useAvvisi } from "../avvisi.js";

export function MiaSchermata(): React.ReactElement {
  const { avvisa, errore, successo } = useAvvisi();

  const handleSalva = async () => {
    try {
      await api.salvaDati(...);
      // Notifica di successo (verde, auto-dismiss dopo 4s)
      successo("Modifiche salvate con successo!");
    } catch (err: unknown) {
      // Notifica di errore (rossa, auto-dismiss dopo 7s, formattata con l'euristica 9)
      errore(err, "Impossibile completare l'operazione. Riprova.");
    }
  };

  const handleInfo = () => {
    // Notifica informativa generica
    avvisa("Link copiato negli appunti.", "neutral");
  };

  return <button onClick={handleSalva}>Salva</button>;
}
```

### Metodi esposti da `useAvvisi()`

- **`errore(causa: unknown, ripiego: string)`**: traduce la causa dell'errore (usando `spiega` da `errori.ts`) e mostra un toast di errore con `role="alert"`.
- **`successo(testo: string)`**: mostra un toast di successo (verde) con icona di spunta.
- **`avvisa(testo: string, tone?: "neutral" | "error" | "ok")`**: mostra un toast personalizzato.
- **`chiudi(id: string)`**: chiude manualmente una specifica notifica prima del timeout.

---

## 3. Quando usare `<Alert>` inline vs `useAvvisi()`

- **Usa `useAvvisi()` (Toast)** per:
  - Risultato di un'azione avviata dall'utente (click su pulsante, invio messaggio, cancellazione).
  - Errori di rete o fallimenti API durante navigazione o interazione.
  - Conferme operative (es. «Chiavi ripristinate», «Backup salvato»).

- **Usa `<Alert>` (Inline)** per:
  - Form monouso a schermo intero (`Login`, `Join`, `Setup`, `Recover`) dove l'errore blocca l'intero flusso di autenticazione ed è essenziale che resti visibile sopra i campi input.
  - Avvisi statici e informativi su limitazioni di stato (es. _"Alcuni messaggi non possono essere decifrati senza chiavi"_ in cima alla lista messaggi).

---

## 4. Regole di Usabilità ed Error Handling (Euristica 9)

In conformità con [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) §«Euristiche di usabilità»:

1. **Messaggi in italiano e orientati alla soluzione**: mai mostrare codici di errore HTTP grezzi (es. `500 Internal Error`), stack trace o stringhe di sistema incomprensibili (es. `Failed to fetch`).
2. **Uso di `spiega(causa, ripiego)`**: il metodo `errore()` di `useAvvisi` include già internamente `spiega()`. Se il backend restituisce un `DomainError` con messaggio localizzato, viene mostrato quello; se l'errore è un `TypeError` del browser (rete caduta), viene mostrato _"Non riesco a raggiungere l'istanza. Controlla il collegamento e riprova."_; altrimenti viene usato il testo di ripiego fornito.
3. **Nessun vicolo cieco**: quando un'azione fallisce, il messaggio deve chiarire cosa l'utente può fare (es. «Passphrase non corretta o backup non trovato. Riprova.»).

---

## 5. Regole per Coding Agents (AI)

Quando implementi nuove schermate o funzionalità in ESTIA:

1. **Non creare nuovi stati locali `const [errore, setErrore] = useState()` per azioni asincrone**, a meno che non si tratti di validazione sincrona di un form dedicato.
2. **Utilizza `const { errore, successo } = useAvvisi()`** per gestire i blocchi `try / catch` delle chiamate API.
3. **Rispetta la CSP e i Design Token**: non applicare stili inline con colori per le notifiche; le classi CSS `.avviso-toast`, `.avviso-toast--error`, `.avviso-toast--ok` sono già definite in `components.css` e agganciate ai token di design.
4. **Verifica il comportamento su cambio vista**: assicurati che uscendo o cambiando entità (es. aprendo un'altra chat o navigando su un altro profilo) l'interfaccia rimanga pulita.
