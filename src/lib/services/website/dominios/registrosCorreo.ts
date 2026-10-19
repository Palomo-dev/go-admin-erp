/**
 * Traduce los registros que pide Resend a nombres relativos de la zona DNS
 * del dominio comprado. Puro: no llama a Vercel ni a Resend.
 */
import type { DnsRecord } from '@/lib/services/crm/email/types';

export type TipoRegistroCorreo = 'TXT' | 'MX' | 'CNAME';

export interface RegistroZonaCorreo {
  name: string;
  type: TipoRegistroCorreo;
  value: string;
  mxPriority?: number;
}

const TIPOS = new Set<string>(['TXT', 'MX', 'CNAME']);
const SUFIJO_AJENO = /^(com|net|org|io|store|co|online|app|dev|shop|info|biz|me|us|uk|es|mx|ar|br|pe|cl|ec)$/;

export interface CompraDominio {
  organizationId: number;
  host: string;
}

export interface ZonaOrganizacion {
  organizationId: number;
  host: string;
  principal: boolean;
}

export interface CorreoExistente {
  organizationId: number;
  host: string;
  verificado: boolean;
}

/** Nombre relativo a la zona. `null` si el registro apunta a otro dominio. */
export function nombreEnZona(dominio: string, nombre: string): string | null {
  const zona = dominio.trim().toLowerCase().replace(/\.$/, '');
  let n = nombre.trim().toLowerCase().replace(/\.$/, '');
  if (!zona) return null;
  if (n === '@' || n === zona) return '';
  if (n.endsWith(`.${zona}`)) n = n.slice(0, -(zona.length + 1));
  if (!n) return '';
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/.test(n)) return null;
  const ultimo = n.split('.').pop() ?? '';
  if (n.includes('.') && SUFIJO_AJENO.test(ultimo)) return null;
  return n;
}

function valorLimpio(valor: string, tipo: string): string {
  let v = valor.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (tipo !== 'TXT') v = v.replace(/\.$/, '');
  return v;
}

/** Registros publicables. El TXT se compara tal cual: el DKIM distingue mayúsculas. */
export function registrosDeProveedor(dominio: string, records: readonly DnsRecord[]): RegistroZonaCorreo[] {
  const vistos = new Set<string>();
  const salida: RegistroZonaCorreo[] = [];
  for (const r of records) {
    const type = String(r.type ?? '').toUpperCase();
    if (!TIPOS.has(type)) continue;
    const name = nombreEnZona(dominio, String(r.name ?? ''));
    if (name === null) continue;
    const value = valorLimpio(String(r.value ?? ''), type);
    if (!value) continue;
    const item: RegistroZonaCorreo = { name, type: type as TipoRegistroCorreo, value };
    if (type === 'MX') item.mxPriority = typeof r.priority === 'number' ? r.priority : 10;
    const clave = `${type}|${name}|${type === 'TXT' ? value : value.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(item);
  }
  return salida;
}

export function registroYaPublicado(
  existentes: readonly { name?: string; type?: string; value?: string }[],
  nuevo: RegistroZonaCorreo,
): boolean {
  return existentes.some((e) => {
    const type = String(e.type ?? '').toUpperCase();
    if (type !== nuevo.type) return false;
    if (String(e.name ?? '') !== nuevo.name) return false;
    const actual = valorLimpio(String(e.value ?? ''), type);
    return type === 'TXT' ? actual === nuevo.value : actual.toLowerCase() === nuevo.value.toLowerCase();
  });
}

/**
 * Dominios comprados, presentes en la organización y todavía sin correo
 * verificado. Los principales van primero. No incluye un host que la
 * organización no tenga registrado.
 */
export function hostsPendientes(
  compras: readonly CompraDominio[],
  zonas: readonly ZonaOrganizacion[],
  correos: readonly CorreoExistente[],
): CompraDominio[] {
  const comprados = new Set(compras.map((c) => `${c.organizationId}:${c.host.trim().toLowerCase()}`));
  const verificados = new Set(
    correos.filter((c) => c.verificado).map((c) => `${c.organizationId}:${c.host.trim().toLowerCase()}`),
  );
  const vistos = new Set<string>();
  const ordenados = [...zonas].sort((a, b) => Number(b.principal) - Number(a.principal));
  const salida: CompraDominio[] = [];
  for (const z of ordenados) {
    const host = z.host.trim().toLowerCase();
    const clave = `${z.organizationId}:${host}`;
    if (!comprados.has(clave) || verificados.has(clave) || vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ organizationId: z.organizationId, host });
  }
  return salida;
}
