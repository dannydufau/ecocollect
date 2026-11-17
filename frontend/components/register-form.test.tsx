import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { calgaryToday } from "@/lib/time";
import { eighteenYearsAgo } from "@/lib/validate-account";
import RegisterForm from "./register-form";

afterEach(cleanup);

const label = (name: string) => screen.getByLabelText(name);
const type = (name: string, text: string) => userEvent.type(label(name), text);

async function fillAbout() {
    await type("First name", "Riley");
    await type("Last name", "Resident");
    fireEvent.change(label("Date of birth"), { target: { value: "1995-03-14" } });
    await type("Public name", "Riley R.");
    await type("Username", "riley_1");
    await type("Email", "riley@example.com");
    await type("Password", "secret1");
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Create account" }));

it("shows the about you and account fields and a role choice, and no role details yet", () => {
    render(<RegisterForm />);
    for (const name of ["First name", "Last name", "Date of birth", "Public name", "Username", "Email", "Password"]) expect(label(name)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Request pickups (Resident)" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" })).not.toBeChecked();
    expect(screen.queryByLabelText("Street")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add postal code" })).not.toBeInTheDocument();
});

it("shows street and postal code for a resident, and hides the street for a volunteer", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    expect(label("Street")).toBeInTheDocument();
    expect(label("Postal code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add postal code" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    expect(screen.queryByLabelText("Street")).not.toBeInTheDocument();
    expect(screen.getByText("Preferred postal codes (optional, up to 3)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add postal code" })).toBeInTheDocument();
});

it("groups the fields like the design, with Role details for either role", async () => {
    render(<RegisterForm />);
    for (const name of ["About you", "Account", "I want to"]) expect(screen.getByRole("group", { name })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Role details" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    expect(screen.getByRole("group", { name: "Role details" })).toContainElement(label("Street"));
    await userEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    expect(screen.getByRole("group", { name: "Role details" })).toBeInTheDocument();
});

it("has the sign in link next to the button", () => {
    render(<RegisterForm />);
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute("href", "/login");
});

it("lowercases the username and tidies the postal code when the field is left", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    await type("Username", "Riley_1");
    await type("Postal code", " t2p 1j9 ");
    await userEvent.tab();
    expect(label("Username")).toHaveValue("riley_1");
    expect(label("Postal code")).toHaveValue("T2P1J9");
});

it("sets the latest birth date to 18 years ago", () => {
    render(<RegisterForm />);
    expect(label("Date of birth")).toHaveAttribute("max", eighteenYearsAgo(calgaryToday()));
});

it("shows a message under each empty field, sends nothing and moves focus to the first one", async () => {
    const onValid = vi.fn();
    render(<RegisterForm onValid={onValid} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await submit();
    expect(onValid).not.toHaveBeenCalled();
    expect(label("First name")).toHaveAccessibleDescription("Enter your first name.");
    expect(label("Last name")).toHaveAccessibleDescription("Enter your last name.");
    expect(label("Date of birth")).toHaveAccessibleDescription("Enter your date of birth.");
    expect(label("Public name")).toHaveAccessibleDescription(/Enter a public name\./);
    expect(label("Username")).toHaveAccessibleDescription(/Use 3 to 50 characters: a to z, 0 to 9, _ and -\./);
    expect(label("Email")).toHaveAccessibleDescription("Enter a valid email.");
    expect(label("Password")).toHaveAccessibleDescription("Choose a password.");
    expect(screen.getByText("Choose how you want to use EcoCollect.")).toBeInTheDocument();
    expect(label("First name")).toHaveFocus();
});

it("says why a birth date under 18 or in the future does not work, and updates as the user types", async () => {
    render(<RegisterForm />);
    await submit();
    fireEvent.change(label("Date of birth"), { target: { value: "2099-01-01" } });
    expect(screen.getByText("Birth date can't be in the future.")).toBeInTheDocument();
    fireEvent.change(label("Date of birth"), { target: { value: calgaryToday() } });
    expect(screen.getByText("You must be 18 or older to register.")).toBeInTheDocument();
    fireEvent.change(label("Date of birth"), { target: { value: "1995-03-14" } });
    expect(screen.queryByText("You must be 18 or older to register.")).not.toBeInTheDocument();
});

it("checks the resident address and the Calgary postal code", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    await type("Postal code", "M5V 2T6");
    await submit();
    expect(screen.getByText("Enter your street address.")).toBeInTheDocument();
    expect(label("Postal code")).toHaveAccessibleDescription(/Enter a Calgary postal code, for example T2P 1J9\./);
});

it("adds and removes up to 3 postal codes for a volunteer and names the row of a duplicate", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    const add = screen.getByRole("button", { name: "Add postal code" });
    await userEvent.click(add);
    await userEvent.click(add);
    await userEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getAllByLabelText(/^Postal code \d$/)).toHaveLength(3);
    await userEvent.type(label("Postal code 1"), "t2p 1j9");
    await userEvent.type(label("Postal code 2"), "T2P1J9");
    await submit();
    expect(label("Postal code 2")).toHaveAccessibleDescription("Each code can only be added once.");
    expect(label("Postal code 1")).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Remove postal code 2" }));
    expect(screen.getAllByLabelText(/^Postal code \d$/)).toHaveLength(2);
    expect(add).toBeEnabled();
    expect(screen.queryByText("Each code can only be added once.")).not.toBeInTheDocument();
});

it("passes a valid resident to onValid", async () => {
    const onValid = vi.fn();
    render(<RegisterForm onValid={onValid} />);
    await fillAbout();
    await userEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    await type("Street", "101 8 Ave SW");
    await type("Postal code", "t2p 1j9");
    await submit();
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid.mock.calls[0][0]).toMatchObject({ username: "riley_1", role: "resident", street: "101 8 Ave SW", postalCode: "T2P1J9", dateOfBirth: "1995-03-14" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("passes a valid volunteer without codes to onValid", async () => {
    const onValid = vi.fn();
    render(<RegisterForm onValid={onValid} />);
    await fillAbout();
    await userEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    await submit();
    expect(onValid.mock.calls[0][0]).toMatchObject({ role: "volunteer", preferredPostalCodes: [] });
});

it("shows the server's field errors under the matching inputs and moves focus to the first", () => {
    render(<RegisterForm fieldErrors={{ username: "This username is taken.", email: "This email is already used." }} />);
    expect(label("Username")).toHaveAccessibleDescription(/This username is taken\./);
    expect(label("Email")).toHaveAccessibleDescription("This email is already used.");
    expect(label("Username")).toHaveFocus();
});

it("tells the page about an edit, but not about leaving a field unchanged", async () => {
    const onEdit = vi.fn();
    render(<RegisterForm onEdit={onEdit} />);
    await userEvent.click(label("Username"));
    await userEvent.tab();
    expect(onEdit).not.toHaveBeenCalled();
    await userEvent.type(label("Username"), "a");
    expect(onEdit).toHaveBeenCalledTimes(1);
});

it("disables the form while sending and ignores a submit when the button is disabled", async () => {
    const onValid = vi.fn();
    const { rerender } = render(<RegisterForm onValid={onValid} submitDisabled />);
    await fillAbout();
    await userEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect(onValid).not.toHaveBeenCalled();
    rerender(<RegisterForm onValid={onValid} busy />);
    expect(screen.getByRole("button", { name: "Creating account..." })).toBeDisabled();
    expect(label("Email")).toBeDisabled();
});
