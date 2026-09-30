/**
 * «Solicitar acceso» del gerente de una sede (Figma 14, `1382:44111`): avisa a
 * los administradores de la organización de que la persona quiere ver más
 * sucursales o los reportes de toda la organización.
 *
 * - Destinatarios: miembros activos con rol de administrador (`isOrgAdminLike`
 *   sobre `role_id` e `is_super_admin`; nunca por el nombre del rol).
 * - La notificación la crea `fn_create_org_notification` con el cliente de la
 *   sesión (exige membresía activa en la organización de la sesión).
 * - Una solicitud por persona cada `ESPERA_SOLICITUD_MS`: la repetición no
 *   vuelve a notificar. Leer las notificaciones ajenas exige el service role,
 *   con la organización ya validada por la sesión.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { getServiceClient } from '@/lib/supabase/server-service';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { nombreDePerfil } from './programados/programacion';

export const TIPO_SOLICITUD_ACCESO = 'reporte_solicitud_acceso';
export const ESPERA_SOLICITUD_MS = 6 * 60 * 60 * 1000;
const MAX_ADMINS = 50;

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

export interface SolicitudAcceso {
  reportId: string | null;
  sucursalId: number | null;
}

export interface ResultadoSolicitud {
  notificados: number;
  repetida: boolean;
}

export async function solicitarAccesoReportes(ctx: Ctx, solicitud: SolicitudAcceso, ahora: Date = new Date()): Promise<ResultadoSolicitud> {
  const desde = new Date(ahora.getTime() - ESPERA_SOLICITUD_MS).toISOString();
  const previa = await getServiceClient()
    .from('notifications')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .contains('payload', { type: TIPO_SOLICITUD_ACCESO, solicitante: ctx.userId })
    .gte('created_at', desde)
    .limit(1);
  if (previa.error) throw new Error(`No se pudo revisar la solicitud previa: ${previa.error.message}`);
  if ((previa.data ?? []).length > 0) return { notificados: 0, repetida: true };

  const [miembrosRes, perfilRes] = await Promise.all([
    ctx.supabase
      .from('organization_members')
      .select('user_id, role_id, is_super_admin')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .limit(500),
    ctx.supabase.from('profiles').select('first_name, last_name, email').eq('id', ctx.userId).maybeSingle(),
  ]);
  if (miembrosRes.error) throw new Error(`No se pudieron leer los miembros: ${miembrosRes.error.message}`);
  const admins = ((miembrosRes.data ?? []) as Array<{ user_id: string; role_id: number; is_super_admin: boolean | null }>)
    .filter((m) => m.user_id !== ctx.userId && isOrgAdminLike({ roleId: m.role_id, isSuperAdmin: m.is_super_admin === true }))
    .slice(0, MAX_ADMINS);
  if (admins.length === 0) throw new OrgContextError('La organización no tiene administradores a quien avisar', 409, 'sin_administradores');

  const nombre = nombreDePerfil(perfilRes.data as { first_name?: string | null; last_name?: string | null; email?: string | null } | null) ?? '—';
  let notificados = 0;
  for (const admin of admins) {
    const { error } = await ctx.supabase.rpc('fn_create_org_notification', {
      p_organization_id: ctx.organizationId,
      p_recipient_user_id: admin.user_id,
      p_channel: 'app',
      p_type: TIPO_SOLICITUD_ACCESO,
      p_title: 'Solicitud de acceso a reportes',
      p_content: `${nombre} pide acceso a más sucursales en Reportes.`,
      p_metadata: {
        solicitante: ctx.userId,
        report_id: solicitud.reportId,
        branch_id: solicitud.sucursalId,
        link: '/app/organizacion/miembros',
      },
    });
    if (error) console.warn('[reportes] no se creó la notificación de solicitud de acceso', { mensaje: error.message });
    else notificados += 1;
  }
  if (notificados === 0) throw new Error('No se pudo notificar a ningún administrador');
  return { notificados, repetida: false };
}
