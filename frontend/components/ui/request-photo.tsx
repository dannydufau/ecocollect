"use client";

import { useState } from "react";

export function RequestPhoto({ src, alt, refetch }: { src: string; alt: string; refetch: () => void }) {
    const [errors, setErrors] = useState(0);

    if (errors > 1) return <p className="text-neutral-700">The photo is not available right now.</p>;

    return (
        // eslint-disable-next-line @next/next/no-img-element -- signed photo URLs change, so next/image does not fit
        <img src={src} alt={alt} className="w-full max-w-full rounded-2xl object-cover"
            onError={() => {
                if (errors === 0) refetch();
                setErrors(errors + 1);
            }} />
    );
}
