import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="px-4 py-6">
            <h2 className="text-2xl">{title}</h2>
            {children && <div className="mt-3 text-neutral-800">{children}</div>}
        </div>
    );
}
