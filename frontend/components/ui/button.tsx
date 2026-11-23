import type { ButtonHTMLAttributes } from "react";

const variants = {
    // not-disabled: a disabled button, and a link that is not one, shows no hover or pressed change
    primary: "bg-accent text-on-accent not-disabled:hover:bg-accent-700 not-disabled:active:bg-accent-800",
    secondary: "border border-neutral-600 text-text not-disabled:hover:bg-text/10 not-disabled:active:bg-text/15",
    danger: "bg-danger text-on-danger not-disabled:hover:brightness-90 not-disabled:active:brightness-75",
    // The prototype's red action buttons on a request page: an outline with red text. The filled one is for the confirm button.
    "danger-outline": "border border-danger text-danger not-disabled:hover:bg-danger/10 not-disabled:active:bg-danger/15",
    ghost: "text-text not-disabled:hover:bg-text/10 not-disabled:active:bg-text/15",
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

// Also used by linkButton and secondaryLinkButton, so a link that looks like a button is the same as the button
export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md") {
    return `soft-transition rounded-full font-semibold motion-safe:not-disabled:active:scale-[0.985] motion-safe:not-disabled:active:duration-(--duration-press) disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${variants[variant]}`;
}

export function Button({ variant = "primary", size = "md", busy = false, busyLabel, disabled, children, className = "", ...rest }: Props) {
    return (
        <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy}
            className={`${buttonClass(variant, size)} ${className}`}>
            {busy && <span aria-hidden="true" className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] motion-reduce:animate-none" />}
            {busy && busyLabel ? busyLabel : children}
        </button>
    );
}
