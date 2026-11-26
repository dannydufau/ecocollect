import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { UPLOAD_TIMEOUT_MS, uploadPhoto } from "./upload-photo";

const mocks = vi.hoisted(() => ({
    auth: { authStateReady: () => Promise.resolve(), currentUser: null },
}));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("./prepare-image", () => ({
    prepareImage: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })),
}));

const ticket = {
    uploadUrl: "https://upload.imagekit.io/api/v2/files/upload",
    token: "jwt",
    fields: {
        fileName: "abc.jpg",
        folder: "/eco/item-photos/1/",
        isPrivateFile: true,
        useUniqueFileName: false,
        overwriteFile: false,
        checks: '"file.size" <= "10mb"',
        transformation: '{"pre":"md-false"}',
    },
    expiresAt: "2026-11-15T10:00:00Z",
};

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const photo = new File(["x"], "my photo.png", { type: "image/png" });

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("sends token, file and every field to ImageKit and returns the fileId", async () => {
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockResolvedValueOnce(json(200, { fileId: "f1" }));

    expect(await uploadPhoto(photo, { purpose: "item_photo" })).toBe("f1");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        purpose: "item_photo",
        fileName: "my photo.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1,
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(ticket.uploadUrl);
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get("token")).toBe("jwt");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect((form.get("file") as File).name).toBe("abc.jpg");
    const fields = Object.fromEntries([...form].filter(([name]) => name !== "file" && name !== "token"));
    expect(fields).toEqual(Object.fromEntries(Object.entries(ticket.fields).map(([name, value]) => [name, String(value)])));
});

it("does not call ImageKit when Q3 answers 403", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "forbidden", message: "No." } }));

    await expect(uploadPhoto(photo, { purpose: "delivery_evidence", requestId: "r1" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("shows a retry message and preserves the ImageKit error response", async () => {
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockResolvedValueOnce(json(400, { message: "invalid payload" }));

    const upload = uploadPhoto(photo, { purpose: "item_photo" });
    await expect(upload).rejects.toThrow("The photo could not be uploaded, try again");
    await expect(upload).rejects.toHaveProperty("cause", { status: 400, answer: { message: "invalid payload" } });
});

it("fails when ImageKit answers 200 without a fileId", async () => {
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockResolvedValueOnce(json(200, {}));

    await expect(uploadPhoto(photo, { purpose: "item_photo" })).rejects.toThrow("The photo could not be uploaded, try again");
});

it("fails and keeps the cause when the upload has a network error", async () => {
    const network = new TypeError("Failed to fetch");
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockRejectedValueOnce(network);

    const error = await uploadPhoto(photo, { purpose: "item_photo" }).catch(e => e);
    expect(error.message).toBe("The photo could not be uploaded, try again");
    expect(error.cause).toBe(network);
});

it("times out a hung ImageKit upload after UPLOAD_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    }));
    const pending = uploadPhoto(photo, { purpose: "item_photo" }).catch(e => e);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    const error = await pending;
    expect(error.message).toBe("The upload took too long. Check your connection and try again.");
    vi.useRealTimers();
});

it("cancels an in-flight upload when the caller signal aborts", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = uploadPhoto(photo, { purpose: "item_photo", signal: controller.signal }).catch(e => e);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    const error = await pending;
    expect(error.name).toBe("AbortError");
});
