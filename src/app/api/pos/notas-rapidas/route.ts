/**
 * /api/pos/notas-rapidas — notas rápidas del editor de nota de la línea.
 *
 * GET    ?branch_id=&todas=1 → `{ notas, sugeridas }`: las configuradas para la
 *        organización y para la sucursal (activas; con `todas=1`, también las
 *        inactivas, para la configuración) y las más usadas de las ventas
 *        (`pos_notas_rapidas_sugeridas`) que aún no están configuradas.
 * POST   `{ label, kind, branch_id?, display_order? }` → crea.
 * PATCH  `{ id, label?, kind?, display_order?, is_active? }` → edita.
 * DELETE ?id= → borra la nota rápida (es configuración, no historia).
 *
 * - La organización sale de la sesión; una ajena en query o body → 403.
 * - Leer: cualquier miembro (RLS de `pos_quick_notes`). Escribir exige
 *   `organization_settings` (o administración), resuelto aquí en el servidor;
 *   la tabla no tiene políticas de escritura: se escribe con `service_role`
 *   después de esa comprobación y siempre filtrando por la organización.
 */
import { NextResponse } from 'next/server';
import {
  getServerOrgContext,
  hasOrgAdminOrPermission,
  OrgContextError,
  type ServerOrgContext,
} from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  notaRapidaCrearSchema,
  notaRapidaEditarSchema,
  sinClavesDeOrganizacion,
} from '@/lib/pos/cocina/rutasCocina';

export const dynamic = 'force-dynamic';

const RUTA = '/api/pos/notas-rapidas';
const PERMISO_CONFIGURAR = 'organization_settings';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const COLUMNAS = 'id, organization_id, branch_id, label, kind, display_order, is_active, created_at, updated_at';

function error(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

function respuestaContexto(err: unknown) {
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, code: err.code, codigo: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  throw err;
}

function enteroPositivo(valor: string | null): number | null {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function puedeConfigurar(ctx: ServerOrgContext): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx, PERMISO_CONFIGURAR);
}

async function sucursalDeLaOrganizacion(ctx: ServerOrgContext, branchId: number): Promise<boolean> {
  const { data } = await getServiceClient()
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  return !!data;
}

export async function GET(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
    const url = new URL(request.url);
    const branchId = enteroPositivo(url.searchParams.get('branch_id'));
    const todas = url.searchParams.get('todas') === '1';

    let consulta = ctx.supabase
      .from('pos_quick_notes')
      .select(COLUMNAS)
      .eq('organization_id', ctx.organizationId)
      .order('display_order', { ascending: true })
      .order('label', { ascending: true });
    if (!todas) consulta = consulta.eq('is_active', true);
    consulta = branchId ? consulta.or(`branch_id.is.null,branch_id.eq.${branchId}`) : consulta.is('branch_id', null);
    const { data: notas, error: errNotas } = await consulta;
    if (errNotas) {
      console.error('[pos/notas-rapidas] leer', { organizationId: ctx.organizationId, message: errNotas.message });
      return error(500, 'error_interno');
    }

    const { data: usadas, error: errUsadas } = await getServiceClient().rpc('pos_notas_rapidas_sugeridas', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_limite: 8,
    });
    if (errUsadas) console.warn('[pos/notas-rapidas] sugeridas', { organizationId: ctx.organizationId, message: errUsadas.message });

    const configuradas = new Set((notas ?? []).map((n) => String(n.label).trim().toLowerCase()));
    const sugeridas = ((usadas as Array<{ texto: string; usos: number }> | null) ?? [])
      .filter((s) => !configuradas.has(String(s.texto).trim().toLowerCase()))
      .map((s) => ({ texto: s.texto, usos: Number(s.usos) || 0 }));

    return NextResponse.json({ notas: notas ?? [], sugeridas, puedeConfigurar: await puedeConfigurar(ctx) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
    if (!(await puedeConfigurar(ctx))) {
      console.warn('[pos/notas-rapidas] crear sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
      return error(403, 'sin_permiso');
    }
    const parsed = notaRapidaCrearSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return error(400, 'datos_invalidos');
    const { label, kind, branch_id: branchId, display_order: orden } = parsed.data;
    if (branchId && !(await sucursalDeLaOrganizacion(ctx, branchId))) return error(403, 'sucursal_de_otra_organizacion');

    const { data, error: errInsert } = await getServiceClient()
      .from('pos_quick_notes')
      .insert({
        organization_id: ctx.organizationId,
        branch_id: branchId ?? null,
        label,
        kind,
        display_order: orden ?? 0,
        created_by: ctx.userId,
      })
      .select(COLUMNAS)
      .single();
    if (errInsert) {
      if (errInsert.code === '23505') return error(409, 'nota_duplicada');
      console.error('[pos/notas-rapidas] crear', { organizationId: ctx.organizationId, message: errInsert.message });
      return error(500, 'error_interno');
    }
    return NextResponse.json({ nota: data }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: `PATCH ${RUTA}` });
    if (!(await puedeConfigurar(ctx))) {
      console.warn('[pos/notas-rapidas] editar sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
      return error(403, 'sin_permiso');
    }
    const parsed = notaRapidaEditarSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) return error(400, 'datos_invalidos');
    const { id, ...cambios } = parsed.data;
    if (Object.keys(cambios).length === 0) return error(400, 'datos_invalidos');

    const { data, error: errUpdate } = await getServiceClient()
      .from('pos_quick_notes')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select(COLUMNAS)
      .maybeSingle();
    if (errUpdate) {
      if (errUpdate.code === '23505') return error(409, 'nota_duplicada');
      console.error('[pos/notas-rapidas] editar', { organizationId: ctx.organizationId, message: errUpdate.message });
      return error(500, 'error_interno');
    }
    if (!data) return error(404, 'nota_no_encontrada');
    return NextResponse.json({ nota: data }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: `DELETE ${RUTA}` });
    if (!(await puedeConfigurar(ctx))) {
      console.warn('[pos/notas-rapidas] borrar sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
      return error(403, 'sin_permiso');
    }
    const id = enteroPositivo(new URL(request.url).searchParams.get('id'));
    if (!id) return error(400, 'datos_invalidos');
    const { data, error: errDelete } = await getServiceClient()
      .from('pos_quick_notes')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select('id');
    if (errDelete) {
      console.error('[pos/notas-rapidas] borrar', { organizationId: ctx.organizationId, message: errDelete.message });
      return error(500, 'error_interno');
    }
    if (!data || data.length === 0) return error(404, 'nota_no_encontrada');
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}
