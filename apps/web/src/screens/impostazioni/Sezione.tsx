import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, IconButton, Live, type Tone } from "../../ui/index.js";

import { TITOLI, type Chiave } from "./sezioni.js";

/**
 * La cornice di una sezione delle impostazioni.
 *
 * Il guscio (lista | dettaglio) sta nel Layout: qui restano titolo, scopo,
 * ritorno sul telefono, e il contenuto. Sul desktop la freccia non serve — la
 * lista è già a sinistra.
 *
 * **Tiene le parti che dieci pagine avevano deciso dieci volte** (vedi
 * `DESIGN_SYSTEM.md` §«Come è fatta una pagina di impostazioni»):
 *
 * - il **titolo viene dal registro**, quindi non si può più scrivere due volte;
 * - lo **scopo** è obbligatorio insieme alla chiave: una pagina che non dice a
 *   che serve non compila, ed è così che questa incoerenza smette di nascere;
 * - `Live` **prima** e `Alert` **dopo**, sempre nello stesso ordine, invece dei
 *   tre ordini diversi che convivevano;
 * - l'**attesa non duplica la cornice**: cinque schermate scrivevano un secondo
 *   `<Sezione>` intero, col titolo ribattuto a mano, solo per dire «Carico…».
 *
 * `titolo` resta accettato come forma vecchia finché le altre nove pagine non
 * sono passate: è una migrazione una-per-volta, non un rifacimento di tutto.
 */

interface Comune {
  /** Vero finché i dati non ci sono: la cornice resta, il corpo diventa attesa. */
  caricamento?: boolean;
  /** Un'operazione in corso. Passa da `Live`, sempre. */
  lavoro?: string | undefined;
  /** Com'è andata. */
  avviso?: { testo: string; tono: Tone } | undefined;
  children: ReactNode;
}

export type SezioneProps =
  | (Comune & {
      /** Quale sezione. Il titolo esce da qui e non si riscrive. */
      chiave: Chiave;
      /** Che cosa si fa qui, in una frase. Obbligatoria: senza, non compila. */
      scopo: string;
      titolo?: never;
    })
  | (Comune & {
      /** La forma vecchia: il titolo battuto a mano. In uscita. */
      titolo: string;
      chiave?: never;
      scopo?: never;
    });

export function Sezione(props: SezioneProps): React.ReactElement {
  const navigate = useNavigate();
  const { caricamento = false, lavoro, avviso, children } = props;
  const titolo = props.chiave === undefined ? props.titolo : TITOLI[props.chiave];

  return (
    <>
      <header className="screen-head split-layout__detail-head">
        <IconButton
          className="split-layout__back"
          icon="arrow-left"
          label="Torna alle impostazioni"
          onClick={() => void navigate("/impostazioni")}
        />
        <h1 className="screen-head__title">{titolo}</h1>
      </header>

      <div className="stack split-layout__section">
        {props.scopo !== undefined && <p className="muted screen-head__scopo">{props.scopo}</p>}

        {/*
         * Montato sempre, anche vuoto: un `aria-live` che nasce insieme al
         * proprio contenuto spesso non viene annunciato affatto.
         */}
        <Live>{caricamento ? "Carico…" : (lavoro ?? "")}</Live>

        {/* Finché si lavora vince il lavoro: un esito vecchio accanto a
            un'operazione in corso è la cosa che confonde di più. */}
        {lavoro !== undefined && <Alert>{lavoro}</Alert>}
        {lavoro === undefined && avviso !== undefined && (
          <Alert tone={avviso.tono}>{avviso.testo}</Alert>
        )}

        {caricamento ? <p className="muted">Carico…</p> : children}
      </div>
    </>
  );
}
