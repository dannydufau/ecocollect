import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { uploadPhoto } from "./upload-photo";

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
    for (const name of Object.keys(ticket.fields)) expect(form.has(name)).toBe(true);
});

it("does not call ImageKit when Q3 answers 403", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "forbidden", message: "No." } }));

    await expect(uploadPhoto(photo, { purpose: "delivery_evidence", requestId: "r1" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("fails with a plain message when ImageKit answers 400", async () => {
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockResolvedValueOnce(json(400, { message: "invalid payload" }));

    await expect(uploadPhoto(photo, { purpose: "item_photo" })).rejects.toThrow("The photo could not be uploaded, try again");
});

it("sends the fields unchanged", async () => {
    fetchMock.mockResolvedValueOnce(json(201, ticket)).mockResolvedValueOnce(json(200, { fileId: "f1" }));

    await uploadPhoto(photo, { purpose: "item_photo" });

    const entries = Object.fromEntries([...(fetchMock.mock.calls[1][1].body as FormData)].filter(([name]) => name !== "file" && name !== "token"));
    expect(entries).toEqual(Object.fromEntries(Object.entries(ticket.fields).map(([name, value]) => [name, String(value)])));
});
