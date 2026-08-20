import type { InviteView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { InviteLink } from "../../../components/InviteLink.js";
import { useSignedIn } from "../../../state.js";
import { Badge, Button, TextField } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Inviti(): React.ReactElement {
  const { token } = useSignedIn();
  const [inviti, setInviti] = useState<InviteView[]>([]);
  const [etichetta, setEtichetta] = useState("");
  const [riutilizzabile, setRiutilizzabile] = useState(false);
  const [appena, setAppena] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(async () => {
    setInviti((await api.invites(token)).invites);
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const crea = async (): Promise<void> => {
    setOccupato(true);

    try {
      const creato = await api.createInvite(token, {
        label: etichetta,
        ...(riutilizzabile ? { maxUses: 10 } : {}),
      });

      // Mostrato una volta sola: l'istanza ne conserva solo l'impronta.
      setAppena(creato.code);
      setEtichetta("");
      await carica();
    } finally {
      setOccupato(false);
    }
  };

  return (
    <Sezione titolo="Inviti">
      <div className="card">
        {appena !== undefined && <InviteLink code={appena} />}

        <TextField
          hint="Per ricordarti a chi l'hai dato. Lo vedi solo tu."
          label="Per chi è questo invito?"
          onChange={(event) => setEtichetta(event.target.value)}
          placeholder="es. Scala B"
          value={etichetta}
        />

        <label className="choice">
          <input
            checked={riutilizzabile}
            onChange={(event) => setRiutilizzabile(event.target.checked)}
            type="checkbox"
          />
          <span className="choice__body">
            <span className="choice__title">Riutilizzabile fino a 10 persone</span>
            <span className="choice__note">
              Un invito monouso è più sicuro: se gira di mano in mano, ne serve uno nuovo ogni
              volta.
            </span>
          </span>
        </label>

        <Button disabled={occupato} onClick={() => void crea()}>
          Crea invito
        </Button>
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Inviti creati</h2>
        {inviti.length === 0 && <p className="empty">Nessun invito creato.</p>}
        {inviti.map((invito) => (
          <div className="row" key={invito.id}>
            <span className="row__body">
              <span className="row__title">
                {invito.label === "" ? "Invito" : invito.label}{" "}
                {invito.usable ? <Badge tone="on">valido</Badge> : <Badge>esaurito</Badge>}
              </span>
              <span className="row__note">
                Usato {invito.usedCount} di {invito.maxUses} · scade il {quando(invito.expiresAt)}
              </span>
            </span>
            <span className="row__end">
              {invito.usable && (
                <Button
                  onClick={() => void api.revokeInvite(token, invito.id).then(carica)}
                  variant="danger"
                >
                  Ritira
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
