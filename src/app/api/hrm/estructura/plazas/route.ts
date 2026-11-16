/**
 * Recursos humanos › Plazas (Figma 20.1).
 * GET → presupuesto por área y sede (aprobadas frente a ocupadas) y solicitudes.
 * POST → solicita una plaza nueva: pasa por el motor de aprobaciones
 * (`plaza_nueva`) y solo se suma al presupuesto cuando se aprueba.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cargarPlazas, solicitarPlaza } from '@/lib/services/hrm/estructuraService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await cargarPlazas(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:plazas');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/plazas' });
    return NextResponse.json(await solicitarPlaza(ctx, b ?? {}), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:plazas:solicitar');
  }
});
