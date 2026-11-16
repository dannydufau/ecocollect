import type { ButtonHTMLAttributes } from "react";

const variants = {
    primary: "bg-accent text-bg hover:bg-accent-700 active:bg-accent-800",
    secondary: "border-2 border-accent-700 text-accent-700 hover:bg-accent-100 active:bg-accent-200",
    danger: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof variants;
    busy?: boolean;
    busyLabel?: string;
};

export function Button({ variant = "primary", busy = false, busyLabel, disabled, children, className = "", ...rest }: Props) {
    return (
        <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy}
            className={`min-h-11 rounded-lg px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}>
            {busy && busyLabel ? busyLabel : children}
        </button>
    );
}
