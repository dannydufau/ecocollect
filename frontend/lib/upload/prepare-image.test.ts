import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareImage } from "./prepare-image";

const drawImage = vi.fn();

// jsdom has no canvas, so the browser functions are stubs
beforeEach(() => {
    drawImage.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillRect: vi.fn(),
        drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
        callback(new Blob(["x"], { type }));
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function stubBitmap(width: number, height: number) {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width, height, close }));
    return close;
}

const photo = (name: string, type: string) => new File(["x"], name, { type });

it("scales a 4000x3000 photo down to 2048x1536", async () => {
    stubBitmap(4000, 3000);
    await prepareImage(photo("a.jpg", "image/jpeg"));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1536);
});

it("keeps a 100x100 photo at 100x100", async () => {
    stubBitmap(100, 100);
    await prepareImage(photo("a.png", "image/png"));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 100);
});

it("keeps a very narrow 1x5000 photo at least 1 px wide", async () => {
    stubBitmap(1, 5000);
    await prepareImage(photo("a.jpg", "image/jpeg"));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 2048);
});

it("throws for a gif", async () => {
    stubBitmap(100, 100);
    await expect(prepareImage(photo("a.gif", "image/gif"))).rejects.toThrow("JPEG, PNG or WebP");
});

it("throws for a file over 10 MB", async () => {
    stubBitmap(100, 100);
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await expect(prepareImage(big)).rejects.toThrow("10 MB");
});

it("returns a JPEG blob", async () => {
    stubBitmap(100, 100);
    const blob = await prepareImage(photo("a.webp", "image/webp"));

    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBeGreaterThan(0);
});

it("says the photo could not be read when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("bad image")));
    await expect(prepareImage(photo("a.jpg", "image/jpeg"))).rejects.toThrow("could not read");
});

it("fails when the canvas gives back no blob", async () => {
    stubBitmap(100, 100);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(null));
    await expect(prepareImage(photo("a.jpg", "image/jpeg"))).rejects.toThrow("could not prepare");
});

it("frees the decoded photo when there is no canvas context", async () => {
    const close = stubBitmap(100, 100);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(prepareImage(photo("a.jpg", "image/jpeg"))).rejects.toThrow("could not prepare");
    expect(close).toHaveBeenCalledOnce();
});
