"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, CameraIcon } from "@/components/ui";
import { uploadPhoto } from "@/lib/upload/upload-photo";

type Props = {
    purpose: "item_photo" | "delivery_evidence";
    requestId?: string;
    optional?: boolean;
    onUploaded: (fileId: string, previewUrl: string) => void;
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

    async function upload(chosen: File, previewUrl: string) {
        const id = ++attempt.current;
        setStatus("uploading");
        setError("");
        try {
            const fileId = await uploadPhoto(chosen, { purpose, requestId });
            if (id !== attempt.current) return;
            setStatus("done");
            onUploaded(fileId, previewUrl);
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
        const previewUrl = URL.createObjectURL(chosen);
        setPreview(previewUrl);
        upload(chosen, previewUrl);
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
            <div className="relative">
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border-strong bg-surface-elevated px-4 pb-8 pt-3 text-center font-semibold hover:bg-surface has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-700">
                    <CameraIcon className="size-6" />
                    <span>Photo{optional && <span className="font-normal text-text-muted"> (optional)</span>}</span>
                    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="sr-only" />
                </label>
                {/* Outside the label so the input's name stays just "Photo" */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2.5 text-center text-sm text-text-muted">{file ? "Choose another file" : "Choose a file"}</span>
            </div>
            <p className="text-sm text-text-muted">No house numbers, faces, mail or documents in the photo. JPEG, PNG or WEBP, up to 10 MB.</p>
            <p className="text-sm text-text-muted">Location and EXIF data are removed automatically.</p>
            {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, so next/image does not fit
                <img src={preview} alt={purpose === "delivery_evidence" ? "Delivery photo" : "Photo of the items"} className="h-28 w-40 max-w-full rounded-xl border border-border object-cover" />
            )}
            {status === "uploading" && <p role="status">Uploading...</p>}
            {status === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                    <p role="status">Uploaded</p>
                    <Button variant="secondary" onClick={remove}>Remove photo</Button>
                </div>
            )}
            {status === "error" && file && preview && (
                <div className="space-y-2">
                    <Alert variant="error">{error}</Alert>
                    <Button variant="secondary" onClick={() => upload(file, preview)}>Retry</Button>
                </div>
            )}
        </div>
    );
}
