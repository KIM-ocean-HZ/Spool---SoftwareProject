import { readFile } from '@tauri-apps/plugin-fs';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

// v2.7 attachment text extraction (PLAN_EN.md §9.6). Reads a file attachment's text so
// pack output can inline it. Runs entirely local — never touches the network. Best-effort:
// unsupported or unreadable files resolve to `{ ok: false }` rather than throwing.
//
// `readFile` returns a Uint8Array; it is handed straight to the parsers. We deliberately
// avoid Node's `Buffer` — it is not defined in the Tauri webview runtime.

export type ExtractionResult =
  | { ok: true; text: string; kind: 'pdf' | 'docx' | 'plaintext' }
  | { ok: false; kind: 'failed'; reason: string };

const PLAINTEXT_EXTS = ['.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.log'];

export async function extractAttachmentText(absolutePath: string): Promise<ExtractionResult> {
  const ext = absolutePath.toLowerCase().slice(absolutePath.lastIndexOf('.'));

  try {
    if (ext === '.pdf') {
      const bytes = await readFile(absolutePath);
      const data = await pdfParse(bytes);
      return { ok: true, text: data.text, kind: 'pdf' };
    }

    if (ext === '.docx') {
      const bytes = await readFile(absolutePath);
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
