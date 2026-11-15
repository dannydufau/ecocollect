import { useState } from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithClient } from "@/test/utils";
import TermsCheckbox from "./terms-checkbox";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const terms = (id: string) => ({ termsDocumentId: id, content: "Some terms", publishedAt: "2026-11-01T00:00:00.000Z" });

// Keeps the value like a real form would
function Form({ onChange }: { onChange: (id: string | null) => void }) {
    const [value, setValue] = useState<string | null>(null);
    return (
        <TermsCheckbox
            value={value}
            onChange={(id) => {
                setValue(id);
                onChange(id);
            }}
        />
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
});

// Vitest does not clean the page between tests by itself
afterEach(cleanup);

it("calls onChange with the terms id when ticked", async () => {
    vi.mocked(api.get).mockResolvedValue(terms("t1"));
    const onChange = vi.fn();
    renderWithClient(<Form onChange={onChange} />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "I have read and accept the terms and safety guidelines" }));
    expect(onChange).toHaveBeenCalledWith("t1");
});

it("calls onChange with null when unticked", async () => {
    vi.mocked(api.get).mockResolvedValue(terms("t1"));
    const onChange = vi.fn();
    renderWithClient(<Form onChange={onChange} />);

    const box = await screen.findByRole("checkbox");
    await userEvent.click(box);
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(null);
});

it("resets when a refetch gives a new terms id", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(terms("t1")).mockResolvedValue(terms("t2"));
    const onChange = vi.fn();
    renderWithClient(<Form onChange={onChange} />);

    const box = await screen.findByRole("checkbox");
    await userEvent.click(box);
    expect(box).toBeChecked();

    // Coming back to the tab refetches the terms
    window.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
    expect(box).not.toBeChecked();
});

it("shows loading text and no checkbox while loading", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithClient(<Form onChange={() => {}} />);

    expect(screen.getByText("Loading terms...")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("shows an error and lets the user try again", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(terms("t1"));
    renderWithClient(<Form onChange={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the terms. Please try again.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("checkbox")).toBeInTheDocument();
});
