import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { MODO_PREDEFINITO, isModo, type Modo } from "../modo.js";
import { useApp } from "../state.js";
import { SegmentedControl } from "../ui/index.js";

const OPZIONI = [
  { icon: "instance", label: "Istanza", value: "istanza" },
  { icon: "globe", label: "Rete", value: "rete" },
] as const;

/**
 * La lente, e dove sta.
 *
 * Sta **in cima alle schermate che cambia** — la home e il profilo — e non in
 * un menu: una modalità dimenticata è il difetto di usabilità classico, e qui
 * il costo di dimenticarla è pubblicare al pubblico sbagliato. Perciò è
 * sempre a schermo, il colore della cornice la ripete, e sotto il composer la
 * destinazione è scritta a parole.
 *
 * Si riflette in `?modo=`, così un indirizzo condiviso apre la stessa vista;
 * il valore predefinito non compare, perché un parametro che dice la cosa
 * normale è solo rumore in una barra degli indirizzi.
 */
export function ModeSwitch(): React.ReactElement {
  const { modo, setModo } = useApp();
  const [params, setParams] = useSearchParams();
  const nellUrl = params.get("modo");

  useEffect(() => {
    if (isModo(nellUrl) && nellUrl !== modo) {
      setModo(nellUrl);
    }
  }, [modo, nellUrl, setModo]);

  const cambia = (prossimo: Modo): void => {
    setModo(prossimo);

    const aggiornati = new URLSearchParams(params);

    if (prossimo === MODO_PREDEFINITO) {
      aggiornati.delete("modo");
    } else {
      aggiornati.set("modo", prossimo);
    }

    // `replace`: cambiare lente non è navigare, e il tasto indietro deve
    // riportare da dove si veniva e non al colore di prima.
    setParams(aggiornati, { replace: true });
  };

  return (
    <SegmentedControl
      label="Che cosa stai guardando"
      onChange={cambia}
      options={OPZIONI}
      value={modo}
    />
  );
}
