/// <reference types="vite/client" />
// Raw source of Mermaid's self-contained IIFE build. It is never evaluated in the
// preview window itself; mermaidRenderer.ts injects it into a sandboxed iframe.
import mermaidSource from 'mermaid/dist/mermaid.min.js?raw';

export default mermaidSource;
