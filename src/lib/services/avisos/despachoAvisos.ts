/**
 * Despacho de los correos de avisos pendientes (`member_notices`). Solo
 * servidor, con la clave de servicio: el trigger o el servicio que creó el
 * aviso ya validó la organización y el destinatario es un miembro activo.
 *
 * Vive aparte de `despacho.server.ts` porque aquel importa `next/server`
 * (`after`) y el servidor de voz (ws-server, Railway) no puede cargarlo. El
 * agente de voz llama a `despacharAvisosPendientes` en el momento en que deja
 * su aviso (`voiceAgent/avisoDesinteres.ts`), igual que las rutas lo
 * programan con `programarDespachoAvisos`; el cron solo reintenta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { decisionCorreoOperativo, veredictoCorreoOperativo, type DecisionCorreoOperativo } from '@/lib/services/cuentaCorreo';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { EmailError, type EmailMessageStatus } from '@/lib/services/crm/email/types';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { htmlAviso, textoPlanoAviso, unirSeguimientoYCierre, urlAbsoluta } from './correo';
import { correoPermitido, enNoMolestar, minutosEnZona } from './reglas';

const LIMITE_CORREO = 40;

const ESTADOS_FALLIDOS = new Set<EmailMessageStatus>(['failed', 'bounced', 'complained']);

export interface ResumenAvisos {
  revisados: number;
  enviados: number;
  omitidos: number;
  fallidos: number;
  enPausa: number;
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

export async function zonaDe(db: SupabaseClient, cache: Map<number, string>, organizationId: number): Promise<string> {
  const guardada = cache.get(organizationId);
  if (guardada) return guardada;
  const zona = await getOrganizationTimezone(organizationId, db);
  cache.set(organizationId, zona);
  return zona;
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
