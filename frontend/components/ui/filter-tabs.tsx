"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const fade = "pointer-events-none absolute -inset-y-1.5 z-[5] w-8 from-bg to-transparent";

export function FilterTabs<T extends string>({ label, options, value, onChange }: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (option: T) => void;
}) {
    const row = useRef<HTMLDivElement>(null);
    const chosen = useRef<HTMLButtonElement>(null);
    const [more, setMore] = useState({ left: false, right: false });

    const measure = useCallback(() => {
        const el = row.current;
        if (!el) return;
        const left = el.scrollLeft > 1;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setMore(old => (old.left === left && old.right === right ? old : { left, right }));
    }, []);

    // Moves only this row. scrollIntoView could also move the page.
    useEffect(() => {
        if (row.current && chosen.current) row.current.scrollLeft = chosen.current.offsetLeft - (row.current.clientWidth - chosen.current.offsetWidth) / 2;
        measure();
    }, [value, options.length, measure]);

    useEffect(() => {
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [measure]);

    return (
        <div className="relative min-w-0">
            {more.left && <span aria-hidden="true" data-fade="left" className={`${fade} -left-1.5 bg-gradient-to-r`} />}
            {/* The padding keeps the focus ring from being cut off by the scrolling row */}
            <div ref={row} role="group" aria-label={label} onScroll={measure} className="relative -m-1.5 flex gap-2 overflow-x-auto p-1.5 sm:flex-wrap sm:overflow-visible">
                {options.map((option) => (
                    // The chosen and focused chips sit above the fade
                    <button key={option} ref={option === value ? chosen : undefined} type="button" aria-pressed={option === value} onClick={() => onChange(option)}
                        className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-2 font-semibold focus-visible:relative focus-visible:z-10 ${option === value
                            ? "relative z-10 border-text bg-text text-bg"
                            : "border-neutral-600 text-text hover:bg-surface"}`}>
                        {option}
                    </button>
                ))}
            </div>
            {more.right && <span aria-hidden="true" data-fade="right" className={`${fade} -right-1.5 bg-gradient-to-l`} />}
        </div>
    );
}
