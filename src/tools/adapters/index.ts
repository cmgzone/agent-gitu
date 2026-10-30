/**
 * Adapters connecting Pi built-in tool implementations to Gitu's execution layer.
 *
 * Invariant: Gitu owns catalog schemas, authorization (ProjectGuard / PolicyEngine),
 * mutation verification, and task accounting. Pi provides the underlying operations.
 */
export { isPiToolsEnabled } from './config.js';
export { piReadFile, piListFiles, piSearchFiles, type PiReadOnlyAdapterOptions } from './pi-read-only.js';
export { piWriteFile, piApplyEdit, type PiMutationAdapterOptions } from './pi-mutations.js';
export { withFileMutationQueue } from './file-mutation-queue.js';
