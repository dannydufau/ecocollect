import type { ReactNode } from "react";

type Props = { className?: string };

function Icon({ className = "size-5", children }: Props & { children: ReactNode }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" className={className}>
            {children}
        </svg>
    );
}

export const PlusIcon = (props: Props) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;

export const ClockIcon = (props: Props) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;

export const CalendarIcon = (props: Props) => <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
</Icon>;

export const MapPinIcon = (props: Props) => <Icon {...props}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.5" />
</Icon>;

export const ScaleIcon = (props: Props) => <Icon {...props}>
    <path d="M12 4v16M8 20h8M5 7h14" /><path d="M5 7l-2.5 6a3 3 0 0 0 5 0L5 7ZM19 7l-2.5 6a3 3 0 0 0 5 0L19 7Z" />
</Icon>;

export const CameraIcon = (props: Props) => <Icon {...props}>
    <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" />
</Icon>;

export const TruckIcon = (props: Props) => <Icon {...props}>
    <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7" /><circle cx="6.5" cy="18" r="1.75" /><circle cx="17" cy="18" r="1.75" />
</Icon>;

export const PackageIcon = (props: Props) => <Icon {...props}>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="M4 7l8 4 8-4M12 11v10M8 5l8 4" />
</Icon>;

export const ChevronRightIcon = (props: Props) => <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>;

export const CheckIcon = (props: Props) => <Icon {...props}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;

export const InfoIcon = (props: Props) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>;

export const WarningIcon = (props: Props) => <Icon {...props}>
    <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" />
</Icon>;

export const AlertIcon = (props: Props) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></Icon>;

export const EyeIcon = (props: Props) => <Icon {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />
</Icon>;

export const EyeOffIcon = (props: Props) => <Icon {...props}>
    <path d="M3 3l18 18M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.6 3.3M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.3-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
</Icon>;

export const BellIcon = (props: Props) => <Icon {...props}>
    <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9Z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" />
</Icon>;

export const LeafIcon = (props: Props) => <Icon {...props}>
    <path d="M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15" /><path d="M5 19c3-4 6-6.5 10-8.5" />
</Icon>;
