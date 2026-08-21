import type { ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "./icons/Icon.js";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Un'icona prima del testo. Decorativa: il significato sta nel testo. */
  icon?: IconName;
  block?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  danger: "btn btn--danger",
  primary: "btn",
  quiet: "btn btn--quiet",
  secondary: "btn btn--secondary",
};

export function Button({
  variant = "primary",
  icon,
  block = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps): React.ReactElement {
  return (
    <button
      className={[VARIANT[variant], block ? "btn--block" : "", className ?? ""]
        .filter((part) => part !== "")
        .join(" ")}
      type={type}
      {...rest}
    >
      {icon !== undefined && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Obbligatoria: un pulsante senza testo non ha altro modo di dire che cos'è. */
  label: string;
  active?: boolean;
  /** React 19: ref come prop, per ancorare un Sheet piccolo. */
  ref?: React.Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  active = false,
  className,
  type = "button",
  ref,
  ...rest
}: IconButtonProps): React.ReactElement {
  return (
    <button
      aria-label={label}
      className={["btn btn--icon", active ? "btn--on" : "", className ?? ""]
        .filter((part) => part !== "")
        .join(" ")}
      ref={ref}
      title={label}
      type={type}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
