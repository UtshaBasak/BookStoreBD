import { useEffect, useRef } from 'react';

/**
 * A preview of an image the visitor has just picked, before it is uploaded.
 *
 * It is painted onto a canvas rather than shown through `<img src>`. The
 * picked file never becomes a URL in the page, so there is nothing a code
 * scanner can read as text from the page being turned back into markup - and
 * no object URL to forget to revoke, which the old `src={URL.createObjectURL(f)}`
 * minted afresh on every render. It is drawn at most `max` pixels on its long
 * side, so a 4000px phone photo costs a thumbnail's memory. Browsers without
 * `createImageBitmap` (and the test environment) show the tinted tile.
 */
interface FilePreviewProps {
  file: Blob;
  alt: string;
  className?: string;
  max?: number;
}

const FilePreview = ({ file, alt, className, max = 480 }: FilePreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof createImageBitmap !== 'function') return;
    let cancelled = false;
    createImageBitmap(file)
      .then((bitmap) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          bitmap.close();
          return;
        }
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      })
      .catch(() => {
        // Not an image the browser can decode; the tile stays blank.
      });
    return () => {
      cancelled = true;
    };
  }, [file, max]);

  return <canvas ref={canvasRef} role="img" aria-label={alt} className={className} />;
};

export default FilePreview;
