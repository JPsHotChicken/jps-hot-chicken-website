/**
 * The icon under the date on the Today card on a day off: a mug of coffee by
 * the window. Flat, still vector shapes in quiet grays, cropped tight to the
 * drawing so it sizes like any other icon. Work days have no icon.
 */

const DARK = "#6b7280"; // gray-500
const MID = "#9ca3af"; // gray-400
const LIGHT = "#d1d5db"; // gray-300
const PALE = "#e5e7eb"; // gray-200

export function Coffee({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="14 26 92 67" aria-hidden data-art="coffee" className={className}>
      {/* Window behind. */}
      <rect x="22" y="28" width="52" height="58" rx="8" fill={PALE} />
      <rect x="46.5" y="28" width="3" height="58" fill="#ffffff" />
      <rect x="22" y="55.5" width="52" height="3" fill="#ffffff" />

      {/* Sill. */}
      <rect x="16" y="86" width="88" height="5" rx="2.5" fill={LIGHT} />

      {/* Steam. */}
      <path
        d="M70 50C66 45 74 42 70 36M81 50C77 45 85 42 81 36"
        fill="none"
        stroke={MID}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Mug, on the sill in front of the glass. */}
      <path
        d="M92 63H96A8 8 0 0 1 96 79H92"
        fill="none"
        stroke={DARK}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M62 56H93V78C93 82.4 89.4 86 85 86H70C65.6 86 62 82.4 62 78Z" fill={DARK} />
      <rect x="62" y="56" width="31" height="5" rx="1.5" fill={MID} />
    </svg>
  );
}
