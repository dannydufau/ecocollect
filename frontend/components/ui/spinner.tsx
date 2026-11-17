export function Spinner({ label = "Loading" }: { label?: string }) {
    return (
        <span role="status" className="inline-flex items-center gap-2 text-neutral-700">
            <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-accent" />
            <span>{label}</span>
        </span>
    );
}
