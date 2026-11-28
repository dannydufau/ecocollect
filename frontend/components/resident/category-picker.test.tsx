import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api";
import { renderWithClient } from "@/test/utils";
import { CategoryPicker } from "./category-picker";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const categories = [
    { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers", standardWeightKg: 2.5 },
    { categoryId: "desktops", name: "Computers/Desktops", wasteType: "Computers", standardWeightKg: 8.0 },
    { categoryId: "monitors", name: "Monitors", wasteType: "Displays", standardWeightKg: 5.0 },
    { categoryId: "tvs", name: "Televisions", wasteType: "Displays", standardWeightKg: 12.0 },
    { categoryId: "phones", name: "Phones", wasteType: "Mobile Devices", standardWeightKg: 0.2 },
    { categoryId: "tablets", name: "Tablets", wasteType: "Mobile Devices", standardWeightKg: 0.5 },
    { categoryId: "printers", name: "Printers", wasteType: "Printers", standardWeightKg: 6.0 },
    { categoryId: "small-appliances", name: "Small Appliances", wasteType: "Small Appliances", standardWeightKg: 3.0 },
    { categoryId: "cables-chargers", name: "Cables and Chargers", wasteType: "Accessories", standardWeightKg: 0.3 },
];

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

describe("CategoryPicker", () => {
    it("loads Q1 and renders every category name", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        expect(await screen.findByRole("option", { name: "Computers/Laptops" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Phones" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Cables and Chargers" })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/api/categories");
        expect(screen.getByLabelText("Category")).toHaveValue("");
    });

    it("calls onChange with the selected categoryId", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        const onChange = vi.fn();
        renderWithClient(<CategoryPicker value="" onChange={onChange} />);
        fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "phones" } });
        expect(onChange).toHaveBeenCalledWith("phones");
    });

    it("filters case-insensitively by category name, waste type, and aliases", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        const search = await screen.findByLabelText("Search categories");

        // Alias match: "cell phone" -> Phones
        await userEvent.type(search, "Cell Phone");
        expect(screen.getByRole("option", { name: "Phones" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Monitors" })).not.toBeInTheDocument();

        // Waste type match: "displays" -> Monitors + Televisions
        await userEvent.clear(search);
        await userEvent.type(search, "DISPLAYS");
        expect(screen.getByRole("option", { name: "Monitors" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Televisions" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Phones" })).not.toBeInTheDocument();

        // Alias match: "hdmi" -> Cables and Chargers
        await userEvent.clear(search);
        await userEvent.type(search, "hdmi");
        expect(screen.getByRole("option", { name: "Cables and Chargers" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Printers" })).not.toBeInTheDocument();
    });

    it("keeps a category with no hardcoded aliases searchable by name and waste type", async () => {
        const withUnaliased = [
            ...categories,
            { categoryId: "gaming-consoles", name: "Gaming Consoles", wasteType: "Entertainment", standardWeightKg: 3.5 },
        ];
        vi.mocked(api.get).mockResolvedValue(withUnaliased);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        const search = await screen.findByLabelText("Search categories");

        await userEvent.type(search, "console");
        expect(screen.getByRole("option", { name: "Gaming Consoles" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Phones" })).not.toBeInTheDocument();

        await userEvent.clear(search);
        await userEvent.type(search, "entertainment");
        expect(screen.getByRole("option", { name: "Gaming Consoles" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Monitors" })).not.toBeInTheDocument();
    });

    it("keeps the currently chosen option visible even when the search query no longer matches it", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        const onChange = vi.fn();
        renderWithClient(<CategoryPicker value="laptops" onChange={onChange} />);
        const search = await screen.findByLabelText("Search categories");

        await userEvent.type(search, "cell phone");
        const select = screen.getByLabelText("Category");
        expect(select).toHaveValue("laptops");
        expect(within(select).getByRole("option", { name: "Computers/Laptops" })).toBeInTheDocument();
        expect(within(select).getByRole("option", { name: "Phones" })).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("shows a no-results message and Clear search restores all options and focuses the search field", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        const search = await screen.findByLabelText("Search categories");

        await userEvent.type(search, "bicycle");
        expect(screen.getByRole("status")).toHaveTextContent("No categories match “bicycle”.");
        expect(screen.queryByRole("option", { name: "Phones" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(search).toHaveValue("");
        expect(search).toHaveFocus();
        expect(screen.getByRole("option", { name: "Phones" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Monitors" })).toBeInTheDocument();
    });

    it("continues disabling options listed in disabledIds even while filtered", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} disabledIds={["laptops"]} />);
        const search = await screen.findByLabelText("Search categories");

        await userEvent.type(search, "computers");
        expect(screen.getByRole("option", { name: "Computers/Laptops" })).toBeDisabled();
        expect(screen.getByRole("option", { name: "Computers/Desktops" })).not.toBeDisabled();
    });

    it("does not submit the enclosing form when pressing Enter in Search categories", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
        renderWithClient(
            <form onSubmit={onSubmit}>
                <CategoryPicker value="" onChange={vi.fn()} />
                <button type="submit">Review request</button>
            </form>,
        );
        const search = await screen.findByLabelText("Search categories");
        await userEvent.type(search, "phone{Enter}");
        expect(onSubmit).not.toHaveBeenCalled();
        expect(search).toHaveValue("phone");
    });

    it("shows loading text while waiting for categories", () => {
        vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading categories...");
    });
});
