"use client";

import { useState } from "react";
import { CameraOffIcon } from "./icons";

type Props = { src: string; alt: string; refetch: () => void };

// key={src} starts the error count again when the refetch gives a new signed URL
export function RequestPhoto(props: Props) {
    return <Photo key={props.src} {...props} />;
}

function Photo({ src, alt, refetch }: Props) {
    const [errors, setErrors] = useState(0);

    if (errors > 1) return <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface p-4 text-center text-sm text-text-muted">
        <CameraOffIcon className="size-6" />
        <p>The photo is not available right now.</p>
    </div>;

    return (
        // eslint-disable-next-line @next/next/no-img-element -- signed photo URLs change, so next/image does not fit
        <img src={src} alt={alt} className="aspect-[4/3] w-full max-w-full rounded-xl border border-border bg-surface object-contain"
            onError={() => {
                if (errors === 0) refetch();
                setErrors(errors + 1);
            }} />
    );
}
