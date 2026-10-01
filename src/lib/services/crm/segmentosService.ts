import { getServiceClient } from '@/lib/supabase/server-service';
import { CRM_PERMISOS, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';
import { normalizarFiltroSegmento } from './segmentosLogica';
import { filtroDeIdsSegmento } from './segmentosImportacionLogica';
import { CrmHttpError, exigirUuid } from './crmErrors';
import { leerAudienciaSegmento, obtenerSegmento, type SegmentoRegistro } from './segmentosAudiencia';
export { leerAudienciaSegmento, obtenerSegmento } from './segmentosAudiencia';
export type { SegmentoRegistro, CifrasSegmento, LecturaSegmento } from './segmentosAudiencia';

export async function guardarSegmento(
  ctx: CrmSesion,
  input: {
    id?: string;
    name: string;
    description?: string | null;
    filter_json: unknown;
    is_dynamic: boolean;
    expected_updated_at?: string;
    refresh_members?: boolean;
    member_ids?: string[];
  },
): Promise<SegmentoRegistro> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'guardar segmento');
  if (input.member_ids && input.is_dynamic) throw new CrmHttpError(400, 'tipo_invalido', 'La lista importada requiere un segmento estático');
  const filter = input.member_ids ? filtroDeIdsSegmento(input.member_ids) : normalizarFiltroSegmento(input.filter_json);
  const old = input.id ? await obtenerSegmento(ctx.organizationId, input.id, ctx.supabase) : null;
  const retain = old?.is_dynamic === false && !input.is_dynamic && !input.refresh_members && !input.member_ids;
  const read = retain || input.member_ids
    ? null
    : await leerAudienciaSegmento(ctx.organizationId, ctx.supabase, {
        filter,
        collectIds: !input.is_dynamic,
      });
  // Actor y organización validados arriba. RPC privada: snapshot + auditoría en la misma transacción.
  const { data, error } = await getServiceClient().rpc('crm_save_segment', {
    p_org: ctx.organizationId,
    p_actor: ctx.userId,
    p_id: input.id ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_filter: filter,
    p_dynamic: input.is_dynamic,
    p_count: input.member_ids?.length ?? read?.counts.total ?? 0,
    p_members: input.member_ids ?? (input.is_dynamic || retain ? null : read?.ids),
    p_expected: input.expected_updated_at ?? null,
  });
  if (error) throw error;
  return data as SegmentoRegistro;
}

export async function copiarSegmento(ctx: CrmSesion, id: string, name: string): Promise<SegmentoRegistro> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'copiar segmento');
  exigirUuid(id);
  const { data, error } = await getServiceClient().rpc('crm_duplicate_segment', { p_org: ctx.organizationId, p_actor: ctx.userId, p_id: id, p_name: name });
  if (error) throw error;
  return data as SegmentoRegistro;
}
export async function borrarSegmento(ctx: CrmSesion, id: string, expected: string): Promise<void> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'borrar segmento');
  exigirUuid(id);
  const { error } = await getServiceClient().rpc('crm_delete_segment', { p_org: ctx.organizationId, p_actor: ctx.userId, p_id: id, p_expected: expected });
  if (error) throw error;
}
