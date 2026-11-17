import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="px-4 py-6">
            <p className="font-[family-name:var(--font-heading)] text-2xl">{title}</p>
            {children && <div className="mt-3 text-neutral-800">{children}</div>}
        </div>
    );
}
