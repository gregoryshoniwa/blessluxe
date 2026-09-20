/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A phone camera produces 4–12 MB files. Where data costs around $4 a gigabyte
 * that is a real price for posting one look — and the feed would then make every
 * VIEWER pay it again. 1080px on the long edge is all a phone screen can show;
 * the result is typically 120–250 KB.
 *
 *   const small = await resizeImage(file);            // File, ready for FormData
 *
 * Never throws: if the browser can't decode or encode, the original file comes
 * back and the server's own size limit is the backstop.
 */
export async function resizeImage(file, { max = 1080, quality = 0.82 } = {}) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

    try {
        // `from-image` applies the EXIF rotation — without it, portrait phone
        // photos come out sideways once the metadata is stripped by the canvas.
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * scale);
        const h = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();

        let blob = await toBlob(canvas, 'image/webp', quality);
        // Browsers that can't encode WebP silently hand back a PNG — which for
        // a photo is LARGER than what we started with. Ask for JPEG instead.
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
        if (!blob || blob.size >= file.size) return file;

        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
    } catch {
        return file;
    }
}

function toBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
