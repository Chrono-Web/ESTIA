import type { ConnectionView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import { nomeIstanza, useSignedIn } from "../../state.js";
import { Alert } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * Questa casa e questo software.
 *
 * Comprende ciò che prima stava in «L'istanza»: chi ci abita e da dove stai
 * arrivando adesso (SECURITY_BASELINE §1). La chiave per collegare altre
 * istanze non sta qui — sta in EstiaNet, dove serve.
 */
export function Informazioni(): React.ReactElement {
  const { instance } = useSignedIn();
  const [connessione, setConnessione] = useState<ConnectionView | undefined>();

  useEffect(() => {
    void api
      .connection()
      .then(setConnessione)
      .catch(() => undefined);
  }, []);

  return (
    <Sezione titolo="Informazioni">
      <div className="card">
        <h2>{nomeIstanza(instance)}</h2>
        {instance.description !== undefined && instance.description !== "" && (
          <p>{instance.description}</p>
        )}
        <p className="muted">
          {instance.memberCount === 1 ? "1 persona" : `${String(instance.memberCount)} persone`} in
          questa istanza.
        </p>
      </div>

      <div className="card">
        <h2>Come sei connesso</h2>
        {connessione === undefined ? (
          <p className="muted">Sto guardando…</p>
        ) : connessione.origin === "public" ? (
          <Alert tone="error">{connessione.detail}</Alert>
        ) : (
          <p className="muted">{connessione.detail}</p>
        )}
      </div>

      <div className="card">
        <h2>Che cos&apos;è ESTIA</h2>
        <p>
          Un social network in cui i contenuti stanno fisicamente su una macchina che è tua, o della
          tua comunità. Non c&apos;è un algoritmo che decide l&apos;ordine, non c&apos;è pubblicità,
          e non c&apos;è nessuna azienda in mezzo che debba essere creduta sulla parola.
        </p>
        <p className="muted">
          Quello che scrivi qui non viene copiato altrove. Quando cancelli un post è cancellato
          davvero, perché non ne esiste una copia da nessun&apos;altra parte.
        </p>
      </div>

      <div className="card">
        <h2>Licenza</h2>
        <p className="muted">
          ESTIA è software libero sotto <strong>AGPL-3.0</strong>. Chiunque può leggerne il codice,
          modificarlo e ospitarne una copia; chi lo offre ad altri come servizio deve rendere
          disponibili le proprie modifiche. È la licenza che rende difficile trasformarlo nella cosa
          da cui vuole difendere.
        </p>
      </div>
    </Sezione>
  );
}
