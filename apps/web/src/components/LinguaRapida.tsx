import {
  avvisoIncompleta,
  impostaLingua,
  LINGUE,
  scriviSceltaLocale,
  t,
  useLingua,
} from "../i18n/index.js";

/**
 * Cambiare lingua prima di essere entrati (ADR 0044 §3).
 *
 * Sulle pagine d'accesso, d'invito e di configurazione la lingua la sceglie il
 * browser; questo è il modo di correggerla quando il browser sbaglia — un
 * computer di famiglia, un telefono prestato. La scelta resta su questo
 * browser, e all'accesso passa sull'istanza se la persona non ne aveva una.
 *
 * Un `<select>` nativo e non un menu nostro: è il controllo che ogni sistema
 * sa già leggere, e ogni lingua vi compare col proprio nome.
 */
export function LinguaRapida(): React.ReactElement {
  const lingua = useLingua();
  const avviso = avvisoIncompleta(lingua);

  return (
    <div className="lingua-rapida">
      <label className="only-screen-reader" htmlFor="lingua-rapida">
        {t("language.choose")}
      </label>
      <select
        className="select"
        id="lingua-rapida"
        onChange={(event) => {
          scriviSceltaLocale(event.target.value);
          void impostaLingua(event.target.value);
        }}
        value={lingua}
      >
        {LINGUE.map((voce) => (
          <option key={voce.code} lang={voce.code} value={voce.code}>
            {voce.name}
          </option>
        ))}
      </select>
      {avviso !== undefined ? <p className="muted">{avviso}</p> : null}
    </div>
  );
}
