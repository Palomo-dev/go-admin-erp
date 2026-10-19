/**
 * Cuando el dominio comprado tiene la zona DNS en Vercel, publica los
 * registros de Resend y pide la verificación. Si la zona no es nuestra, no
 * crea el dominio en el proveedor: no habría dónde dejar SPF ni DKIM.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDomain, verifyDomain } from '@/lib/services/crm/email/domainsService';
import { getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import type { DnsRecord } from '@/lib/services/crm/email/types';
import { isEmailError } from '@/lib/services/crm/email/types';
import { hostsPendientes, registrosDeProveedor, registroYaPublicado, type RegistroZonaCorreo } from './registrosCorreo';
import { configuracionRegistrador, crearClienteRegistrador, type ClienteRegistrador } from './vercelDominios';

export type EstadoCorreoDominio = 'verificado' | 'pendiente' | 'fallo' | 'sin_dns' | 'ya_verificado' | 'sin_proveedor';

export interface ResultadoCorreoDominio {
  host: string;
  estado: EstadoCorreoDominio;
}

interface FilaCorreo {
  id: string;
  status: string;
  domain: string;
  dns_records: DnsRecord[];
}

function hostLimpio(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function correoValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const correo = valor.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
}

async function filaDe(db: SupabaseClient, orgId: number, host: string): Promise<FilaCorreo | null> {
  const { data, error } = await db
    .from('email_domains')
    .select('id, status, domain, dns_records')
    .eq('organization_id', orgId)
    .eq('domain', host)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilaCorreo | null) ?? null;
}

async function publicar(dns: ClienteRegistrador, host: string, registros: RegistroZonaCorreo[]): Promise<void> {
  const actuales = await dns.listarDns(host);
  if (!actuales) return;
  for (const registro of registros) {
    if (registroYaPublicado(actuales, registro)) continue;
    await dns.crearDns(host, registro);
    actuales.push({ name: registro.name, type: registro.type, value: registro.value, mxPriority: registro.mxPriority });
  }
}

function estadoDe(status: string): EstadoCorreoDominio {
  if (status === 'verified') return 'verificado';
  if (status === 'failed') return 'fallo';
  return 'pendiente';
}

export async function activarCorreoDominio(
  db: SupabaseClient,
  orgId: number,
  hostEntrada: string,
  dns: ClienteRegistrador | null = null,
): Promise<ResultadoCorreoDominio> {
  const host = hostLimpio(hostEntrada);
  const cfg = configuracionRegistrador();
  const cliente = dns ?? (cfg ? crearClienteRegistrador(cfg) : null);
  if (!cliente) return { host, estado: 'sin_proveedor' };
  const existente = await filaDe(db, orgId, host);
  if (existente?.status === 'verified') return { host, estado: 'ya_verificado' };

  const zona = await cliente.listarDns(host);
  if (!zona) return { host, estado: 'sin_dns' };
  if (!getMasterResendKey()) return { host, estado: 'sin_proveedor' };

  let fila = existente;
  if (!fila) {
    const { data: org } = await db.from('organizations').select('name, email').eq('id', orgId).maybeSingle();
    const nombre = typeof org?.name === 'string' && org.name.trim() ? org.name.trim() : 'Tienda';
    const respuesta = correoValido(org?.email);
    try {
      const creado = await createDomain(orgId, {
        domain: host,
        // Misma región que el dominio de envío que la plataforma ya tiene autenticado.
        region: 'sa-east-1',
        from_name: nombre,
        from_email_local: 'pedidos',
        reply_to: respuesta ?? undefined,
        receiving_enabled: false,
        open_tracking: false,
        click_tracking: false,
      }, db);
      fila = { id: creado.id, status: creado.status, domain: creado.domain, dns_records: creado.dns_records };
    } catch (error) {
      const detalle = isEmailError(error) ? `${error.message} ${JSON.stringify(error.details ?? '')}` : '';
      if (/domain limit|upgrade to add more/i.test(detalle)) return { host, estado: 'sin_proveedor' };
      if (!isEmailError(error) || error.code !== 'DOMAIN_EXISTS') throw error;
      fila = await filaDe(db, orgId, host);
    }
  }
  if (!fila) return { host, estado: 'fallo' };

  await publicar(cliente, host, registrosDeProveedor(host, fila.dns_records ?? []));
  const fresco = await verifyDomain(orgId, fila.id, db);
  return { host, estado: estadoDe(fresco.status) };
}

/** Reintenta unos pocos dominios comprados. El cron lo llama cada cuarto de hora. */
export async function activarCorreosComprados(db: SupabaseClient, limite = 5): Promise<{ revisados: number; resultados: ResultadoCorreoDominio[] }> {
  const cfg = configuracionRegistrador();
  if (!cfg || !getMasterResendKey()) return { revisados: 0, resultados: [] };
  const dns = crearClienteRegistrador(cfg);
  const [compras, zonas, correos] = await Promise.all([
    db.from('domain_purchases').select('organization_id, domain').eq('status', 'completed'),
    db.from('organization_domains').select('organization_id, host, is_primary').eq('is_active', true),
    db.from('email_domains').select('organization_id, domain, status'),
  ]);
  const error = compras.error ?? zonas.error ?? correos.error;
  if (error) throw new Error(error.message);
  const pendientes = hostsPendientes(
    ((compras.data ?? []) as { organization_id: number; domain: string }[]).map((c) => ({ organizationId: c.organization_id, host: c.domain })),
    ((zonas.data ?? []) as { organization_id: number; host: string; is_primary: boolean }[]).map((z) => ({
      organizationId: z.organization_id, host: z.host, principal: z.is_primary,
    })),
    ((correos.data ?? []) as { organization_id: number; domain: string; status: string }[]).map((c) => ({
      organizationId: c.organization_id, host: c.domain, verificado: c.status === 'verified',
    })),
  );
  const resultados: ResultadoCorreoDominio[] = [];
  for (const item of pendientes.slice(0, Math.max(0, limite))) {
    try {
      const resultado = await activarCorreoDominio(db, item.organizationId, item.host, dns);
      resultados.push(resultado);
      if (resultado.estado === 'sin_proveedor') break;
    } catch (error) {
      console.error('[correo-dominio] no se pudo preparar el correo', item.organizationId, error);
      resultados.push({ host: item.host, estado: 'fallo' });
    }
  }
  return { revisados: resultados.length, resultados };
}
