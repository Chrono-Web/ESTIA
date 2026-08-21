/**
 * Le icone, disegnate qui.
 *
 * Nessuna libreria: `AGENTS.md` chiede di verificare compatibilità e licenza di
 * ogni dipendenza nuova, e venti tracciati non valgono quella verifica né
 * l'aggiornamento che si porta dietro per sempre.
 *
 * Tutte sulla stessa griglia da 24, tratto e non riempimento, `currentColor`
 * ovunque — così un'icona prende il colore del testo che le sta accanto e la
 * modalità Rete la ridipinge senza saperlo.
 *
 * Sono **decorative**: `aria-hidden`, perché il significato sta nel testo o
 * nell'`aria-label` di chi le contiene. Un'icona che si annuncia da sola
 * raddoppia ogni voce di menu per chi ascolta.
 */

const ICONS = {
  alert: (
    <>
      <path d="M12 3.8 21.2 20H2.8Z" />
      <path d="M12 10v4.3M12 17.3h.01" />
    </>
  ),
  "arrow-left": <path d="M20 12H4.5M11 5.5 4.5 12l6.5 6.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  "chevron-right": <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  comment: (
    <path d="M20.5 12.2c0 4.1-3.8 7.4-8.5 7.4a9.9 9.9 0 0 1-2.6-.3L4 21l1.5-3.6a7 7 0 0 1-2-5.2C3.5 8.1 7.3 4.8 12 4.8s8.5 3.3 8.5 7.4Z" />
  ),
  download: <path d="M12 3.5v12M7.5 11.5 12 16l4.5-4.5M4 19.5h16" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z" />
    </>
  ),
  heart: (
    <path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z" />
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8.6" cy="10" r="1.6" />
      <path d="m3.5 17.5 4.8-4.3a2 2 0 0 1 2.7 0L20.5 20" />
    </>
  ),
  instance: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.8" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.8" />
      <path d="M7 7.2h.01M7 16.8h.01" />
    </>
  ),
  key: (
    <>
      <circle cx="15.5" cy="8.5" r="4.2" />
      <path d="M12.5 11.5 4 20M6.5 17.5l2.2 2.2M9 15l2.2 2.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3" />
      <path d="m15 8 4 4-4 4M19 12H9" />
    </>
  ),
  menu: (
    <>
      <path d="M4 8h16" />
      <path d="M4 16h10" />
    </>
  ),
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </g>
  ),
  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10.2 20.5a2 2 0 0 0 3.6 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  send: (
    <path d="M4 11.5 20 4l-4.5 16-3.2-6.2L4 11.5Z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.6" />
      <path d="M12 1.8v2.6M12 19.6v2.6M22.2 12h-2.6M4.4 12H1.8M19.2 4.8l-1.9 1.9M6.7 17.3l-1.9 1.9M19.2 19.2l-1.9-1.9M6.7 6.7 4.8 4.8" />
    </>
  ),
  shield: <path d="M12 3.2 20 6v6.2c0 4.6-3.3 7-8 8.6-4.7-1.6-8-4-8-8.6V6Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.6 3.6 0 0 1 0 6.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** In pixel, sulla griglia da 24. Il tratto non si assottiglia. */
  size?: number;
}

export function Icon({ name, size = 24 }: IconProps): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {ICONS[name]}
    </svg>
  );
}
