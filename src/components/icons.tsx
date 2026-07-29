/**
 * Hand-rolled line icons: one 1.6 stroke weight, one 24-box, no dependency.
 * Every icon here is drawn for this app rather than pulled from a default set.
 */
type Props = { className?: string }

const Svg = ({ children, className = 'size-[17px]' }: Props & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={className}
  >
    {children}
  </svg>
)

export const IconOverview = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Svg>
)

export const IconAccounts = (p: Props) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 20c0-2.2-.8-3.9-2-5" />
  </Svg>
)

export const IconArchive = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="4.5" rx="1.6" />
    <path d="M4.8 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11.4a1.5 1.5 0 0 0 1.5-1.5V8.5" />
    <path d="M10 12.5h4" />
  </Svg>
)

export const IconTerminal = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
    <path d="M6.5 9.5 9 12l-2.5 2.5M12 14.5h5" />
  </Svg>
)

export const IconProxy = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="2.3" />
    <circle cx="5.5" cy="18" r="2.3" />
    <circle cx="18.5" cy="18" r="2.3" />
    <path d="M10.9 7.4 6.6 16M13.1 7.4l4.3 8.6M7.8 18h8.4" />
  </Svg>
)

export const IconSettings = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" />
  </Svg>
)

export const IconKey = (p: Props) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="4.2" />
    <path d="M11 11l8 8M16.5 16.5 15 18M19 14l-1.5 1.5" />
  </Svg>
)

export const IconFile = (p: Props) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
)

export const IconClock = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const IconSearch = (p: Props) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4 4" />
  </Svg>
)

export const IconRefresh = (p: Props) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 4.5V9h-4.5" />
  </Svg>
)

export const IconPlus = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
)

export const IconMinus = (p: Props) => (
  <Svg {...p}>
    <path d="M5.5 12h13" />
  </Svg>
)

export const IconArrowRight = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
  </Svg>
)

export const IconChevron = (p: Props) => (
  <Svg {...p}>
    <path d="m9 5.5 6 6.5-6 6.5" />
  </Svg>
)

export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
)

export const IconAlert = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v3.5M12 16.5v.01" />
  </Svg>
)

export const IconDots = (p: Props) => (
  <Svg {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </Svg>
)

export const IconPencil = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h4L20 8l-4-4L4 16z" />
  </Svg>
)

export const IconTrash = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />
  </Svg>
)

export const IconLogout = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M17 8.5l3.5 3.5L17 15.5M20 12h-8" />
  </Svg>
)
