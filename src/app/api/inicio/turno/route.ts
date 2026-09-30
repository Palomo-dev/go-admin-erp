/**
 * GET /api/inicio/turno — «Tu turno» de la persona de la sesión (Figma
 * «Inicio — Marcar turno», 631:21816, aprobada por el dueño el 2026-09-30).
 *
 * Solo lectura: el estado (antes · sin marcar · en turno · cerrado) sale del
 * turno asignado hoy y de las marcaciones de HRM. Marcar sigue siendo el flujo
 * existente (`/marcar`). La organización y la persona salen de la sesión
 * (`withOrg`); cualquier miembro puede ver SU turno. Sin módulo HRM o sin
 * contrato activo responde `visible: false` (no hay tarjeta ni botón).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { turnoDeHoy } from '@/lib/dashboard/inicio.server';
import { manejarError, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await turnoDeHoy(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('turno', ctx, err);
  }
});
