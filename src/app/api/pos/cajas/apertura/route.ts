/**
 * Apertura de caja con base sugerida («Caja — lo que sale entre turnos»,
 * migración 20261126070000; Figma 3319:306513 y 3319:306707).
 *
 * GET  /api/pos/cajas/apertura?sucursal=<id>|todas — base sugerida: la base que
 *      dejó el cierre anterior de la misma caja (o lo contado, si ese cierre es
 *      anterior a esta fase), quién cerró, si es la primera apertura y el tipo
 *      de organización (persona natural / sociedad) para la cuenta del dueño.
 * POST /api/pos/cajas/apertura — abre la caja (`pos_caja_abrir`). Abrir con un
 *      monto distinto a la base sugerida no se impide: exige `motivo` y queda
 *      como «Diferencia de apertura» (movimiento + asiento; alerta «por
 *      explicar» salvo retiro/aporte del dueño). La primera apertura con base
 *      exige `origen` (banco, dueño o traslado).
 *
 * La organización sale de la sesión (`getServerOrgContext`); si el body o la
 * query declaran otra → 403 y registro (`readOrgBody`). La base vuelve a
 * comprobar pertenencia y acceso a la sucursal.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { codigoErrorTurno, MOTIVOS_DIFERENCIA_APERTURA } from '@/lib/pos/cajas/entreTurnos';

export const dynamic = 'force-dynamic';

const NO_CACHE = { 'Cache-Control': 'private, no-store' };

function sucursalDeQuery(valor: string | null): number | null | 'invalida' {
  if (valor === null || valor === '' || valor === 'todas') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 'invalida';
}

function respuestaError(err: { code?: string; message?: string }, ruta: string, organizationId: number) {
  const turno = codigoErrorTurno(err.message);
  if (turno) {
    return NextResponse.json({ error: 'No se pudo abrir la caja', code: 'INVALID_BODY', codigo: turno }, { status: 400 });
  }
  if (err.code === '23505') {
    return NextResponse.json({ error: 'Ya hay una caja abierta', code: 'ALREADY_OPEN', codigo: 'caja_ya_abierta' }, { status: 409 });
  }
  if (err.code === '42501') {
    return NextResponse.json({ error: 'No tienes acceso a esta sucursal', code: 'FORBIDDEN', codigo: 'organizacion_no_permitida' }, { status: 403 });
  }
  if (err.code === 'P0002') {
    return NextResponse.json({ error: 'No se encontró', code: 'NOT_FOUND', codigo: 'cuenta_no_encontrada' }, { status: 404 });
  }
  console.error(`[pos/cajas/apertura] ${ruta}`, { organizationId, message: err.message });
  return NextResponse.json({ error: 'No se pudo abrir la caja', codigo: 'apertura_fallida' }, { status: 500 });
}

function errorContexto(err: unknown) {
  if (err instanceof OrgContextError) {
    return NextResponse.json(
      { error: err.message, code: err.code, codigo: err.code === 'UNAUTHENTICATED' ? 'no_autenticado' : 'organizacion_no_permitida' },
      { status: err.statusCode },
    );
  }
  throw err;
}

export async function GET(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const sucursal = sucursalDeQuery(new URL(request.url).searchParams.get('sucursal'));
    if (sucursal === 'invalida') {
      return NextResponse.json({ error: 'Sucursal inválida', codigo: 'sin_sucursal' }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc('pos_caja_base_sugerida', {
      p_organization_id: ctx.organizationId,
      p_branch_id: sucursal,
    });
    if (error) return respuestaError(error, 'GET', ctx.organizationId);
    return NextResponse.json(data ?? {}, { headers: NO_CACHE });
  } catch (err) {
    return errorContexto(err);
  }
}

const importe = z.number().finite().min(0).max(1e12);

const bodySchema = z
  .object({
    sucursal_id: z.number().int().positive().nullable(),
    monto: importe,
    notas: z.string().max(2000).nullable().optional(),
    motivo: z.enum(MOTIVOS_DIFERENCIA_APERTURA).nullable().optional(),
    nota_diferencia: z.string().max(2000).nullable().optional(),
    origen: z
      .discriminatedUnion('tipo', [
        z.object({
          tipo: z.literal('banco'),
          cuenta_banco_id: z.number().int().positive(),
          referencia: z.string().min(1).max(120),
          soporte_path: z.string().max(300).optional(),
        }).strict(),
        z.object({ tipo: z.literal('dueno') }).strict(),
        z.object({ tipo: z.literal('traslado'), sesion_origen_id: z.number().int().positive() }).strict(),
      ])
      .nullable()
      .optional(),
    tercero_nit: z.string().max(30).nullable().optional(),
    tercero_nombre: z.string().max(200).nullable().optional(),
    /** Idempotencia: el mismo uuid devuelve la caja ya abierta. */
    uuid: z.string().uuid().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'POST /api/pos/cajas/apertura' });
    const candidato =
      typeof body === 'object' && body !== null
        ? Object.fromEntries(Object.entries(body).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
        : body;
    const parsed = bodySchema.safeParse(candidato);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de apertura inválidos', code: 'INVALID_BODY', codigo: 'datos_apertura_invalidos' }, { status: 400 });
    }
    const d = parsed.data;
    const { data, error } = await ctx.supabase.rpc('pos_caja_abrir', {
      p_organization_id: ctx.organizationId,
      p_branch_id: d.sucursal_id,
      p_monto: Math.round(d.monto * 100) / 100,
      p_notas: d.notas ?? null,
      p_motivo: d.motivo ?? null,
      p_nota_diferencia: d.nota_diferencia ?? null,
      p_origen: d.origen ?? null,
      p_tercero_nit: d.tercero_nit ?? null,
      p_tercero_nombre: d.tercero_nombre ?? null,
      p_uuid: d.uuid ?? null,
    });
    if (error) return respuestaError(error, 'POST', ctx.organizationId);
    return NextResponse.json({ session: data }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    return errorContexto(err);
  }
}
