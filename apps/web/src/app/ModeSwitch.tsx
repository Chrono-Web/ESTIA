import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { MODO_PREDEFINITO, isModo, type Modo } from "../modo.js";
import { useApp } from "../state.js";
import { SegmentedControl } from "../ui/index.js";

const OPZIONI = [
  { icon: "instance" as const, label: "Istanza", value: "istanza" as const },
  { icon: "globe" as const, label: "Rete", value: "rete" as const },
];

/**
 * La lente, e dove sta.
 *
 * Sul telefono vive in cima, al centro, solo a icone. Sul desktop resta in
 * cima al feed. Si riflette in `?modo=`, così un indirizzo condiviso apre la
 * stessa vista; il valore predefinito non compare nell'URL.
 */
export function ModeSwitch({
  compatto = false,
  bloccato = false,
}: {
  compatto?: boolean;
  /** Sulla pagina di un post: si vede ancora, ma non si cambia. */
  bloccato?: boolean;
}): React.ReactElement {
  const { modo, setModo } = useApp();
  const [params, setParams] = useSearchParams();
  const nellUrl = params.get("modo");

  /*
   * Solo l'URL → stato, e solo quando l'URL dichiara un modo.
   * Evita la race rete→istanza che rimetteva il valore vecchio.
   */
  useEffect(() => {
    if (isModo(nellUrl)) {
      setModo(nellUrl);
    }
  }, [nellUrl, setModo]);

  const cambia = (prossimo: Modo): void => {
    if (bloccato) {
      return;
    }

    setModo(prossimo);

    const aggiornati = new URLSearchParams(params);

    if (prossimo === MODO_PREDEFINITO) {
      aggiornati.delete("modo");
    } else {
      aggiornati.set("modo", prossimo);
    }

    setParams(aggiornati, { replace: true });
  };

  return (
    <SegmentedControl
      bloccato={bloccato}
      compatto={compatto}
      label={bloccato ? "Lente del messaggio (fissa)" : "Che cosa stai guardando"}
      onChange={cambia}
      options={OPZIONI}
      value={modo}
    />
  );
}
