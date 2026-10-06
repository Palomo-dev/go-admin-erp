/**
 * /api/pos/reservas-mesas/configuracion — ajustes de reservas de mesa por sede.
 *
 * GET  ?branchId=<id>   (sin branchId = la fila de toda la organización)
 *   → { sede: { propia, organizacion, efectiva, origen }, recomendados,
 *       porDefecto, zonas, puedeEditar }
 * PUT  { branchId: number | null, ajustes: AjustesReservaDto }
 *   → { ajustes } · 400 AJUSTES_INVALIDOS { errores } · 403 SIN_PERMISO / SEDE_AJENA
 *
 * Contrato de la pantalla de POS › Reservas de mesa › Configuración y de la de
 * Sitio web (la construye el frente del módulo Sitio web): ver
 * `src/lib/services/restaurantBookingSettingsService.ts`.
 *
 * - La organización sale de la sesión (`withOrg`). Una organización ajena en la
 *   query o el body → 403 FOREIGN_ORGANIZATION y registro (`readOrgBody`).
 * - Guardar exige administración o `website.sites.edit`, resuelto en el
 *   servidor (`hasOrgAdminOrPermission`). Leer: cualquier miembro.
 * - Cliente de usuario (RLS por pertenencia), nunca service role.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission, readOrgBody, ORG_BODY_KEYS, type ServerOrgContext } from '@/lib/utils/orgContext';
import {
  AJUSTES_RESERVA_POR_DEFECTO,
  AJUSTES_RESERVA_RECOMENDADOS,
  AjustesReservaError,
  getAjustesReserva,
  guardarAjustesReserva,
  validarAjustesReserva,
} from '@/lib/services/restaurantBookingSettingsService';

export const dynamic = 'force-dynamic';

const RUTA = '/api/pos/reservas-mesas/configuracion';
const PERMISO_EDITAR = 'website.sites.edit';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function error(status: number, codigo: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: codigo, codigo, ...extra }, { status, headers: SIN_CACHE });
}

function sedeDeQuery(valor: string | null): number | null | 'invalida' {
  if (valor == null || valor === '' || valor === 'null') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 'invalida';
}

function respuestaDeError(err: unknown, ctx: ServerOrgContext, branchId: number | null) {
  if (err instanceof AjustesReservaError) {
    if (err.codigo === 'SEDE_AJENA') {
      console.warn(`[${RUTA}] sede ajena`, { organizationId: ctx.organizationId, userId: ctx.userId, branchId });
      return error(403, 'SEDE_AJENA');
    }
    console.error(`[${RUTA}] base de datos`, { organizationId: ctx.organizationId, branchId, message: err.message });
    return error(500, 'ERROR_INTERNO');
  }
  throw err;
}

async function zonasDeSede(ctx: ServerOrgContext, branchId: number | null): Promise<string[]> {
  let consulta = ctx.supabase.from('restaurant_tables').select('zone').eq('organization_id', ctx.organizationId);
  if (branchId != null) consulta = consulta.eq('branch_id', branchId);
  const { data } = await consulta;
  const zonas = (data ?? [])
    .map((f: { zone: string | null }) => (typeof f.zone === 'string' ? f.zone.trim() : ''))
    .filter((z: string) => z !== '');
  return Array.from(new Set<string>(zonas)).sort((a, b) => a.localeCompare(b, 'es'));
}

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: `GET ${RUTA}` });
  const branchId = sedeDeQuery(new URL(req.url).searchParams.get('branchId'));
  if (branchId === 'invalida') return error(400, 'SEDE_INVALIDA');
  try {
    const [sede, zonas, puedeEditar] = await Promise.all([
      getAjustesReserva(ctx.supabase, ctx.organizationId, branchId),
      zonasDeSede(ctx, branchId),
      hasOrgAdminOrPermission(ctx, PERMISO_EDITAR),
    ]);
    return NextResponse.json(
      { sede, recomendados: AJUSTES_RESERVA_RECOMENDADOS, porDefecto: AJUSTES_RESERVA_POR_DEFECTO, zonas, puedeEditar },
      { headers: SIN_CACHE },
    );
  } catch (err) {
    return respuestaDeError(err, ctx, branchId);
  }
});

const bodySchema = z
  .object({
    branchId: z.number().int().positive().nullable(),
    ajustes: z.unknown(),
  })
  .strict();

export const PUT = withOrg(async (ctx, req) => {
  const crudo: unknown = await readOrgBody(ctx, req, { route: `PUT ${RUTA}` });
  const sinOrg =
    typeof crudo === 'object' && crudo !== null
      ? Object.fromEntries(Object.entries(crudo).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : crudo;
  const body = bodySchema.safeParse(sinOrg);
  if (!body.success) return error(400, 'DATOS_INVALIDOS');

  if (!(await hasOrgAdminOrPermission(ctx, PERMISO_EDITAR))) {
    console.warn(`[${RUTA}] guardar sin permiso`, { organizationId: ctx.organizationId, userId: ctx.userId });
    return error(403, 'SIN_PERMISO');
  }

  const validacion = validarAjustesReserva(body.data.ajustes);
  if (!validacion.ok) return error(400, 'AJUSTES_INVALIDOS', { errores: validacion.errores });

  try {
    const ajustes = await guardarAjustesReserva(ctx.supabase, ctx.organizationId, body.data.branchId, validacion.ajustes);
    return NextResponse.json({ ajustes }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaDeError(err, ctx, body.data.branchId);
  }
});
