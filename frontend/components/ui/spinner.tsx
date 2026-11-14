export function Spinner({ label = "Loading" }: { label?: string }) {
    return (
        <span role="status" className="inline-flex items-center gap-2 text-sm text-stone-700">
            <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-[#9e5220]" />
            <span>{label}</span>
        </span>
    );
}
