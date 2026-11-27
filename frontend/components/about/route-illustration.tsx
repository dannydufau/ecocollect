// Custom inline SVG illustrating EcoCollect's doorstep-to-facility journey.
// Matches the 1.75px rounded-stroke grammar of components/ui/icons.tsx and uses semantic CSS tokens.
export default function RouteIllustration() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 420 240"
            fill="none"
            className="h-auto w-full max-w-[420px]"
        >
            <defs>
                <linearGradient id="ecocollect-route-grad" x1="56" y1="68" x2="364" y2="176" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="var(--color-role-resident)" />
                    <stop offset="52%" stopColor="var(--color-accent-600)" />
                    <stop offset="100%" stopColor="var(--color-role-volunteer)" />
                </linearGradient>
            </defs>

            {/* Subtle background grid lines evoking a neighborhood map */}
            <g stroke="var(--color-divider)" strokeWidth="1">
                <path d="M24 56H396M24 120H396M24 184H396" />
                <path d="M92 20V220M210 20V220M328 20V220" />
            </g>

            {/* Static dashed guide beneath the animated route */}
            <path
                d="M64 68 C 148 68, 152 124, 210 124 C 268 124, 272 174, 356 174"
                stroke="var(--color-border-strong)"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                strokeLinecap="round"
                opacity="0.45"
            />

            {/* Animated doorstep-to-facility route line */}
            <path
                d="M64 68 C 148 68, 152 124, 210 124 C 268 124, 272 174, 356 174"
                stroke="url(#ecocollect-route-grad)"
                strokeWidth="3"
                strokeLinecap="round"
                className="about-route-path"
            />

            {/* Node 1: Resident doorstep (Terracotta) */}
            <g transform="translate(40, 44)">
                <rect x="0" y="0" width="48" height="48" rx="14" fill="var(--color-surface-elevated)" stroke="var(--color-role-resident)" strokeWidth="1.75" />
                <path d="M24 13 15 17.5v9L24 31l9-4.5v-9L24 13Z" stroke="var(--color-role-resident)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 17.5 24 22l9-4.5M24 22v9" stroke="var(--color-role-resident)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text x="64" y="112" textAnchor="middle" fill="var(--color-text-muted)" fontSize="12" fontWeight="600">
                Resident
            </text>

            {/* Node 2: Volunteer pickup (Midpoint) */}
            <g transform="translate(186, 100)">
                <rect x="0" y="0" width="48" height="48" rx="14" fill="var(--color-surface-elevated)" stroke="var(--color-accent-600)" strokeWidth="1.75" />
                <path d="M13 18h12v11H13zM25 22h4.5l3.5 3.5V29h-8" stroke="var(--color-text)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="17.5" cy="31" r="2" stroke="var(--color-text)" strokeWidth="1.75" />
                <circle cx="29" cy="31" r="2" stroke="var(--color-text)" strokeWidth="1.75" />
            </g>
            <text x="210" y="168" textAnchor="middle" fill="var(--color-text-muted)" fontSize="12" fontWeight="600">
                Volunteer
            </text>

            {/* Node 3: Recycling facility (Moss) */}
            <g transform="translate(332, 150)">
                <rect x="0" y="0" width="48" height="48" rx="14" fill="var(--color-role-volunteer)" />
                <path d="M17 31c0-8 5-13 14-13 0 9-5 14-13 14" stroke="var(--color-on-moss)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 31c2.8-3.8 5.6-6 9.2-8" stroke="var(--color-on-moss)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text x="356" y="218" textAnchor="middle" fill="var(--color-text-muted)" fontSize="12" fontWeight="600">
                Facility
            </text>
        </svg>
    );
}
