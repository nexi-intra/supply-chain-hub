interface HubertIconProps {
  size?: number
  className?: string
  /** Accepteret for drop-in-kompatibilitet med phosphor-ikoner; paavirker ikke tegningen. */
  weight?: string
}

// Easter egg: Hubert er en golden retriever. Ikonet blander et robothoved med
// hundeoerer, snude og naese i gyldne toner.
export function HubertIcon({ size = 24, className }: HubertIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Hubert"
    >
      {/* Haengende hundeoerer bag hovedet */}
      <path d="M7 11C4.4 11 2.9 14 3.5 17.6C4.1 21.2 6.2 23.2 8.2 22.6C8.3 18 8.6 13.6 9.6 11.6C8.8 11.2 7.9 11 7 11Z" fill="#A96A28" />
      <path d="M25 11C27.6 11 29.1 14 28.5 17.6C27.9 21.2 25.8 23.2 23.8 22.6C23.7 18 23.4 13.6 22.4 11.6C23.2 11.2 24.1 11 25 11Z" fill="#A96A28" />
      {/* Antenne der signalerer robot */}
      <line x1="16" y1="3.8" x2="16" y2="6.8" stroke="#9AA5B1" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="3" r="1.6" fill="#22D3EE" />
      {/* Robothoved */}
      <rect x="6.5" y="6.5" width="19" height="17.5" rx="6.2" fill="#E3A857" />
      {/* Lysere ansigtspanel */}
      <rect x="9.2" y="9" width="13.6" height="9.2" rx="4.2" fill="#EEBB79" />
      {/* Robotoejne */}
      <circle cx="12.9" cy="13.3" r="1.8" fill="#20303B" />
      <circle cx="19.1" cy="13.3" r="1.8" fill="#20303B" />
      <circle cx="13.4" cy="12.7" r="0.6" fill="#22D3EE" />
      <circle cx="19.6" cy="12.7" r="0.6" fill="#22D3EE" />
      {/* Snude */}
      <ellipse cx="16" cy="20.4" rx="6" ry="4.1" fill="#F5DDB4" />
      {/* Naese */}
      <ellipse cx="16" cy="18.8" rx="2" ry="1.5" fill="#33271F" />
      {/* Mund */}
      <path
        d="M16 20.3V22.2M13.6 22.9C14.6 23.7 17.4 23.7 18.4 22.9"
        stroke="#33271F"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
