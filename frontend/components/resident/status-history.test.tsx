import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import StatusHistory from "./status-history";

afterEach(cleanup);

it("shows history oldest first without changing the response order, using Calgary timestamps", () => {
    const history = [
        { status: "Missed" as const, changedAt: "2026-11-16T20:00:00Z", reason: "Volunteer did not arrive.\nPlease use the side door next time." },
        { status: "Open" as const, changedAt: "2026-11-14T18:00:00Z", reason: null },
        { status: "Assigned" as const, changedAt: "2026-11-15T19:00:00Z", reason: null },
    ];
    render(<StatusHistory statusHistory={history} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    ["Open", "Assigned", "Missed"].forEach((status, index) => expect(within(rows[index]).getByText(status)).toBeInTheDocument());
    expect(history.map(entry => entry.status)).toEqual(["Missed", "Open", "Assigned"]);
    const time = rows[0].querySelector("time")!;
    expect(time).toHaveAttribute("datetime", "2026-11-14T18:00:00Z");
    expect(time).toHaveTextContent(/Nov 14, 2026/);
    expect(time).toHaveTextContent(/12:00/);
    expect(rows[2]).toHaveTextContent("Volunteer did not arrive.");
    expect(rows[2]).toHaveTextContent("Please use the side door next time.");
    expect(rows[0].querySelector("p")).toBeNull();
});

it("links the missed request to its replacement and the replacement back to its source", () => {
    render(<StatusHistory rescheduledFrom={{ requestId: "old/request" }} rescheduledAs={{ requestId: "r2" }} />);
    expect(screen.getByRole("link", { name: "Rescheduled from" })).toHaveAttribute("href", "/resident/requests/old%2Frequest");
    expect(screen.getByRole("link", { name: "Rescheduled as" })).toHaveAttribute("href", "/resident/requests/r2");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it.each(["rescheduledFrom", "rescheduledAs"] as const)("shows only the supplied %s link", key => {
    render(<StatusHistory {...{ [key]: { requestId: "r2" } }} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveTextContent(key === "rescheduledFrom" ? "Rescheduled from" : "Rescheduled as");
});

it("shows a single history row without empty reschedule navigation", () => {
    render(<StatusHistory statusHistory={[{ status: "Open", changedAt: "2026-11-14T18:00:00Z", reason: null }]}
        rescheduledFrom={null} rescheduledAs={null} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it("omits the section when there is no history or reschedule link", () => {
    const { container, rerender } = render(<StatusHistory />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StatusHistory statusHistory={[]} rescheduledFrom={null} rescheduledAs={null} />);
    expect(container).toBeEmptyDOMElement();
});
