/**
 * POST /api/logistica/domiciliarios — alta rápida de un domiciliario (logística Fase 1, Figma
 * 2800:8493).
 *
 * - La organización sale de la sesión (`withOrg`); un body con otra organización responde 403
 *   (`readOrgBody`) y se registra.
 * - Permiso resuelto aquí (`puedeGestionarDomiciliarios`: fn_caja_puede 'pos.create'), nunca en
 *   el navegador.
 * - Escribe con el cliente de la SESIÓN (RLS de miembro activo) y comprueba que la sede, el empleo
 *   o el usuario elegidos sean de la organización antes de escribir (`crearDomiciliario`).
 *
 * Un domiciliario externo NO necesita contrato en Recursos humanos (nombre, celular y documento);
 * si es empleado se vincula por `employmentId` y el disparador completa su usuario.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { altaDomiciliarioSchema } from '@/lib/logistica/domiciliarios';
import { puedeGestionarDomiciliarios } from '@/lib/logistica/permisosDomiciliarios.server';
import { AltaDomiciliarioError, crearDomiciliario } from '@/lib/services/logistica/domiciliariosService';

export const dynamic = 'force-dynamic';

const ESTADO_ERROR: Record<AltaDomiciliarioError['codigo'], number> = {
  sede: 400,
  empleo: 400,
  usuario: 400,
  duplicado: 409,
  empleo_ajeno: 403,
  error: 500,
};

export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<unknown>(ctx, request, { route: 'logistica/domiciliarios' });
  if (!(await puedeGestionarDomiciliarios(ctx))) {
    return NextResponse.json({ error: 'Sin permiso para registrar domiciliarios', code: 'SIN_PERMISO' }, { status: 403 });
  }
  const alta = altaDomiciliarioSchema.safeParse(body);
  if (!alta.success) {
    const campo = alta.error.issues[0]?.path?.[0];
    return NextResponse.json({ error: 'Datos inválidos', code: 'DATOS_INVALIDOS', campo: typeof campo === 'string' ? campo : null }, { status: 400 });
  }
  try {
    const domiciliario = await crearDomiciliario(ctx.supabase, ctx.organizationId, alta.data);
    return NextResponse.json({ domiciliario }, { status: 201 });
  } catch (err) {
    if (err instanceof AltaDomiciliarioError) {
      if (err.codigo === 'error') console.error('[logistica/domiciliarios] alta falló', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: 'No se pudo registrar', code: err.codigo.toUpperCase() }, { status: ESTADO_ERROR[err.codigo] });
    }
    console.error('[logistica/domiciliarios] alta falló', { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
