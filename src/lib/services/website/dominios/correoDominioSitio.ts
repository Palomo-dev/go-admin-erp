/**
 * Cuando un dominio comprado para el sitio queda verificado y principal,
 * lo da de alta en Resend (solo envío, región sa-east-1, remitente
 * `pedidos@`) y publica en el DNS de Vercel los registros que Resend pide.
 *
 * No falla el cambio de principal: si Resend o el DNS no responden, el
 * cron `/api/cron/correo-dominio-sitio` lo retoma. El correo de la tienda
 * sigue saliendo por el dominio de la plataforma hasta que el estado quede
 * `verified`.
 *
 * Un dominio conectado (DNS ajeno) no entra: no podemos escribir su zona.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailDomainRegion } from '@/lib/services/crm/email/types';
import { isEmailError } from '@/lib/services/crm/email/types';
import { esHostValido } from '@/components/sitio-web/dominios/nombreDns';
import type { ClienteDns } from './vercelDominios';
import {
  comoRegistros,
  planPublicacion,
  registrosPublicables,
  type EntradaCorreoDominio,
  type RegistroDns,
} from './registrosCorreo';

export const REGION_CORREO_SITIO: EmailDomainRegion = 'sa-east-1';
export const REMITENTE_CORREO_SITIO = 'pedidos';

export interface FilaCorreo {
  id: string;
  domain: string;
  status: string;
  is_default: boolean;
  dns_records: RegistroDns[];
  from_email: string;
}

export interface DependenciasCorreoSitio {
  servicio: SupabaseClient;
  dns: ClienteDns | null;
  proveedorListo: boolean;
  crearDominio: (
    orgId: number,
    input: {
      domain: string;
      region: EmailDomainRegion;
      from_name: string;
      from_email_local: string;
      open_tracking: boolean;
      click_tracking: boolean;
      receiving_enabled: boolean;
      is_default: boolean;
    },
    supabase: SupabaseClient,
  ) => Promise<FilaCorreo>;
  verificarDominio: (orgId: number, id: string, supabase: SupabaseClient) => Promise<FilaCorreo>;
  /** Dominio que ya existe en Resend y no tiene fila. Null si tampoco está allá. */
  adoptar: (entrada: EntradaCorreoDominio, supabase: SupabaseClient) => Promise<FilaCorreo | null>;
}

export interface ResultadoCorreoSitio {
  organizationId: number;
  host: string;
  estado: 'omitido' | 'pendiente' | 'verificado' | 'error';
  motivo?: string;
}

export function nombreRemitente(nombre: string | null): string {
  const limpio = (nombre ?? '').replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio.slice(0, 80) || 'Tienda';
}

function hostDe(valor: string): string | null {
  const host = valor.trim().toLowerCase().replace(/\.+$/, '');
  if (!esHostValido(host) || host === 'goadmin.io' || host.endsWith('.goadmin.io')) return null;
  return host;
}

export function aFila(row: {
  id: string;
  domain: string;
  status: string;
  is_default?: boolean;
  dns_records?: unknown;
  from_email?: string;
}): FilaCorreo {
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    is_default: row.is_default === true,
    dns_records: comoRegistros(row.dns_records),
    from_email: row.from_email ?? '',
  };
}

async function leerFila(servicio: SupabaseClient, orgId: number, host: string): Promise<FilaCorreo | null> {
  const { data, error } = await servicio
    .from('email_domains')
    .select('id, domain, status, is_default, dns_records, from_email')
    .eq('organization_id', orgId)
    .eq('domain', host)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return aFila(data as FilaCorreo);
}

async function marcarPredeterminado(servicio: SupabaseClient, orgId: number, id: string): Promise<void> {
  const ahora = new Date().toISOString();
  const a = await servicio.from('email_domains').update({ is_default: false, updated_at: ahora }).eq('organization_id', orgId).eq('is_default', true).neq('id', id);
  if (a.error) throw new Error(a.error.message);
  const b = await servicio.from('email_domains').update({ is_default: true, updated_at: ahora }).eq('organization_id', orgId).eq('id', id);
  if (b.error) throw new Error(b.error.message);
}

async function publicar(host: string, records: RegistroDns[], dns: ClienteDns): Promise<void> {
  const existentes = await dns.listar(host);
  const plan = planPublicacion(registrosPublicables(records, host), existentes, host);
  let fallos = 0;
  for (const r of plan.crear) {
    try {
      await dns.crear(host, r);
    } catch (e) {
      fallos += 1;
      console.error('[correo-dominio] un registro DNS no se creó', {
        name: r.name,
        type: r.type,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (fallos > 0) throw new Error('dns incompleto');
}

/**
 * Alta + DNS + verificación de un dominio. No lanza por un fallo de Resend
 * o del DNS: devuelve `error` o `pendiente` para que el cron lo reintente.
 */
export async function aprovisionarCorreoDominioSitio(entrada: EntradaCorreoDominio, deps: DependenciasCorreoSitio): Promise<ResultadoCorreoSitio> {
  const host = hostDe(entrada.host);
  const base = { organizationId: entrada.organizationId, host: host ?? entrada.host };
  if (!host) return { ...base, estado: 'omitido', motivo: 'host' };
  if (!deps.proveedorListo) return { ...base, host, estado: 'omitido', motivo: 'sin_proveedor' };

  try {
    let fila = await leerFila(deps.servicio, entrada.organizationId, host);
    if (fila?.status === 'verified') {
      if (!fila.is_default) await marcarPredeterminado(deps.servicio, entrada.organizationId, fila.id);
      return { ...base, host, estado: 'omitido', motivo: 'ya_verificado' };
    }
    if (!fila) {
      try {
        fila = await deps.crearDominio(
          entrada.organizationId,
          {
            domain: host,
            region: REGION_CORREO_SITIO,
            from_name: nombreRemitente(entrada.nombreOrganizacion),
            from_email_local: REMITENTE_CORREO_SITIO,
            open_tracking: false,
            click_tracking: false,
            receiving_enabled: false,
            is_default: false,
          },
          deps.servicio,
        );
      } catch (e) {
        fila = await leerFila(deps.servicio, entrada.organizationId, host);
        if (!fila && isEmailError(e) && e.code === 'PROVIDER') fila = await deps.adoptar({ ...entrada, host }, deps.servicio);
        if (!fila) return { ...base, host, estado: 'error', motivo: isEmailError(e) ? e.code : 'alta' };
      }
    }
    if (fila.status === 'verified') {
      if (!fila.is_default) await marcarPredeterminado(deps.servicio, entrada.organizationId, fila.id);
      return { ...base, host, estado: 'verificado' };
    }
    if (deps.dns) {
      try {
        await publicar(host, fila.dns_records, deps.dns);
      } catch (e) {
        console.error('[correo-dominio] no se publicaron los DNS', {
          organizationId: entrada.organizationId,
          message: e instanceof Error ? e.message : String(e),
        });
        return { ...base, host, estado: 'error', motivo: 'dns' };
      }
    }
    let fresco = fila;
    try {
      fresco = await deps.verificarDominio(entrada.organizationId, fila.id, deps.servicio);
    } catch (e) {
      console.error('[correo-dominio] la verificación quedó pendiente', {
        organizationId: entrada.organizationId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { ...base, host, estado: 'pendiente', motivo: 'verificacion' };
    }
    if (fresco.status === 'verified') {
      if (!fresco.is_default) await marcarPredeterminado(deps.servicio, entrada.organizationId, fresco.id);
      return { ...base, host, estado: 'verificado' };
    }
    return { ...base, host, estado: 'pendiente', motivo: fresco.status };
  } catch (e) {
    console.error('[correo-dominio] no se pudo preparar el dominio', {
      organizationId: entrada.organizationId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { ...base, host, estado: 'error', motivo: 'interno' };
  }
}
