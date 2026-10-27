const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  checkin: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  pay: ['M3 7h18v12H3z', 'M3 7l3-3h12', 'M16 13h2'],
  report: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17.5v.5'],
  skills: [circle(12, 9, 6), 'M8.2 13.5L7 21l5-3 5 3-1.2-7.5'],
  feedback: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  track: [circle(11, 11, 7), 'M20 20l-4-4'],
  verify: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v3', 'M14 20h3', 'M20 20h1'],
  location: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', circle(12, 9.5, 2.5)],
  copy: ['M9 9h11v11H9z', 'M5 15V5h10'],
  share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v14'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  alert: [circle(12, 12, 10), 'M12 8v5', 'M12 16v.5'],
  check: ['M5 12l5 5L20 7'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  stop: ['M6 6h12v12H6z'],
  speaker: ['M11 5L6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
  sun: [circle(12, 12, 4), 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  contrast: [circle(12, 12, 9), 'M12 3a9 9 0 0 1 0 18z'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  calendar: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  clock: [circle(12, 12, 9), 'M12 7v5l3 2'],
  user: [circle(12, 8, 4), 'M4 21a8 8 0 0 1 16 0'],
  globe: [circle(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  users: [circle(9, 8, 3.5), 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14a6.5 6.5 0 0 1 3.5 6'],
  file: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6', 'M8 13h8', 'M8 17h8'],
  hardhat: ['M3 17a9 9 0 0 1 18 0', 'M2 17h20', 'M5 17v2h14v-2', 'M12 8V5'],
  cap: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5', 'M22 9v6'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  chevron: ['M9 6l6 6-6 6'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  flame: ['M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-2 4-3 5-1-2-1-5 0-7-4 3-7 6-7 12 0 4 3 7 7 7z'],
  help: [circle(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7', 'M12 17.5v.5'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M2 20h20'],
  // Standard "languages" glyph: a character with strokes on the left, an A on the right.
  translate: ['M5 8l6 6', 'M4 14l6-6 2-3', 'M2 5h12', 'M7 2h1', 'M22 22l-5-10-5 10', 'M14 18h6'],
} as const;

export type IconName = keyof typeof PATHS;

/** Small inline line icon (stroke 1.75). Decorative only: always pair it with visible text. Use 20 or 24. */
export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
