import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { renderWithClient } from "@/test/utils";
import RequestForm, { validate, type RequestValues } from "./request-form";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const categories = [
    { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics", standardWeightKg: 2.5 },
    { categoryId: "phones", name: "Phones", wasteType: "Electronics", standardWeightKg: 0.2 },
];
const valid = (): RequestValues => ({ items: [{ categoryId: "laptops", quantity: "2" }], windows: [{ date: "2026-11-21", startHour: 10 }], notes: "Side door" });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    vi.mocked(api.get).mockResolvedValue(categories);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

describe("validate", () => {
    it("accepts valid values and two different hours on the same day", () => {
        const values = valid();
        values.windows.push({ date: "2026-11-21", startHour: 11 });
        expect(validate(values)).toEqual({});
    });
    it.each(["0", "-1", "1.5", "", " "])("rejects quantity %j at its field path", quantity => {
        const values = valid(); values.items[0].quantity = quantity;
        expect(validate(values)).toHaveProperty("items[0].quantity");
    });
    it("rejects a repeated or missing category at the matching row", () => {
        const values = valid(); values.items.push({ categoryId: "laptops", quantity: "1" }, { categoryId: "", quantity: "1" });
        expect(validate(values)).toMatchObject({ "items[1].categoryId": expect.any(String), "items[2].categoryId": expect.any(String) });
    });
    it("requires items and windows", () => {
        expect(validate({ items: [], windows: [], notes: "" })).toMatchObject({ items: expect.any(String), windows: expect.any(String) });
    });
    it("rejects duplicate slots, invalid dates, past windows and late end times", () => {
        for (const windows of [
            [valid().windows[0], valid().windows[0]],
            [{ date: "2026-02-30", startHour: 10 }],
            [{ date: "2026-11-20", startHour: 10 }],
            [{ date: "2026-12-20", startHour: 23 }],
            [{ date: "2026-11-21", startHour: 24 }],
        ]) expect(validate({ ...valid(), windows }), JSON.stringify(windows)).toHaveProperty("windows");
    });
    it("uses the original creation date when editing", () => {
        expect(validate(valid(), "2026-10-20T18:00:00Z")).toHaveProperty("windows");
    });
});

describe("RequestForm", () => {
    it("adds rows, disables chosen categories in other rows and limits rows to category count", async () => {
        renderWithClient(<RequestForm />);
        fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "laptops" } });
        fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
        const rows = screen.getAllByRole("group", { name: /^Item \d/ });
        expect(rows).toHaveLength(2);
        expect(within(rows[1]).getByRole("option", { name: "Computers/Laptops" })).toBeDisabled();
        expect(within(rows[0]).getByRole("option", { name: "Computers/Laptops" })).not.toBeDisabled();
        expect(screen.getByRole("button", { name: "Add another item" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Remove item 1" }));
        expect(screen.getByRole("option", { name: "Computers/Laptops" })).not.toBeDisabled();
    });
    it("updates the read-only estimated weight when quantity changes", async () => {
        renderWithClient(<RequestForm initialValues={valid()} />);
        expect(await screen.findByText("Estimated weight: 5.00 kg")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
        expect(screen.getByText("Estimated weight: 7.50 kg")).toBeInTheDocument();
    });
    it("shows no errors before the first submit", async () => {
        renderWithClient(<RequestForm />);
        await screen.findByLabelText("Category");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    it("shows errors under the matching item and window fields", async () => {
        const values = valid(); values.items[0].quantity = "0"; values.windows = [];
        renderWithClient(<RequestForm initialValues={values} />);
        await screen.findByLabelText("Category");
        fireEvent.submit(screen.getByRole("button", { name: "Review request" }).closest("form")!);
        expect(screen.getByLabelText("Quantity")).toHaveAccessibleDescription("Enter a whole number, 1 or more.");
        expect(screen.getByText("Choose one to three pickup windows.")).toBeInTheDocument();
    });
    it("moves focus to the first field with an error", async () => {
        renderWithClient(<RequestForm />);
        await screen.findByLabelText("Category");
        fireEvent.click(screen.getByRole("button", { name: "Review request" }));
        expect(await screen.findByLabelText("Category")).toHaveFocus();
    });
    it("keeps the other errors while one is fixed and updates them as the user types", async () => {
        const values = valid(); values.items[0].quantity = "0"; values.windows = [];
        renderWithClient(<RequestForm initialValues={values} />);
        await screen.findByLabelText("Category");
        fireEvent.click(screen.getByRole("button", { name: "Review request" }));
        expect(screen.getByLabelText("Quantity")).toHaveAccessibleDescription("Enter a whole number, 1 or more.");
        fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
        expect(screen.getByLabelText("Quantity")).not.toHaveAccessibleDescription("Enter a whole number, 1 or more.");
        expect(screen.getByText("Choose one to three pickup windows.")).toBeInTheDocument();
    });
    it("sends valid details to onValid and links to the profile for the address", async () => {
        const onValid = vi.fn();
        renderWithClient(<RequestForm initialValues={valid()} onValid={onValid} />);
        await screen.findByLabelText("Category");
        expect(screen.getByRole("link", { name: "Change address" })).toHaveAttribute("href", "/profile");
        fireEvent.click(screen.getByRole("button", { name: "Review request" }));
        expect(onValid).toHaveBeenCalledWith(valid());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/api/categories");
    });
});
