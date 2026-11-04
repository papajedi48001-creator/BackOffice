import { useId } from 'react';

type BrandLogoProps = { size?: number; title?: string; decorative?: boolean; className?: string };

/** WR (Warichaphum) monogram in a rounded-square badge with a blue gradient. */
export function BrandLogo({ size = 40, title = 'โลโก้ WR โรงพยาบาลวาริชภูมิ', decorative = false, className }: BrandLogoProps) {
  const id = useId().replace(/:/g, '');
  const bg = `wr-bg-${id}`, shine = `wr-shine-${id}`, titleId = `wr-title-${id}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className}
      role={decorative ? undefined : 'img'} aria-hidden={decorative ? 'true' : undefined}
      aria-labelledby={decorative ? undefined : titleId} focusable="false">
      {decorative ? null : <title id={titleId}>{title}</title>}
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset=".55" stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${bg})`} />
      <path d="M2 18A16 16 0 0 1 18 2h28a16 16 0 0 1 16 16v6C44 30 22 30 2 24Z" fill={`url(#${shine})`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" />
      <text x="32" y="42" textAnchor="middle" fill="#fff" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="26" fontWeight="800" letterSpacing="-1">WR</text>
      <rect x="20" y="48" width="24" height="3" rx="1.5" fill="#93C5FD" />
    </svg>
  );
}
