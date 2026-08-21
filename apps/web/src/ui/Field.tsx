import { useId } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Un campo con la sua etichetta, il suo aiuto e il suo errore, legati fra loro.
 *
 * Il legame non è decorativo: `aria-describedby` è ciò che fa leggere l'aiuto
 * subito dopo il nome del campo invece che mai, e `aria-invalid` è ciò che
 * distingue un errore da un colore rosso.
 */

interface Shared {
  label: string;
  hint?: string;
  error?: string;
}

export type TextFieldProps = Shared &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

export function TextField({ label, hint, error, ...rest }: TextFieldProps): React.ReactElement {
  const id = useId();
  const described = [hint === undefined ? "" : `${id}-hint`, error === undefined ? "" : `${id}-err`]
    .filter((part) => part !== "")
    .join(" ");

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className={error === undefined ? "input" : "input input--invalid"}
        id={id}
        {...(described === "" ? {} : { "aria-describedby": described })}
        {...(error === undefined ? {} : { "aria-invalid": true })}
        {...rest}
      />
      {hint !== undefined && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span className="field__error" id={`${id}-err`}>
          {error}
        </span>
      )}
    </div>
  );
}

export type TextAreaFieldProps = Shared &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">;

export function TextAreaField({
  label,
  hint,
  error,
  ...rest
}: TextAreaFieldProps): React.ReactElement {
  const id = useId();
  const described = [hint === undefined ? "" : `${id}-hint`, error === undefined ? "" : `${id}-err`]
    .filter((part) => part !== "")
    .join(" ");

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        className={error === undefined ? "textarea" : "textarea input--invalid"}
        id={id}
        {...(described === "" ? {} : { "aria-describedby": described })}
        {...(error === undefined ? {} : { "aria-invalid": true })}
        {...rest}
      />
      {hint !== undefined && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span className="field__error" id={`${id}-err`}>
          {error}
        </span>
      )}
    </div>
  );
}

export interface ChoiceProps {
  name: string;
  checked: boolean;
  onChoose: () => void;
  title: string;
  /** La conseguenza della scelta, non la sua ripetizione. */
  note?: string;
  type?: "radio" | "checkbox";
  /** Mentre un salvataggio è in corso: si vede, non si clicca. */
  disabled?: boolean;
}

export function Choice({
  name,
  checked,
  onChoose,
  title,
  note,
  type = "radio",
  disabled = false,
}: ChoiceProps): React.ReactElement {
  return (
    <label className={disabled ? "choice choice--disabled" : "choice"}>
      <input checked={checked} disabled={disabled} name={name} onChange={onChoose} type={type} />
      <span className="choice__body">
        <span className="choice__title">{title}</span>
        {note !== undefined && <span className="choice__note">{note}</span>}
      </span>
    </label>
  );
}
