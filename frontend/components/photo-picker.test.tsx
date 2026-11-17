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
    expect(screen.getByRole("img", { name: "Chosen photo" })).toHaveAttribute("src", "blob:1");
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
    expect(uploadPhoto).toHaveBeenCalledWith(file, { purpose: "item_photo", requestId: undefined });

    upload.resolve("f1");
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith("f1");
});

it("shows the hint", () => {
    setup();
    expect(screen.getByText("No house numbers, faces, mail or documents in the photo.")).toBeInTheDocument();
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
    expect(onUploaded).toHaveBeenCalledWith("f1");
});

it("clears an old error when a new file is chosen", async () => {
    vi.mocked(uploadPhoto).mockRejectedValueOnce(new Error("down")).mockReturnValue(new Promise(() => {}));
    const { input } = setup();

    await userEvent.upload(input, photo());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.upload(input, photo("b.jpg"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("calls onClear on Remove and lets the same file be chosen again", async () => {
    vi.mocked(uploadPhoto).mockResolvedValue("f1");
    const { onClear, onUploaded, input } = setup();

    const file = photo();
    await userEvent.upload(input, file);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
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
    expect(screen.getByRole("button", { name: "Remove" })).toHaveFocus();
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
    expect(onUploaded).toHaveBeenCalledWith("f2");
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
