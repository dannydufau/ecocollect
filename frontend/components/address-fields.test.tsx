import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddressFields, PostalCodeList } from "./address-fields";

afterEach(cleanup);

it("shows the address errors and tidies the postal code on blur", () => {
    const onPostalCode = vi.fn();
    render(<AddressFields street="" postalCode="t2p 1j9" onStreet={vi.fn()} onPostalCode={onPostalCode}
        errors={{ "address.street": "Enter your street address.", "address.postalCode": "Bad code." }} />);
    expect(screen.getByLabelText("Street")).toHaveAccessibleDescription("Enter your street address.");
    expect(screen.getByText("Bad code.")).toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText("Postal code"));
    expect(onPostalCode).toHaveBeenCalledWith("T2P1J9");
});

it("adds, removes and tidies codes and stops at three", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PostalCodeList codes={["t2p 1j9"]} errors={{ "preferredPostalCodes[0]": "Each code can only be added once." }} onChange={onChange} />);
    expect(screen.getByText("Each code can only be added once.")).toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText("Postal code 1"));
    expect(onChange).toHaveBeenLastCalledWith(["T2P1J9"]);
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    expect(onChange).toHaveBeenLastCalledWith(["t2p 1j9", ""]);
    fireEvent.click(screen.getByRole("button", { name: "Remove postal code 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<PostalCodeList codes={["T2P1J9", "T3A0B1", "T2N4X7"]} errors={{}} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Add postal code" })).toBeDisabled();
});
