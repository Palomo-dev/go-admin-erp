/**
 * GET /api/modules/no-usados — grupo «Módulos que tu organización no usa» del
 * buscador global (docs/design/MODULO-NO-HABILITADO.md §4, Figma `2421:65004`).
 *
 * Solo para quien puede encender módulos (la regla de `POST /api/modules`,
 * resuelta en el servidor). A los demás les responde `puedeEncender: false` y
 * una lista vacía: el miembro solo ve la pista del estado vacío.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { modulosNoUsados } from '@/lib/organizacion/accesoModulo.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await modulosNoUsados(ctx), { headers: SIN_CACHE });
  } catch (err) {
    console.error('[api/modules/no-usados]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudieron leer los módulos', code: 'error' }, { status: 500, headers: SIN_CACHE });
  }
});
