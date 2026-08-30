/**
 * Shared Language Server Protocol types used by the client, manager, and
 * agent-facing LSP tools. Position/range types mirror the LSP JSON-RPC shape
 * so server payloads can be passed through unchanged.
 */

export interface LspServerConfig {
  name: string;
  languageIds: string[];
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** A trusted, built-in way to install one of Gitu's default language servers. */
export interface LspInstallSpec {
  /** Executable used to install the server (for example npm, go, or dotnet). */
  program: string;
  /** Fixed arguments; these are never derived from project/user input. */
  args: string[];
  /** Human-readable command shown in progress events and diagnostics. */
  label: string;
  /** Known executable directory to add to PATH after a successful install. */
  pathHint?: 'npm-global' | 'python-user' | 'go-bin' | 'cargo-bin' | 'dotnet-tools';
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: { start: LspPosition; end: LspPosition };
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}

export interface LspLocation {
  uri: string;
  range: { start: LspPosition; end: LspPosition };
}

export interface LspSymbol {
  name: string;
  kind: number;
  range: { start: LspPosition; end: LspPosition };
  selectionRange: { start: LspPosition; end: LspPosition };
  children?: LspSymbol[];
}

export interface LspStatusView {
  server: string;
  languageIds: string[];
  configured: boolean;
  running: boolean;
}

export type LspCall =
  | { ok: true; output: string; payload?: unknown }
  | { ok: false; output: string; errorSignature?: string };
