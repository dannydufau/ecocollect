"use client";

import { useEffect, useRef } from "react";

export function FilterTabs<T extends string>({ label, options, value, onChange }: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (option: T) => void;
}) {
    const row = useRef<HTMLDivElement>(null);
    const chosen = useRef<HTMLButtonElement>(null);

    // Moves only this row. scrollIntoView could also move the page.
    useEffect(() => {
        if (row.current && chosen.current) row.current.scrollLeft = chosen.current.offsetLeft - (row.current.clientWidth - chosen.current.offsetWidth) / 2;
    }, [value]);

    return (
        // The padding keeps the focus ring from being cut off by the scrolling row
        <div ref={row} role="group" aria-label={label} className="relative -m-1.5 flex gap-2 overflow-x-auto p-1.5 sm:flex-wrap sm:overflow-visible">
            {options.map((option) => (
                <button key={option} ref={option === value ? chosen : undefined} type="button" aria-pressed={option === value} onClick={() => onChange(option)}
                    className={`soft-transition min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-2 font-semibold ${option === value
                        ? "border-text bg-text text-bg"
                        : "border-neutral-600 text-text hover:bg-surface"}`}>
                    {option}
                </button>
            ))}
        </div>
    );
}
