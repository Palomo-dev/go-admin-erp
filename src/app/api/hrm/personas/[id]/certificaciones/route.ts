/**
 * POST  /api/hrm/personas/[id]/certificaciones — { nombre, entidad?, expedicion?, vence?, documento_id? }
 * PATCH /api/hrm/personas/[id]/certificaciones — { id, …mismos campos, activa? }
 *
 * Certificaciones con vencimiento (Figma 20.3, pestaña Certificaciones). Van
 * con la sesión del usuario: la RLS exige hr.employees.edit y el trigger, que
 * la persona sea de la organización. No se borran: se retiran (`activa: false`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, esFechaPlana, esUuid } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

function campos(b: Record<string, unknown>, exigirNombre: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.nombre !== undefined || exigirNombre) {
    const n = typeof b.nombre === 'string' ? b.nombre.trim() : '';
    if (n.length < 2 || n.length > 160) throw new HrmError(422, 'nombre_obligatorio');
    out.name = n;
  }
  if (b.entidad !== undefined) out.issuer = typeof b.entidad === 'string' && b.entidad.trim() ? b.entidad.trim().slice(0, 160) : null;
  for (const [k, col] of [
    ['expedicion', 'issued_on'],
    ['vence', 'expires_on'],
  ] as const) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === '') out[col] = null;
    else if (esFechaPlana(b[k])) out[col] = b[k];
    else throw new HrmError(422, 'fecha_invalida');
  }
  if (b.documento_id !== undefined) {
    if (b.documento_id !== null && !esUuid(b.documento_id)) throw new HrmError(400, 'documento_invalido');
    out.document_id = b.documento_id;
  }
  if (typeof b.activa === 'boolean') out.is_active = b.activa;
  return out;
}

function errorDb(e: { code?: string } | null): never {
  if (e?.code === '42501') throw new HrmError(403, 'sin_permiso');
  if (e?.code === '23514') throw new HrmError(422, 'fechas_invalidas');
  throw new HrmError(500, 'error_hrm');
}

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    if (!esUuid(persona)) throw new HrmError(400, 'persona_invalida');
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/certificaciones' });
    const { data, error } = await ctx.supabase
      .from('hr_person_certifications')
      .insert({ ...campos(b ?? {}, true), person_id: persona, organization_id: ctx.organizationId, created_by: ctx.userId })
      .select('id')
      .single();
    if (error || !data) errorDb(error);
    return NextResponse.json({ id: data.id }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'certificaciones:crear');
  }
});

export const PATCH = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/certificaciones' });
    if (!esUuid(persona) || !esUuid(b?.id)) throw new HrmError(400, 'certificacion_invalida');
    const { data, error } = await ctx.supabase
      .from('hr_person_certifications')
      .update({ ...campos(b, false), updated_at: new Date().toISOString() })
      .eq('id', b.id)
      .eq('person_id', persona)
      .eq('organization_id', ctx.organizationId)
      .select('id')
      .maybeSingle();
    if (error) errorDb(error);
    if (!data) throw new HrmError(404, 'no_existe');
    return NextResponse.json({ id: data.id }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'certificaciones:editar');
  }
});
