import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

/** Indirizzo della pagina di una persona, di casa o di un'altra istanza. */
export function percorsoPersona(username: string, instanceKey?: string): string {
  if (instanceKey === undefined || instanceKey === "locale") {
    return `/@${username}`;
  }

  return `/r/${encodeURIComponent(instanceKey)}/${encodeURIComponent(username)}`;
}

/**
 * Porta alla pagina di una persona.
 *
 * Con `instanceKey` (diverso da `locale`) è una visita su un'altra casa:
 * profilo e bacheca sul protocollo ([ADR 0023]).
 */
export function PersonLink({
  username,
  instanceKey,
  className,
  children,
  onClick,
}: {
  username: string;
  instanceKey?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
  onClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
}): React.ReactElement {
  return (
    <Link className={className} onClick={onClick} to={percorsoPersona(username, instanceKey)}>
      {children}
    </Link>
  );
}
