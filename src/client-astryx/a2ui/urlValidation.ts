const UNSAFE_URL_CHARS = /[\u0000-\u001f\u007f<>"\\]/;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

/**
 * Validates URLs rendered from untrusted agent A2UI payloads, mirroring server `outSafeUrl`.
 */
export function isSafeAssetUrl(
  raw: unknown,
  opts?: { allowDataImage?: boolean },
): string {
  const value = String(raw ?? '').trim();
  if (!value || UNSAFE_URL_CHARS.test(value)) {
    return '';
  }
  if (opts?.allowDataImage && DATA_IMAGE_REGEX.test(value)) {
    return value;
  }
  const relative = value.startsWith('/') && !value.startsWith('//');
  if (!relative && !/^https?:\/\//i.test(value)) {
    return '';
  }
  try {
    const base =
      typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : 'http://localhost/';
    const parsed = new URL(value, base);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      return '';
    }
    if (relative && parsed.origin !== new URL(base).origin) {
      return '';
    }
    return relative
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.href;
  } catch {
    return '';
  }
}
