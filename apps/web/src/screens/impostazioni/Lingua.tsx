import { AUTOMATIC_LANGUAGE } from "@estia/contracts";
import { useState } from "react";

import { api } from "../../api.js";
import { SceltaLingua } from "../../components/SceltaLingua.js";
import { spiega } from "../../errori.js";
import { impostaLingua, LINGUE, scegliLingua, scriviSceltaLocale, t } from "../../i18n/index.js";
import { useSignedIn } from "../../state.js";
import { Alert, Choice } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * In che lingua ti parla ESTIA (ADR 0044 §3).
 *
 * Come l'aspetto: è tua, vale su ogni dispositivo in cui entri, e non cambia
 * niente di quello che vedono gli altri — né la lingua dei post, che restano
 * come li ha scritti chi li ha scritti.
 *
 * Scegliere una lingua ridisegna tutta la pagina: la conferma è la pagina
 * stessa, già nella lingua nuova. Per questo si salva prima sull'istanza e si
 * cambia dopo: se il salvataggio non riesce, la pagina resta com'era e dice
 * perché, invece di cambiare lingua e poi tornare indietro.
 */
export function Lingua(): React.ReactElement {
  const { instance, refreshInstance, refreshUser, token, user } = useSignedIn();
  const [inCorso, setInCorso] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const amministra = user.role === "instance_admin";
  const automatica = scegliLingua({ istanza: instance.defaultLanguage });
  const nomeAutomatica = LINGUE.find((lingua) => lingua.code === automatica)?.name ?? automatica;

  const scegli = async (codice: string): Promise<void> => {
    setErrore(undefined);
    setInCorso(codice);

    try {
      await api.updateLanguage(token, codice);
      scriviSceltaLocale(codice === AUTOMATIC_LANGUAGE ? undefined : codice);
      await refreshUser();
      await impostaLingua(codice === AUTOMATIC_LANGUAGE ? automatica : codice);
    } catch (causa) {
      setErrore(spiega(causa, t("language.error_save")));
    } finally {
      setInCorso(undefined);
    }
  };

  const scegliPerIstanza = async (codice: string): Promise<void> => {
    setErrore(undefined);
    setInCorso(`istanza-${codice}`);

    try {
      await api.updateInstanceLanguage(token, codice);
      await refreshInstance();
    } catch (causa) {
      setErrore(spiega(causa, t("language.error_instance")));
    } finally {
      setInCorso(undefined);
    }
  };

  return (
    <Sezione
      chiave="lingua"
      lavoro={inCorso === undefined ? undefined : t("language.saving")}
      scopo={t("language.purpose")}
    >
      {errore !== undefined ? <Alert tone="error">{errore}</Alert> : null}

      <div className="card card--flush">
        <h2 className="gruppo">{t("language.yours")}</h2>
        <Choice
          checked={user.language === AUTOMATIC_LANGUAGE}
          name="lingua"
          note={
            inCorso === AUTOMATIC_LANGUAGE
              ? t("language.saving")
              : t("language.automatic_note", { language: nomeAutomatica })
          }
          onChoose={() => void scegli(AUTOMATIC_LANGUAGE)}
          title={t("language.automatic")}
        />
        <SceltaLingua
          durante={t("language.saving")}
          inCorso={inCorso}
          nome="lingua"
          onScegli={(codice) => void scegli(codice)}
          valore={user.language}
        />
      </div>

      {amministra ? (
        <div className="card card--flush">
          <h2 className="gruppo">{t("language.instance")}</h2>
          <p className="muted">{t("language.instance_note")}</p>
          <SceltaLingua
            durante={t("language.saving")}
            inCorso={inCorso?.startsWith("istanza-") === true ? inCorso.slice(8) : undefined}
            nome="lingua-istanza"
            onScegli={(codice) => void scegliPerIstanza(codice)}
            valore={instance.defaultLanguage}
          />
        </div>
      ) : null}
    </Sezione>
  );
}
