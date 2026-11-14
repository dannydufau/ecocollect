import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
            <p className="font-medium text-stone-900">{title}</p>
            {children && <div className="mt-2 text-sm text-stone-700">{children}</div>}
        </div>
    );
}
