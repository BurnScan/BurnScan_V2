import type React from "react";

const paths: Record<string, React.ReactNode> = {
  map: (
    <>
      <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" />
      <path d="M8 3v15m8-12v15" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  compare: <path d="M5 20V10m7 10V4m7 16v-7" />,
  anomaly: (
    <>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4m0 3h.01" />
    </>
  ),
  satellite: (
    <>
      <path d="M12 3v18M3 12h18" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4" />
      <path d="M4 19h16" />
    </>
  ),
  flame: (
    <path d="M12 22c4.4 0 7-3 7-7 0-3-1.5-5.3-4.5-8.5.1 3-1.7 4.3-2.7 5-1-2.7-2.5-5-4.8-7.5.2 4-2 6.2-2 10.5C5 18.7 7.7 22 12 22Z" />
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
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
      {paths[name]}
    </svg>
  );
}
