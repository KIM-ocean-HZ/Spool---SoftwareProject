import { readFile } from '@tauri-apps/plugin-fs';
// Static `?worker` import so Vite reliably compiles the pdf.js worker as its own chunk and
// hands us a Worker constructor (a dynamic import of `?worker` is NOT transformed reliably).
// This pulls only the tiny worker-glue into the main bundle; the worker asset and the pdf.js
// core both load lazily — the asset on `new PdfWorker()`, the core on `import('pdfjs-dist')`.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// v2.7 attachment text extraction (PLAN_EN.md §9.6). Reads a file attachment's text so
// pack output can inline it. Runs entirely local — never touches the network. Best-effort:
// unsupported or unreadable files resolve to `{ ok: false }` rather than throwing.
//
// `readFile` returns a Uint8Array, handed straight to the parsers; no Node `Buffer`, which
// does not exist in the Tauri webview runtime.

export type ExtractionResult =
  | { ok: true; text: string; kind: 'pdf' | 'docx' | 'plaintext' }
  | { ok: false; kind: 'failed'; reason: string };

const PLAINTEXT_EXTS = ['.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.log'];

// pdf.js, lazily loaded and initialised once. The worker is bundled as a separate chunk
// (Vite `?worker`) and wired via `workerPort`, so extraction runs off the UI thread and
// needs no network or cross-origin worker URL.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
const getPdfjs = (): Promise<typeof import('pdfjs-dist')> => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
};

const extractPdf = async (bytes: Uint8Array): Promise<string> => {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    return pages.join('\n');
  } finally {
    await doc.destroy();
  }
};

export async function extractAttachmentText(absolutePath: string): Promise<ExtractionResult> {
  const ext = absolutePath.toLowerCase().slice(absolutePath.lastIndexOf('.'));

  try {
    if (ext === '.pdf') {
      const bytes = await readFile(absolutePath);
      return { ok: true, text: await extractPdf(bytes), kind: 'pdf' };
    }

    if (ext === '.docx') {
      const bytes = await readFile(absolutePath);
      const mammoth = await import('mammoth');
      // mammoth's browser-side input is `{ arrayBuffer }`. readFile's Uint8Array wraps a
      // fresh, offset-0 ArrayBuffer, so `.buffer` is exactly this file's bytes.
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer });
      return { ok: true, text: result.value, kind: 'docx' };
    }

    if (PLAINTEXT_EXTS.includes(ext)) {
      const bytes = await readFile(absolutePath);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { ok: true, text, kind: 'plaintext' };
    }

    return { ok: false, kind: 'failed', reason: `unsupported extension: ${ext}` };
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, kind: 'failed', reason };
  }
}
