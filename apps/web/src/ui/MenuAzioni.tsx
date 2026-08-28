import { useRef, useState } from "react";

import { Button, IconButton } from "./Button.js";
import { ListRow } from "./ListRow.js";
import { Sheet } from "./Sheet.js";
import type { IconName } from "./icons/Icon.js";

/**
 * Le azioni su una cosa, dietro un burger.
 *
 * `DESIGN_SYSTEM.md` §«I componenti» diceva già che `Sheet variant="piccolo"` è
 * la forma del «burger, menu ⋯» — cioè che sono la stessa cosa. Il codice non
 * l'aveva letto: quattro menu (Altro, un post, un commento, una conversazione)
 * costruivano ognuno il proprio, con **tre forme di voce diverse** e tre modi
 * diversi di chiedere conferma. Uno di loro si appoggiava a una classe CSS che
 * non esisteva, e nessuno dei quattro diceva di aprire qualcosa.
 *
 * Qui il menu si porta dietro **il proprio pulsante e il proprio stato**. È la
 * parte che toglie le quattro macchine a stati copiate: chi lo usa passa
 * l'elenco delle voci e non tocca né `useRef` né `useState`.
 *
 * **Le voci sono `ListRow`**, la primitiva delle impostazioni, per la ragione
 * che quel componente esiste: una riga cliccabile fatta a mano con un `<div>` è
 * invisibile a chi non usa il mouse. Il chevron però si spegne — dentro un menu
 * prometterebbe di andare più a fondo, e non c'è nessun fondo.
 *
 * **Il ruolo dichiarato è `dialog`, non `menu`.** `role="menu"` promette le
 * frecce, e `DESIGN_SYSTEM.md` §«I componenti» dice che dichiarare un ruolo
 * senza il comportamento che quel ruolo promette è dire una cosa non vera.
 * Sotto c'è un `<dialog>` per davvero, quindi `aria-haspopup="dialog"` è la
 * sola cosa onesta da scrivere.
 */

export interface VoceMenu {
  /** Stabile: distingue le voci fra loro, e non si vede. */
  id: string;
  title: string;
  /** Che cosa succede se la scegli. Una riga, non un paragrafo. */
  note?: string;
  icon?: IconName;
  /** `danger` colora il titolo: un'azione che toglie qualcosa non sembra le altre. */
  tono?: "normale" | "danger";
  to?: string;
  onClick?: () => void;
  /**
   * Chiede conferma **dentro lo stesso menu**, invece di agire subito.
   *
   * Sta qui e non in chi chiama perché è esattamente il pezzo che i tre menu
   * precedenti avevano riscritto in tre modi diversi.
   */
  conferma?: { titolo: string; testo: string; etichetta: string };
}

export interface MenuAzioniProps {
  /**
   * Che cosa dice il pulsante a chi non lo vede: **su che cosa** agisce.
   *
   * «Azioni su Via Milano», non «Menu»: in una lista di venti righe venti
   * pulsanti chiamati «Menu» sono venti volte la stessa parola.
   */
  etichetta: string;
  /** Il titolo del pannello. Senza, il dialog non avrebbe nome accessibile. */
  titolo: string;
  voci: readonly VoceMenu[];
  /** Mentre un'operazione è in corso non si apre: le voci sarebbero bugie. */
  occupato?: boolean;
}

export function MenuAzioni({
  etichetta,
  titolo,
  voci,
  occupato = false,
}: MenuAzioniProps): React.ReactElement {
  const ancora = useRef<HTMLButtonElement>(null);
  const [aperto, setAperto] = useState(false);
  const [daConfermare, setDaConfermare] = useState<VoceMenu | undefined>();

  const chiudi = (): void => {
    setAperto(false);
    setDaConfermare(undefined);
  };

  const scegli = (voce: VoceMenu): void => {
    if (voce.conferma !== undefined) {
      setDaConfermare(voce);

      return;
    }

    chiudi();
    voce.onClick?.();
  };

  return (
    <>
      <IconButton
        aria-expanded={aperto}
        aria-haspopup="dialog"
        disabled={occupato}
        icon="menu"
        label={etichetta}
        onClick={() => {
          setDaConfermare(undefined);
          setAperto(true);
        }}
        ref={ancora}
      />

      <Sheet
        anchorRef={ancora}
        onClose={chiudi}
        open={aperto}
        title={daConfermare?.conferma?.titolo ?? titolo}
        variant="piccolo"
      >
        {daConfermare?.conferma === undefined ? (
          <>
            {voci.map((voce) => (
              <ListRow
                chevron={false}
                key={voce.id}
                onClick={() => scegli(voce)}
                title={
                  voce.tono === "danger" ? (
                    <span className="row__title--danger">{voce.title}</span>
                  ) : (
                    voce.title
                  )
                }
                {...(voce.icon === undefined ? {} : { icon: voce.icon })}
                {...(voce.note === undefined ? {} : { note: voce.note })}
                {...(voce.to === undefined ? {} : { to: voce.to })}
              />
            ))}
          </>
        ) : (
          /*
           * La conferma. La via d'uscita sta accanto all'azione e non altrove:
           * chi si è pentito non deve cercare dove si torna indietro.
           */
          <div className="stack--tight">
            <p className="muted">{daConfermare.conferma.testo}</p>
            <Button
              block
              onClick={() => {
                const azione = daConfermare.onClick;

                chiudi();
                azione?.();
              }}
              variant={daConfermare.tono === "danger" ? "danger" : "primary"}
            >
              {daConfermare.conferma.etichetta}
            </Button>
            <Button block onClick={() => setDaConfermare(undefined)} variant="secondary">
              Annulla
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
