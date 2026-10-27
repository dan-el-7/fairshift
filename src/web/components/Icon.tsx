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
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  calendar: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  clock: [circle(12, 12, 9), 'M12 7v5l3 2'],
  user: [circle(12, 8, 4), 'M4 21a8 8 0 0 1 16 0'],
  globe: [circle(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18'],
} as const;

export type IconName = keyof typeof PATHS;

/** Small inline line icon. Decorative only: always pair it with visible text. */
export function Icon({ name, size = 28 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
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
