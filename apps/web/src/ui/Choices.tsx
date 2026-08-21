import { Icon, type IconName } from "./icons/Icon.js";

/**
 * Scegliere fra due o tre cose che stanno tutte a schermo.
 *
 * Non è un menu a tendina, e ADR 0018 spiega perché per il caso che conta qui:
 * «un menu a tendina si legge male; due pulsanti diversi no». Una scelta che
 * cambia il pubblico di ciò che scrivi va vista senza aprirla.
 */

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  /** Che cosa si sta scegliendo. Letto prima delle opzioni da chi ascolta. */
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Solo icone: sul telefono la lente in cima non ha spazio per le parole. */
  compatto?: boolean;
  /** Visibile ma non cliccabile — sulla pagina di un post. */
  bloccato?: boolean;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  compatto = false,
  bloccato = false,
}: SegmentedControlProps<T>): React.ReactElement {
  const selezionata = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const n = options.length;

  return (
    <div
      aria-label={label}
      className={[
        compatto ? "segmented segmented--compatto" : "segmented",
        bloccato ? "segmented--bloccato" : "",
      ]
        .filter((part) => part !== "")
        .join(" ")}
      data-count={String(n)}
      data-index={String(selezionata)}
      role="group"
    >
      <span aria-hidden="true" className="segmented__thumb" />
      {options.map((option) => (
        <button
          aria-disabled={bloccato || undefined}
          aria-label={compatto ? option.label : undefined}
          aria-pressed={option.value === value}
          className="segmented__option"
          disabled={bloccato}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={compatto ? option.label : undefined}
          type="button"
        >
          {option.icon !== undefined && (
            <Icon name={option.icon} size={compatto ? 18 : 16} />
          )}
          <span className="segmented__testo">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface TabsProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Le schede di un profilo.
 *
 * `role="tablist"` con le frecce che spostano la selezione: è il
 * comportamento che chi usa la tastiera si aspetta da qualcosa che si chiama
 * scheda, e senza le frecce il ruolo dichiarato sarebbe una bugia.
 */
export function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: TabsProps<T>): React.ReactElement {
  const move = (direction: 1 | -1): void => {
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + direction + options.length) % options.length];

    if (next !== undefined) {
      onChange(next.value);
    }
  };

  return (
    <div aria-label={label} className="tabs" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className="tabs__tab"
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              move(1);
            } else if (event.key === "ArrowLeft") {
              move(-1);
            }
          }}
          role="tab"
          tabIndex={option.value === value ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
