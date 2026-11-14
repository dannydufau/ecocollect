import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { renderWithClient } from "@/test/utils";
import { CategoryPicker } from "./category-picker";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const categories = [
    { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics", standardWeightKg: 2.5 },
    { categoryId: "phones", name: "Phones", wasteType: "Electronics", standardWeightKg: 0.2 },
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

    it("disables the options listed in disabledIds", async () => {
        vi.mocked(api.get).mockResolvedValue(categories);
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} disabledIds={["laptops"]} />);
        expect(await screen.findByRole("option", { name: "Computers/Laptops" })).toBeDisabled();
        expect(screen.getByRole("option", { name: "Phones" })).not.toBeDisabled();
    });

    it("shows loading text while waiting for categories", () => {
        vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
        renderWithClient(<CategoryPicker value="" onChange={vi.fn()} />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading categories...");
    });
});
