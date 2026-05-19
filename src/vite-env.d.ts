/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

// pdf-parse ships no type declarations. Minimal surface for the one call site in
// src/lib/attachments/extractor.ts — the library default-exports a single function.
declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
