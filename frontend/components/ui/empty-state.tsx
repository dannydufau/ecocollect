import type { ReactNode } from "react";

// bare drops the dashed box, for a place that already sits inside a card
export function EmptyState({ title, icon, action, bare = false, children }: { title: string; icon?: ReactNode; action?: ReactNode; bare?: boolean; children?: ReactNode }) {
    return (
        <div className={`px-4 py-6 ${bare ? "" : "rounded-2xl border border-dashed border-border-strong bg-surface/50"}`}>
            {icon && <span aria-hidden="true" className="mb-2 inline-flex text-text-muted [&>svg]:size-6">{icon}</span>}
            <p className="text-xl font-bold">{title}</p>
            {children && <div className="mt-3 text-text-muted">{children}</div>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}
