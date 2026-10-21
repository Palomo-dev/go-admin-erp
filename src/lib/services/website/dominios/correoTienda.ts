/**
 * Dominio de envío de los correos de pedido.
 *
 * Cuando el dominio del sitio queda verificado, se pide `send.<dominio>` al
 * proveedor y, si el DNS está en Vercel, se publican SPF, DKIM, el MX de
 * rebotes y DMARC. Si no, los registros quedan guardados para copiarlos.
 * No crea una clave de API por dominio: la de la plataforma envía desde
 * cualquier dominio ya verificado de la cuenta.
 *
 * La organización siempre llega de la sesión o de la fila del dominio, nunca
 * de un cuerpo público. Este proceso no se dispara a mano contra tiendas vivas
 * desde una sesión de desarrollo: lo hace el cron y el botón Verificar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapProviderStatus } from '@/lib/services/crm/email/domainRules';
import { getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import { getServiceClient } from '@/lib/supabase/server-service';
import { configuracionRegistrador } from './vercelDominios';
import {
  MENSAJE_DNS_AJENO,
  REGION_CORREO_TIENDA,
  RESPALDO_CORREO_PEDIDOS,
  debePublicar,
  dominioDeEnvio,
  hostDeZona,
  nombreRelativo,
  registrosDeProveedor,
  yaTieneRemitenteVerificado,
  type EstadoCorreoTienda,
  type RegistroDnsCorreo,
} from './correoTiendaReglas';

const LOTE = 10;

export type { EstadoCorreoTienda };

export class ErrorCorreoTienda extends Error {
  constructor(public readonly estadoHttp: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCorreoTienda';
  }
}

interface FilaDominio {
  id: string;
  organization_id: number;
  host: string;
  domain_type: string;
  status: string;
  is_active: boolean;
}

interface FilaCorreo {
  id: string;
  domain: string;
  status: string;
  from_email: string | null;
  from_name: string | null;
  provider_domain_id: string | null;
  dns_records: unknown;
  is_default: boolean;
  last_error: string | null;
}

function vacio(parcial: Partial<EstadoCorreoTienda> & Pick<EstadoCorreoTienda, 'estado'>): EstadoCorreoTienda {
  return {
    desde: null,
    respaldo: RESPALDO_CORREO_PEDIDOS,
    registros: [],
    dnsEnVercel: false,
    error: null,
    ...parcial,
  };
}

function registrosVisibles(valor: unknown, zona: string): { tipo: string; nombre: string; valor: string }[] {
  const filas = Array.isArray(valor) ? valor : [];
  return filas.flatMap((fila) => {
    if (!fila || typeof fila !== 'object') return [];
    const tipo = String((fila as { tipo?: unknown; type?: unknown }).tipo || (fila as { type?: unknown }).type || '').toUpperCase();
    const nombre = String((fila as { nombre?: unknown; name?: unknown }).nombre || (fila as { name?: unknown }).name || '');
    const texto = String((fila as { valor?: unknown; value?: unknown }).valor || (fila as { value?: unknown }).value || '');
    if (!tipo || !nombre || !texto) return [];
    return [{ tipo, nombre: nombreRelativo(nombre, zona) || nombre, valor: texto }];
  });
}

async function leerDominio(sb: SupabaseClient, organizationId: number, domainId: string): Promise<FilaDominio> {
  const { data, error } = await sb
    .from('organization_domains')
    .select('id, organization_id, host, domain_type, status, is_active')
    .eq('id', domainId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo leer el dominio.');
  if (!data) throw new ErrorCorreoTienda(404, 'No encontramos ese dominio.');
  return data as FilaDominio;
}

async function correosDe(sb: SupabaseClient, organizationId: number): Promise<FilaCorreo[]> {
  const { data, error } = await sb
    .from('email_domains')
    .select('id, domain, status, from_email, from_name, provider_domain_id, dns_records, is_default, last_error')
    .eq('organization_id', organizationId);
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo leer el correo de la tienda.');
  return (data || []) as FilaCorreo[];
}

function estadoDeFilas(fila: FilaDominio, correos: FilaCorreo[]): EstadoCorreoTienda {
  const apex = hostDeZona(fila.host, fila.domain_type);
  if (!apex) return vacio({ estado: 'no_aplica' });
  const envio = dominioDeEnvio(apex);
  const verificado = correos.find((c) => c.status === 'verified' && (c.domain === apex || c.domain === envio));
  if (verificado) {
    return vacio({
      estado: 'verified',
      desde: verificado.from_email,
      registros: registrosVisibles(verificado.dns_records, apex),
      dnsEnVercel: true,
    });
  }
  const pendiente = correos.find((c) => c.domain === envio);
  if (!pendiente) {
    return vacio({
      estado: fila.status === 'verified' && fila.is_active ? 'sin_configurar' : 'sin_configurar',
      desde: envio ? `pedidos@${envio}` : null,
      error: fila.status === 'verified' ? null : 'Primero verifica el dominio del sitio.',
    });
  }
  const estado = pendiente.status === 'verified' || pendiente.status === 'pending' || pendiente.status === 'verifying' || pendiente.status === 'failed'
    ? pendiente.status
    : 'pending';
  return vacio({
    estado,
    desde: pendiente.from_email,
    registros: registrosVisibles(pendiente.dns_records, apex),
    error: pendiente.last_error,
  });
}

async function llamarResend(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const key = getMasterResendKey();
  if (!key) return { ok: false, status: 0, json: null };
  const respuesta = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const json = await respuesta.json().catch(() => null);
  return { ok: respuesta.ok, status: respuesta.status, json };
}

async function idEnResend(nombre: string): Promise<{ id: string; records: unknown; status: string | null } | null> {
  const lista = await llamarResend('/domains', 'GET');
  const filas = Array.isArray(lista.json?.data) ? lista.json.data : Array.isArray(lista.json) ? lista.json : [];
  const hallado = filas.find((fila: { name?: string }) => String(fila?.name || '').toLowerCase() === nombre);
  if (!hallado?.id) return null;
  return { id: String(hallado.id), records: hallado.records ?? [], status: hallado.status ?? null };
}

async function publicarDns(zona: string, registros: RegistroDnsCorreo[]): Promise<{ dnsEnVercel: boolean; error: string | null }> {
  const cfg = configuracionRegistrador();
  if (!cfg) return { dnsEnVercel: false, error: 'Falta la configuración del registrador. Copia los registros a mano.' };
  const camino = `/v4/domains/${encodeURIComponent(zona)}/records?teamId=${encodeURIComponent(cfg.teamId)}`;
  const leer = await fetch(`https://api.vercel.com${camino}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: 'no-store',
  });
  if (leer.status === 403 || leer.status === 404) return { dnsEnVercel: false, error: MENSAJE_DNS_AJENO };
  if (!leer.ok) return { dnsEnVercel: false, error: `No se pudieron leer los registros (${leer.status}).` };
  const cuerpo = await leer.json().catch(() => ({})) as { records?: { type?: string; name?: string; value?: string }[] };
  const existentes = (cuerpo.records || []).map((r) => ({
    tipo: String(r.type || ''),
    nombre: String(r.name || ''),
    valor: String(r.value || ''),
  }));
  for (const registro of registros) {
    if (!debePublicar(existentes, registro, zona)) continue;
    const creado = await fetch(`https://api.vercel.com${camino}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nombreRelativo(registro.nombre, zona),
        type: registro.tipo,
        value: registro.valor,
        ttl: 60,
        ...(registro.tipo === 'MX' ? { mxPriority: registro.prioridad ?? 10 } : {}),
      }),
      cache: 'no-store',
    });
    if (creado.status === 409) continue;
    if (creado.status === 403 || creado.status === 404) return { dnsEnVercel: false, error: MENSAJE_DNS_AJENO };
    if (!creado.ok) return { dnsEnVercel: false, error: `No se pudo crear un registro (${creado.status}).` };
    existentes.push({ tipo: registro.tipo, nombre: nombreRelativo(registro.nombre, zona), valor: registro.valor });
  }
  return { dnsEnVercel: true, error: null };
}

async function guardar(
  sb: SupabaseClient,
  organizationId: number,
  entrada: {
    domain: string;
    providerDomainId: string | null;
    status: string;
    records: RegistroDnsCorreo[];
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    error: string | null;
    hacerDefecto: boolean;
  },
): Promise<void> {
  const ahora = new Date().toISOString();
  const { data: previo } = await sb
    .from('email_domains')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('domain', entrada.domain)
    .maybeSingle();
  const campos = {
    provider: 'resend',
    provider_domain_id: entrada.providerDomainId,
    status: entrada.status,
    dns_records: entrada.records,
    dmarc_configured: entrada.records.some((r) => nombreRelativo(r.nombre, entrada.domain.replace(/^send\./, '')) === '_dmarc'),
    from_name: entrada.fromName,
    from_email: entrada.fromEmail,
    reply_to: entrada.replyTo,
    last_check_at: ahora,
    last_error: entrada.error,
    updated_at: ahora,
    ...(entrada.status === 'verified' ? { verified_at: ahora } : {}),
  };
  if (previo?.id) {
    const { error } = await sb.from('email_domains').update(campos).eq('id', previo.id).eq('organization_id', organizationId);
    if (error) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
    return;
  }
  const { error } = await sb.from('email_domains').insert({
    organization_id: organizationId,
    domain: entrada.domain,
    is_default: entrada.hacerDefecto,
    ...campos,
  });
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
}

async function datosTienda(sb: SupabaseClient, organizationId: number): Promise<{ nombre: string; replyTo: string | null; cuantos: number }> {
  const [{ data: org }, { count }] = await Promise.all([
    sb.from('organizations').select('name, email').eq('id', organizationId).maybeSingle(),
    sb.from('email_domains').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
  ]);
  const nombre = String(org?.name || 'Tienda').replace(/[\r\n<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Tienda';
  const correo = typeof org?.email === 'string' ? org.email.trim().toLowerCase() : '';
  const replyTo = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(correo) ? correo : null;
  return { nombre, replyTo, cuantos: count ?? 0 };
}

async function provisionar(sb: SupabaseClient, fila: FilaDominio): Promise<EstadoCorreoTienda> {
  const apex = hostDeZona(fila.host, fila.domain_type);
  if (!apex) return vacio({ estado: 'no_aplica' });
  const correos = await correosDe(sb, fila.organization_id);
  if (yaTieneRemitenteVerificado(correos, apex)) return estadoDeFilas(fila, correos);
  if (fila.status !== 'verified' || !fila.is_active) {
    return vacio({ estado: 'sin_configurar', desde: `pedidos@${dominioDeEnvio(apex)}`, error: 'Primero verifica el dominio del sitio.' });
  }
  const envio = dominioDeEnvio(apex);
  if (!envio) return vacio({ estado: 'no_aplica' });
  if (!getMasterResendKey()) {
    return vacio({ estado: 'pending', desde: `pedidos@${envio}`, error: 'Falta la clave de envío de la plataforma.' });
  }
  let remoto = await llamarResend('/domains', 'POST', { name: envio, region: REGION_CORREO_TIENDA });
  let id = remoto.ok ? String(remoto.json?.id || '') : '';
  let records = remoto.json?.records;
  let status = typeof remoto.json?.status === 'string' ? remoto.json.status : null;
  if (!id) {
    const hallado = await idEnResend(envio);
    if (!hallado) {
      const tienda = await datosTienda(sb, fila.organization_id);
      await guardar(sb, fila.organization_id, {
        domain: envio,
        providerDomainId: null,
        status: 'pending',
        records: [],
        fromName: tienda.nombre,
        fromEmail: `pedidos@${envio}`,
        replyTo: tienda.replyTo,
        error: `El proveedor no creó el dominio (${remoto.status}).`,
        hacerDefecto: tienda.cuantos === 0,
      });
      return vacio({ estado: 'pending', desde: `pedidos@${envio}`, error: `El proveedor no creó el dominio (${remoto.status}).` });
    }
    id = hallado.id;
    records = hallado.records;
    status = hallado.status;
  }
  const dns = registrosDeProveedor(records, apex);
  const publicado = await publicarDns(apex, dns);
  await llamarResend(`/domains/${encodeURIComponent(id)}/verify`, 'POST');
  const fresco = await llamarResend(`/domains/${encodeURIComponent(id)}`, 'GET');
  const recordsFinales = registrosDeProveedor(fresco.json?.records ?? records, apex);
  const estado = mapProviderStatus(typeof fresco.json?.status === 'string' ? fresco.json.status : status, true);
  const tienda = await datosTienda(sb, fila.organization_id);
  await guardar(sb, fila.organization_id, {
    domain: envio,
    providerDomainId: id,
    status: estado,
    records: recordsFinales,
    fromName: tienda.nombre,
    fromEmail: `pedidos@${envio}`,
    replyTo: tienda.replyTo,
    error: publicado.error,
    hacerDefecto: tienda.cuantos === 0,
  });
  return vacio({
    estado,
    desde: `pedidos@${envio}`,
    registros: registrosVisibles(recordsFinales, apex),
    dnsEnVercel: publicado.dnsEnVercel,
    error: publicado.error,
  });
}

export async function leerEstadoCorreoTienda(organizationId: number, domainId: string): Promise<EstadoCorreoTienda> {
  const sb = getServiceClient();
  const fila = await leerDominio(sb, organizationId, domainId);
  return estadoDeFilas(fila, await correosDe(sb, organizationId));
}

export async function verificarCorreoTienda(organizationId: number, domainId: string): Promise<EstadoCorreoTienda> {
  const sb = getServiceClient();
  const fila = await leerDominio(sb, organizationId, domainId);
  return provisionar(sb, fila);
}

/** Lo llama la verificación del dominio. Un fallo de correo no la tumba. */
export async function asegurarCorreoTienda(organizationId: number, domainId: string): Promise<void> {
  const sb = getServiceClient();
  const fila = await leerDominio(sb, organizationId, domainId);
  if (fila.status !== 'verified' || !fila.is_active) return;
  if (!hostDeZona(fila.host, fila.domain_type)) return;
  await provisionar(sb, fila);
}

async function refrescarFila(sb: SupabaseClient, organizationId: number, domain: string): Promise<void> {
  const { data } = await sb
    .from('organization_domains')
    .select('id, organization_id, host, domain_type, status, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('status', 'verified')
    .in('domain_type', ['custom_domain', 'custom_subdomain', 'www_alias'])
    .limit(20);
  const fila = ((data || []) as FilaDominio[]).find((d) => {
    const apex = hostDeZona(d.host, d.domain_type);
    return apex != null && dominioDeEnvio(apex) === domain;
  });
  if (!fila) return;
  await provisionar(sb, fila);
}

/** Revisa pendientes y prepara dominios verificados que aún no tienen remitente. */
export async function revisarPendientesCorreoTienda(): Promise<{ revisados: number }> {
  const sb = getServiceClient();
  const { data: pendientes, error } = await sb
    .from('email_domains')
    .select('organization_id, domain')
    .in('status', ['pending', 'verifying'])
    .like('domain', 'send.%')
    .order('last_check_at', { ascending: true })
    .limit(LOTE);
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo leer la cola de correo.');
  let revisados = 0;
  for (const fila of (pendientes || []) as { organization_id: number; domain: string }[]) {
    await refrescarFila(sb, fila.organization_id, fila.domain);
    revisados += 1;
  }
  if (revisados >= LOTE) return { revisados };
  const { data: dominios, error: errorDominios } = await sb
    .from('organization_domains')
    .select('id, organization_id, host, domain_type, status, is_active')
    .eq('status', 'verified')
    .eq('is_active', true)
    .in('domain_type', ['custom_domain', 'custom_subdomain'])
    .limit(30);
  if (errorDominios) throw new ErrorCorreoTienda(500, 'No se pudieron leer los dominios.');
  for (const fila of (dominios || []) as FilaDominio[]) {
    if (revisados >= LOTE) break;
    const apex = hostDeZona(fila.host, fila.domain_type);
    if (!apex) continue;
    const correos = await correosDe(sb, fila.organization_id);
    if (yaTieneRemitenteVerificado(correos, apex)) continue;
    const envio = dominioDeEnvio(apex);
    if (envio && correos.some((c) => c.domain === envio)) continue;
    await provisionar(sb, fila);
    revisados += 1;
  }
  return { revisados };
}
