const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2048;

// Redraws the photo on a canvas. That drops the EXIF data, including the GPS location (README 6.0).
export async function prepareImage(file: File): Promise<Blob> {
    if (!TYPES.includes(file.type)) throw new Error("Please choose a JPEG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) throw new Error("The photo is too big. The limit is 10 MB.");

    let bitmap: ImageBitmap;
    try {
        // Turn the photo the right way up before the EXIF data is gone
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        throw new Error("We could not read the photo. Please try another one.");
    }

    const canvas = document.createElement("canvas");
    try {
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("We could not prepare the photo. Please try another one.");
        ctx.fillStyle = "#ffffff"; // a transparent PNG would turn black as a JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
    } finally {
        bitmap.close(); // free the decoded photo even if drawing failed
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("We could not prepare the photo. Please try another one.");
    return blob;
}
