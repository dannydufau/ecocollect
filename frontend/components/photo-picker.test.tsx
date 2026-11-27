import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadPhoto } from "@/lib/upload/upload-photo";
import PhotoPicker from "./photo-picker";

vi.mock("@/lib/upload/upload-photo", () => ({ uploadPhoto: vi.fn() }));

const photo = (name = "a.jpg", type = "image/jpeg") => new File(["x"], name, { type });

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
    const cameraInput = screen.getByLabelText("Take photo") as HTMLInputElement;
    const chooseInput = screen.getByLabelText("Choose photo") as HTMLInputElement;
    return { onUploaded, onClear, cameraInput, chooseInput, view };
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

it("exposes Take photo with rear camera capture and Choose photo without capture", () => {
    const { cameraInput, chooseInput } = setup();
    expect(cameraInput).toHaveAttribute("type", "file");
    expect(cameraInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(cameraInput).toHaveAttribute("capture", "environment");
    expect(cameraInput).toHaveClass("sr-only");

    expect(chooseInput).toHaveAttribute("type", "file");
    expect(chooseInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(chooseInput).not.toHaveAttribute("capture");
    expect(chooseInput).toHaveClass("sr-only");
});

it("shows a preview, uploads the file from Choose photo and calls onUploaded", async () => {
    const upload = deferred();
    vi.mocked(uploadPhoto).mockReturnValue(upload.promise);
    const { onUploaded, chooseInput } = setup();

    const file = photo();
    await userEvent.upload(chooseInput, file);
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", "blob:1");
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledWith(file, { purpose: "item_photo", requestId: undefined, signal: expect.any(AbortSignal) });

    upload.resolve("f1");
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith("f1", "blob:1");
});

it("uploads a file captured through Take photo through the same upload path", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f-cam");
    const { onUploaded, cameraInput } = setup();

    const file = photo("camera.jpg");
    await userEvent.upload(cameraInput, file);
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledWith(file, { purpose: "item_photo", requestId: undefined, signal: expect.any(AbortSignal) });
    expect(onUploaded).toHaveBeenCalledWith("f-cam", "blob:1");
});

it("leaves the current preview and uploaded ID intact if the user cancels either picker", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onUploaded, onClear, cameraInput, chooseInput } = setup();

    await userEvent.upload(cameraInput, photo("first.jpg"));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledTimes(1);

    // Simulate cancelling the file picker (change event with empty files)
    fireEvent.change(chooseInput, { target: { files: [] } });
    fireEvent.change(cameraInput, { target: { files: [] } });

    expect(onClear).not.toHaveBeenCalled();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", "blob:1");
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
});

it("draws the drop area on the raised surface with a dashed strong border", () => {
    const { cameraInput } = setup();
    const container = cameraInput.closest("div.border-dashed");
    expect(container).toHaveClass("bg-surface-elevated", "border-dashed", "border-border-strong");
    expect(container).not.toHaveClass("bg-white");
});

it("shows the privacy and EXIF hints", () => {
    setup();
    expect(screen.getByText("No house numbers, faces, mail or documents in the photo. JPEG, PNG or WEBP, up to 10 MB.")).toBeInTheDocument();
    expect(screen.getByText("Location and EXIF data are removed automatically.")).toBeInTheDocument();
});

it("shows the error and keeps Choose photo available as fallback when camera returns an unsupported file", async () => {
    vi.mocked(uploadPhoto)
        .mockRejectedValueOnce(new Error("Please choose a JPEG, PNG or WebP photo."))
        .mockResolvedValueOnce("f-gallery");
    const { onUploaded, cameraInput, chooseInput } = setup();

    // Unsupported format (e.g. HEIC) selected via camera
    fireEvent.change(cameraInput, { target: { files: [photo("phone.heic", "image/heic")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Please choose a JPEG, PNG or WebP photo.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();

    // Gallery fallback still works immediately
    await userEvent.upload(chooseInput, photo("gallery.jpg"));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith("f-gallery", "blob:2");
});

it("uploads the same file again on Retry", async () => {
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("f1");
    const { onUploaded, chooseInput } = setup();

    const file = photo();
    await userEvent.upload(chooseInput, file);
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadPhoto).mock.calls[1][0]).toBe(file);
    expect(onUploaded).toHaveBeenCalledWith("f1", "blob:1");
});

it("clears the old photo as soon as a replacement is selected from the other input", async () => {
    vi.mocked(uploadPhoto).mockResolvedValueOnce("f1").mockRejectedValueOnce(new Error("The photo could not be uploaded, try again"));
    const { onUploaded, onClear, cameraInput, chooseInput } = setup();
    await userEvent.upload(cameraInput, photo("a.jpg"));
    await screen.findByText("Uploaded");
    expect(onClear).not.toHaveBeenCalled();

    await userEvent.upload(chooseInput, photo("b.jpg"));
    expect(onClear).toHaveBeenCalledTimes(1);
    await screen.findByText("The photo could not be uploaded, try again");
    expect(onUploaded).toHaveBeenCalledTimes(1);
});

it("calls onClear on Remove and lets the same file be chosen again from either input", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onClear, onUploaded, cameraInput, chooseInput } = setup();

    const file = photo();
    await userEvent.upload(cameraInput, file);
    await userEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(cameraInput.value).toBe("");
    expect(chooseInput.value).toBe("");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await userEvent.upload(cameraInput, file);
    await screen.findByText("Uploaded");
    expect(onUploaded).toHaveBeenCalledTimes(2);
});

it("Remove can be reached with Tab and used with Enter", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onClear, chooseInput } = setup();

    await userEvent.upload(chooseInput, photo());
    await screen.findByText("Uploaded");
    chooseInput.focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Remove photo" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClear).toHaveBeenCalled();
});

it("ignores the first upload when a replacement is chosen from the other input before it ends", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(uploadPhoto).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { onUploaded, cameraInput, chooseInput } = setup();

    await userEvent.upload(cameraInput, photo());
    await userEvent.upload(chooseInput, photo("b.jpg"));
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
    const { onUploaded, chooseInput, view } = setup();

    await userEvent.upload(chooseInput, photo());
    view.unmount();
    upload.resolve("f1");
    await upload.promise;
    expect(onUploaded).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
});

it("revokes the object URL on unmount", async () => {
    vi.mocked(uploadPhoto).mockReturnValue(new Promise(() => {}));
    const { chooseInput, view } = setup();

    await userEvent.upload(chooseInput, photo());
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
});

it("marks the fieldset legend as optional when optional is true", () => {
    render(<PhotoPicker purpose="item_photo" optional onUploaded={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Photo (optional)" })).toBeInTheDocument();
});

it("calls the delivery preview Delivery photo", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    render(<PhotoPicker purpose="delivery_evidence" requestId="r1" onUploaded={vi.fn()} onClear={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText("Take photo"), photo());
    expect(screen.getByRole("img", { name: "Delivery photo" })).toBeInTheDocument();
});

it("moves focus back to the input that was used after Remove", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { cameraInput } = setup();
    await userEvent.upload(cameraInput, photo());
    await userEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(cameraInput).toHaveFocus();
});

it("can reach both Take photo and Choose photo with the keyboard", async () => {
    const { cameraInput, chooseInput } = setup();
    await userEvent.tab();
    expect(cameraInput).toHaveFocus();
    await userEvent.tab();
    expect(chooseInput).toHaveFocus();
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
    await userEvent.upload(screen.getByLabelText("Take photo"), photo());
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Cancel upload" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(passedSignal?.aborted).toBe(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Uploading...")).not.toBeInTheDocument();
});
