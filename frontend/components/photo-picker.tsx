"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Button, CameraIcon } from "@/components/ui";
import { uploadPhoto } from "@/lib/upload/upload-photo";

const ACCEPT = "image/jpeg,image/png,image/webp";
const actionLabel =
    "soft-transition inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-600 bg-bg px-4 py-2 font-semibold text-text hover:bg-surface active:bg-accent-200 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-700";

type Props = {
    purpose: "item_photo" | "delivery_evidence";
    requestId?: string;
    optional?: boolean;
    onUploaded: (fileId: string, previewUrl: string) => void;
    onClear: () => void;
    onBusyChange?: (busy: boolean) => void;
};

export default function PhotoPicker({ purpose, requestId, optional = false, onUploaded, onClear, onBusyChange }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
    const [error, setError] = useState("");
    const cameraInput = useRef<HTMLInputElement>(null);
    const chooseInput = useRef<HTMLInputElement>(null);
    const lastSource = useRef<"camera" | "choose">("choose");
    // Each upload gets a number, so an old or unmounted upload's answer is ignored
    const attempt = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const onBusyChangeRef = useRef(onBusyChange);
    useEffect(() => { onBusyChangeRef.current = onBusyChange; }, [onBusyChange]);

    useEffect(() => {
        onBusyChangeRef.current?.(status === "uploading");
    }, [status]);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    useEffect(() => {
        const current = attempt;
        return () => {
            current.current++;
            controller.current?.abort();
            onBusyChangeRef.current?.(false);
        };
    }, []);

    function resetInputs() {
        if (cameraInput.current) cameraInput.current.value = "";
        if (chooseInput.current) chooseInput.current.value = "";
    }

    async function upload(chosen: File, previewUrl: string) {
        controller.current?.abort();
        const ctrl = new AbortController();
        controller.current = ctrl;
        const id = ++attempt.current;
        setStatus("uploading");
        setError("");
        try {
            const fileId = await uploadPhoto(chosen, { purpose, requestId, signal: ctrl.signal });
            if (id !== attempt.current) return;
            setStatus("done");
            onUploaded(fileId, previewUrl);
        } catch (e) {
            if (id !== attempt.current || ctrl.signal.aborted) return;
            setStatus("error");
            setError(e instanceof Error ? e.message : "The photo could not be uploaded, try again");
        }
    }

    function choose(source: "camera" | "choose", e: ChangeEvent<HTMLInputElement>) {
        const chosen = e.target.files?.[0];
        // If the user cancelled the picker, keep any current preview and uploaded ID in place.
        if (!chosen) return;
        lastSource.current = source;
        // Clear the input value so the same file can be chosen again after removal or retry.
        e.target.value = "";
        // The form still holds the id of the photo uploaded before. If this one fails it must not be sent.
        if (status === "done") onClear();
        setFile(chosen);
        const previewUrl = URL.createObjectURL(chosen);
        setPreview(previewUrl);
        upload(chosen, previewUrl);
    }

    function remove() {
        attempt.current++;
        controller.current?.abort();
        controller.current = null;
        setFile(null);
        setPreview(null);
        setStatus("idle");
        setError("");
        resetInputs();
        (lastSource.current === "camera" ? cameraInput.current : chooseInput.current)?.focus();
        onClear();
    }

    return (
        <fieldset className="flex max-w-full flex-col gap-2">
            <legend className="font-semibold">
                Photo{optional && <> <span className="font-normal text-text-muted">(optional)</span></>}
            </legend>
            <div className="flex flex-col gap-2.5 rounded-xl border-2 border-dashed border-border-strong bg-surface-elevated p-3.5 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <label className={actionLabel}>
                        <CameraIcon className="size-5 shrink-0" />
                        <span>Take photo</span>
                        <input
                            ref={cameraInput}
                            type="file"
                            accept={ACCEPT}
                            capture="environment"
                            onChange={(e) => choose("camera", e)}
                            className="sr-only"
                        />
                    </label>
                    <label className={actionLabel}>
                        <span>Choose photo</span>
                        <input
                            ref={chooseInput}
                            type="file"
                            accept={ACCEPT}
                            onChange={(e) => choose("choose", e)}
                            className="sr-only"
                        />
                    </label>
                </div>
                <p className="text-center text-small text-text-muted">
                    {file ? "Take or choose another photo to replace this one." : "Take a photo with your camera or choose an image from your device."}
                </p>
            </div>
            <p className="text-sm text-text-muted">No house numbers, faces, mail or documents in the photo. JPEG, PNG or WEBP, up to 10 MB.</p>
            <p className="text-sm text-text-muted">Location and EXIF data are removed automatically.</p>
            {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, so next/image does not fit
                <img src={preview} alt={purpose === "delivery_evidence" ? "Delivery photo" : "Photo of the items"} className="h-28 w-40 max-w-full rounded-xl border border-border object-cover" />
            )}
            {status === "uploading" && (
                <div className="flex flex-wrap items-center gap-2">
                    <p role="status">Uploading...</p>
                    <Button variant="secondary" onClick={remove}>Cancel upload</Button>
                </div>
            )}
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
        </fieldset>
    );
}
