import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';

/** Se resuelve en la base por usuario y organización; nunca por nombre de rol. */
export async function exigirLecturaInformes(ctx: ServerOrgContext): Promise<void> {
  const respuestas = await Promise.allSettled(['finance.view', 'reports.finance'].map((code) => ctx.supabase.rpc('check_user_permission', {
    p_user_id: ctx.userId,
    p_organization_id: ctx.organizationId,
    p_permission_code: code,
  })));
  if (!respuestas.some((respuesta) => respuesta.status === 'fulfilled' && !respuesta.value.error && respuesta.value.data === true)) {
    throw new OrgContextError('No tiene permiso para consultar informes contables.', 403, 'FORBIDDEN');
  }
}
