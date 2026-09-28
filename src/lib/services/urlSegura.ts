/**
 * Guarda contra SSRF para URLs que da el usuario y que el SERVIDOR va a pedir
 * (imágenes de un CSV, páginas para el scraping): solo http(s), puerto por
 * defecto y sin hosts internos (localhost, IPs privadas, link-local,
 * metadatos de la nube). No resuelve DNS: un dominio público que apunte a una
 * IP privada sigue pasando, por eso además las descargas usan timeout, tope de
 * tamaño y no siguen redirecciones a hosts internos.
 */

const HOSTS_BLOQUEADOS = new Set(['localhost', 'metadata.google.internal', 'metadata', '0.0.0.0', '[::]', '[::1]']);

function ipv4Privada(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function urlPublicaSegura(valor: string): URL | null {
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  if (HOSTS_BLOQUEADOS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return null;
  if (ipv4Privada(host)) return null;
  if (host.startsWith('[')) return null; // IPv6 literal: fuera
  return url;
}
