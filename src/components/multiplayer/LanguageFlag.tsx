import type { MultiplayerLanguage } from '@/lib/multiplayer'

/** Tiny inline flag; the language name always sits next to it, so it is decorative. */
export function LanguageFlag({ language }: { language: MultiplayerLanguage }) {
  switch (language) {
    case 'da':
      return (
        <svg className="wp-flag" viewBox="0 0 37 28" aria-hidden="true">
          <rect width="37" height="28" fill="#c8102e" />
          <rect x="12" width="4" height="28" fill="#fff" />
          <rect y="12" width="37" height="4" fill="#fff" />
        </svg>
      )
    case 'sv':
      return (
        <svg className="wp-flag" viewBox="0 0 37 28" aria-hidden="true">
          <rect width="37" height="28" fill="#006aa7" />
          <rect x="11" width="5" height="28" fill="#fecc00" />
          <rect y="11.5" width="37" height="5" fill="#fecc00" />
        </svg>
      )
    case 'fi':
      return (
        <svg className="wp-flag" viewBox="0 0 37 28" aria-hidden="true">
          <rect width="37" height="28" fill="#fff" />
          <rect x="11" width="5" height="28" fill="#003580" />
          <rect y="11.5" width="37" height="5" fill="#003580" />
        </svg>
      )
    default:
      return (
        <svg className="wp-flag" viewBox="0 0 60 30" aria-hidden="true">
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0 L60 30 M60 0 L0 30" stroke="#c8102e" strokeWidth="2" />
          <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
          <path d="M30 0 V30 M0 15 H60" stroke="#c8102e" strokeWidth="6" />
        </svg>
      )
  }
}
