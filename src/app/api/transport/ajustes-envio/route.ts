/**
 * /api/transport/ajustes-envio
 *   GET → ajustes de envío de la organización de la sesión y el peso por defecto de sus categorías.
 *   PUT → guarda el interruptor de integraciones de transportadoras, el peso y las medidas por
 *         defecto, y el peso por categoría (solo administradores).
 *
 * Organización de la sesión; un organizationId ajeno → 403 y registro (`readOrgBody`). Cliente de
 * la sesión con RLS: no hace falta service role.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { guardarAjustesEnvio, leerAjustesEnvio } from '@/lib/services/transporte/ajustesEnvio.server';

export const dynamic = 'force-dynamic';

const RUTA = '/api/transport/ajustes-envio';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

const positivo = z.number().positive().max(100000).nullable();

const esquema = z.object({
  carrierIntegrationsEnabled: z.boolean().optional(),
  defaultWeightKg: positivo.optional(),
  defaultLengthCm: positivo.optional(),
  defaultWidthCm: positivo.optional(),
  defaultHeightCm: positivo.optional(),
  categorias: z.array(z.object({ id: z.number().int().positive(), defaultWeightKg: positivo })).max(2000).optional(),
}).strict();

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  try {
    return NextResponse.json(await leerAjustesEnvio(ctx.supabase, ctx.organizationId), { headers: SIN_CACHE });
  } catch (err) {
    console.error(`[${RUTA}]`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudieron leer los ajustes de envío.' }, { status: 500, headers: SIN_CACHE });
  }
});

export const PUT = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `PUT ${RUTA}` }));
  if (!cuerpo.success) return NextResponse.json({ error: 'Datos inválidos: los pesos y medidas deben ser mayores que cero.' }, { status: 400, headers: SIN_CACHE });
  try {
    await guardarAjustesEnvio(ctx.supabase, { organizationId: ctx.organizationId, userId: ctx.userId }, cuerpo.data);
    return NextResponse.json(await leerAjustesEnvio(ctx.supabase, ctx.organizationId), { headers: SIN_CACHE });
  } catch (err) {
    console.error(`[${RUTA}]`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudieron guardar los ajustes de envío.' }, { status: 500, headers: SIN_CACHE });
  }
}, { admin: true });
