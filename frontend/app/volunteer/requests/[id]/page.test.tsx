import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { pageWidth } from "@/components/ui";
import VolunteerRequestPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "request-123" }) }));
vi.mock("@/components/volunteer/request-detail", () => ({
    default: ({ requestId }: { requestId: string }) => <p>Details for {requestId}</p>,
}));
afterEach(cleanup);

it("passes the id from the url to the detail", () => {
    render(<VolunteerRequestPage />);
    expect(screen.getByText("Details for request-123")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass(...pageWidth.split(" "));
});
