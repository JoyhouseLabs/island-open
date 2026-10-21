import { useEffect, useRef } from "react";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  return (pdfjsPromise ??= (async () => {
    const lib = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  })());
}

type LoadedBook = {
  lib: Awaited<ReturnType<typeof pdfjs>>;
  doc: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs>>["getDocument"]>["promise"]>;
};

/**
 * Renders one PDF page onto a canvas, fitted to the given width. Swapping
 * `pageNumber` re-renders; unmount cleans up tasks.
 */
export function PdfPage({
  book,
  pageNumber,
  width,
}: {
  book: LoadedBook;
  pageNumber: number;
  width: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const canvasEl = canvas.current;
    if (!canvasEl) return;
    void (async () => {
      try {
        const page = await book.doc.getPage(pageNumber);
        if (cancelled) return;
        const scale = width / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasEl.width = viewport.width * dpr;
        canvasEl.height = viewport.height * dpr;
        canvasEl.style.width = `${viewport.width}px`;
        canvasEl.style.height = `${viewport.height}px`;
        await page.render({
          canvas: canvasEl,
          canvasContext: canvasEl.getContext("2d")!,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
      } catch {
        /* a failed page shows a blank sheet; flipping again usually heals */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book, pageNumber, width]);
  return <canvas ref={canvas} className="pdf-page" />;
}

/** Loads a PDF document from raw bytes (fetched by the caller). */
export async function loadPdf(bytes: ArrayBuffer): Promise<LoadedBook> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes }).promise;
  return { lib, doc };
}
