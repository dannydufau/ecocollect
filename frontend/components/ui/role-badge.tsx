const styles = {
    resident: { name: "Resident", color: "bg-accent-700 text-on-accent" },
    volunteer: { name: "Volunteer", color: "bg-accent-2-800 text-on-moss" },
};

export function RoleBadge({ role, className = "" }: { role: "resident" | "volunteer"; className?: string }) {
    return <span className={`inline-block rounded-full px-3 py-0.5 text-[13px] font-semibold ${styles[role].color} ${className}`}>{styles[role].name}</span>;
}
