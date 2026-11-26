import { badge } from "./styles";

const styles = {
    resident: { name: "Resident", color: "bg-role-resident text-on-accent" },
    volunteer: { name: "Volunteer", color: "bg-role-volunteer text-on-moss" },
};

export function RoleBadge({ role, className = "" }: { role: "resident" | "volunteer"; className?: string }) {
    return <span className={`${badge} ${styles[role].color} ${className}`}>{styles[role].name}</span>;
}
