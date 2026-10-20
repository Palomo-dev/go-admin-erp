/**
 * Qué DNS de correo se puede publicar en un dominio comprado para el sitio,
 * y cuáles de esos dominios todavía no pueden enviar.
 *
 * Reglas, sin red:
 * - El MX del apex no se toca: ahí puede vivir el correo que la tienda ya
 *   recibe. El retorno de Resend va en el subdominio `send`.
 * - `www` es del sitio, no del correo.
 * - Si ya hay un TXT en `_dmarc`, no se sustituye: puede ser más estricto
 *   que el `p=none` que sugerimos.
 * - Un CNAME o un MX con el mismo nombre y otro valor no se pisa.
 */

export interface RegistroDns {
  record?: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
}

export interface RegistroPublicable {
  name: string;
  type: 'TXT' | 'MX' | 'CNAME';
  value: string;
  mxPriority?: number;
}

export interface RegistroExistente {
  name: string;
  type: string;
  value: string;
  mxPriority?: number | null;
}

export interface PlanDns {
  crear: RegistroPublicable[];
  yaEstaban: number;
  omitidos: string[];
}

export interface EntradaCorreoDominio {
  organizationId: number;
  host: string;
  nombreOrganizacion: string | null;
}

/** Lote por pasada del cron: cabe en el tiempo del request y rota si alguno falla. */
export const LOTE_CORREO_DOMINIO = 8;

export function nombreRelativo(name: string, dominio: string): string {
  const d = dominio.trim().toLowerCase().replace(/\.+$/, '');
  let n = name.trim().toLowerCase().replace(/\.+$/, '');
  if (!n || n === '@' || n === d) return '';
  if (d && n.endsWith(`.${d}`)) n = n.slice(0, -(d.length + 1));
  return n;
}

function valorLimpio(type: string, value: string): string {
  const t = value.trim();
  if (type === 'TXT') return t.replace(/^"(.*)"$/, '$1');
  return t.replace(/\.+$/, '');
}

function mismoValor(type: string, a: string, b: string): boolean {
  const izq = valorLimpio(type, a);
  const der = valorLimpio(type, b);
  return type === 'TXT' ? izq === der : izq.toLowerCase() === der.toLowerCase();
}

/** Registros que Resend pide y que es seguro crear. El MX del apex y `Receiving` salen. */
export function registrosPublicables(records: RegistroDns[], dominio: string): RegistroPublicable[] {
  const vistos = new Set<string>();
  const out: RegistroPublicable[] = [];
  for (const r of records) {
    if ((r.record ?? '').toLowerCase() === 'receiving') continue;
    const type = (r.type ?? '').toUpperCase();
    if (type !== 'TXT' && type !== 'MX' && type !== 'CNAME') continue;
    const name = nombreRelativo(r.name ?? '', dominio);
    if (!name || name === 'www') continue;
    if (type === 'MX' && name !== 'send') continue;
    const value = valorLimpio(type, r.value ?? '');
    if (!value) continue;
    const mxPriority = type === 'MX' ? (r.priority ?? 10) : undefined;
    const clave = `${type}|${name}|${value}|${mxPriority ?? ''}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ name, type, value, ...(mxPriority !== undefined ? { mxPriority } : {}) });
  }
  return out;
}

/** Cruza lo que falta con lo que el DNS ya tiene. No reemplaza valores distintos. */
export function planPublicacion(deseados: RegistroPublicable[], existentes: RegistroExistente[], dominio: string): PlanDns {
  const crear: RegistroPublicable[] = [];
  const omitidos: string[] = [];
  let yaEstaban = 0;
  const ex = existentes.map((e) => ({
    name: nombreRelativo(e.name ?? '', dominio),
    type: (e.type ?? '').toUpperCase(),
    value: e.value ?? '',
    mxPriority: e.mxPriority ?? null,
  }));
  for (const d of deseados) {
    const delNombre = ex.filter((e) => e.name === d.name && e.type === d.type);
    const igual = delNombre.some(
      (e) => mismoValor(d.type, e.value, d.value) && (d.type !== 'MX' || (e.mxPriority ?? 10) === (d.mxPriority ?? 10)),
    );
    if (d.name === '_dmarc' && d.type === 'TXT' && ex.some((e) => e.name === '_dmarc' && e.type === 'TXT')) {
      if (igual) yaEstaban += 1;
      else omitidos.push('dmarc');
      continue;
    }
    if (igual) {
      yaEstaban += 1;
      continue;
    }
    if (d.type === 'CNAME' && delNombre.length > 0) {
      omitidos.push(`cname:${d.name}`);
      continue;
    }
    if (d.type === 'MX' && delNombre.some((e) => (e.mxPriority ?? 10) === (d.mxPriority ?? 10))) {
      omitidos.push(`mx:${d.name}`);
      continue;
    }
    crear.push(d);
  }
  return { crear, yaEstaban, omitidos };
}

export function comoRegistros(valor: unknown): RegistroDns[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    return [
      {
        record: typeof o.record === 'string' ? o.record : undefined,
        name: typeof o.name === 'string' ? o.name : '',
        type: typeof o.type === 'string' ? o.type : '',
        value: typeof o.value === 'string' ? o.value : '',
        priority: typeof o.priority === 'number' ? o.priority : undefined,
      },
    ];
  });
}

/** Dominio propio conectado: no. Comprado aquí (comprobante o el pago guardado en la fila): sí. */
export function dominioCompradoAqui(metadata: unknown, compra: unknown): boolean {
  if (compra) return true;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const pago = (metadata as Record<string, unknown>).stripe_payment_intent;
  return typeof pago === 'string' && pago.trim() !== '';
}

export function correspondeCorreoSitio(
  fila: { domain_type: string; status: string; is_active: boolean },
  comprado: boolean,
): boolean {
  return comprado && fila.is_active && fila.status === 'verified' && fila.domain_type === 'custom_domain';
}

export interface FilaPendiente {
  organizationId: number;
  host: string;
  status: string;
  isPrimary: boolean;
  isActive: boolean;
  domainType: string;
  metadata: unknown;
}

export interface CompraPendiente {
  organizationId: number;
  domain: string;
  status: string;
}

export interface CorreoPendiente {
  organizationId: number;
  domain: string;
  status: string;
}

/** Principales comprados y verificados en el sitio, sin dominio de correo verificado. */
export function elegirPendientes(dominios: FilaPendiente[], compras: CompraPendiente[], correos: CorreoPendiente[]): Array<{ organizationId: number; host: string }> {
  const comprados = new Set(
    compras.filter((c) => c.status === 'completed').map((c) => `${c.organizationId}|${c.domain.trim().toLowerCase()}`),
  );
  const listos = new Set(
    correos.filter((c) => c.status === 'verified').map((c) => `${c.organizationId}|${c.domain.trim().toLowerCase()}`),
  );
  const vistos = new Set<string>();
  const out: Array<{ organizationId: number; host: string }> = [];
  const ordenados = [...dominios].sort((a, b) => a.organizationId - b.organizationId || a.host.localeCompare(b.host));
  for (const d of ordenados) {
    const host = d.host.trim().toLowerCase();
    const clave = `${d.organizationId}|${host}`;
    if (vistos.has(clave)) continue;
    if (!correspondeCorreoSitio({ domain_type: d.domainType, status: d.status, is_active: d.isActive }, dominioCompradoAqui(d.metadata, comprados.has(clave) ? true : null))) {
      continue;
    }
    if (listos.has(clave)) continue;
    vistos.add(clave);
    out.push({ organizationId: d.organizationId, host });
  }
  return out;
}

/** Rota el inicio para que un fallo reiterado no deje al resto sin turno. */
export function loteRotativo<T>(items: T[], inicio: number, limite: number): T[] {
  if (items.length === 0 || limite <= 0) return [];
  const i = ((inicio % items.length) + items.length) % items.length;
  return [...items.slice(i), ...items.slice(0, i)].slice(0, limite);
}
