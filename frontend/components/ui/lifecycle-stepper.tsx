import { CheckIcon, ChevronRightIcon } from "./icons";

const steps = ["Open", "Assigned", "Collected", "Delivered"] as const;

export function LifecycleStepper({ status }: { status: (typeof steps)[number] }) {
    const current = steps.findIndex(step => step === status);
    return (
        <ol aria-label="Request progress" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            {steps.map((step, index) => <li key={step} aria-current={index === current ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 ${index === current ? "font-bold" : index > current ? "text-text-muted" : ""}`}>
                {index > 0 && <ChevronRightIcon className="size-4" />}
                {index < current && <CheckIcon className="size-4" />}
                {step}{index === current && " (now)"}
            </li>)}
        </ol>
    );
}
