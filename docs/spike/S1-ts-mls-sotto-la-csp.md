# S1 — `ts-mls` sotto la CSP di ESTIA

- Data: 2026-08-26
- Eseguito da: sessione di lavoro assistita, in laboratorio locale
- Domanda di [ADR 0036](../adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md) in prova: condizione 2 di §«Quando riesaminare» — _«esiste una libreria MLS matura utilizzabile nel browser senza `wasm-unsafe-eval` e su React Native senza binding binari instabili, con licenza compatibile AGPL-3.0»_
- Esito: **parziale** — sì nel browser, **no su React Native**

## Perché questo spike esiste

[ADR 0027](../adr/0027-la-libreria-mls.md) aveva scelto MLS e non lo ha costruito. La ragione registrata era la CSP: l'istanza serve `script-src 'self'` ([`static.ts:25`](../../apps/core-api/src/web/static.ts)) e una libreria MLS compilata in WebAssembly avrebbe richiesto `wasm-unsafe-eval`, indebolendo la policy che protegge i token di sessione.

Questo spike misura se quell'ostacolo esiste ancora, ora che c'è una implementazione MLS in TypeScript puro. **Non decide niente**: prepara la decisione, come impone `AGENTS.md` per le scelte che toccano la crittografia.

## Ambiente

| Voce                    | Valore                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| Libreria in prova       | `ts-mls` 1.6.2 (stabile) — repo a `fea455f` del 2026-08-24 per i vettori |
| Dipendenza runtime      | `@hpke/core` 1.8.0 → `@hpke/common` 1.10.1                               |
| Peer usati              | `@noble/ciphers` 2.1.1, `@noble/curves` 2.0.1, `@noble/hashes` 2.0.1     |
| Node                    | 22.22.2                                                                  |
| Browser                 | pannello Chromium della sessione                                         |
| Componenti ESTIA        | **nessuno avviato**: lo spike è isolato, fuori dal repository            |
| Modifiche al repository | nessuna — `.claude/launch.json` è stato usato e ripristinato             |

## Procedura seguita

```bash
# 1. installazione isolata
npm init -y && npm i ts-mls@1.6.2
npm i @noble/ciphers@2.1.1 @noble/curves@2.0.1 @noble/hashes@2.0.1

# 2. scenario funzionale completo (gruppo a 2, poi a 3, poi rimozione)
node prova.mjs

# 3. vettori ufficiali RFC 9420, dal repository upstream
git clone --depth 1 https://github.com/LukaJCB/ts-mls.git tv
cd tv && npm install --legacy-peer-deps && npx vitest run test/test-vectors

# 4. bundle per il browser
npx esbuild web/app.mjs --bundle --format=esm --outfile=web/bundle.js

# 5. servito con la CSP di ESTIA, e con un controllo negativo
node server.mjs   # Content-Security-Policy: default-src 'self'; script-src 'self'; …

# 6. simulazione React Native: crypto.subtle === undefined
node prova-noble.mjs
```

## Misure

| Misura                                                   | Valore                                          | Note                                                     |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Licenze dell'albero reale                                | **tutte MIT**                                   | `ts-mls`, `@hpke/core`, `@hpke/common`, `@noble/ciphers` |
| File `.wasm` nell'albero installato                      | **0**                                           |                                                          |
| Occorrenze di `WebAssembly` / `new Function(` nel bundle | **0**                                           | l'unica occorrenza trovata era una stringa di log mia    |
| Vettori ufficiali RFC 9420                               | **785 test su 14 file, tutti verdi**            | l'insieme completo del working group MLS                 |
| Bundle aggiunto (solo `ts-mls` e catena)                 | 443 kB non compresso, **96 kB gzip**            | il bundle attuale di ESTIA è 448,89 kB / 130,63 kB gzip  |
| Scenario funzionale in Node                              | **5 blocchi su 5**                              | dettaglio sotto                                          |
| Scenario funzionale nel browser sotto CSP                | **riuscito**                                    | nessun messaggio in console, nessuna violazione          |
| Con `crypto.subtle === undefined`                        | **fallito su tutte e 3 le ciphersuite provate** | dettaglio in §Limiti                                     |

### Che cosa fa lo scenario funzionale

```
── 1. Gruppo a due (il caso M6) ──
  ✓  Anna vede 2 membri
  ✓  Bruno vede 2 membri
  ✓  Bruno legge: "ciao Bruno"

── 2. Terzo membro: i GRUPPI ──
  ✓  il gruppo è a 3
  ✓  epoch avanzata: 1 → 2
  ✓  Bruno legge il messaggio di gruppo
  ✓  Carla legge il messaggio di gruppo

── 3. Forward secrecy: Carla NON deve leggere il passato ──
  ✓  Carla non può leggere il passato (ValidationError)

── 4. Le chiavi cambiano davvero (il ratchet) ──
  ✓  segreto esportato cambia a ogni epoch
       prima: ef86091b47440094c7250e96df6c7a39…
       dopo:  b222d6b44a46be16a523528d3a241f56…

── 5. Rimozione: chi esce non legge più ──
  ✓  Carla rimossa, il gruppo torna a 2
  ✓  Carla non legge dopo essere uscita (CryptoError)
```

I blocchi 3, 4 e 5 sono esattamente i tre limiti che [ADR 0036](../adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md) dichiara assenti in `ESTIA-E2E-v1`, misurati qui come presenti.

### Il controllo negativo, che è la parte che rende valido il resto

Un test che passa sotto una CSP non dimostra niente se la CSP non è viva. Sulla **stessa origine, con gli stessi header**, una seconda pagina prova a usare WebAssembly:

```
WebAssembly BLOCCATO dalla CSP → CompileError: WebAssembly.instantiate():
  Compiling or instantiating WebAssembly module violates the foll…
new Function BLOCCATO dalla CSP → EvalError
```

Quindi: **sotto la CSP di ESTIA il WebAssembly fallisce e `ts-mls` funziona.** È la prova diretta che l'ostacolo di ADR 0027 era reale e che questa libreria lo aggira.

## Osservazioni

**La libreria è una MLS completa, non un sottoinsieme.** Espone ratchet tree, key schedule, epoch, commit, proposal, Welcome, PSK, resumption e ingresso esterno — cioè tutto ciò che ADR 0027 aveva descritto e che non era stato scritto.

**Due agganci corrispondono a due limiti aperti di ADR 0036.** `AuthenticationService` è il punto in cui si innesterebbe la verifica delle chiavi (limite 4), e `KeyRetentionConfig` governa per quanto si conservano le chiavi vecchie — cioè quanto costa, in cronologia leggibile, la forward secrecy (limite 1).

**Il progetto è vivo.** Ultimo commit upstream due giorni prima di questa prova; `2.0.0` è in release candidate alla `rc.16` del 2026-07-18. Primo rilascio 2025-07-10: ha poco più di un anno.

**Il progetto si prova già nel browser.** Ha uno script `test:browser` con Playwright, oltre alla suite Node.

## Limiti di questa prova

**Non dimostra che `ts-mls` sia sicura.** Il progetto dichiara di **non avere un audit di sicurezza formale** e raccomanda una revisione indipendente per usi security-critical. 785 vettori verdi dicono che il protocollo è implementato secondo la specifica; non dicono che l'implementazione non abbia falle. Se «matura» in ADR 0036 vuol dire «verificata da terzi», questa condizione **non è soddisfatta** e la decisione resta del proprietario.

**Su React Native non funziona, oggi.** Simulando fedelmente RN — `crypto.subtle` assente, `getRandomValues` presente — la libreria fallisce su tutte e tre le ciphersuite provate, con `Cannot read properties of undefined (reading 'generateKey')`. La causa è precisa: il `nobleCryptoProvider` copre hash, KDF, AEAD e firme, ma **il KEM passa comunque da `@hpke/core`, che richiede WebCrypto**. Per le firme Ed25519 esiste un ripiego (`if (subtle !== undefined)`); per il KEM no.

> Nota di metodo: la prima versione di questa prova faceva lanciare un'eccezione al getter di `crypto.subtle` invece di restituire `undefined`, e concludeva a torto che anche le firme fossero bloccate. Corretta, la prova distingue il ripiego che esiste dal KEM che non ce l'ha.

Le vie d'uscita non sono state misurate e restano da valutare quando M7 si riaprirà: un polyfill WebCrypto per RN, un contributo upstream che renda il KEM nativo in noble, oppure `2.0.0` se cambia la catena — la `rc.16` dipende ancora da `@hpke/*`, quindi probabilmente no.

**Le versioni non combaciano con quelle di ESTIA.** `ts-mls` 1.6.2 fissa peer **esatti**: `@noble/ciphers` 2.1.1 e `@noble/curves` 2.0.1, mentre `apps/mobile` usa 2.3.0. La `2.0.0-rc.16` chiede 2.2.0. È attrito d'integrazione, non un ostacolo.

**Il costo del bundle non è trascurabile.** 96 kB gzip su un bundle che oggi ne pesa 130,63: il client web quasi raddoppia. Non è stato misurato l'effetto del tree-shaking su un uso reale, che userebbe una ciphersuite sola.

**Non è stato misurato niente sulle prestazioni** — né tempi di commit su gruppi grandi, né dimensione dei messaggi sul filo, né peso dello stato da conservare per epoch.

## Conseguenze per ADR 0036

**La condizione 2 è per metà soddisfatta, e per metà no.**

| Requisito di ADR 0036                             | Esito                                                      |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Utilizzabile nel browser senza `wasm-unsafe-eval` | **Sì**, dimostrato con controllo negativo                  |
| Licenza compatibile AGPL-3.0                      | **Sì**, MIT lungo tutta la catena                          |
| Su React Native senza binding binari instabili    | **No** — non binding instabili, ma `crypto.subtle` assente |
| «Matura»                                          | **Aperto** — 785 vettori verdi, nessun audit               |

Quindi:

1. **Per il client web, MLS non è più bloccato da un ostacolo tecnico.** Quello che resta è un giudizio sul rischio di adottare una libreria giovane e non auditata, e quel giudizio è del proprietario.
2. **Per il client mobile, MLS oggi non passa.** È una ragione in più per non riaprire M7 prima di aver deciso qui: il perimetro crittografico dell'app dipende da questa scelta, e rifare il client mobile su `ESTIA-E2E-v1` per poi cambiarlo sarebbe farlo due volte.
3. **Resta da decidere una cosa che nessuno spike può misurare**, ed è a monte del codice: la forward secrecy rende **impossibile** la promessa di [ADR 0028](../adr/0028-il-dispositivo-portatore-di-chiavi.md), cioè che con la passphrase si ripristini _«l'intera cronologia conservata sull'istanza»_. O si tiene la cronologia recuperabile, o si tiene la forward secrecy. Va deciso prima di scrivere codice, e determina l'interfaccia.
