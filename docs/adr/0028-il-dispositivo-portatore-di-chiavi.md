# ADR 0028 — Il dispositivo portatore di chiavi e il backup con passphrase

- Stato: **Accepted** — decisa dal proprietario il 2026-08-22
- Data: 2026-08-22
- Proprietario: progetto ESTIA
- Dipende da: [ADR 0006](0006-messaggi-privati-end-to-end-o-niente.md), [ADR 0008](0008-hashing-password-argon2id.md), [ADR 0009](0009-recupero-accesso-amministratore.md), [ADR 0022](0022-il-follow-attraversa-le-istanze.md), [ADR 0027](0027-la-libreria-mls.md)
- Attua: Milestone M6 (Identità del dispositivo)

## Contesto

In ESTIA, fino a M5 le sessioni erano token opachi conservati solo come hash SHA-256 (`apps/core-api/src/db/migrations.ts`). Un browser non possedeva alcuna chiave crittografica propria.
Per consentire la cifratura end-to-end con MLS (RFC 9420), ogni dispositivo/sessione deve possedere una coppia di chiavi di firma e di cifratura asimmetrica, e pubblicare al server dei KeyPackage monouso.

Inoltre, sorge il problema del cambio dispositivo o della perdita dei dati del browser (pulizia cache/IndexedDB): se le chiavi private vivono solo sul dispositivo, la cronologia dei messaggi E2E sarebbe irrecuperabile su un nuovo browser.

## Decisione

1. **Il dispositivo genera e conserva una chiave propria**:
   - Al login o alla prima apertura, il client web genera una coppia di chiavi asimmetriche (`device_key`) e genera un set di `key_packages` pre-pubblicati.
   - La chiave privata viene salvata localmente nel browser in **IndexedDB** (`non-extractable` o protetta dall'origine).
   - La chiave pubblica viene registrata sul server associata all'`id` di sessione (`device_keys.session_id -> sessions.id ON DELETE CASCADE`).
   - La revoca di una sessione revoca immediatamente la chiave del dispositivo.
2. **Backup delle chiavi cifrato con passphrase (sul server)**:
   - Per consentire il recupero della cronologia su nuovi dispositivi, il client cifra il set delle proprie chiavi private e dello stato MLS con una **passphrase personale scelta dal membro**.
   - **KDF e Algoritmo**: Derivazione chiave via PBKDF2 (con 600.000 iterazioni SHA-256 nativo in WebCrypto) + cifratura AES-GCM-256.
   - Il blob cifrato (`key_backups`) viene depositato sul server. Il server **non conosce la passphrase** e non può decifrare questo blob.
   - All'accesso da un nuovo browser, inserendo la passphrase il membro riscarica il blob, ripristina le chiavi e decifra l'intera cronologia conservata sull'istanza.

## Conseguenze

### Positive

- Il membro non perde le proprie conversazioni cambiando telefono o computer, mantenendo la garanzia zero-knowledge per il server.
- Il database dell'istanza ospita sia le buste dei messaggi sia il backup delle chiavi, garantendo che i regolari backup `.tar.age` dell'istanza proteggano l'intero patrimonio comunicativo.
- Riapre e risolve la decisione 4 di ADR 0022: ora ogni dispositivo possiede una propria identità crittografica formale.

### Negative / Vincoli

- Chi dimentica la propria passphrase di backup della chat non potrà decifrare le chat passate su un nuovo dispositivo (ma potrà generarne una nuova e ripartire da zero).
