import { readFile } from '@tauri-apps/plugin-fs';
// pdf.js **legacy** build — the modern build assumes ReadableStream features the Tauri
// WKWebView lacks ("undefined is not a function (near '...value of readableStream...')").
// The legacy build targets broader environments. Static `?worker` import so Vite reliably
// compiles the worker as its own chunk and hands us a Worker constructor (a dynamic import
// of `?worker` is NOT transformed reliably). Only the tiny worker-glue lands in the main
// bundle; the worker asset and pdf.js core both load lazily on first use.
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';

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

// WKWebView ships `ReadableStream` but not its async-iterator protocol, so pdf.js's
// `for await (const value of readableStream)` in `getTextContent` throws "undefined is not a
// function (near '...value of readableStream...')" — even on the legacy build. This is the
// standard spec-shaped `values()`/`[Symbol.asyncIterator]` shim; install once before pdf.js
// loads. Harmless on engines that already implement it (guarded by the feature check).
const installReadableStreamAsyncIterator = (): void => {
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown> & {
    getReader: ReadableStream['getReader'];
  };
  if (proto[Symbol.asyncIterator]) return;
  proto.values = function (this: ReadableStream, { preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const result = await reader.read();
          if (result.done) reader.releaseLock();
          return result;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value: unknown) {
        if (!preventCancel) {
          const cancelPromise = reader.cancel(value);
          reader.releaseLock();
          await cancelPromise;
        } else {
          reader.releaseLock();
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as AsyncIterableIterator<unknown>;
  };
  proto[Symbol.asyncIterator] = proto.values;
};

// pdf.js, lazily loaded and initialised once. The worker is bundled as a separate chunk
// (Vite `?worker`) and wired via `workerPort`, so extraction runs off the UI thread and
// needs no network or cross-origin worker URL.
let pdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
const getPdfjs = (): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      installReadableStreamAsyncIterator();
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
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
