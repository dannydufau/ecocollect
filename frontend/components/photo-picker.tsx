"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Button } from "@/components/ui";
import { uploadPhoto } from "@/lib/upload/upload-photo";

type Props = {
    purpose: "item_photo" | "delivery_evidence";
    requestId?: string;
    optional?: boolean;
    onUploaded: (fileId: string) => void;
    onClear: () => void;
};

export default function PhotoPicker({ purpose, requestId, optional = false, onUploaded, onClear }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
    const [error, setError] = useState("");
    const input = useRef<HTMLInputElement>(null);
    // Each upload gets a number, so an old or unmounted upload's answer is ignored
    const attempt = useRef(0);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    useEffect(() => {
        const current = attempt;
        return () => { current.current++; };
    }, []);

    async function upload(chosen: File) {
        const id = ++attempt.current;
        setStatus("uploading");
        setError("");
        try {
            const fileId = await uploadPhoto(chosen, { purpose, requestId });
            if (id !== attempt.current) return;
            setStatus("done");
            onUploaded(fileId);
        } catch (e) {
            if (id !== attempt.current) return;
            setStatus("error");
            setError(e instanceof Error ? e.message : "The photo could not be uploaded, try again");
        }
    }

    function choose(e: ChangeEvent<HTMLInputElement>) {
        const chosen = e.target.files?.[0];
        if (!chosen) return;
        // The form still holds the id of the photo uploaded before. If this one fails it must not be sent.
        if (status === "done") onClear();
        setFile(chosen);
        setPreview(URL.createObjectURL(chosen));
        upload(chosen);
    }

    function remove() {
        attempt.current++;
        setFile(null);
        setPreview(null);
        setStatus("idle");
        // lets the same file be chosen again
        if (input.current) input.current.value = "";
        input.current?.focus();
        onClear();
    }

    return (
        <div className="flex max-w-full flex-col gap-2">
            <label className="flex flex-col gap-1">
                <span>Photo{optional && <span className="font-normal text-neutral-700"> (optional)</span>}</span>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}
                    className="min-h-11 w-full max-w-full text-sm" />
            </label>
            <p className="text-sm text-text-muted">No house numbers, faces, mail or documents in the photo. JPEG, PNG or WEBP, up to 10 MB.</p>
            {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, so next/image does not fit
                <img src={preview} alt={purpose === "delivery_evidence" ? "Delivery photo" : "Photo of the items"} className="h-28 w-40 max-w-full rounded-md object-cover" />
            )}
            {status === "uploading" && <p role="status">Uploading...</p>}
            {status === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                    <p role="status">Uploaded</p>
                    <Button variant="secondary" onClick={remove}>Remove photo</Button>
                </div>
            )}
            {status === "error" && file && (
                <div className="space-y-2">
                    <Alert variant="error">{error}</Alert>
                    <Button variant="secondary" onClick={() => upload(file)}>Retry</Button>
                </div>
            )}
        </div>
    );
}
