import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { MODO_PREDEFINITO, isModo, type Modo } from "../modo.js";
import { useApp } from "../state.js";
import { Icon, SegmentedControl } from "../ui/index.js";

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
 *
 * Sulla pagina di un post la lente non si tocca, e un controllo con una voce
 * morta direbbe una bugia: al suo posto resta solo il nome della lente in cui
 * il post è stato aperto.
 */
export function ModeSwitch({
  compatto = false,
  bloccato = false,
}: {
  compatto?: boolean;
  /** Sulla pagina di un post: resta solo l'indicatore del modo corrente. */
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

  if (bloccato) {
    const corrente = OPZIONI.find((opzione) => opzione.value === modo) ?? OPZIONI[0]!;

    return (
      <span className="lente-fissa">
        <Icon name={corrente.icon} size={compatto ? 18 : 16} />
        <span>{corrente.label}</span>
      </span>
    );
  }

  const cambia = (prossimo: Modo): void => {
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
      compatto={compatto}
      label="Che cosa stai guardando"
      onChange={cambia}
      options={OPZIONI}
      value={modo}
    />
  );
}
