import { avvisoIncompleta, LINGUE } from "../i18n/index.js";
import { Choice } from "../ui/index.js";

/**
 * Le lingue di ESTIA come scelte (ADR 0044 §3, §4).
 *
 * Ogni lingua si chiama col proprio nome — «English», non «Inglese» — perché
 * chi la cerca è chi la legge. Una lingua incompleta si offre lo stesso, e
 * sotto il nome dice quanto è tradotta, **nella propria lingua**: è la regola
 * del proprietario, e l'avviso è per chi quella lingua la parla.
 */
export function SceltaLingua({
  nome,
  valore,
  onScegli,
  inCorso,
  durante,
}: {
  /** Il `name` del gruppo di radio: due elenchi nella stessa pagina non si mescolano. */
  nome: string;
  valore: string | undefined;
  onScegli: (codice: string) => void;
  /** La lingua che si sta salvando, se ce n'è una. */
  inCorso?: string | undefined;
  /** Che cosa dire sotto quella lingua mentre si salva. */
  durante?: string;
}): React.ReactElement {
  return (
    <>
      {LINGUE.map((lingua) => {
        const nota = inCorso === lingua.code ? durante : avvisoIncompleta(lingua.code);

        return (
          <Choice
            checked={valore === lingua.code}
            key={lingua.code}
            name={nome}
            onChoose={() => onScegli(lingua.code)}
            title={lingua.name}
            {...(nota === undefined ? {} : { note: nota })}
          />
        );
      })}
    </>
  );
}
