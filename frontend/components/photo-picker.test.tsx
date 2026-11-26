import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadPhoto } from "@/lib/upload/upload-photo";
import PhotoPicker from "./photo-picker";

vi.mock("@/lib/upload/upload-photo", () => ({ uploadPhoto: vi.fn() }));

const photo = (name = "a.jpg") => new File(["x"], name, { type: "image/jpeg" });

// Returns a promise and the function that settles it, to control when an upload ends
function deferred() {
    let resolve!: (id: string) => void;
    const promise = new Promise<string>((done) => { resolve = done; });
    return { promise, resolve };
}

function setup() {
    const onUploaded = vi.fn();
    const onClear = vi.fn();
    const view = render(<PhotoPicker purpose="item_photo" onUploaded={onUploaded} onClear={onClear} />);
    const input = screen.getByLabelText("Photo") as HTMLInputElement;
    return { onUploaded, onClear, input, view };
}

let urls = 0;
beforeEach(() => {
    urls = 0;
    vi.mocked(uploadPhoto).mockReset();
    URL.createObjectURL = vi.fn(() => `blob:${++urls}`);
    URL.revokeObjectURL = vi.fn();
});

// Vitest does not clean the page between tests by itself
afterEach(cleanup);

it("shows a preview, uploads the file and calls onUploaded", async () => {
    const upload = deferred();
    vi.mocked(uploadPhoto).mockReturnValue(upload.promise);
    const { onUploaded, input } = setup();

    const file = photo();
    await userEvent.upload(input, file);
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", "blob:1");
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledWith(file, { purpose: "item_photo", requestId: undefined, signal: expect.any(AbortSignal) });

    upload.resolve("f1");
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith("f1", "blob:1");
});

it("draws the drop area on the raised surface with a dashed strong border", () => {
    const { input } = setup();
    expect(input.closest("label")).toHaveClass("bg-surface-elevated", "border-dashed", "border-border-strong", "hover:bg-surface");
    expect(input.closest("label")).not.toHaveClass("bg-white");
});

it("shows the hint", () => {
    setup();
    expect(screen.getByText("No house numbers, faces, mail or documents in the photo. JPEG, PNG or WEBP, up to 10 MB.")).toBeInTheDocument();
});

it("shows the error and does not call onUploaded when the upload fails", async () => {
    vi.mocked(uploadPhoto).mockRejectedValue(new Error("The photo could not be uploaded, try again"));
    const { onUploaded, input } = setup();

    await userEvent.upload(input, photo());
    expect(await screen.findByRole("alert")).toHaveTextContent("The photo could not be uploaded, try again");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
});

it("uploads the same file again on Retry", async () => {
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("f1");
    const { onUploaded, input } = setup();

    const file = photo();
    await userEvent.upload(input, file);
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadPhoto).mock.calls[1][0]).toBe(file);
    expect(onUploaded).toHaveBeenCalledWith("f1", "blob:1");
});

it("clears an old error when a new file is chosen", async () => {
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error("down")).mockReturnValue(new Promise(() => {}));
    const { input } = setup();

    await userEvent.upload(input, photo());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.upload(input, photo("b.jpg"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("clears the old photo as soon as another one is chosen, so a failed second upload leaves no id behind", async () => {
    vi.mocked(uploadPhoto).mockResolvedValueOnce("f1").mockRejectedValueOnce(new Error("The photo could not be uploaded, try again"));
    const { onUploaded, onClear, input } = setup();
    await userEvent.upload(input, photo("a.jpg"));
    await screen.findByText("Uploaded");
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.upload(input, photo("b.jpg"));
    expect(onClear).toHaveBeenCalledTimes(1);
    await screen.findByText("The photo could not be uploaded, try again");
    expect(onUploaded).toHaveBeenCalledTimes(1);
});

it("calls onClear on Remove and lets the same file be chosen again", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onClear, onUploaded, input } = setup();

    const file = photo();
    await userEvent.upload(input, file);
    await userEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await userEvent.upload(input, file);
    await screen.findByText("Uploaded");
    expect(onUploaded).toHaveBeenCalledTimes(2);
});

it("Remove can be reached with Tab and used with Enter", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onClear, input } = setup();

    await userEvent.upload(input, photo());
    await screen.findByText("Uploaded");
    input.focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Remove photo" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClear).toHaveBeenCalled();
});

it("ignores the first upload when a second file is chosen before it ends", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(uploadPhoto).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { onUploaded, input } = setup();

    await userEvent.upload(input, photo());
    await userEvent.upload(input, photo("b.jpg"));
    second.resolve("f2");
    await screen.findByText("Uploaded");
    first.resolve("f1");
    await first.promise;
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith("f2", "blob:2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
});

it("does not call onUploaded when unmounted during an upload", async () => {
    const upload = deferred();
    vi.mocked(uploadPhoto).mockReturnValue(upload.promise);
    const errors = vi.spyOn(console, "error");
    const { onUploaded, input, view } = setup();

    await userEvent.upload(input, photo());
    view.unmount();
    upload.resolve("f1");
    await upload.promise;
    expect(onUploaded).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
});

it("revokes the object URL on unmount", async () => {
    vi.mocked(uploadPhoto).mockReturnValue(new Promise(() => {}));
    const { input, view } = setup();

    await userEvent.upload(input, photo());
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
});

it("adds (optional) to the label when the photo is optional", () => {
    render(<PhotoPicker purpose="item_photo" optional onUploaded={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText("Photo (optional)")).toBeInTheDocument();
});

it("calls the delivery preview Delivery photo", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    render(<PhotoPicker purpose="delivery_evidence" requestId="r1" onUploaded={vi.fn()} onClear={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText("Photo"), photo());
    expect(screen.getByRole("img", { name: "Delivery photo" })).toBeInTheDocument();
});

it("moves focus back to the file input after Remove", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { input } = setup();
    await userEvent.upload(input, photo());
    await userEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(input).toHaveFocus();
});

it("shows the location note and a hidden input inside a dashed label with a camera icon", () => {
    const { input } = setup();
    expect(screen.getByText("Location and EXIF data are removed automatically.")).toBeInTheDocument();
    expect(input).toHaveClass("sr-only");
    const label = input.closest("label")!;
    expect(label).toHaveClass("border-dashed", "has-[:focus-visible]:outline-3");
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

it("can be reached with the keyboard", async () => {
    const { input } = setup();
    await userEvent.tab();
    expect(input).toHaveFocus();
});

it("reports upload busy state and lets the user cancel a hung upload", async () => {
    const upload = deferred();
    const onBusyChange = vi.fn();
    let passedSignal: AbortSignal | undefined;
    vi.mocked(uploadPhoto).mockImplementation((_file, opts) => {
        passedSignal = opts.signal;
        return upload.promise;
    });
    render(<PhotoPicker purpose="item_photo" onUploaded={vi.fn()} onClear={vi.fn()} onBusyChange={onBusyChange} />);
    await userEvent.upload(screen.getByLabelText("Photo"), photo());
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Cancel upload" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(passedSignal?.aborted).toBe(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Uploading...")).not.toBeInTheDocument();
});
