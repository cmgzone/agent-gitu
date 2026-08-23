/**
 * Screenshot payload optimization.
 *
 * Vision models bill by image size, and raw full-window PNGs from a desktop
 * browser are far larger than what UI reasoning needs. Before a screenshot is
 * attached to model context we:
 *   - cap the longest edge at SCREENSHOT_MAX_DIM,
 *   - prefer JPEG at SCREENSHOT_JPEG_QUALITY for photographic UI content.
 *
 * The pure helpers here describe and verify that transform so the behavior is
 * testable without Electron; the actual re-encoding runs in the desktop bridge
 * (Electron NativeImage) which has a real image codec.
 */

export const SCREENSHOT_MAX_DIM = 1280;
export const SCREENSHOT_JPEG_QUALITY = 60;
/** Below this decoded size a PNG is cheap enough to keep lossless. */
export const SCREENSHOT_COMPRESS_THRESHOLD_BYTES = 160 * 1024;

export interface ResizePlan {
  /** Target dimensions after capping the longest edge. */
  width: number;
  height: number;
  /** Whether the image needs to be re-encoded at all. */
  needsResize: boolean;
  /** Whether the payload is large enough to justify lossy compression. */
  compress: boolean;
  /** Encoded format to emit. */
  format: 'png' | 'jpeg';
  /** JPEG quality when format === 'jpeg'. */
  quality: number;
}

/**
 * Decide how a captured screenshot should be downscaled/re-encoded. Pure and
 * deterministic so it can be unit tested.
 */
export function planScreenshotResize(
  width: number,
  height: number,
  decodedBytes: number,
  opts: { maxDim?: number; quality?: number; compressThresholdBytes?: number } = {},
): ResizePlan {
  const maxDim = opts.maxDim ?? SCREENSHOT_MAX_DIM;
  const quality = opts.quality ?? SCREENSHOT_JPEG_QUALITY;
  const threshold = opts.compressThresholdBytes ?? SCREENSHOT_COMPRESS_THRESHOLD_BYTES;

  const longest = Math.max(width, height);
  const needsResize = longest > maxDim && longest > 0;
  const scale = needsResize ? maxDim / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const compress = decodedBytes > threshold;

  return {
    width: targetW,
    height: targetH,
    needsResize,
    compress,
    format: compress ? 'jpeg' : 'png',
    quality,
  };
}

/**
 * Parse width/height from a PNG's IHDR chunk given raw base64. PNG stores the
 * dimensions as big-endian uint32 at fixed offsets, so no pixel decoding is
 * needed. Returns undefined for non-PNG payloads.
 */
export function pngDimensionsFromBase64(base64: string): { width: number; height: number } | undefined {
  try {
    const head = Buffer.from(base64.slice(0, 44), 'base64');
    // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) then width/height.
    if (head.length < 24) return undefined;
    const sig = head.subarray(1, 4).toString('ascii');
    if (sig !== 'PNG') return undefined;
    const type = head.subarray(12, 16).toString('ascii');
    if (type !== 'IHDR') return undefined;
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    if (!width || !height) return undefined;
    return { width, height };
  } catch {
    return undefined;
  }
}

/** Decoded byte size of a base64 payload. */
export function decodedBytesFromBase64(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}
