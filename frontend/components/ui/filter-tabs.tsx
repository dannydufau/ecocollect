export function FilterTabs<T extends string>({ label, options, value, onChange }: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (option: T) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
            {options.map((option) => (
                <button key={option} type="button" aria-pressed={option === value} onClick={() => onChange(option)}
                    className={`min-h-11 rounded-full border px-4 py-2 font-semibold ${option === value
                        ? "border-text bg-text text-bg"
                        : "border-neutral-600 text-text hover:bg-surface"}`}>
                    {option}
                </button>
            ))}
        </div>
    );
}
