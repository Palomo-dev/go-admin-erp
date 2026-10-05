/** URL de audio que solicitará el proveedor; nunca se descarga desde el servidor ERP. */
export function normalizedHoldMusicUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500 || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.')
      || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')
      || /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(host)
      || host.startsWith('[')) return null;
    return url.toString();
  } catch { return null; }
}
