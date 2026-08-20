import type { AdminDiagnostics } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Alert, Badge } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

const A_RIPOSO: Record<AdminDiagnostics["atRest"]["detected"], string> = {
  active: "rilevata",
  inactive: "non rilevata",
  unknown: "non verificabile",
};

const DICHIARATA: Record<AdminDiagnostics["atRest"]["declared"], string> = {
  automatic: "sblocco automatico",
  none: "nessuna, per scelta",
  passphrase: "passphrase all'avvio",
  unspecified: "non dichiarata",
};

const AGGIORNAMENTO: Record<string, string> = {
  created: "con backup",
  failed: "backup fallito",
  not_configured: "senza backup",
};

const ORIGINI: Record<string, string> = {
  local: "dalla rete di casa",
  loopback: "dal NAS stesso",
  overlay: "da fuori, attraverso la rete privata",
  public: "da fuori dalla rete di casa",
};

const DUREVOLEZZA: Record<AdminDiagnostics["dataDurability"], string> = {
  anonymous: "su un volume anonimo",
  ephemeral: "dentro il container",
  persistent: "su un volume",
  unknown: "non verificabile",
};

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Quello che l'istanza sa di sé, e che altrimenti resterebbe nei log.
 *
 * Il criterio è sempre lo stesso: **rosso solo dove chi amministra crede di
 * essere protetto e non lo è.** Backup non configurati è una constatazione;
 * backup configurati che non producono archivi è un allarme.
 */
export function Stato(): React.ReactElement {
  const { token } = useSignedIn();
  const [d, setD] = useState<AdminDiagnostics | undefined>();

  useEffect(() => {
    void api.diagnostics(token).then(setD);
  }, [token]);

  if (d === undefined) {
    return (
      <Sezione titolo="Stato dell'istanza">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  return (
    <Sezione titolo="Stato dell'istanza">
      {/* Prima di ogni altra cosa: un'istanza che perde tutto al prossimo
          aggiornamento non ha altri problemi che contino. */}
      {d.dataDurability === "anonymous" && (
        <Alert tone="error">
          <strong>Questi dati si perdono se aggiorni dal pannello.</strong> Stanno su un volume che
          Docker ha creato da sé, senza che nessuno glielo chiedesse: se lo porta dietro solo quando
          è <code>docker compose</code> a ricreare il container. Il pulsante «aggiorna» del NAS,
          Portainer e Watchtower ne attaccano invece uno nuovo e vuoto, e l&apos;istanza riparte da
          zero — account, contenuti, fotografie e la chiave privata, che{" "}
          <strong>non è sostituibile</strong>. I dati vecchi non vengono cancellati: restano in un
          volume orfano, e si recuperano.
        </Alert>
      )}

      {d.dataDurability === "ephemeral" && (
        <Alert tone="error">
          <strong>I tuoi dati spariranno al prossimo aggiornamento.</strong> Non sono su un volume:
          stanno dentro il container, che viene buttato e rifatto ogni volta che aggiorni
          l&apos;immagine. Se ne vanno account, contenuti, fotografie e la chiave privata
          dell&apos;istanza, che <strong>non è sostituibile</strong>.
        </Alert>
      )}

      {/* L'assunzione su cui poggia tutto il modello delle minacce è che questa
          istanza non sia raggiungibile da Internet. Se smette di essere vera,
          smette di esserlo in silenzio (SECURITY_BASELINE §5). */}
      {d.connections.some((visto) => visto.origin === "public") && (
        <Alert tone="error">
          <strong>Qualcuno è arrivato da un indirizzo fuori dalla rete di casa</strong> e fuori
          dalla rete privata. Le spiegazioni sono due: o sul router è aperta una porta verso il NAS
          — e allora l&apos;istanza è su Internet, che non dovrebbe essere — oppure fra te e lei
          c&apos;è un proxy che nasconde l&apos;indirizzo di chi chiama. Vale la pena stabilire
          quale delle due.
        </Alert>
      )}

      {/* Una protezione dichiarata che l'istanza non vede è la cosa più
          pericolosa da mostrare in silenzio (ADR 0007). */}
      {!d.atRest.consistent && (
        <Alert tone="error">
          La configurazione dichiara una cifratura che l&apos;istanza non rileva. Finché non è
          chiarito, considera i dati <strong>non protetti</strong> da un furto del NAS.
        </Alert>
      )}

      <div className="card card--flush">
        <div className="row">
          <span className="row__body">
            <span className="row__title">Dove stanno i dati</span>
            <span className="row__note">{d.dataDurabilityDetail}</span>
          </span>
          <span className="row__end">
            <Badge tone={d.dataDurability === "persistent" ? "on" : "neutral"}>
              {DUREVOLEZZA[d.dataDurability]}
            </Badge>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">Persone</span>
          </span>
          <span className="row__end">
            <strong>{d.memberCount}</strong>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">Cifratura dei dati a riposo</span>
            <span className="row__note">{d.atRest.detail}</span>
            {d.atRest.declared !== "unspecified" && (
              <span className="row__note">
                Dichiarata in configurazione: {DICHIARATA[d.atRest.declared]}.
              </span>
            )}
          </span>
          <span className="row__end">
            <Badge tone={d.atRest.consistent && d.atRest.detected === "active" ? "on" : "neutral"}>
              {A_RIPOSO[d.atRest.detected]}
            </Badge>
          </span>
        </div>

        <div className="row">
          <span className="row__body">
            <span className="row__title">Da dove arrivano le connessioni</span>
            <span className="row__note">
              {d.connections.length === 0
                ? "Ancora niente da dire."
                : d.connections
                    .map((visto) => `${ORIGINI[visto.origin] ?? visto.origin}: ${visto.count}`)
                    .join(" · ")}
            </span>
            <span className="row__note">
              L&apos;istanza conta i tipi di rete, non gli indirizzi: da fuori o da dentro è affare
              di chi amministra, da quale indirizzo non è affare di nessuno.
            </span>
          </span>
        </div>

        {/* Solo quando manca: una directory con i permessi giusti è la norma, e
            dirlo ogni volta la trasformerebbe in rumore. */}
        {!d.dataDirectorySecure && (
          <div className="row">
            <span className="row__body">
              <span className="row__title">Permessi della cartella dei dati</span>
              <span className="row__note">
                Il filesystem ha rifiutato di stringerla a 0700: altri utenti di questa macchina
                possono elencarne il contenuto. Succede sulle condivisioni di rete e su alcuni bind
                mount.
              </span>
            </span>
            <span className="row__end">
              <Badge>troppo aperti</Badge>
            </span>
          </div>
        )}

        {/* Le migrazioni vanno solo in avanti: un aggiornamento applicato senza
            backup resta senza punto di ritorno per sempre (ADR 0014). */}
        {d.lastUpgrade !== undefined && (
          <div className="row">
            <span className="row__body">
              <span className="row__title">Ultimo aggiornamento dello schema</span>
              <span className="row__note">
                Versione {d.lastUpgrade.fromVersion} → {d.lastUpgrade.toVersion}, il{" "}
                {quando(d.lastUpgrade.appliedAt)}
              </span>
              <span className="row__note">{d.lastUpgrade.detail}</span>
            </span>
            <span className="row__end">
              <Badge tone={d.lastUpgrade.backupStatus === "created" ? "on" : "error"}>
                {AGGIORNAMENTO[d.lastUpgrade.backupStatus] ?? d.lastUpgrade.backupStatus}
              </Badge>
            </span>
          </div>
        )}
      </div>
    </Sezione>
  );
}
