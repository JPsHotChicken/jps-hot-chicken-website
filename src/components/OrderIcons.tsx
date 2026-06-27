// Small brand marks for the per-location order buttons. lucide covers the
// storefront (pickup) and utensils (Uber Eats) glyphs; DoorDash has no lucide
// equivalent, so its mark — three left-aligned bars tapering to a right-pointing
// arrow — is hand-drawn here. Uses `currentColor` so the parent tile can tint it.

type MarkProps = { className?: string };

export function DoorDashMark({ className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="4.5" y="7.4" width="10" height="2.6" rx="1.3" />
      <rect x="4.5" y="10.7" width="15" height="2.6" rx="1.3" />
      <rect x="4.5" y="14" width="10" height="2.6" rx="1.3" />
    </svg>
  );
}
