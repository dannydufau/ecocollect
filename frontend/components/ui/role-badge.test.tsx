import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RoleBadge } from "./role-badge";
import { StatusBadge } from "./status-badge";
import { badge } from "./styles";

afterEach(cleanup);

it.each([["resident", "Resident", "bg-role-resident"], ["volunteer", "Volunteer", "bg-role-volunteer"]] as const)("shows %s with its word and colour", (role, word, color) => {
    render(<RoleBadge role={role} className="extra" />);
    expect(screen.getByText(word)).toHaveClass(color, "extra");
});

it("gives the role and status badges the same base, so they line up", () => {
    render(<><RoleBadge role="resident" /><StatusBadge status="Open" /></>);
    for (const word of ["Resident", "Open"]) expect(screen.getByText(word)).toHaveClass(...badge.split(" "));
});
