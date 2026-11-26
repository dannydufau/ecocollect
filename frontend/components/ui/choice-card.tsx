import type { ReactNode } from "react";
import { CheckIcon } from "./icons";

const tones = {
    resident: {
        selected: "border-accent-700 bg-accent-100 ring-1 ring-accent-700",
        interactive: "hover:border-accent-700 hover:bg-accent-100 active:border-accent-700 active:bg-accent-100",
        icon: "text-accent-700",
    },
    volunteer: {
        selected: "border-accent-2-700 bg-accent-2-200 ring-1 ring-accent-2-700",
        interactive: "hover:border-accent-2-700 hover:bg-accent-2-100 active:border-accent-2-700 active:bg-accent-2-100",
        icon: "text-accent-2-800",
    },
};

export function ChoiceCard({ name, value, checked, onChange, title, detail, note, tone, disabled = false }: {
    name: string;
    value: string;
    checked: boolean;
    onChange: (value: string) => void;
    title: ReactNode;
    detail?: ReactNode;
    note?: ReactNode;
    tone: keyof typeof tones;
    disabled?: boolean;
}) {
    const style = tones[tone];
    const appearance = checked ? style.selected : "border-border-strong bg-surface-elevated";
    const interaction = disabled ? "cursor-not-allowed opacity-60" : `cursor-pointer ${checked ? "" : style.interactive}`;

    return <label className={`soft-transition relative flex min-h-11 min-w-0 items-start gap-3 rounded-xl border px-3.5 py-2.5 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-700 ${appearance} ${interaction}`}>
        <input type="radio" name={name} value={value} checked={checked} disabled={disabled}
            onChange={() => onChange(value)} className="sr-only" />
        <span className="min-w-0 flex-1 break-words">
            <span className="block font-semibold">{title}</span>
            {detail && <>{" "}<span className="block">{detail}</span></>}
            {note && <>{" "}<span className="mt-1 block rounded-xl bg-surface px-2.5 py-1.5 text-caption text-text-muted">{note}</span></>}
        </span>
        <span aria-hidden="true" className={`soft-transition size-5 flex-none motion-reduce:transition-none ${checked ? "opacity-100" : "opacity-0"}`}>
            <CheckIcon className={`size-5 ${style.icon}`} />
        </span>
    </label>;
}
