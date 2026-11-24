/**
 * GET /api/logistica/domiciliarios/candidatos — para el alta rápida: empleados activos de Recursos
 * humanos que aún no son domiciliarios («Traer desde Recursos humanos») y miembros activos sin
 * domiciliario (cuenta para «Mis envíos» de un externo). Sesión + organización (`withOrg`) y el
 * mismo permiso que el alta; lee con el cliente de la sesión, filtrado por la organización.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { puedeGestionarDomiciliarios } from '@/lib/logistica/permisosDomiciliarios.server';
import { candidatosAlta } from '@/lib/services/logistica/domiciliariosService';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  if (!(await puedeGestionarDomiciliarios(ctx))) {
    return NextResponse.json({ error: 'Sin permiso', code: 'SIN_PERMISO' }, { status: 403 });
  }
  try {
    return NextResponse.json(await candidatosAlta(ctx.supabase, ctx.organizationId));
  } catch (err) {
    console.error('[logistica/domiciliarios/candidatos] falló', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
