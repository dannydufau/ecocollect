import type { ReactNode } from "react";

export function EmptyState({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children?: ReactNode }) {
    return (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 px-4 py-6">
            {icon && <span aria-hidden="true" className="mb-2 inline-flex text-text-muted">{icon}</span>}
            <p className="text-xl font-bold">{title}</p>
            {children && <div className="mt-3 text-neutral-800">{children}</div>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}
