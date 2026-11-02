const paths: Record<string, React.ReactNode> = {
  "cars-driving": (
    <>
      <path d="m4 11 2-6h12l2 6v7H4zM4 11h16M7 8h10M7 18v2m10-2v2" />
      <path d="M7 14h2m6 0h2" />
    </>
  ),
  "fitness-movement": <path d="M3 9v6m3-8v10m12-10v10m3-8v6M6 12h12" />,
  gaming: (
    <>
      <path d="M7 7h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 17 4 7 7 7Z" />
      <path d="M8 10v4m-2-2h4m5-1h.01m3 2h.01" />
    </>
  ),
  "food-cooking": (
    <path d="M5 3v6c0 2 4 2 4 0V3M7 3v18m10-18c-3 4-3 9 1 9V3Zm1 9v9" />
  ),
  "travel-culture": (
    <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />
  ),
};

export function InterestIcon({ slug }: { slug: string }) {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[slug]}
    </svg>
  );
}
