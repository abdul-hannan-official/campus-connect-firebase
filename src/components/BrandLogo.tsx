interface BrandLogoProps {
  size?: 'sm' | 'md';
  inverted?: boolean;
}

export function BrandLogo({ size = 'md', inverted = false }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-[17px]' : 'text-[19px]';

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="13.5"
          stroke={inverted ? '#FFFFFF' : '#157347'}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="66 19"
          transform="rotate(-38 18 18)"
        />
        <circle cx="18" cy="18" r="4.2" fill={inverted ? '#6EE7B7' : '#157347'} />
        <path
          d="M21.2 14.8L26.8 9.2"
          stroke={inverted ? '#6EE7B7' : '#0F5132'}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="27.2" cy="8.8" r="2.1" fill={inverted ? '#FFFFFF' : '#157347'} />
      </svg>
      <span className={`font-display ${textSize} font-bold tracking-tight leading-none`}>
        <span className={inverted ? 'text-white' : 'text-slate-900 dark:text-white'}>Campus</span>
        <span className={inverted ? 'text-emerald-300' : 'text-[#157347] dark:text-emerald-400'}>
          Connect
        </span>
      </span>
    </span>
  );
}
