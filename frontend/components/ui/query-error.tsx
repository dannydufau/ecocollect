import { Alert } from "./alert";
import { Button } from "./button";

export function QueryError({ message, onRetry, busy = false }: { message: string; onRetry: () => void; busy?: boolean }) {
    return (
        <div className="space-y-2">
            <Alert variant="error">{message}</Alert>
            <Button variant="secondary" onClick={onRetry} busy={busy} busyLabel="Trying...">Try again</Button>
        </div>
    );
}
