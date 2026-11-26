import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager, useMutation } from "@tanstack/react-query";
import Providers from "./providers";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/auth-context", () => ({
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/sse", async () => {
    const { createContext } = await import("react");
    return {
        StreamContext: createContext(() => {}),
        useEventStream: () => ({ reopen: vi.fn() }),
    };
});

afterEach(() => {
    onlineManager.setOnline(true);
    cleanup();
    vi.restoreAllMocks();
});

function OfflineAction({ onSend }: { onSend: () => Promise<unknown> }) {
    const mutation = useMutation({ mutationFn: onSend });
    return (
        <div>
            <button type="button" onClick={() => mutation.mutate()}>Confirm</button>
            {mutation.isPaused && <p>Paused</p>}
            {mutation.isError && <p role="alert">Failed</p>}
        </div>
    );
}

it("fails mutations immediately while offline instead of queuing them for reconnect", async () => {
    onlineManager.setOnline(false);
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Providers><OfflineAction onSend={send} /></Providers>);

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Failed"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();

    // Reconnecting must not replay the abandoned mutation
    onlineManager.setOnline(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(send).toHaveBeenCalledTimes(1);
});
