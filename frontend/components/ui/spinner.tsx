export function Spinner({ label = "Loading" }: { label?: string }) {
    return (
        <span role="status" className="inline-flex items-center gap-2 text-text-muted">
            <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full motion-reduce:animate-none border-2 border-neutral-300 border-t-accent" />
            <span>{label}</span>
        </span>
    );
}

// A region that fills with data. It keeps its height, so the page does not jump when the data arrives.
export function LoadingRegion({ label }: { label: string }) {
    return <div className="flex min-h-48 items-center justify-center"><Spinner label={label} /></div>;
}

// Fills the space it is given and centres the spinner, for a whole page that is still loading
export function PageLoading() {
    return <div className="flex min-h-48 flex-1 items-center justify-center p-8"><Spinner label="Loading..." /></div>;
}
