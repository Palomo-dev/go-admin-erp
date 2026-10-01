/**
 * Despacho de avisos al miembro. Solo servidor, con la clave de servicio:
 * el trigger ya validó la organización y el destinatario es un miembro activo.
 * El cron revisa vencimientos; el resto solo manda los correos pendientes.
 */
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { EmailError, type EmailMessageStatus } from '@/lib/services/crm/email/types';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { copiaVencimiento, htmlAviso, textoPlanoAviso, urlAbsoluta } from './correo';
import {
  clasificarVencimiento,
  correoPermitido,
  enNoMolestar,
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
  entity_type: 'task' | 'opportunity';
  entity_id: string;
  title: string;
  body: string;
  href: string;
  idempotency_key: string;
  email_status: 'pendiente';
}

interface AvisoPendiente {
  id: string;
  organization_id: number;
  recipient_user_id: string;
  event: string;
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

async function zonaDe(db: SupabaseClient, cache: Map<number, string>, organizationId: number): Promise<string> {
  const guardada = cache.get(organizationId);
  if (guardada) return guardada;
  const zona = await getOrganizationTimezone(organizationId, db);
  cache.set(organizationId, zona);
  return zona;
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
    });
  }

  for (let i = 0; i < filas.length; i += 100) {
    const lote = filas.slice(i, i + 100);
    const { error } = await db.from('member_notices').upsert(lote, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
    });
    if (error) console.error('[avisos] alta', error.message);
  }
  return filas.length;
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
    .select('id, organization_id, recipient_user_id, event, title, body, href, idempotency_key')
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

  for (const fila of (data ?? []) as AvisoPendiente[]) {
    if (!(await reclamar(db, fila.id))) continue;
    const org = Number(fila.organization_id);
    if (!(await miembroActivo(db, org, fila.recipient_user_id))) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      continue;
    }

    const { data: perfil, error: errorPerfil } = await db
      .from('profiles')
      .select('email')
      .eq('id', fila.recipient_user_id)
      .maybeSingle();
    if (errorPerfil) {
      console.error('[avisos] perfil', errorPerfil.message);
      await marcar(db, fila.id, 'fallido');
      resumen.fallidos += 1;
      continue;
    }
    const correo = typeof perfil?.email === 'string' ? perfil.email.trim() : '';
    if (!correo) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      continue;
    }

    const pref = await preferenciaDe(db, preferencias, fila.recipient_user_id);
    if (!correoPermitido(pref?.allowed_types, fila.event, pref?.mute === true)) {
      await marcar(db, fila.id, 'omitido');
      resumen.omitidos += 1;
      continue;
    }

    const zona = await zonaDe(db, zonas, org);
    if (enNoMolestar(pref?.dnd_start, pref?.dnd_end, minutosEnZona(new Date(), zona))) {
      await marcar(db, fila.id, 'pendiente');
      resumen.enPausa += 1;
      continue;
    }

    try {
      const enlace = urlAbsoluta(fila.href);
      const contenido = { titulo: fila.title, cuerpo: fila.body, enlace };
      const resultado = await sendEmail(org, { userId: null, orgName: await nombreOrganizacion(db, nombres, org) }, {
        to: [correo],
        subject: fila.title,
        content: { html: htmlAviso(contenido), text: textoPlanoAviso(contenido) },
        related_type: 'member_notice',
        related_id: fila.id,
        kind: 'transactional',
        client_request_id: fila.idempotency_key,
        strict_variables: false,
        avisoMiembro: true,
      }, db);
      const duplicado = resultado.warnings.includes('duplicate_client_request');
      if (duplicado && ESTADOS_FALLIDOS.has(resultado.message.status)) {
        await marcar(db, fila.id, 'fallido');
        resumen.fallidos += 1;
      } else {
        await marcar(db, fila.id, 'enviado');
        resumen.enviados += 1;
      }
    } catch (err) {
      await marcar(db, fila.id, 'fallido');
      resumen.fallidos += 1;
      console.error('[avisos] correo', err instanceof EmailError ? err.code : 'error');
    }
  }

  return resumen;
}

/** No bloquea la respuesta del guardado. Si el correo falla, el cron lo reintenta. */
export function programarDespachoAvisos(organizationId: number): void {
  after(() => {
    void despacharAvisosPendientes(organizationId).catch((err) => {
      console.error('[avisos] despacho', err instanceof Error ? err.name : 'error');
    });
  });
}

export async function correrAvisos(opts: { organizationId?: number; soloCorreo?: boolean } = {}): Promise<ResumenAvisos> {
  const db = getServiceClient();
  const revisados = opts.soloCorreo ? 0 : await crearVencimientos(db, opts.organizationId);
  const envio = await despacharAvisosPendientes(opts.organizationId, db);
  return { ...envio, revisados };
}
