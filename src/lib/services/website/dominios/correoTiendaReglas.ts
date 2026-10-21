/**
 * Reglas del correo de pedidos de una tienda. Sin red ni base.
 *
 * El dominio que se registra en el proveedor es el de la tienda (pedidos@ese
 * dominio). El proveedor publica SPF y DKIM en subdominios; el MX de la raíz
 * no se crea ni se pisa. Un DMARC que ya exista tampoco.
 */

export const RESPALDO_CORREO_PEDIDOS = 'pedidos@goadmin.io';

export interface EstadoCorreoTienda {
  estado: 'verified' | 'pending' | 'verifying' | 'failed' | 'sin_configurar' | 'no_aplica';
  desde: string | null;
  respaldo: string;
  registros: { tipo: string; nombre: string; valor: string }[];
  dnsEnVercel: boolean;
  error: string | null;
}

export const REGION_CORREO_TIENDA = 'sa-east-1';
export const MENSAJE_DNS_AJENO = 'El DNS de este dominio no está en Vercel. Copia los registros y pulsa Reintentar.';
export const PLAZO_CORREO_MS = 72 * 60 * 60 * 1000;
export const VALOR_DMARC = 'v=DMARC1; p=none; rua=mailto:dmarc@goadmin.io';

const TIPOS_ENVIABLES = new Set(['custom_domain', 'custom_subdomain', 'www_alias']);

export interface RegistroDnsCorreo {
  tipo: 'TXT' | 'MX';
  nombre: string;
  valor: string;
  prioridad: number | null;
}

export function hostDeZona(host: string, domainType: string): string | null {
  let limpio = (host || '').trim().toLowerCase().replace(/\.$/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!limpio || limpio.endsWith('.goadmin.io') || domainType === 'system_subdomain') return null;
  if (!TIPOS_ENVIABLES.has(domainType)) return null;
  if (domainType === 'www_alias' && limpio.startsWith('www.')) limpio = limpio.slice(4);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(limpio)) return null;
  return limpio;
}

/** Dominio raíz que se registra. `send.` no es otro dominio: son sus registros. */
export function dominioDeEnvio(apex: string): string | null {
  let host = (apex || '').trim().toLowerCase().replace(/\.$/, '');
  if (host.startsWith('send.')) host = host.slice('send.'.length);
  if (!host || host.endsWith('.goadmin.io') || host.length > 253 || !host.includes('.')) return null;
  return host;
}

export function yaTieneRemitenteVerificado(
  filas: readonly { domain: string; status: string }[],
  apex: string,
): boolean {
  const raiz = dominioDeEnvio(apex);
  if (!raiz) return false;
  return filas.some((fila) => {
    if (fila.status !== 'verified') return false;
    const dominio = fila.domain.trim().toLowerCase();
    return dominio === raiz || dominio === `send.${raiz}`;
  });
}

/** 15 min, 30, 60… hasta 16 h. El plazo de 72 h lo corta `vencioPlazo`. */
export function esperaReintentoMs(intentos: number): number {
  const pasos = Math.min(Math.max(Math.floor(intentos) || 1, 1), 7) - 1;
  return 15 * 60 * 1000 * 2 ** pasos;
}

export function vencioPlazo(desde: string | Date, ahora: Date): boolean {
  const t = desde instanceof Date ? desde.getTime() : Date.parse(desde);
  if (!Number.isFinite(t)) return false;
  return ahora.getTime() - t >= PLAZO_CORREO_MS;
}

/** Lo que ve la tienda. El detalle del proveedor va después, en el mismo texto. */
export const MENSAJE_LIMITE_PLAN = 'El plan de correo no admite más dominios.';

export function textoDeProveedor(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const cuerpo = json as { name?: unknown; message?: unknown; error?: unknown };
  const anidado = cuerpo.error && typeof cuerpo.error === 'object'
    ? cuerpo.error as { name?: unknown; message?: unknown }
    : null;
  const name = typeof cuerpo.name === 'string' ? cuerpo.name : typeof anidado?.name === 'string' ? anidado.name : '';
  const message = typeof cuerpo.message === 'string' ? cuerpo.message : typeof anidado?.message === 'string' ? anidado.message : '';
  return [name, message].map((parte) => parte.trim()).filter(Boolean).join(': ').slice(0, 400);
}

/** 403/422 por cupo del plan. Una clave inválida no entra aquí. */
export function esAvisoLimitePlan(error: string | null | undefined): boolean {
  if (!error) return false;
  const texto = error.toLowerCase();
  return texto.includes('domain limit') || texto.includes('no admite más dominios') || texto.includes('no admite mas dominios');
}

export function falloAlCrearDominio(status: number, json: unknown): { mensaje: string; limitePlan: boolean } {
  const crudo = textoDeProveedor(json);
  const limitePlan = (status === 403 || status === 422) && esAvisoLimitePlan(crudo);
  if (limitePlan) {
    const mensaje = crudo.startsWith(MENSAJE_LIMITE_PLAN) ? crudo : `${MENSAJE_LIMITE_PLAN} ${crudo}`.trim();
    return { limitePlan: true, mensaje: mensaje.slice(0, 500) };
  }
  if (crudo) return { limitePlan: false, mensaje: crudo };
  if (!status) return { limitePlan: false, mensaje: 'El proveedor no creó el dominio.' };
  return { limitePlan: false, mensaje: `El proveedor no creó el dominio (${status}).` };
}

export function nombreRelativo(nombre: string, zona: string): string {
  const n = (nombre || '').trim().toLowerCase().replace(/\.$/, '');
  const z = (zona || '').trim().toLowerCase().replace(/\.$/, '');
  if (!n || n === '@' || n === z) return '';
  if (z && n.endsWith(`.${z}`)) return n.slice(0, -(z.length + 1));
  return n;
}

export function conservarDmarc(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && /v\s*=\s*dmarc1/i.test(valor);
}

export function registroDmarc(zona: string): RegistroDnsCorreo {
  return { tipo: 'TXT', nombre: `_dmarc.${zona}`, valor: VALOR_DMARC, prioridad: null };
}

export function esMxRaiz(registro: { tipo: string; nombre: string }, zona: string): boolean {
  return registro.tipo.toUpperCase() === 'MX' && nombreRelativo(registro.nombre, zona) === '';
}

function esRegistro(valor: unknown): valor is { type?: unknown; name?: unknown; value?: unknown; priority?: unknown } {
  return !!valor && typeof valor === 'object';
}

/** Registros que devolvió el proveedor, más el DMARC si todavía no viene. */
export function registrosDeProveedor(records: unknown, zona: string): RegistroDnsCorreo[] {
  const lista = Array.isArray(records) ? records : [];
  const salida: RegistroDnsCorreo[] = [];
  for (const crudo of lista) {
    if (!esRegistro(crudo)) continue;
    const tipo = String(crudo.type || '').toUpperCase();
    if (tipo !== 'TXT' && tipo !== 'MX') continue;
    const nombre = String(crudo.name || '').trim();
    const valor = String(crudo.value || '').trim();
    if (!nombre || !valor || valor.length > 2000) continue;
    const prioridad = tipo === 'MX' ? Number(crudo.priority ?? 10) : null;
    salida.push({
      tipo,
      nombre,
      valor,
      prioridad: prioridad != null && Number.isFinite(prioridad) ? prioridad : null,
    });
  }
  const hayDmarc = salida.some((r) => nombreRelativo(r.nombre, zona) === '_dmarc');
  if (!hayDmarc && zona) salida.push(registroDmarc(zona));
  return salida;
}

export function debePublicar(
  existentes: readonly { tipo: string; nombre: string; valor: string }[],
  nuevo: RegistroDnsCorreo,
  zona: string,
): boolean {
  if (esMxRaiz(nuevo, zona)) return false;
  const nombre = nombreRelativo(nuevo.nombre, zona);
  if (nombre === '_dmarc') {
    const publicado = existentes.find((e) => e.tipo.toUpperCase() === 'TXT' && nombreRelativo(e.nombre, zona) === '_dmarc');
    if (publicado && conservarDmarc(publicado.valor)) return false;
  }
  return !existentes.some((e) =>
    e.tipo.toUpperCase() === nuevo.tipo
    && nombreRelativo(e.nombre, zona) === nombre
    && e.valor.trim() === nuevo.valor.trim(),
  );
}
