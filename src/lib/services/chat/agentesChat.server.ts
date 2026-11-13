/**
 * Agentes del Chat y asignación de conversaciones, resueltos en el servidor
 * (regla dura 6). Figma 91-chat-02: «Asignado a» con nombre y avatar,
 * buscador, carga abierta de cada persona y «Quitar asignación». Solo
 * aparecen —y solo se puede asignar a— personas que pueden entrar al Chat.
 *
 * Datos: miembros, cargos y perfiles se leen con el cliente de servicio
 * SIEMPRE filtrado por la organización de la sesión (los perfiles de otros
 * miembros no son legibles con RLS); la escritura de la asignación usa el
 * cliente de la sesión, así el trigger `fn_track_conversation_assignment`
 * registra quién asignó (con `auth.uid()`) en `conversation_assignments`. Por
 * eso aquí NO se inserta a mano en esa tabla: quedaría duplicada.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolverCargoMiembro, type FilaAccesoModulo } from '@/lib/navigation/accesoCargo';
import { defaultLocale, isValidLocale, type Locale } from '@/i18n/config';
import {
  agenteAsignado,
  cargoPuedeUsarChat,
  contarPorAgente,
  nombrePersona,
  ordenarAgentes,
  type AgenteChat,
} from './agentesChat';

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

interface MiembroFila {
  id: number;
  user_id: string;
  is_super_admin: boolean | null;
  job_position_id: string | null;
}

interface PerfilFila {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: string | null;
}

/** Tipo de la notificación interna al asignar. */
export const TIPO_AVISO_ASIGNACION = 'chat_conversacion_asignada';

async function leerPerfiles(ids: string[]): Promise<Map<string, PerfilFila>> {
  if (ids.length === 0) return new Map();
  const { data } = await getServiceClient()
    .from('profiles')
    .select('id, first_name, last_name, email, avatar_url, preferred_language')
    .in('id', ids);
  return new Map(((data ?? []) as PerfilFila[]).map((p) => [p.id, p]));
}

/**
 * Personas de la organización de la sesión que pueden atender el Chat, con su
 * nombre, avatar, cargo y conversaciones abiertas asignadas.
 */
export async function listarAgentesChat(ctx: Ctx): Promise<AgenteChat[]> {
  const db = getServiceClient();
  const { data: filasMiembros, error } = await db
    .from('organization_members')
    .select('id, user_id, is_super_admin, job_position_id')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .limit(1000);
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);
  const miembros = (filasMiembros ?? []) as MiembroFila[];
  if (miembros.length === 0) return [];

  // Cargo de respaldo (empleo activo) para quien no lo tiene en la membresía.
  const sinCargo = miembros.filter((m) => !m.is_super_admin && !m.job_position_id).map((m) => m.id);
  const cargoEmpleo = new Map<number, string>();
  if (sinCargo.length > 0) {
    const { data } = await db
      .from('employments')
      .select('organization_member_id, position_id, created_at')
      .in('organization_member_id', sinCargo)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    for (const e of (data ?? []) as { organization_member_id: number; position_id: string | null }[]) {
      if (e.position_id && !cargoEmpleo.has(Number(e.organization_member_id))) cargoEmpleo.set(Number(e.organization_member_id), e.position_id);
    }
  }

  // La MISMA regla de cargo del menú y el middleware, sin una consulta por persona.
  const cargos = new Map<number, string | null>();
  for (const m of miembros) {
    cargos.set(m.id, await resolverCargoMiembro(m, async (id) => cargoEmpleo.get(Number(id)) ?? null));
  }
  const idsCargo = [...new Set([...cargos.values()].filter((c): c is string => !!c))];

  let filasPorCargo: Map<string, FilaAccesoModulo[]> | null = new Map();
  const nombresCargo = new Map<string, string>();
  if (idsCargo.length > 0) {
    const [acceso, puestos] = await Promise.all([
      db.from('job_position_module_access').select('job_position_id, module_code, can_view, can_access').in('job_position_id', idsCargo),
      db.from('job_positions').select('id, name').eq('organization_id', ctx.organizationId).in('id', idsCargo),
    ]);
    if (acceso.error) {
      filasPorCargo = null; // fail open, como el middleware
    } else {
      for (const f of (acceso.data ?? []) as (FilaAccesoModulo & { job_position_id: string })[]) {
        const lista = filasPorCargo.get(f.job_position_id) ?? [];
        lista.push(f);
        filasPorCargo.set(f.job_position_id, lista);
      }
    }
    for (const p of (puestos.data ?? []) as { id: string; name: string | null }[]) {
      if (p.name) nombresCargo.set(p.id, p.name);
    }
  }

  const habilitados = miembros.filter((m) => cargoPuedeUsarChat(cargos.get(m.id) ?? null, filasPorCargo));
  const [perfiles, abiertas] = await Promise.all([
    leerPerfiles(habilitados.map((m) => m.user_id)),
    db
      .from('conversations')
      .select('assigned_member_id')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'open')
      .not('assigned_member_id', 'is', null)
      .limit(10000),
  ]);
  const carga = contarPorAgente((abiertas.data ?? []) as { assigned_member_id: number | null }[]);

  return ordenarAgentes(
    habilitados.map((m) => {
      const perfil = perfiles.get(m.user_id);
      const cargo = cargos.get(m.id);
      return {
        memberId: Number(m.id),
        userId: m.user_id,
        nombre: nombrePersona(perfil) ?? '—',
        avatarUrl: perfil?.avatar_url ?? null,
        cargo: cargo ? nombresCargo.get(cargo) ?? null : null,
        abiertas: carga.get(Number(m.id)) ?? 0,
        esYo: m.user_id === ctx.userId,
      };
    }),
  );
}

async function mensajes(locale: Locale): Promise<AbstractIntlMessages> {
  const mod = (await import(`../../../../messages/${locale}.json`)) as { default?: AbstractIntlMessages } & AbstractIntlMessages;
  return (mod.default ?? mod) as AbstractIntlMessages;
}

type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

/** Aviso interno a quien recibe la conversación, en su idioma. Nunca rompe la asignación. */
async function avisarAsignado(ctx: Ctx, agente: AgenteChat, asignador: string, conversationId: string, cliente: string): Promise<void> {
  try {
    const perfiles = await leerPerfiles([agente.userId]);
    const pref = perfiles.get(agente.userId)?.preferred_language ?? '';
    const locale: Locale = isValidLocale(pref) ? pref : defaultLocale;
    const t = createTranslator({ locale, messages: await mensajes(locale), namespace: 'chatBandeja.notificacion' }) as unknown as Traductor;
    const link = `/app/chat/conversaciones/${conversationId}`;
    const { error } = await ctx.supabase.rpc('fn_create_org_notification', {
      p_organization_id: ctx.organizationId,
      p_recipient_user_id: agente.userId,
      p_channel: 'app',
      p_type: TIPO_AVISO_ASIGNACION,
      p_title: t('titulo', { persona: asignador }),
      p_content: t('contenido', { persona: asignador, cliente }),
      p_metadata: { conversation_id: conversationId, href: link, link },
    });
    if (error) console.warn('[agentesChat] no se creó el aviso de asignación', { mensaje: error.message });
  } catch (err) {
    console.warn('[agentesChat] aviso de asignación', err instanceof Error ? err.message : err);
  }
}

/**
 * Asigna (o quita, con `memberId = null`) la conversación. Exige que quien
 * pide y quien recibe puedan usar el Chat, y que la conversación sea de la
 * organización de la sesión.
 */
export async function asignarConversacion(ctx: Ctx, conversationId: string, memberId: number | null): Promise<{ asignado: AgenteChat | null }> {
  const agentes = await listarAgentesChat(ctx);
  const yo = agentes.find((a) => a.esYo);
  if (!yo) throw new OrgContextError('No tienes acceso al Chat', 403, 'SIN_ACCESO_CHAT');
  const destino = memberId == null ? null : agenteAsignado(agentes, memberId);
  if (memberId != null && !destino) throw new OrgContextError('Esa persona no tiene acceso al Chat', 422, 'AGENTE_SIN_ACCESO');

  const { data: conv, error: errConv } = await ctx.supabase
    .from('conversations')
    .select('id, assigned_member_id, customer:customers(first_name, last_name, full_name)')
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errConv) throw new Error(`No se pudo leer la conversación: ${errConv.message}`);
  if (!conv) throw new OrgContextError('Conversación no encontrada', 404, 'NOT_FOUND');

  const fila = conv as { assigned_member_id: number | null; customer?: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null };
  if ((fila.assigned_member_id == null ? null : Number(fila.assigned_member_id)) === memberId) return { asignado: destino };

  const { data: actualizada, error } = await ctx.supabase
    .from('conversations')
    .update({ assigned_member_id: memberId })
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .select('id');
  if (error) throw new Error(`No se pudo asignar: ${error.message}`);
  if (!actualizada || actualizada.length === 0) throw new OrgContextError('No puedes cambiar esta conversación', 403, 'SIN_PERMISO');

  if (destino && !destino.esYo) {
    const cliente = fila.customer?.full_name || nombrePersona(fila.customer) || '';
    await avisarAsignado(ctx, destino, yo.nombre, conversationId, cliente);
  }
  return { asignado: destino };
}
