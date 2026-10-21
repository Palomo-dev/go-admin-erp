/**
 * Correo de pedidos de la tienda. Una sola implementación.
 *
 * La base encola cuando el dominio queda principal y verificado. Este módulo
 * toma el trabajo (`FOR UPDATE SKIP LOCKED`), registra el dominio raíz en el
 * proveedor, publica los DNS que falten y vuelve a mirar hasta 72 horas.
 * Reejecutarlo no crea otro dominio ni otro registro igual.
 *
 * La organización llega de la sesión o de la fila, nunca de un cuerpo público.
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
  esAvisoLimitePlan,
  esperaReintentoMs,
  falloAlCrearDominio,
  hostDeZona,
  nombreRelativo,
  registrosDeProveedor,
  vencioPlazo,
  yaTieneRemitenteVerificado,
  type EstadoCorreoTienda,
  type RegistroDnsCorreo,
} from './correoTiendaReglas';

const LOTE = 5;

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
  is_primary: boolean;
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
  dns_provider: string | null;
  organization_domain_id: string | null;
  check_attempts: number | null;
  demoted_at: string | null;
}

interface JobReclamado {
  job_id: string;
  organization_id: number;
  organization_domain_id: string | null;
  accion: string;
  creado_en: string;
  intentos: number;
  id_proveedor: string | null;
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
    if (!tipo || !texto) return [];
    return [{ tipo, nombre: nombreRelativo(nombre, zona) || nombre || '@', valor: texto }];
  });
}

async function leerDominio(sb: SupabaseClient, organizationId: number, domainId: string): Promise<FilaDominio> {
  const { data, error } = await sb
    .from('organization_domains')
    .select('id, organization_id, host, domain_type, status, is_active, is_primary')
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
    .select('id, domain, status, from_email, from_name, provider_domain_id, dns_records, is_default, last_error, dns_provider, organization_domain_id, check_attempts, demoted_at')
    .eq('organization_id', organizationId);
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo leer el correo de la tienda.');
  return (data || []) as FilaCorreo[];
}

function filaDe(correos: FilaCorreo[], domainId: string, apex: string): FilaCorreo | undefined {
  return correos.find((c) => c.organization_domain_id === domainId)
    ?? correos.find((c) => c.domain === apex || c.domain === `send.${apex}`);
}

function estadoDeFilas(fila: FilaDominio, correos: FilaCorreo[]): EstadoCorreoTienda {
  const apex = hostDeZona(fila.host, fila.domain_type);
  if (!apex) return vacio({ estado: 'no_aplica' });
  const propio = filaDe(correos, fila.id, apex);
  const desde = `pedidos@${apex}`;
  if (!propio) {
    return vacio({
      estado: 'sin_configurar',
      desde,
      dnsEnVercel: true,
      error: fila.status === 'verified' && fila.is_primary ? null : 'Primero verifica el dominio y márcalo como principal.',
    });
  }
  const estadoBase = propio.status === 'verified' || propio.status === 'pending' || propio.status === 'verifying' || propio.status === 'failed'
    ? propio.status
    : 'pending';
  const estado = esAvisoLimitePlan(propio.last_error) ? 'failed' : estadoBase;
  return vacio({
    estado,
    desde: propio.from_email || desde,
    registros: registrosVisibles(propio.dns_records, apex),
    dnsEnVercel: propio.dns_provider !== 'externo',
    error: propio.last_error,
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
  const json = method === 'DELETE' ? null : await respuesta.json().catch(() => null);
  return { ok: respuesta.ok, status: respuesta.status, json };
}

async function idEnResend(nombre: string): Promise<{ id: string; records: unknown; status: string | null } | null> {
  const lista = await llamarResend('/domains', 'GET');
  const filas = Array.isArray(lista.json?.data) ? lista.json.data : Array.isArray(lista.json) ? lista.json : [];
  const hallado = filas.find((fila: { name?: string }) => String(fila?.name || '').toLowerCase() === nombre);
  if (!hallado?.id) return null;
  return { id: String(hallado.id), records: hallado.records ?? [], status: hallado.status ?? null };
}

type AltaProveedor =
  | { ok: true; id: string; records: unknown; status: string | null }
  | { ok: false; mensaje: string; limitePlan: boolean };

async function asegurarEnProveedor(nombre: string, idConocido: string | null): Promise<AltaProveedor> {
  if (idConocido) {
    const fresco = await llamarResend(`/domains/${encodeURIComponent(idConocido)}`, 'GET');
    if (fresco.ok && fresco.json?.id) {
      return { ok: true, id: String(fresco.json.id), records: fresco.json.records ?? [], status: fresco.json.status ?? null };
    }
  }
  const creado = await llamarResend('/domains', 'POST', { name: nombre, region: REGION_CORREO_TIENDA });
  const id = creado.ok ? String(creado.json?.id || '') : '';
  if (id) return { ok: true, id, records: creado.json?.records ?? [], status: creado.json?.status ?? null };
  const existente = await idEnResend(nombre);
  if (existente) return { ok: true, ...existente };
  const fallo = falloAlCrearDominio(creado.status, creado.json);
  return { ok: false, mensaje: fallo.mensaje, limitePlan: fallo.limitePlan };
}

async function publicarDns(zona: string, registros: RegistroDnsCorreo[], yaExterno: boolean): Promise<{ dnsProvider: 'vercel' | 'externo'; error: string | null; dmarc: boolean }> {
  const hayDmarc = registros.some((r) => nombreRelativo(r.nombre, zona) === '_dmarc');
  if (yaExterno) return { dnsProvider: 'externo', error: MENSAJE_DNS_AJENO, dmarc: hayDmarc };
  const cfg = configuracionRegistrador();
  if (!cfg) return { dnsProvider: 'externo', error: MENSAJE_DNS_AJENO, dmarc: hayDmarc };
  const camino = `/v2/domains/${encodeURIComponent(zona)}/records?teamId=${encodeURIComponent(cfg.teamId)}`;
  const leer = await fetch(`https://api.vercel.com${camino}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: 'no-store',
  });
  if (leer.status === 403 || leer.status === 404) return { dnsProvider: 'externo', error: MENSAJE_DNS_AJENO, dmarc: hayDmarc };
  if (!leer.ok) return { dnsProvider: 'vercel', error: `No se pudieron leer los registros (${leer.status}).`, dmarc: hayDmarc };
  const cuerpo = await leer.json().catch(() => ({})) as { records?: { type?: string; name?: string; value?: string }[] } | { type?: string; name?: string; value?: string }[];
  const lista = Array.isArray(cuerpo) ? cuerpo : (cuerpo.records || []);
  const existentes = lista.map((r) => ({
    tipo: String(r.type || ''),
    nombre: String(r.name || ''),
    valor: String(r.value || ''),
  }));
  const dmarcPrevio = existentes.some((e) => e.tipo.toUpperCase() === 'TXT' && nombreRelativo(e.nombre, zona) === '_dmarc');
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
    if (creado.status === 403 || creado.status === 404) return { dnsProvider: 'externo', error: MENSAJE_DNS_AJENO, dmarc: hayDmarc || dmarcPrevio };
    if (!creado.ok) return { dnsProvider: 'vercel', error: `No se pudo crear un registro (${creado.status}).`, dmarc: hayDmarc || dmarcPrevio };
    existentes.push({ tipo: registro.tipo, nombre: nombreRelativo(registro.nombre, zona), valor: registro.valor });
  }
  return { dnsProvider: 'vercel', error: null, dmarc: hayDmarc || dmarcPrevio };
}

async function datosTienda(sb: SupabaseClient, organizationId: number): Promise<{ nombre: string; replyTo: string | null }> {
  const { data: org } = await sb.from('organizations').select('name, email').eq('id', organizationId).maybeSingle();
  const nombre = String(org?.name || 'Tienda').replace(/[\r\n<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Tienda';
  const correo = typeof org?.email === 'string' ? org.email.trim().toLowerCase() : '';
  const replyTo = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(correo) ? correo : null;
  return { nombre, replyTo };
}

async function guardar(
  sb: SupabaseClient,
  organizationId: number,
  domainId: string,
  entrada: {
    domain: string;
    providerDomainId: string | null;
    status: string;
    records: RegistroDnsCorreo[];
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    error: string | null;
    dnsProvider: 'vercel' | 'externo' | null;
    intentos: number;
    dmarc: boolean;
    predeterminado: boolean;
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
    dmarc_configured: entrada.dmarc,
    from_name: entrada.fromName,
    from_email: entrada.fromEmail,
    reply_to: entrada.replyTo,
    dns_provider: entrada.dnsProvider,
    organization_domain_id: domainId,
    check_attempts: entrada.intentos,
    last_check_at: ahora,
    last_error: entrada.error,
    updated_at: ahora,
    demoted_at: null,
    ...(entrada.status === 'verified' ? { verified_at: ahora } : {}),
  };
  let id = previo?.id as string | undefined;
  if (id) {
    const { error } = await sb.from('email_domains').update(campos).eq('id', id).eq('organization_id', organizationId);
    if (error) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
  } else {
    const { data, error } = await sb.from('email_domains').insert({
      organization_id: organizationId,
      domain: entrada.domain,
      is_default: false,
      ...campos,
    }).select('id').maybeSingle();
    if (error) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
    id = data?.id as string | undefined;
  }
  if (entrada.predeterminado && id) {
    const { error: baja } = await sb
      .from('email_domains')
      .update({ is_default: false, updated_at: ahora })
      .eq('organization_id', organizationId)
      .eq('is_default', true)
      .neq('id', id);
    if (baja) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
    const { error: alta } = await sb
      .from('email_domains')
      .update({ is_default: true, demoted_at: null, updated_at: ahora })
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (alta) throw new ErrorCorreoTienda(500, 'No se pudo guardar el correo de la tienda.');
  }
}

async function cerrarJob(
  sb: SupabaseClient,
  job: JobReclamado,
  status: 'done' | 'failed' | 'cancelled' | 'pending',
  extra: { runAfter?: string; error?: string | null } = {},
): Promise<void> {
  const { error } = await sb
    .from('email_domain_jobs')
    .update({
      status,
      run_after: extra.runAfter ?? new Date().toISOString(),
      last_error: extra.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.job_id)
    .eq('organization_id', job.organization_id);
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo cerrar el trabajo de correo.');
}

async function reprogramar(sb: SupabaseClient, job: JobReclamado, error: string | null): Promise<void> {
  if (vencioPlazo(job.creado_en, new Date())) {
    if (job.organization_domain_id) {
      await sb
        .from('email_domains')
        .update({
          status: 'failed',
          last_error: error || 'No se pudo verificar el correo en 72 horas.',
          last_check_at: new Date().toISOString(),
          check_attempts: job.intentos,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', job.organization_id)
        .eq('organization_domain_id', job.organization_domain_id);
    }
    await cerrarJob(sb, job, 'failed', { error: error || 'No se pudo verificar el correo en 72 horas.' });
    return;
  }
  const runAfter = new Date(Date.now() + esperaReintentoMs(job.intentos)).toISOString();
  if (job.organization_domain_id) {
    await sb
      .from('email_domains')
      .update({
        last_error: error,
        last_check_at: new Date().toISOString(),
        check_attempts: job.intentos,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', job.organization_id)
      .eq('organization_domain_id', job.organization_domain_id);
  }
  await cerrarJob(sb, job, 'pending', { runAfter, error });
}

/** El cupo del plan no se arregla reintentando. Queda en error hasta Reintentar. */
async function fallarSinReintento(
  sb: SupabaseClient,
  job: JobReclamado,
  apex: string,
  domainId: string,
  mensaje: string,
): Promise<void> {
  await asegurarFila(sb, job, apex, domainId, mensaje);
  const { error } = await sb
    .from('email_domains')
    .update({
      status: 'failed',
      last_error: mensaje,
      last_check_at: new Date().toISOString(),
      check_attempts: job.intentos,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', job.organization_id)
    .eq('organization_domain_id', domainId);
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo guardar el error del correo.');
  await cerrarJob(sb, job, 'failed', { error: mensaje });
}

async function usarElQueYaEsta(sb: SupabaseClient, job: JobReclamado, apex: string, correos: FilaCorreo[]): Promise<void> {
  const fila = correos.find((c) => c.status === 'verified' && (c.domain === apex || c.domain === `send.${apex}`));
  if (fila && job.organization_domain_id && !fila.organization_domain_id) {
    await sb
      .from('email_domains')
      .update({ organization_domain_id: job.organization_domain_id, demoted_at: null, updated_at: new Date().toISOString() })
      .eq('id', fila.id)
      .eq('organization_id', job.organization_id)
      .is('organization_domain_id', null);
  }
  if (fila && !fila.is_default) {
    const ahora = new Date().toISOString();
    await sb.from('email_domains').update({ is_default: false, updated_at: ahora }).eq('organization_id', job.organization_id).eq('is_default', true).neq('id', fila.id);
    await sb.from('email_domains').update({ is_default: true, demoted_at: null, updated_at: ahora }).eq('id', fila.id).eq('organization_id', job.organization_id);
  }
  await cerrarJob(sb, job, 'done');
}

/** Deja una fila para que el panel muestre el error antes del primer alta en el proveedor. */
async function asegurarFila(
  sb: SupabaseClient,
  job: JobReclamado,
  apex: string,
  domainId: string,
  error: string | null,
): Promise<void> {
  const correos = await correosDe(sb, job.organization_id);
  if (filaDe(correos, domainId, apex)) return;
  const tienda = await datosTienda(sb, job.organization_id);
  await guardar(sb, job.organization_id, domainId, {
    domain: apex,
    providerDomainId: job.id_proveedor,
    status: 'pending',
    records: [],
    fromName: tienda.nombre,
    fromEmail: `pedidos@${apex}`,
    replyTo: tienda.replyTo,
    error,
    dnsProvider: null,
    intentos: job.intentos,
    dmarc: false,
    predeterminado: false,
  });
}

async function provisionar(sb: SupabaseClient, job: JobReclamado): Promise<void> {
  if (!job.organization_domain_id) {
    await cerrarJob(sb, job, 'failed', { error: 'El trabajo no tiene dominio.' });
    return;
  }
  const { data, error } = await sb
    .from('organization_domains')
    .select('id, organization_id, host, domain_type, status, is_active, is_primary')
    .eq('id', job.organization_domain_id)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo leer el dominio.');
  const fila = data as FilaDominio | null;
  const apex = fila ? hostDeZona(fila.host, fila.domain_type) : null;
  if (!fila || !apex || !fila.is_primary || !fila.is_active || fila.status !== 'verified') {
    await cerrarJob(sb, job, 'cancelled');
    return;
  }
  const correos = await correosDe(sb, job.organization_id);
  if (yaTieneRemitenteVerificado(correos, apex)) {
    await usarElQueYaEsta(sb, job, apex, correos);
    return;
  }
  if (vencioPlazo(job.creado_en, new Date())) {
    const mensaje = 'No se pudo verificar el correo en 72 horas.';
    await asegurarFila(sb, job, apex, fila.id, mensaje);
    await reprogramar(sb, job, mensaje);
    return;
  }
  if (!getMasterResendKey()) {
    const mensaje = 'Falta la clave de envío de la plataforma.';
    await asegurarFila(sb, job, apex, fila.id, mensaje);
    await reprogramar(sb, job, mensaje);
    return;
  }
  const previo = filaDe(correos, fila.id, apex);
  const remoto = await asegurarEnProveedor(apex, previo?.provider_domain_id || job.id_proveedor);
  if (!remoto.ok) {
    if (remoto.limitePlan) {
      await fallarSinReintento(sb, job, apex, fila.id, remoto.mensaje);
      return;
    }
    await asegurarFila(sb, job, apex, fila.id, remoto.mensaje);
    await reprogramar(sb, job, remoto.mensaje);
    return;
  }
  const dns = registrosDeProveedor(remoto.records, apex);
  const publicado = await publicarDns(apex, dns, previo?.dns_provider === 'externo');
  await llamarResend(`/domains/${encodeURIComponent(remoto.id)}/verify`, 'POST');
  const fresco = await llamarResend(`/domains/${encodeURIComponent(remoto.id)}`, 'GET');
  const recordsFinales = registrosDeProveedor(fresco.json?.records ?? remoto.records, apex);
  const estado = mapProviderStatus(typeof fresco.json?.status === 'string' ? fresco.json.status : remoto.status, true);
  const tienda = await datosTienda(sb, job.organization_id);
  const verificado = estado === 'verified';
  await guardar(sb, job.organization_id, fila.id, {
    domain: apex,
    providerDomainId: remoto.id,
    status: verificado ? 'verified' : 'pending',
    records: recordsFinales,
    fromName: tienda.nombre,
    fromEmail: `pedidos@${apex}`,
    replyTo: tienda.replyTo,
    error: publicado.error,
    dnsProvider: publicado.dnsProvider,
    intentos: job.intentos,
    dmarc: publicado.dmarc || recordsFinales.some((r) => nombreRelativo(r.nombre, apex) === '_dmarc'),
    predeterminado: verificado,
  });
  if (verificado) {
    await cerrarJob(sb, job, 'done');
    return;
  }
  await reprogramar(sb, job, publicado.error || (estado === 'failed' ? 'El proveedor aún no verifica el dominio.' : null));
}

async function retirar(sb: SupabaseClient, job: JobReclamado): Promise<void> {
  if (job.organization_domain_id) {
    const { data } = await sb
      .from('organization_domains')
      .select('id, organization_id, host, domain_type, status, is_active, is_primary')
      .eq('id', job.organization_domain_id)
      .eq('organization_id', job.organization_id)
      .maybeSingle();
    const fila = data as FilaDominio | null;
    if (fila && fila.is_primary && fila.is_active && fila.status === 'verified' && hostDeZona(fila.host, fila.domain_type)) {
      await sb
        .from('email_domains')
        .update({ demoted_at: null, updated_at: new Date().toISOString() })
        .eq('organization_id', job.organization_id)
        .eq('organization_domain_id', job.organization_domain_id);
      await cerrarJob(sb, job, 'cancelled');
      return;
    }
  }
  const { data: correo } = await sb
    .from('email_domains')
    .select('id, provider_domain_id, demoted_at, organization_domain_id')
    .eq('organization_id', job.organization_id)
    .eq('provider_domain_id', job.id_proveedor || '')
    .maybeSingle();
  const idProveedor = (correo?.provider_domain_id as string | null) || job.id_proveedor;
  if (!idProveedor) {
    await cerrarJob(sb, job, 'done');
    return;
  }
  const demoted = correo?.demoted_at ? Date.parse(String(correo.demoted_at)) : NaN;
  if (Number.isFinite(demoted) && Date.now() < demoted + 30 * 24 * 60 * 60 * 1000) {
    await cerrarJob(sb, job, 'pending', { runAfter: new Date(demoted + 30 * 24 * 60 * 60 * 1000).toISOString() });
    return;
  }
  const baja = await llamarResend(`/domains/${encodeURIComponent(idProveedor)}`, 'DELETE');
  if (!baja.ok && baja.status !== 404 && baja.status !== 0) {
    await reprogramar(sb, job, `No se pudo retirar el dominio del proveedor (${baja.status}).`);
    return;
  }
  if (correo?.id) {
    await sb
      .from('email_domains')
      .update({
        provider_domain_id: null,
        is_default: false,
        status: 'failed',
        last_error: 'Dejó de ser el dominio principal hace 30 días.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', correo.id)
      .eq('organization_id', job.organization_id);
  }
  await cerrarJob(sb, job, 'done');
}

async function despachar(sb: SupabaseClient, job: JobReclamado): Promise<void> {
  if (job.accion === 'retirar_correo') {
    await retirar(sb, job);
    return;
  }
  await provisionar(sb, job);
}

async function reclamar(sb: SupabaseClient, organizationId: number | null): Promise<JobReclamado[]> {
  const { data, error } = await sb.rpc('fn_reclamar_jobs_correo_tienda', {
    p_organization_id: organizationId,
    p_lote: organizationId == null ? LOTE : 1,
  });
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo tomar la cola de correo.');
  return (Array.isArray(data) ? data : []) as JobReclamado[];
}

/** Cron y botón. `organizationId` limita el lote a esa tienda. */
export async function revisarPendientesCorreoTienda(organizationId: number | null = null): Promise<{ revisados: number }> {
  const sb = getServiceClient();
  const jobs = await reclamar(sb, organizationId);
  for (const job of jobs) {
    try {
      await despachar(sb, job);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo preparar el correo.';
      console.error('[correo-dominio-tienda]', { organizationId: job.organization_id, mensaje });
      try {
        await reprogramar(sb, job, mensaje);
      } catch (cierre) {
        console.error('[correo-dominio-tienda] no se pudo reprogramar', {
          organizationId: job.organization_id,
          mensaje: cierre instanceof Error ? cierre.message : String(cierre),
        });
      }
    }
  }
  return { revisados: jobs.length };
}

export async function leerEstadoCorreoTienda(organizationId: number, domainId: string): Promise<EstadoCorreoTienda> {
  const sb = getServiceClient();
  const fila = await leerDominio(sb, organizationId, domainId);
  return estadoDeFilas(fila, await correosDe(sb, organizationId));
}

/** Botón Reintentar: vuelve a encolar y procesa ese dominio. */
export async function verificarCorreoTienda(organizationId: number, domainId: string): Promise<EstadoCorreoTienda> {
  const sb = getServiceClient();
  const { error } = await sb.rpc('fn_reintentar_correo_tienda', {
    p_organization_id: organizationId,
    p_domain_id: domainId,
  });
  if (error) throw new ErrorCorreoTienda(500, 'No se pudo reintentar el correo.');
  await revisarPendientesCorreoTienda(organizationId);
  return leerEstadoCorreoTienda(organizationId, domainId);
}

/** Lo llama la verificación del dominio. Un fallo de correo no la tumba. */
export async function encolarYProcesarCorreoTienda(organizationId: number, _domainId: string): Promise<void> {
  await revisarPendientesCorreoTienda(organizationId);
}
