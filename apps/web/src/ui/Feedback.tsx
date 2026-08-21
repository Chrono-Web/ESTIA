import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons/Icon.js";

export type Tone = "neutral" | "error" | "ok";

const ALERT_TONE: Record<Tone, string> = {
  error: "alert alert--error",
  neutral: "alert",
  ok: "alert alert--ok",
};

export interface AlertProps {
  tone?: Tone;
  children: ReactNode;
}

/**
 * Un avviso.
 *
 * `role="alert"` solo quando è un errore: annunciare ogni riscrittura del
 * documento interromperebbe chi legge con lo screen reader per cose che non lo
 * riguardano.
 *
 * **Non accetta attributi ARIA dall'esterno**, e non è una svista: un `Alert`
 * compare e sparisce insieme al suo testo, e una regione live che nasce già
 * piena non viene annunciata da tutti gli screen reader. Per lo stato di
 * un'operazione c'è `Live`, che nel documento c'è sempre. Da sapere perché
 * TypeScript non protegge da questo errore: un attributo JSX con il trattino
 * — `aria-live` — non viene controllato, quindi passarlo qui compila e non fa
 * niente.
 */
export function Alert({ tone = "neutral", children }: AlertProps): React.ReactElement {
  return (
    <div className={ALERT_TONE[tone]} {...(tone === "error" ? { role: "alert" } : {})}>
      {tone !== "neutral" && (
        <span className="alert__icon">
          <Icon name={tone === "error" ? "alert" : "check"} size={18} />
        </span>
      )}
      <div className="grow">{children}</div>
    </div>
  );
}

/**
 * Il posto da cui si annuncia lo stato di un'operazione.
 *
 * Vive sempre nel documento, anche vuoto: una regione live montata insieme al
 * proprio contenuto arriva troppo tardi perché lo screen reader la legga. Qui
 * dentro passano il «sto lavorando» e l'esito riuscito; **l'errore no**, perché
 * quello lo annuncia già `Alert tone="error"` con `role="alert"` e sentirlo due
 * volte è peggio che non sentirlo.
 *
 * È la prima euristica di `DESIGN_SYSTEM.md` per chi non guarda lo schermo:
 * l'etichetta del controllo dice la stessa cosa a chi lo guarda.
 */
export function Live({ children }: { children?: ReactNode }): React.ReactElement {
  return (
    <span aria-live="polite" className="only-screen-reader">
      {children ?? ""}
    </span>
  );
}

export interface BadgeProps {
  tone?: Tone | "on";
  children: ReactNode;
}

const BADGE_TONE: Record<string, string> = {
  error: "badge badge--danger",
  neutral: "badge",
  ok: "badge badge--ok",
  on: "badge badge--on",
};

export function Badge({ tone = "neutral", children }: BadgeProps): React.ReactElement {
  return <span className={BADGE_TONE[tone] ?? "badge"}>{children}</span>;
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** Che cosa si può fare adesso. Uno stato vuoto che non lo dice è un vicolo cieco. */
  children?: ReactNode;
}

export function EmptyState({ icon, title, children }: EmptyStateProps): React.ReactElement {
  return (
    <div className="empty">
      {icon !== undefined && (
        <span className="empty__icon">
          <Icon name={icon} size={26} />
        </span>
      )}
      <p className="empty__title">{title}</p>
      {children}
    </div>
  );
}

export interface SkeletonProps {
  /** Quante righe di testo simulare. */
  lines?: number;
}

/** Lo scheletro di una scheda: struttura nota, niente salti quando arriva. */
export function SkeletonPost({ lines = 3 }: SkeletonProps): React.ReactElement {
  return (
    <div aria-hidden="true" className="skeleton-post stack--tight">
      <div className="cluster">
        <span className="skeleton avatar avatar--md" />
        <span className="grow">
          <span className="skeleton skeleton--text skeleton--name" />
        </span>
      </div>
      {Array.from({ length: lines }, (_, index) => (
        <div className="skeleton skeleton--text" key={index} />
      ))}
    </div>
  );
}
