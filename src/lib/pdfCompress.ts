import type { PDFDocumentProxy } from 'pdfjs-dist';

// Rasterizes each page of a PDF and reassembles it as a smaller PDF — used when a
// scanned document comes in over the Document Archive's 1MB cap. There's no reliable
// PDF-recompression binary (ghostscript, qpdf, ...) available in a serverless Next.js
// deployment, so this runs entirely in the browser instead: pdfjs-dist renders each page
// to a <canvas>, the canvas is re-encoded as a lower-quality JPEG, and jsPDF reassembles
// those images into a new PDF. Quality/scale are stepped down across a few attempts
// until the result fits, or the last (smallest) attempt is returned if it still doesn't.
export async function compressPdfToLimit(
  file: File,
  maxBytes: number,
  onProgress?: (attempt: number, of: number) => void,
): Promise<File> {
  if (file.size <= maxBytes || file.type !== 'application/pdf') return file;

  const [pdfjs, { jsPDF }] = await Promise.all([import('pdfjs-dist'), import('jspdf')]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const originalBuffer = await file.arrayBuffer();

  // Each step trades a bit more visible quality for size — scanned text documents stay
  // legible well past the point a photo would start looking rough.
  const attempts: Array<{ scale: number; quality: number }> = [
    { scale: 1.5, quality: 0.7 },
    { scale: 1.3, quality: 0.55 },
    { scale: 1.1, quality: 0.4 },
    { scale: 0.9, quality: 0.3 },
    { scale: 0.75, quality: 0.22 },
  ];

  let smallestBlob: Blob | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    onProgress?.(i + 1, attempts.length);
    const { scale, quality } = attempts[i];
    // pdfjs can detach/transfer the underlying buffer while parsing, so each attempt
    // gets its own copy rather than reusing one that a prior attempt may have consumed.
    const doc = await pdfjs.getDocument({ data: originalBuffer.slice(0) }).promise;
    try {
      const blob = await rasterizeToPdf(doc, scale, quality, jsPDF);
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= maxBytes) {
        return new File([blob], toPdfName(file.name), { type: 'application/pdf' });
      }
    } finally {
      await doc.cleanup();
    }
  }

  // Every attempt still landed over the limit (very image-heavy or very-many-page
  // documents) — hand back the smallest one produced rather than the original; the
  // caller's own size check still applies and will surface a clear error.
  return smallestBlob ? new File([smallestBlob], toPdfName(file.name), { type: 'application/pdf' }) : file;
}

async function rasterizeToPdf(
  doc: PDFDocumentProxy,
  scale: number,
  quality: number,
  JsPdfCtor: typeof import('jspdf').jsPDF,
): Promise<Blob> {
  let pdf: InstanceType<typeof JsPdfCtor> | null = null;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for PDF compression.');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs's RenderParameters type isn't exported cleanly for this call shape
    await (page.render({ canvasContext: ctx, viewport } as any) as { promise: Promise<void> }).promise;
    const imageData = canvas.toDataURL('image/jpeg', quality);
    const orientation = canvas.width >= canvas.height ? 'l' : 'p';

    if (!pdf) {
      pdf = new JsPdfCtor({ orientation, unit: 'pt', format: [canvas.width, canvas.height] });
    } else {
      pdf.addPage([canvas.width, canvas.height], orientation);
    }
    pdf.addImage(imageData, 'JPEG', 0, 0, canvas.width, canvas.height);
  }

  if (!pdf) throw new Error('PDF has no pages to compress.');
  return pdf.output('blob');
}

function toPdfName(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
