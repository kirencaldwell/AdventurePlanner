import type { ReactNode } from 'react';

// Small stroke icons for the trip header and tab bar. They inherit the text
// color and are hidden from screen readers; the button label carries meaning.
function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const ChevronDownIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M6 9l6 6 6-6" /></Icon>
);
export const CalendarIcon = ({ size }: IconProps) => (
  <Icon size={size}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);
export const RouteIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M4 19c4 0 4-6 8-6s4-6 8-6" /><circle cx="4" cy="19" r="2" /><circle cx="20" cy="7" r="2" /></Icon>
);
export const MountainIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M3 20l6-10 4 6 3-4 5 8z" /></Icon>
);
export const ShareIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></Icon>
);
export const LinkIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>
);
export const CheckIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
);
export const MoreIcon = ({ size }: IconProps) => (
  <Icon size={size}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
);
export const PlusIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M12 5v14M5 12h14" /></Icon>
);
export const CloseIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);
export const ChatIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M4 5h16v11H9l-5 4z" /></Icon>
);
export const MicIcon = ({ size }: IconProps) => (
  <Icon size={size}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>
);
export const SendIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const CompassIcon = ({ size }: IconProps) => (
  <Icon size={size}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></Icon>
);
export const SunIcon = ({ size }: IconProps) => (
  <Icon size={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const MapIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></Icon>
);
export const BackpackIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M6 9a6 6 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 4.5V3h6v1.5M9 14h6" /></Icon>
);
export const NotebookIcon = ({ size }: IconProps) => (
  <Icon size={size}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M9 9h6M9 13h4" /></Icon>
);
