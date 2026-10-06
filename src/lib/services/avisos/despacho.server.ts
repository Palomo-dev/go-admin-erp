/**
 * Despacho de avisos al miembro. Solo servidor, con la clave de servicio:
 * el trigger ya validó la organización y el destinatario es un miembro activo.
 * El cron revisa vencimientos; el resto solo manda los correos pendientes.
 * Una cuenta suspendida, congelada o con la prueba vencida no recibe el correo
 * ni entra en el resumen diario.
 */
import { createHash } from 'crypto';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { decisionCorreoOperativo, veredictoCorreoOperativo, type DecisionCorreoOperativo } from '@/lib/services/cuentaCorreo';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { EmailError, type EmailMessageStatus } from '@/lib/services/crm/email/types';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { contextoMoneda, formatMoneda, localeDeOrganizacion } from '@/lib/utils/moneda';
import {
  copiaVencimiento,
  htmlAviso,
  textoCartera,
  textoContacto,
  textoInventarioCero,
  textoPlanoAviso,
  unirSeguimientoYCierre,
  urlAbsoluta,
} from './correo';
import {
  clasificarVencimiento,
  correoPermitido,
  enNoMolestar,
  esHoraDeResumen,
  eventoVencimiento,
  minutosEnZona,
  type EventoAviso,
} from './reglas';

const LIMITE_CORREO = 40;
const ESTADOS_FALLIDOS = new Set<EmailMessageStatus>(['failed', 'bounced', 'complained']);

export interface ResumenAvisos {
  revisados: number;
  enviados: number;
  omitidos: number;
  fallidos: number;
  enPausa: number;
}

interface FilaAviso {
  organization_id: number;
  recipient_user_id: string;
  event: EventoAviso;
  entity_type: 'task' | 'opportunity' | 'cash_session' | 'digest' | 'stock';
  entity_id: string;
  title: string;
  body: string;
  href: string;
  idempotency_key: string;
  email_status: 'pendiente';
  subject_key: string | null;
}

interface AvisoPendiente {
  id: string;
  organization_id: number;
  recipient_user_id: string;
  event: string;
  entity_id: string;
  title: string;
  body: string;
  href: string;
  idempotency_key: string;
}

interface PreferenciaCorreo {
  mute: boolean;
  allowed_types: string[] | null;
  dnd_start: string | null;
  dnd_end: string | null;
}

function vacio(): ResumenAvisos {
  return { revisados: 0, enviados: 0, omitidos: 0, fallidos: 0, enPausa: 0 };
}

function hrefDe(entidad: 'task' | 'opportunity', id: string): string {
  return entidad === 'task' ? `/app/pm/tareas?taskId=${id}` : `/app/crm/oportunidades/${id}`;
}

function diaDate(valor: unknown): string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : '';
}

function uuidDeLlave(llave: string): string {
  const hash = createHash('md5').update(llave).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function filaDe(entrada: Omit<FilaAviso, 'email_status'>): FilaAviso {
  return { ...entrada, email_status: 'pendiente' };
}

async function zonaDe(db: SupabaseClient, cache: Map<number, string>, organizationId: number): Promise<string> {
  const guardada = cache.get(organizationId);
  if (guardada) return guardada;
  const zona = await getOrganizationTimezone(organizationId, db);
  cache.set(organizationId, zona);
  return zona;
}

async function modulosActivos(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from('organization_modules').select('organization_id, module_code').eq('is_active', true);
  if (error) {
    console.error('[avisos] modulos', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((fila) => `${fila.organization_id}:${fila.module_code}`));
}

async function destinatariosDe(
  db: SupabaseClient,
  cache: Map<string, string[]>,
  organizationId: number,
  permiso: string,
): Promise<string[]> {
  const clave = `${organizationId}:${permiso}`;
  const guardados = cache.get(clave);
  if (guardados) return guardados;
  const { data, error } = await db.rpc('fn_avisos_miembro_destinatarios', { p_org: organizationId, p_code: permiso });
  if (error) {
    console.error('[avisos] destinatarios', error.message);
    cache.set(clave, []);
    return [];
  }
  const ids = ((data ?? []) as { user_id: string }[]).map((fila) => fila.user_id).filter((id) => !!id);
  cache.set(clave, ids);
  return ids;
}

async function seguimientosDeHoy(
  db: SupabaseClient,
  organizationId: number | undefined,
  activos: Set<string> | null,
  zonas: Map<number, string>,
): Promise<FilaAviso[]> {
  const desde = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const hasta = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  let consulta = db
    .from('opportunities')
    .select('id, organization_id, salesperson_id, name, next_contact_at')
    .eq('status', 'open')
    .not('salesperson_id', 'is', null)
    .not('next_contact_at', 'is', null)
    .gte('next_contact_at', desde)
    .lte('next_contact_at', hasta);
  if (organizationId) consulta = consulta.eq('organization_id', organizationId);
  const { data, error } = await consulta;
  if (error) {
    console.error('[avisos] contacto', error.message);
    return [];
  }
  const modulos = await modulosActivos(db);
  const filas: FilaAviso[] = [];
  for (const oportunidad of data ?? []) {
    const org = Number(oportunidad.organization_id);
    const destinatario = oportunidad.salesperson_id as string | null;
    const cuando = oportunidad.next_contact_at as string | null;
    if (!destinatario || !cuando || !modulos.has(`${org}:crm`)) continue;
    if (activos && !activos.has(`${org}:${destinatario}`)) continue;
    const zona = await zonaDe(db, zonas, org);
    const hoy = toPlainDate(new Date(), zona);
    if (toPlainDate(new Date(cuando), zona) !== hoy) continue;
    const copia = textoContacto(String(oportunidad.name ?? ''));
    filas.push(filaDe({
      organization_id: org,
      recipient_user_id: destinatario,
      event: 'oportunidad.contacto',
      entity_type: 'opportunity',
      entity_id: String(oportunidad.id),
      title: copia.titulo,
      body: copia.cuerpo,
      href: hrefDe('opportunity', String(oportunidad.id)),
      idempotency_key: `${org}:oportunidad.contacto:opportunity:${oportunidad.id}:${destinatario}:${hoy}`,
      subject_key: null,
    }));
  }
  return filas;
}

async function formatearDinero(db: SupabaseClient, cache: Map<number, (valor: number) => string>, organizationId: number): Promise<(valor: number) => string> {
  const guardado = cache.get(organizationId);
  if (guardado) return guardado;
  const moneda = await resolveOrgCurrency(db, organizationId);
  const { data } = await db.from('organizations').select('country_code, country').eq('id', organizationId).maybeSingle();
  const ctx = contextoMoneda(moneda.code, {
    decimals: moneda.decimals,
    locale: localeDeOrganizacion(
      (data as { country_code?: string | null; country?: string | null } | null)?.country_code,
      (data as { country_code?: string | null; country?: string | null } | null)?.country,
    ),
  });
  const formatear = (valor: number) => formatMoneda(valor, ctx);
  cache.set(organizationId, formatear);
  return formatear;
}

async function resumenesDeLaManana(
  db: SupabaseClient,
  organizationId: number | undefined,
  zonas: Map<number, string>,
): Promise<FilaAviso[]> {
  const [stock, cartera, modulos] = await Promise.all([
    db.rpc('fn_avisos_miembro_stock_cero'),
    db.rpc('fn_avisos_miembro_cartera'),
    modulosActivos(db),
  ]);
  if (stock.error) console.error('[avisos] stock', stock.error.message);
  if (cartera.error) console.error('[avisos] cartera', cartera.error.message);

  const filas: FilaAviso[] = [];
  const personas = new Map<string, string[]>();
  const dineros = new Map<number, (valor: number) => string>();
  const porSucursal = new Map<number, Map<string, { sucursal: string; nombres: string[] }>>();

  for (const linea of (stock.data ?? []) as { organization_id: number; branch_id: number; branch_name: string | null; product_name: string | null }[]) {
    const org = Number(linea.organization_id);
    if (organizationId && org !== organizationId) continue;
    if (!modulos.has(`${org}:inventory`)) continue;
    const zona = await zonaDe(db, zonas, org);
    if (!esHoraDeResumen(minutosEnZona(new Date(), zona))) continue;
    const sucursales = porSucursal.get(org) ?? new Map<string, { sucursal: string; nombres: string[] }>();
    const clave = String(linea.branch_id);
    const grupo = sucursales.get(clave) ?? { sucursal: (linea.branch_name ?? '').trim() || 'la sucursal', nombres: [] };
    grupo.nombres.push((linea.product_name ?? '').trim() || 'Sin nombre');
    sucursales.set(clave, grupo);
    porSucursal.set(org, sucursales);
  }

  for (const [org, sucursales] of porSucursal) {
    const zona = await zonaDe(db, zonas, org);
    const hoy = toPlainDate(new Date(), zona);
    const copia = textoInventarioCero([...sucursales.values()]);
    if (!copia) continue;
    for (const destinatario of await destinatariosDe(db, personas, org, 'inventory.view')) {
      const llave = `${org}:inventario.cero:digest:${destinatario}:${hoy}`;
      filas.push(filaDe({
        organization_id: org,
        recipient_user_id: destinatario,
        event: 'inventario.cero',
        entity_type: 'digest',
        entity_id: uuidDeLlave(llave),
        title: copia.titulo,
        body: copia.cuerpo,
        href: '/app/inventario/stock',
        idempotency_key: llave,
        subject_key: `inventario:${hoy}`,
      }));
    }
  }

  for (const linea of (cartera.data ?? []) as { organization_id: number; por_cobrar: number; saldo_cobrar: number; por_pagar: number; saldo_pagar: number }[]) {
    const org = Number(linea.organization_id);
    if (organizationId && org !== organizationId) continue;
    if (!modulos.has(`${org}:finance`)) continue;
    const zona = await zonaDe(db, zonas, org);
    if (!esHoraDeResumen(minutosEnZona(new Date(), zona))) continue;
    const dinero = await formatearDinero(db, dineros, org);
    const copia = textoCartera({
      porCobrar: Number(linea.por_cobrar) || 0,
      saldoCobrar: dinero(Number(linea.saldo_cobrar) || 0),
      porPagar: Number(linea.por_pagar) || 0,
      saldoPagar: dinero(Number(linea.saldo_pagar) || 0),
    });
    if (!copia) continue;
    const hoy = toPlainDate(new Date(), zona);
    for (const destinatario of await destinatariosDe(db, personas, org, 'finance.view')) {
      const llave = `${org}:cartera.resumen:digest:${destinatario}:${hoy}`;
      filas.push(filaDe({
        organization_id: org,
        recipient_user_id: destinatario,
        event: 'cartera.resumen',
        entity_type: 'digest',
        entity_id: uuidDeLlave(llave),
        title: copia.titulo,
        body: copia.cuerpo,
        href: '/app/finanzas/cuentas-por-cobrar',
        idempotency_key: llave,
        subject_key: `cartera:${hoy}`,
      }));
    }
  }

  return filas;
}

async function crearVencimientos(db: SupabaseClient, organizationId?: number): Promise<number> {
  let tareas = db
    .from('tasks')
    .select('id, organization_id, assigned_to, due_date, title, status')
    .in('status', ['open', 'in_progress'])
    .not('assigned_to', 'is', null)
    .not('due_date', 'is', null);
  let oportunidades = db
    .from('opportunities')
    .select('id, organization_id, salesperson_id, expected_close_date, name, status')
    .eq('status', 'open')
    .not('salesperson_id', 'is', null)
    .not('expected_close_date', 'is', null);
  if (organizationId) {
    tareas = tareas.eq('organization_id', organizationId);
    oportunidades = oportunidades.eq('organization_id', organizationId);
  }

  const [rTareas, rOportunidades] = await Promise.all([tareas, oportunidades]);
  if (rTareas.error) console.error('[avisos] tareas', rTareas.error.message);
  if (rOportunidades.error) console.error('[avisos] oportunidades', rOportunidades.error.message);

  const { data: miembros, error: errorMiembros } = await db
    .from('organization_members')
    .select('organization_id, user_id')
    .eq('is_active', true);
  if (errorMiembros) console.error('[avisos] miembros', errorMiembros.message);
  const activos = errorMiembros
    ? null
    : new Set((miembros ?? []).map((miembro) => `${miembro.organization_id}:${miembro.user_id}`));

  const zonas = new Map<number, string>();
  const filas: FilaAviso[] = [];

  for (const tarea of rTareas.data ?? []) {
    const org = Number(tarea.organization_id);
    const destinatario = tarea.assigned_to as string | null;
    const vence = tarea.due_date as string | null;
    if (!destinatario || !vence || (activos && !activos.has(`${org}:${destinatario}`))) continue;
    const zona = await zonaDe(db, zonas, org);
    const hoy = toPlainDate(new Date(), zona);
    const fecha = toPlainDate(new Date(vence), zona);
    const clase = clasificarVencimiento(fecha, hoy, true);
    if (!clase) continue;
    const evento = eventoVencimiento('task', clase);
    const copia = copiaVencimiento(evento, String(tarea.title ?? ''));
    if (!copia) continue;
    filas.push({
      organization_id: org,
      recipient_user_id: destinatario,
      event: evento,
      entity_type: 'task',
      entity_id: String(tarea.id),
      title: copia.titulo,
      body: copia.cuerpo,
      href: hrefDe('task', String(tarea.id)),
      idempotency_key: `${org}:${evento}:task:${tarea.id}:${destinatario}:${hoy}`,
      email_status: 'pendiente',
      subject_key: null,
    });
  }

  for (const oportunidad of rOportunidades.data ?? []) {
    const org = Number(oportunidad.organization_id);
    const destinatario = oportunidad.salesperson_id as string | null;
    if (!destinatario || (activos && !activos.has(`${org}:${destinatario}`))) continue;
    const zona = await zonaDe(db, zonas, org);
    const hoy = toPlainDate(new Date(), zona);
    const fecha = diaDate(oportunidad.expected_close_date);
    const clase = clasificarVencimiento(fecha, hoy, true);
    if (!clase) continue;
    const evento = eventoVencimiento('opportunity', clase);
    const copia = copiaVencimiento(evento, String(oportunidad.name ?? ''));
    if (!copia) continue;
    filas.push({
      organization_id: org,
      recipient_user_id: destinatario,
      event: evento,
      entity_type: 'opportunity',
      entity_id: String(oportunidad.id),
      title: copia.titulo,
      body: copia.cuerpo,
      href: hrefDe('opportunity', String(oportunidad.id)),
      idempotency_key: `${org}:${evento}:opportunity:${oportunidad.id}:${destinatario}:${hoy}`,
      email_status: 'pendiente',
      subject_key: null,
    });
  }

  filas.push(...(await seguimientosDeHoy(db, organizationId, activos, zonas)));
  filas.push(...(await resumenesDeLaManana(db, organizationId, zonas)));
  const vigentes = await sinCuentasCerradas(db, filas);

  for (let i = 0; i < vigentes.length; i += 100) {
    const lote = vigentes.slice(i, i + 100);
    const { error } = await db.from('member_notices').upsert(lote, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
    });
    if (error) console.error('[avisos] alta', error.message);
  }
  return vigentes.length;
}

/** No arma el aviso diario de una cuenta que ya no puede usar el sistema. */
async function sinCuentasCerradas(db: SupabaseClient, filas: FilaAviso[]): Promise<FilaAviso[]> {
  const decisiones = new Map<number, DecisionCorreoOperativo>();
  const vigentes: FilaAviso[] = [];
  for (const fila of filas) {
    const org = Number(fila.organization_id);
    let decision = decisiones.get(org);
    if (!decision) {
      decision = decisionCorreoOperativo(await veredictoCorreoOperativo(db, org));
      decisiones.set(org, decision);
    }
    if (decision !== 'omitir') vigentes.push(fila);
  }
  return vigentes;
}

async function marcar(db: SupabaseClient, id: string, estado: 'pendiente' | 'enviado' | 'omitido' | 'fallido'): Promise<void> {
  const { error } = await db.from('member_notices').update({ email_status: estado }).eq('id', id);
  if (error) console.error('[avisos] estado', error.message);
}

async function reclamar(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db
    .from('member_notices')
    .update({ email_status: 'enviando' })
    .eq('id', id)
    .eq('email_status', 'pendiente')
    .select('id');
  if (error) {
    console.error('[avisos] reclamar', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function miembroActivo(db: SupabaseClient, organizationId: number, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[avisos] miembro', error.message);
    return false;
  }
  return !!data;
}

async function preferenciaDe(
  db: SupabaseClient,
  cache: Map<string, PreferenciaCorreo | null>,
  userId: string,
): Promise<PreferenciaCorreo | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  const { data, error } = await db
    .from('user_notification_preferences')
    .select('mute, allowed_types, dnd_start, dnd_end')
    .eq('user_id', userId)
    .eq('channel', 'email')
    .maybeSingle();
  if (error) {
    console.error('[avisos] preferencia', error.message);
    cache.set(userId, null);
    return null;
  }
  const pref = (data as PreferenciaCorreo | null) ?? null;
  cache.set(userId, pref);
  return pref;
}

const PAREJA_AVISO: Record<string, string[]> = {
  'oportunidad.contacto': ['oportunidad.vence', 'oportunidad.atrasada'],
  'oportunidad.vence': ['oportunidad.contacto'],
  'oportunidad.atrasada': ['oportunidad.contacto'],
};

async function hermanoDe(db: SupabaseClient, fila: AvisoPendiente, hoy: string): Promise<AvisoPendiente | null> {
  const otros = PAREJA_AVISO[fila.event];
  if (!otros || !fila.entity_id) return null;
  const { data, error } = await db
    .from('member_notices')
    .select('id, organization_id, recipient_user_id, event, entity_id, title, body, href, idempotency_key')
    .eq('organization_id', fila.organization_id)
    .eq('recipient_user_id', fila.recipient_user_id)
    .eq('entity_id', fila.entity_id)
    .eq('email_status', 'pendiente')
    .in('event', otros)
    .neq('id', fila.id)
    .limit(5);
  if (error) {
    console.error('[avisos] pareja', error.message);
    return null;
  }
  return ((data ?? []) as AvisoPendiente[]).find((candidato) => candidato.idempotency_key.endsWith(`:${hoy}`)) ?? null;
}

function contenidoPareja(fila: AvisoPendiente, hermano: AvisoPendiente): { titulo: string; cuerpo: string; llave: string; ancla: string } {
  const contacto = fila.event === 'oportunidad.contacto' ? fila : hermano;
  const cierre = contacto === fila ? hermano : fila;
  const clase = cierre.event === 'oportunidad.atrasada' ? 'atrasada' : 'vence';
  return {
    titulo: contacto.title,
    cuerpo: unirSeguimientoYCierre(contacto.body, clase),
    llave: contacto.idempotency_key,
    ancla: contacto.id,
  };
}

async function nombreOrganizacion(db: SupabaseClient, cache: Map<number, string | undefined>, organizationId: number): Promise<string | undefined> {
  if (cache.has(organizationId)) return cache.get(organizationId);
  const { data } = await db.from('organizations').select('name').eq('id', organizationId).maybeSingle();
  const nombre = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : undefined;
  cache.set(organizationId, nombre);
  return nombre;
}

export async function despacharAvisosPendientes(organizationId?: number, db: SupabaseClient = getServiceClient()): Promise<ResumenAvisos> {
  const resumen = vacio();
  const corte = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let rezagados = db.from('member_notices').update({ email_status: 'pendiente' }).eq('email_status', 'enviando').lt('created_at', corte);
  if (organizationId) rezagados = rezagados.eq('organization_id', organizationId);
  const { error: errorRezagados } = await rezagados;
  if (errorRezagados) console.error('[avisos] rezagados', errorRezagados.message);

  let consulta = db
    .from('member_notices')
    .select('id, organization_id, recipient_user_id, event, entity_id, title, body, href, idempotency_key')
    .eq('email_status', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(LIMITE_CORREO);
  if (organizationId) consulta = consulta.eq('organization_id', organizationId);
  const { data, error } = await consulta;
  if (error) {
    console.error('[avisos] pendientes', error.message);
    return resumen;
  }

  const zonas = new Map<number, string>();
  const preferencias = new Map<string, PreferenciaCorreo | null>();
  const nombres = new Map<number, string | undefined>();
  const cuentas = new Map<number, DecisionCorreoOperativo>();
  const atendidos = new Set<string>();

  async function decisionDe(org: number): Promise<DecisionCorreoOperativo> {
    const guardada = cuentas.get(org);
    if (guardada) return guardada;
    const decision = decisionCorreoOperativo(await veredictoCorreoOperativo(db, org));
    cuentas.set(org, decision);
    return decision;
  }

  async function correoDe(userId: string): Promise<string | null> {
    const { data: perfil, error: errorPerfil } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (errorPerfil) {
      console.error('[avisos] perfil', errorPerfil.message);
      return null;
    }
    const correo = typeof perfil?.email === 'string' ? perfil.email.trim() : '';
    return correo || '';
  }

  async function enviar(
    fila: AvisoPendiente,
    correo: string,
    titulo: string,
    cuerpo: string,
    llave: string,
    ancla: string,
  ): Promise<'enviado' | 'fallido'> {
    const org = Number(fila.organization_id);
    try {
      const enlace = urlAbsoluta(fila.href);
      const contenido = { titulo, cuerpo, enlace };
      const resultado = await sendEmail(org, { userId: null, orgName: await nombreOrganizacion(db, nombres, org) }, {
        to: [correo],
        subject: titulo,
        content: { html: htmlAviso(contenido), text: textoPlanoAviso(contenido) },
        related_type: 'member_notice',
        related_id: ancla,
        kind: 'transactional',
        client_request_id: llave,
        strict_variables: false,
        avisoMiembro: true,
      }, db);
      const duplicado = resultado.warnings.includes('duplicate_client_request');
      if (duplicado && ESTADOS_FALLIDOS.has(resultado.message.status)) return 'fallido';
      return 'enviado';
    } catch (err) {
      console.error('[avisos] correo', err instanceof EmailError ? err.code : 'error');
      return 'fallido';
    }
  }

  for (const fila of (data ?? []) as AvisoPendiente[]) {
    if (atendidos.has(fila.id)) continue;
    const org = Number(fila.organization_id);
    const zona = await zonaDe(db, zonas, org);
    const hoy = toPlainDate(new Date(), zona);
    const hermano = await hermanoDe(db, fila, hoy);
    if (hermano) atendidos.add(hermano.id);
    atendidos.add(fila.id);

    if (!(await reclamar(db, fila.id))) continue;
    const decision = await decisionDe(org);
    if (decision !== 'enviar') {
      const estado = decision === 'omitir' ? 'omitido' : 'pendiente';
      await marcar(db, fila.id, estado);
      if (estado === 'omitido') resumen.omitidos += 1;
      if (hermano && (await reclamar(db, hermano.id))) {
        await marcar(db, hermano.id, estado);
        if (estado === 'omitido') resumen.omitidos += 1;
      }
      continue;
    }
    if (!(await miembroActivo(db, org, fila.recipient_user_id))) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      if (hermano && (await reclamar(db, hermano.id))) {
        await marcar(db, hermano.id, 'omitido');
        resumen.omitidos += 1;
      }
      continue;
    }

    const correo = await correoDe(fila.recipient_user_id);
    if (correo == null) {
      await marcar(db, fila.id, 'fallido');
      resumen.fallidos += 1;
      continue;
    }
    if (!correo) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      if (hermano && (await reclamar(db, hermano.id))) {
        await marcar(db, hermano.id, 'omitido');
        resumen.omitidos += 1;
      }
      continue;
    }

    const pref = await preferenciaDe(db, preferencias, fila.recipient_user_id);
    const permitido = correoPermitido(pref?.allowed_types, fila.event, pref?.mute === true);
    const permitidoHermano = hermano
      ? correoPermitido(pref?.allowed_types, hermano.event, pref?.mute === true)
      : false;
    if (!permitido && !permitidoHermano) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      if (hermano && (await reclamar(db, hermano.id))) {
        await marcar(db, hermano.id, 'omitido');
        resumen.omitidos += 1;
      }
      continue;
    }
    if (enNoMolestar(pref?.dnd_start, pref?.dnd_end, minutosEnZona(new Date(), zona))) {
      if (permitido) {
        await marcar(db, fila.id, 'pendiente');
        resumen.enPausa += 1;
      } else {
        await marcar(db, fila.id, 'omitido');
        resumen.omitidos += 1;
      }
      if (hermano && !permitidoHermano && (await reclamar(db, hermano.id))) {
        await marcar(db, hermano.id, 'omitido');
        resumen.omitidos += 1;
      }
      continue;
    }

    if (hermano && permitido && permitidoHermano) {
      if (!(await reclamar(db, hermano.id))) {
        const estado = await enviar(fila, correo, fila.title, fila.body, fila.idempotency_key, fila.id);
        await marcar(db, fila.id, estado);
        resumen[estado === 'enviado' ? 'enviados' : 'fallidos'] += 1;
        continue;
      }
      const junto = contenidoPareja(fila, hermano);
      const estado = await enviar(fila, correo, junto.titulo, junto.cuerpo, junto.llave, junto.ancla);
      await marcar(db, fila.id, estado);
      await marcar(db, hermano.id, estado);
      resumen[estado === 'enviado' ? 'enviados' : 'fallidos'] += 1;
      continue;
    }

    if (!permitido) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
    } else {
      const estado = await enviar(fila, correo, fila.title, fila.body, fila.idempotency_key, fila.id);
      await marcar(db, fila.id, estado);
      resumen[estado === 'enviado' ? 'enviados' : 'fallidos'] += 1;
    }

    if (hermano && permitidoHermano) {
      if (await reclamar(db, hermano.id)) {
        const estado = await enviar(hermano, correo, hermano.title, hermano.body, hermano.idempotency_key, hermano.id);
        await marcar(db, hermano.id, estado);
        resumen[estado === 'enviado' ? 'enviados' : 'fallidos'] += 1;
      }
    } else if (hermano && (await reclamar(db, hermano.id))) {
      await marcar(db, hermano.id, 'omitido');
      resumen.omitidos += 1;
    }
  }

  return resumen;
}

/**
 * No bloquea la respuesta del guardado. Si el correo falla, el cron lo reintenta.
 * Tampoco la tumba: `after()` lanza fuera de un request scope (tests, scripts)
 * y un guardado ya hecho no puede responder 500 por no poder programar el
 * correo. Los avisos siguen pendientes en la tabla y el cron los recoge.
 */
export function programarDespachoAvisos(organizationId: number): void {
  try {
    after(() => {
      void despacharAvisosPendientes(organizationId).catch((err) => {
        console.error('[avisos] despacho', err instanceof Error ? err.name : 'error');
      });
    });
  } catch (err) {
    console.warn('[avisos] despacho no programado; queda para el cron', err instanceof Error ? err.name : 'error');
  }
}

export async function correrAvisos(opts: { organizationId?: number; soloCorreo?: boolean } = {}): Promise<ResumenAvisos> {
  const db = getServiceClient();
  const revisados = opts.soloCorreo ? 0 : await crearVencimientos(db, opts.organizationId);
  const envio = await despacharAvisosPendientes(opts.organizationId, db);
  return { ...envio, revisados };
}
