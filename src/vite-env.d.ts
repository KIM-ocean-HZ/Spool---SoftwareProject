/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

// pdf.js legacy build — broader webview compatibility than the modern build. The package
// ships no per-subpath types, so re-use the main package's declarations.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
