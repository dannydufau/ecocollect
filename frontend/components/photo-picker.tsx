"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Button } from "@/components/ui";
import { uploadPhoto } from "@/lib/upload/upload-photo";

type Props = {
    purpose: "item_photo" | "delivery_evidence";
    requestId?: string;
    onUploaded: (fileId: string) => void;
    onClear: () => void;
};

export default function PhotoPicker({ purpose, requestId, onUploaded, onClear }: Props) {
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
        onClear();
    }

    return (
        <div className="flex max-w-full flex-col gap-2">
            <label className="flex flex-col gap-1">
                Photo
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}
                    className="min-h-11 w-full max-w-full text-sm focus-visible:outline-2 focus-visible:outline-offset-2" />
            </label>
            <p className="text-sm text-neutral-700">No house numbers, faces, mail or documents in the photo.</p>
            {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, so next/image does not fit
                <img src={preview} alt="Chosen photo" className="max-h-60 w-full max-w-full rounded-2xl object-cover" />
            )}
            {status === "uploading" && <p role="status">Uploading...</p>}
            {status === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                    <p role="status">Uploaded</p>
                    <Button variant="secondary" onClick={remove}>Remove</Button>
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
