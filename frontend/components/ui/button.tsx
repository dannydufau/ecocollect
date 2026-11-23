import type { ButtonHTMLAttributes } from "react";

const variants = {
    primary: "bg-accent text-on-accent hover:bg-accent-700 active:bg-accent-800",
    secondary: "border border-neutral-600 text-text hover:bg-text/10 active:bg-text/15",
    danger: "bg-danger text-on-danger hover:brightness-90 active:brightness-75",
    // The prototype's red action buttons on a request page: an outline with red text. The filled one is for the confirm button.
    "danger-outline": "border border-danger text-danger hover:bg-danger/10 active:bg-danger/15",
    ghost: "text-text hover:bg-text/10 active:bg-text/15",
};

const sizes = {
    md: "min-h-11 px-5 py-2",
    // Only for secondary controls
    sm: "min-h-9 px-3 py-1 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    busy?: boolean;
    busyLabel?: string;
};

export function Button({ variant = "primary", size = "md", busy = false, busyLabel, disabled, children, className = "", ...rest }: Props) {
    return (
        <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy}
            className={`soft-transition rounded-full font-semibold motion-safe:active:scale-[0.985] motion-safe:active:duration-(--duration-press) disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${variants[variant]} ${className}`}>
            {busy && <span aria-hidden="true" className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] motion-reduce:animate-none" />}
            {busy && busyLabel ? busyLabel : children}
        </button>
    );
}
