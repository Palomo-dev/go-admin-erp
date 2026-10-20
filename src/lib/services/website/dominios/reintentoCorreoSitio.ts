/**
 * Reintento del correo de los dominios comprados que ya son el principal.
 * El alta en el momento de marcarlo vive en `correoDominioSitio.ts`; aquí
 * está el cron, que también cubre los que ya eran principales antes de
 * existir este flujo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailDomainExtras } from '@/lib/services/crm/email/types';
import type { Resend } from 'resend';
import { normalizeRecords } from '@/lib/services/crm/email/domainsSupport';
import { mapProviderStatus } from '@/lib/services/crm/email/domainRules';
import { configuracionRegistrador, crearClienteDns } from './vercelDominios';
import { LOTE_CORREO_DOMINIO, comoRegistros, elegirPendientes, loteRotativo, type EntradaCorreoDominio } from './registrosCorreo';
import {
  REGION_CORREO_SITIO,
  REMITENTE_CORREO_SITIO,
  aFila,
  aprovisionarCorreoDominioSitio,
  nombreRemitente,
  type DependenciasCorreoSitio,
  type FilaCorreo,
  type ResultadoCorreoSitio,
} from './correoDominioSitio';

/** Principales comprados que aún no tienen el correo verificado. Rota el lote. */
export async function listarPendientes(servicio: SupabaseClient, ahora: Date, limite = LOTE_CORREO_DOMINIO): Promise<EntradaCorreoDominio[]> {
  const dom = await servicio
    .from('organization_domains')
    .select('organization_id, host, status, is_primary, is_active, domain_type, metadata')
    .eq('is_primary', true)
    .eq('is_active', true)
    .eq('status', 'verified')
    .eq('domain_type', 'custom_domain');
  if (dom.error) throw new Error(dom.error.message);
  const filas = (dom.data ?? []) as Array<{
    organization_id: number;
    host: string;
    status: string;
    is_primary: boolean;
    is_active: boolean;
    domain_type: string;
    metadata: unknown;
  }>;
  if (filas.length === 0) return [];
  const orgIds = [...new Set(filas.map((f) => f.organization_id))];
  const [comp, cor] = await Promise.all([
    servicio.from('domain_purchases').select('organization_id, domain, status').eq('status', 'completed').in('organization_id', orgIds),
    servicio.from('email_domains').select('organization_id, domain, status').in('organization_id', orgIds),
  ]);
  if (comp.error) throw new Error(comp.error.message);
  if (cor.error) throw new Error(cor.error.message);
  const compras = ((comp.data ?? []) as Array<{ organization_id: number; domain: string; status: string }>).map((c) => ({
    organizationId: c.organization_id,
    domain: c.domain,
    status: c.status,
  }));
  const correos = ((cor.data ?? []) as Array<{ organization_id: number; domain: string; status: string }>).map((c) => ({
    organizationId: c.organization_id,
    domain: c.domain,
    status: c.status,
  }));
  const lote = loteRotativo(
    elegirPendientes(
      filas.map((f) => ({
        organizationId: f.organization_id,
        host: f.host,
        status: f.status,
        isPrimary: f.is_primary,
        isActive: f.is_active,
        domainType: f.domain_type,
        metadata: f.metadata,
      })),
      compras,
      correos,
    ),
    Math.floor(ahora.getTime() / (15 * 60 * 1000)),
    limite,
  );
  if (lote.length === 0) return [];
  const ids = [...new Set(lote.map((e) => e.organizationId))];
  const orgs = await servicio.from('organizations').select('id, name').in('id', ids);
  if (orgs.error) throw new Error(orgs.error.message);
  const nombres = new Map<number, string | null>();
  for (const o of (orgs.data ?? []) as Array<{ id: number; name: string | null }>) nombres.set(o.id, o.name);
  return lote.map((e) => ({ organizationId: e.organizationId, host: e.host, nombreOrganizacion: nombres.get(e.organizationId) ?? null }));
}

export async function reintentarCorreoDominiosSitio(deps: DependenciasCorreoSitio, ahora = new Date()): Promise<ResultadoCorreoSitio[]> {
  if (!deps.proveedorListo) return [];
  const pendientes = await listarPendientes(deps.servicio, ahora);
  const resultados: ResultadoCorreoSitio[] = [];
  for (const p of pendientes) resultados.push(await aprovisionarCorreoDominioSitio(p, deps));
  return resultados;
}

/** Dependencias reales. Resend se importa aquí, no al cargar las pruebas del sitio. */
export async function dependenciasCorreoSitio(): Promise<DependenciasCorreoSitio> {
  const [{ createDomain, verifyDomain }, { getMasterResend, getMasterResendKey }, { setDomainExtras }, { getServiceClient }] = await Promise.all([
    import('@/lib/services/crm/email/domainsService'),
    import('@/lib/services/crm/email/resendClient'),
    import('@/lib/services/crm/email/domainStore'),
    import('@/lib/supabase/server-service'),
  ]);
  const cfg = configuracionRegistrador();
  const servicio = getServiceClient();
  return {
    servicio,
    dns: cfg ? crearClienteDns(cfg) : null,
    proveedorListo: !!getMasterResendKey(),
    crearDominio: async (orgId, input, supabase) => aFila(await createDomain(orgId, input, supabase)),
    verificarDominio: async (orgId, id, supabase) => aFila(await verifyDomain(orgId, id, supabase)),
    adoptar: async (entrada, supabase) => adoptarEnProveedor(entrada, supabase, getMasterResend(), setDomainExtras),
  };
}

async function adoptarEnProveedor(
  entrada: EntradaCorreoDominio,
  supabase: SupabaseClient,
  master: Resend,
  setDomainExtras: (orgId: number, id: string, extras: Partial<EmailDomainExtras>) => Promise<void>,
): Promise<FilaCorreo | null> {
  let cursor: string | undefined;
  let encontrado: { id: string; status: string } | null = null;
  for (let i = 0; i < 5 && !encontrado; i++) {
    const { data, error } = await master.domains.list(cursor ? { limit: 100, after: cursor } : { limit: 100 });
    if (error || !data) return null;
    const hit = data.data.find((d) => d.name.toLowerCase() === entrada.host);
    if (hit) encontrado = { id: hit.id, status: hit.status };
    else if (!data.has_more || data.data.length === 0) return null;
    else cursor = data.data[data.data.length - 1]?.id;
  }
  if (!encontrado) return null;
  const got = await master.domains.get(encontrado.id);
  const records = got.data?.records ?? [];
  const status = mapProviderStatus(got.data?.status ?? encontrado.status);
  const { data: row, error: insErr } = await supabase
    .from('email_domains')
    .insert({
      organization_id: entrada.organizationId,
      domain: entrada.host,
      provider: 'resend',
      provider_domain_id: encontrado.id,
      status,
      dns_records: normalizeRecords(records, entrada.host),
      from_name: nombreRemitente(entrada.nombreOrganizacion),
      from_email: `${REMITENTE_CORREO_SITIO}@${entrada.host}`,
      is_default: false,
    })
    .select('id, domain, status, is_default, dns_records, from_email')
    .single();
  if (insErr || !row) return null;
  const fila = aFila(row as FilaCorreo);
  await setDomainExtras(entrada.organizationId, fila.id, {
    region: REGION_CORREO_SITIO,
    tracking_subdomain: 'links',
    open_tracking: false,
    click_tracking: false,
    receiving_enabled: false,
    provider_status: got.data?.status ?? encontrado.status,
    api_key_id: null,
    last_checked_at: new Date().toISOString(),
  }).catch(() => undefined);
  return { ...fila, dns_records: comoRegistros(normalizeRecords(records, entrada.host)) };
}
