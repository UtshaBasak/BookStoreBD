/**
 * A picture scaled down before it is uploaded.
 *
 * A banner straight off a phone is a 4000-pixel, 4 MB photograph, shown in a
 * strip 200 pixels tall. Sending that would be most of a minute on a mobile
 * connection, and most of the space an account has. Drawn onto a canvas no
 * larger than it will ever be shown, and saved as a JPEG, it is usually under
 * 300 KB. A browser that cannot do this (or the test environment) sends the
 * original, which the server still accepts up to its limit.
 */
export const resizeImage = async (
  file: File,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.85 } = {}
): Promise<Blob> => {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    // Kept only when it is actually smaller: a tiny PNG can grow as a JPEG.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
};

export default resizeImage;
