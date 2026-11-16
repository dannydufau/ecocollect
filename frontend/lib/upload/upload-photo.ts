import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { prepareImage } from "./prepare-image";

type UploadRequest = components["schemas"]["UploadRequest"];
type UploadTicket = components["schemas"]["UploadTicket"];

export async function uploadPhoto(
    file: File,
    { purpose, requestId }: { purpose: UploadRequest["purpose"]; requestId?: string },
): Promise<string> {
    const blob = await prepareImage(file);

    const body: UploadRequest = {
        purpose,
        fileName: file.name.replace(/\.[^.]*$/, "") + ".jpg",
        contentType: blob.type as UploadRequest["contentType"],
        sizeBytes: blob.size,
    };
    if (requestId) body.requestId = requestId;
    const ticket = await api.post<UploadTicket>("/api/uploads", body);

    const form = new FormData();
    form.append("file", blob, ticket.fields.fileName);
    form.append("token", ticket.token);
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, String(value));

    // plain fetch so our Firebase token never goes to ImageKit
    const failed = (cause?: unknown) => new Error("The photo could not be uploaded, try again", { cause });
    let res: Response;
    try {
        res = await fetch(ticket.uploadUrl, { method: "POST", body: form });
    } catch (cause) {
        throw failed(cause);
    }
    // ImageKit V2 is still in beta, so keep the status and answer to see what it really sends
    const answer = await res.json().catch(() => null);
    if (!res.ok) throw failed({ status: res.status, answer });
    const fileId = answer?.fileId;
    if (typeof fileId !== "string" || !fileId) throw failed({ status: res.status, answer });
    return fileId;
}
