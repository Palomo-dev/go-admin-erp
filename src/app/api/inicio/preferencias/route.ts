/**
 * /api/inicio/preferencias — «Personalizar el inicio» y «Reordenar y ocultar»
 * (Figma 448:196794 y 646:32649), guardadas por usuario y organización en
 * `user_dashboard_preferences` para que viajen entre dispositivos.
 *
 * - GET: las preferencias de la persona en la organización de la sesión.
 * - PUT: las reemplaza. La organización sale de la sesión (`withOrg`) y un
 *   body o query con otra organización responde 403 y queda registrado
 *   (`readOrgBody`, regla dura 5). Los módulos se validan contra los que el
 *   menú le muestra a esa persona (nunca una lista cableada); los bloques,
 *   contra `BLOQUES_OCULTABLES`. La tabla aplica además RLS por usuario y
 *   pertenencia.
 * - Cualquier miembro puede personalizar su propio inicio: no cambia permisos
 *   ni módulos de la organización.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { guardarPreferencias, leerPreferencias, modulosVisibles } from '@/lib/dashboard/inicio.server';
import { validarPreferencias } from '@/lib/dashboard/preferenciasInicio';
import { manejarError, respuestaError, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await leerPreferencias(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('preferencias', ctx, err);
  }
});

export const PUT = withOrg(async (ctx, req) => {
  // Organización ajena en body o query → 403 registrado; JSON roto → 400
  // (ambos los lanza readOrgBody y los responde withOrg).
  const body: unknown = await readOrgBody(ctx, req, { route: 'inicio/preferencias' });
  try {
    const visibles = (await modulosVisibles(ctx)).map((m) => m.codigo);
    const prefs = validarPreferencias(body, visibles);
    if (!prefs) return respuestaError(400, 'preferencias_invalidas', 'Preferencias no válidas');
    return NextResponse.json(await guardarPreferencias(ctx, prefs), { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('preferencias', ctx, err);
  }
});
