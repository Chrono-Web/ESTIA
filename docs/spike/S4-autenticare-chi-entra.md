# S4 — Autenticare chi entra, e riconoscere chi dice di essere

- Data: 2026-08-26
- Eseguito da: sessione di lavoro assistita, in laboratorio locale
- Domanda di [ADR 0038](../adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) in prova: punto 1 di §«Che cosa va costruito, in ordine» — _«l'ingresso esterno verifica che la credenziale sia ben formata, non che sia tua. Con `ts-mls` senza `AuthenticationService`, il rientro autonomo è una porta»_
- Esito: **riuscito** — la porta esiste, si chiude, e chiudendola resta scoperta una seconda cosa che solo l'utente può verificare. In più: **un difetto della libreria**

## La risposta in tre righe

La porta c'è ed è aperta di serie: `defaultAuthenticationService` **risponde sempre `true`**.
Si chiude legando la credenziale al registro dei dispositivi, che ESTIA ha già.
Ma quella chiusura non protegge da chi tiene il registro — e per quello serve un numero da confrontare a voce.

## Ambiente

| Voce                    | Valore                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Libreria                | `ts-mls` 1.6.2, ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` |
| Node                    | 22.22.2                                                               |
| Componenti ESTIA        | **nessuno avviato**: lo spike è isolato, fuori dal repository         |
| Modifiche al repository | nessuna                                                               |

## Parte 1 — La porta è aperta, ed è il default

Mallory non ruba niente. Ottiene un `GroupInfo` — che [S3](S3-il-rientro-di-un-dispositivo.md) ha stabilito che l'istanza deve pubblicare — e **si fabbrica da sola** una credenziale che dice «anna», con una chiave sua.

```
════ PARTE 1 — L'attacco, con la configurazione predefinita ════
  ✓  Bruno accetta il commit. Il gruppo è ["anna","bruno","anna"]
  ✓  Mallory È DENTRO come «anna», con una chiave che si è fabbricata
       defaultAuthenticationService risponde sempre true — ed è il default.
```

Il codice della libreria è di tre righe e non lascia dubbi:

```js
export const defaultAuthenticationService = {
  async validateCredential(_credential, _signaturePublicKey) {
    return true;
  },
};
```

Non è un difetto di `ts-mls`: MLS **delega** deliberatamente l'autenticazione all'applicazione, perché solo l'applicazione sa che cosa significa un'identità. Ma il valore predefinito è permissivo, e chi lo lascia com'è non ha autenticazione.

## Parte 2 — La difesa: legare la credenziale al registro

ESTIA ha già ciò che serve: la tabella `device_keys` associa ogni chiave di dispositivo a un membro. Un `AuthenticationService` che la interroga è una quindicina di righe.

```
════ PARTE 2 — La difesa: legare la credenziale al registro ════
  ✓  Mallory è respinta (ValidationError): la sua chiave non è fra quelle registrate per «anna»
  ✓  Anna vera entra lo stesso: ["anna","bruno","anna"]
```

Entrambe le metà contano. Respinge l'estranea, **e non respinge la persona vera**: una difesa che chiude anche la porta di casa non è una difesa, è un guasto.

## Parte 3 — Che cosa quella difesa non ferma

Il registro è dell'istanza. Se l'avversario **è** l'istanza — o chi la amministra, o chi l'ha compromessa — può registrare una chiave propria come dispositivo di Anna, e a quel punto l'`AuthenticationService` la trova e dice di sì.

```
════ PARTE 3 — Che cosa la difesa NON ferma ════
  ✓  l'istanza entra come «anna»: l'AuthenticationService si fida del registro, e il registro è suo
       → è il limite 4 di ADR 0036, e nessuna difesa lato protocollo lo chiude.
```

**Sono due minacce diverse, e questa è la ragione per cui [ADR 0038](../adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) diceva di chiuderle insieme.** L'`AuthenticationService` ferma l'estraneo: è un guadagno reale, e va fatto. Non ferma chi ospita, perché è costruito sulla parola di chi ospita. Nessun meccanismo interno al protocollo può chiudere quel secondo buco: se il canale che ti dice «questa è la chiave di Anna» è controllato dall'avversario, la verifica deve passare da fuori.

## Parte 4 — Il rimedio fuori banda

Un numero derivato dalle chiavi di firma delle due persone, ordinate, così che entrambe ne calcolino uno identico senza scambiarsi niente.

```
════ PARTE 4 — Il rimedio fuori banda: il numero di sicurezza ════
     Anna legge : 23636 62399 36640 27223 49114 56652
     Bruno legge: 23636 62399 36640 27223 49114 56652
  ✓  i due leggono lo stesso numero: si confronta a voce, e non passa dall'istanza
     se l'istanza sostituisce la chiave di Anna: 05289 18966 60525 13879 45960 30375
  ✓  il numero CAMBIA: la sostituzione della parte 3 si vede, ed è l'unico modo di vederla
```

È il «numero di sicurezza» che Signal mostra, e funziona per la ragione più semplice possibile: **si confronta su un canale che l'istanza non controlla** — a voce, di persona, al telefono. Se i due numeri coincidono, la sostituzione della parte 3 non è avvenuta. Se non coincidono, è avvenuta qualcosa.

Per ESTIA è più interfaccia che crittografia: derivarlo è una `sha256`, mostrarlo e spiegare perché confrontarlo è il lavoro vero.

## Il difetto della libreria, trovato per caso

Mentre costruivo l'attacco, `joinGroupExternal` **non è più tornata**. Non un'attesa che non si risolve: un ciclo **sincrono**, che non cede mai l'event loop — un `setTimeout` di guardia non è mai scattato.

Isolato in una matrice, un processo per caso:

| identità del chiamante             | `resync` | esito              |
| ---------------------------------- | -------- | ------------------ |
| «anna», **stessa chiave di firma** | `true`   | ritorna, entra     |
| «anna», stessa chiave              | `false`  | ritorna, entra     |
| «anna», **chiave diversa**         | `true`   | **ciclo infinito** |
| «anna», chiave diversa             | `false`  | ritorna, entra     |
| «mallory», identità nuova          | `true`   | **ciclo infinito** |
| «mallory», identità nuova          | `false`  | ritorna, entra     |

**`resync: true` cicla all'infinito quando la chiave di firma di chi entra non è già nell'albero.** Ha senso che quel caso sia un errore — `resync` vuol dire «sostituisci la mia foglia», e se non c'è una foglia tua non c'è niente da sostituire — ma la libreria non solleva un'eccezione: si blocca.

**Che cosa significa per ESTIA.** Il percorso legittimo di [S3](S3-il-rientro-di-un-dispositivo.md) è salvo: chi rientra con la passphrase riusa la **stessa** chiave di firma, che è la prima riga della tabella, e funziona. Si blocca invece esattamente il caso di chi **non** ha la passphrase e prova a rientrare da solo: il browser si pianta senza dire niente. È lato client, quindi non è un attacco al server — ma è la persona già più in difficoltà che riceve la schermata peggiore.

**Regola per l'implementazione**: non chiamare mai `resync: true` senza sapere che la propria chiave di firma è già nell'albero. E vale la pena aprire la segnalazione a monte.

## Limiti di questa prova

**Il numero di sicurezza qui è una dimostrazione, non un disegno.** La formula (`sha256` su chiavi ordinate, sei gruppi da cinque cifre) è plausibile e imita quella di Signal, ma non è stata confrontata con la letteratura né scelta con criterio: quante cifre servano, e come si comporti in un gruppo di più di due, restano da decidere.

**Non è stato provato con più di due membri.** In un gruppo, «il numero di sicurezza» va ripensato: si confronta con ciascuno, o si deriva dall'insieme? Sono due prodotti diversi.

**L'`AuthenticationService` della parte 2 è un abbozzo.** Non gestisce la revoca di un dispositivo, né i dispositivi multipli della stessa persona nel tempo, né che cosa succede a una foglia già nell'albero quando la sua chiave viene tolta dal registro.

**Non è stato misurato il costo.** `validateCredential` viene chiamata a ogni validazione dell'albero; se in ESTIA significa una query per foglia, su gruppi grandi va guardato.

## Conseguenze per ADR 0038 e ADR 0036

1. **Il punto 1 di [ADR 0038](../adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) è chiuso**, e la sua premessa era esatta: senza `AuthenticationService` l'ingresso esterno è una porta, ed è aperta di serie. La difesa esiste, costa poco, e usa un registro che ESTIA ha già.
2. **Montare l'`AuthenticationService` non è un'opzione**: senza, chiunque ottenga un `GroupInfo` entra come chi vuole. È la prima riga di codice del lavoro su MLS, non una rifinitura.
3. **Il limite 4 di [ADR 0036](../adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md) resta aperto e resta chiudibile solo fuori banda**, ed è confermato dalla parte 3: nessuna difesa dentro il protocollo può proteggere da chi possiede il registro. Il numero di sicurezza è la strada, e il grosso del lavoro è d'interfaccia.
4. **Nuovo vincolo d'implementazione**: mai `resync: true` senza sapere che la propria chiave è già nell'albero, o il client si blocca. Riguarda il caso «ho perso la passphrase», che è quello che ADR 0037 §3 aveva già segnato come il più probabile.
