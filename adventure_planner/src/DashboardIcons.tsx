import type { ReactNode } from 'react';
import type { ActivityKind } from './tripUtils';

// Small stroke icons for the trip dashboard, drawn in the current text color
const Icon = ({ size = 18, children }: { size?: number; children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const RefreshIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Icon>;
export const SlidersIcon = () => (
  <Icon size={16}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </Icon>
);
export const CardsIcon = () => (
  <Icon size={16}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);
export const MapIcon = ({ size = 16 }: { size?: number }) => <Icon size={size}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></Icon>;
export const LinkIcon = () => <Icon size={17}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Icon>;
export const ChevronIcon = ({ open }: { open: boolean }) => <Icon size={18}><path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} /></Icon>;

export const ActivityIcon = ({ kind }: { kind: ActivityKind }) => {
  if (kind === 'ski') return <Icon size={22}><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18" /></Icon>;
  if (kind === 'bike') return <Icon size={22}><circle cx="6" cy="16" r="4" /><circle cx="18" cy="16" r="4" /><path d="m6 16 4-8h5l3 8M10 8l2 8" /></Icon>;
  if (kind === 'climb') return <Icon size={22}><path d="m3 20 7-14 4 7 2-3 5 10z" /><path d="m8.5 9 1.5 1.5L12 9" /></Icon>;
  if (kind === 'hike') return <Icon size={22}><path d="m3 20 6-10 4 6 2-3 6 7z" /><circle cx="17" cy="6" r="2" /></Icon>;
  return <Icon size={22}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>;
};
