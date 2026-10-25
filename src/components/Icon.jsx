export default function Icon({ name, size = 18, ...props }) {
  const paths = {
    compare: <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    request: <><path d="m8 5-7 7 7 7M16 5l7 7-7 7M14 3l-4 18" /></>,
    layers: <><path d="m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6M2 19l10 6 10-6" transform="translate(0 -1) scale(1 .9)" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c6 6 6 12 0 18-6-6-6-12 0-18Z" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></>,
    terminal: <><rect x="2" y="3" width="20" height="18" rx="4" /><path d="m6 8 4 4-4 4M13 16h5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
