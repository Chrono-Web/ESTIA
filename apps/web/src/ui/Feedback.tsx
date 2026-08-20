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
    <div aria-hidden="true" className="card stack--tight">
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
