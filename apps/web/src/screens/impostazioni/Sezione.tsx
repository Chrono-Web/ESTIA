import type { ReactNode } from "react";

import { ScreenHead } from "../../app/ScreenHead.js";

/**
 * La cornice di una sezione delle impostazioni.
 *
 * Un titolo, un ritorno, e una colonna più larga del feed: qui si legge e si
 * compila, non si scorre.
 */
export interface SezioneProps {
  titolo: string;
  children: ReactNode;
}

export function Sezione({ titolo, children }: SezioneProps): React.ReactElement {
  return (
    <>
      <ScreenHead back title={titolo} />
      <main className="column column--detail stack">{children}</main>
    </>
  );
}
