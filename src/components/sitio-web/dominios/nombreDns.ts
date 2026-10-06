/**
 * Nombres de dominio (puro, sin dependencias): normalizar lo que la persona
 * escribe, validar la forma y calcular la zona (apex) para mostrar los
 * registros como se escriben en el panel del proveedor («@», «www»).
 *
 * El navegador lo usa solo como pista (B/07-06, error en línea); la regla que
 * manda es la del servidor, que usa estas MISMAS funciones.
 */

/** Forma estricta de un host (la misma del CHECK `chk_host_format` más un TLD alfabético). */
export const HOST_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Subdominio del sistema: `^[a-z0-9-]+$`, sin guion al inicio ni al final (P0-8). */
export const SUBDOMINIO_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

/**
 * «https://www.TuMarca.com.co/inicio» → «tumarca.com.co». Quita esquema, `www.`,
 * ruta, puerto, espacios y punto final. No valida: para eso, `esHostValido`.
 */
export function normalizarHost(entrada: string): string {
  let h = entrada.trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  h = h.split(/[/?#]/)[0] ?? '';
  h = h.replace(/:\d+$/, '').replace(/\.+$/, '');
  if (h.startsWith('www.')) h = h.slice(4);
  return h;
}

export function esHostValido(host: string): boolean {
  return HOST_RE.test(host);
}

/**
 * Sufijos públicos de dos niveles frecuentes en la región. Sin la lista
 * completa de sufijos públicos: si un sufijo no está aquí, la zona sale con dos
 * etiquetas, que es lo correcto para la inmensa mayoría (.com, .co, .shop…).
 */
const SUFIJOS_DOBLES = new Set([
  'com.co', 'net.co', 'org.co', 'edu.co', 'gov.co', 'nom.co',
  'com.mx', 'org.mx', 'com.ar', 'com.pe', 'com.ec', 'com.ve', 'com.bo', 'com.py', 'com.uy', 'com.br',
  'co.uk', 'org.uk', 'com.es', 'com.pa', 'com.gt', 'com.do', 'com.sv', 'co.cr', 'com.hn', 'com.ni',
]);

/** Zona (apex) del host: «shop.tumarca.com.co» → «tumarca.com.co». */
export function zonaDe(host: string): string {
  const etiquetas = host.split('.');
  if (etiquetas.length <= 2) return host;
  const ultimas2 = etiquetas.slice(-2).join('.');
  const n = SUFIJOS_DOBLES.has(ultimas2) ? 3 : 2;
  return etiquetas.slice(-n).join('.');
}

/** ¿Es la raíz de su zona? Solo a la raíz se le conecta además el alias www. */
export function esApex(host: string): boolean {
  return zonaDe(host) === host;
}

/** Nombre relativo a la zona como lo pide el proveedor: «tumarca.com» → «@»; «www.tumarca.com» → «www». */
export function nombreRelativo(fqdn: string, zona: string): string {
  const f = fqdn.toLowerCase().replace(/\.+$/, '');
  if (f === zona) return '@';
  return f.endsWith(`.${zona}`) ? f.slice(0, -(zona.length + 1)) : f;
}

/** Subdominio que se propone a partir del nombre de la organización («Mi Tienda S.A.S.» → «mi-tienda-sas»). */
export function sugerirSubdominio(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Etiqueta base para buscar dominios: «Tu Marca» o «tumarca.co» → «tumarca». */
export function nombreBaseBusqueda(entrada: string): string {
  const base = normalizarHost(entrada).split('.')[0] ?? '';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Pista de forma del subdominio (la regla que manda es la del servidor, `validarSubdominio`). */
export function errorSubdominio(valor: string, actual: string | null): 'invalido' | 'igual' | null {
  const v = valor.trim().toLowerCase();
  if (actual && v === actual) return 'igual';
  if (v.length < 3 || v.length > 63 || !SUBDOMINIO_RE.test(v) || v.includes('--')) return 'invalido';
  return null;
}

/** Texto para «Copiar todo» (B/07-07): una línea por registro (tipo, nombre, valor). */
export function textoRegistros(registros: readonly { tipo: string; nombre: string; valor: string }[]): string {
  return registros.map((r) => `${r.tipo}\t${r.nombre}\t${r.valor}`).join('\n');
}
