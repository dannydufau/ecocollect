import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RoleBadge } from "./role-badge";

afterEach(cleanup);

it.each([["resident", "Resident", "bg-accent-700"], ["volunteer", "Volunteer", "bg-accent-2-800"]] as const)("shows %s with its word and colour", (role, word, color) => {
    render(<RoleBadge role={role} className="extra" />);
    expect(screen.getByText(word)).toHaveClass(color, "extra");
});
