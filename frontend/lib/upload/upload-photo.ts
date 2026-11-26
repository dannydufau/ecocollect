import { api, withTimeout } from "@/lib/api";
import type { UploadRequest, UploadTicket } from "@/lib/types";
import { prepareImage } from "./prepare-image";

export const UPLOAD_TIMEOUT_MS = 45_000;

export async function uploadPhoto(
    file: File,
    { purpose, requestId, signal }: { purpose: UploadRequest["purpose"]; requestId?: string; signal?: AbortSignal },
): Promise<string> {
    const blob = await prepareImage(file);
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");

    const body: UploadRequest = {
        purpose,
        fileName: file.name.replace(/\.[^.]*$/, "") + ".jpg",
        contentType: blob.type as UploadRequest["contentType"],
        sizeBytes: blob.size,
    };
    if (requestId) body.requestId = requestId;
    const ticket = await api.post<UploadTicket>("/api/uploads", body, signal ? { signal } : undefined);

    const form = new FormData();
    form.append("file", blob, ticket.fields.fileName);
    form.append("token", ticket.token);
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, String(value));

    // plain fetch so our Firebase token never goes to ImageKit
    const failed = (cause?: unknown) => new Error("The photo could not be uploaded, try again", { cause });
    const timeout = withTimeout(UPLOAD_TIMEOUT_MS, signal);
    let res: Response;
    let answer: { fileId?: unknown } | null;
    try {
        res = await fetch(ticket.uploadUrl, { method: "POST", body: form, signal: timeout.signal });
        // ImageKit V2 is still in beta, so keep the status and answer to see what it really sends
        answer = await res.json().catch(() => null);
    } catch (cause) {
        if (signal?.aborted) throw cause;
        if (timeout.timedOut()) throw new Error("The upload took too long. Check your connection and try again.", { cause });
        throw failed(cause);
    } finally {
        timeout.cleanup();
    }
    if (!res.ok) throw failed({ status: res.status, answer });
    const fileId = answer?.fileId;
    if (typeof fileId !== "string" || !fileId) throw failed({ status: res.status, answer });
    return fileId;
}
