/**
 * POST /api/logistica/mis-envios/fin-jornada — «Enviar resumen para el cuadre» (Figma 2802:10481).
 *
 * El dinero ya está en la base: cada entrega guardó su cobro (`cod_collected_*`) y la pantalla
 * Cuadres lo ve como «por recibir». Esta ruta solo cierra la jornada del domiciliario DE LA SESIÓN
 * (`metadata.fin_jornada_at`), que la lista de Domiciliarios muestra como «fuera de turno».
 *
 * Sesión + organización (`withOrg`), `readOrgBody` (403 ante otra organización). El domiciliario
 * sale de `driver_credentials.user_id = sesión` dentro de la RPC `logistica_fin_jornada`: nadie
 * cierra la jornada de otro, y el domiciliario no necesita permiso de escritura sobre la tabla.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { marcarFinJornada } from '@/lib/services/logistica/domiciliariosService';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: 'logistica/mis-envios/fin-jornada' });
  try {
    const r = await marcarFinJornada(ctx.supabase, ctx.organizationId);
    if (!r) return NextResponse.json({ error: 'No eres domiciliario en esta organización', code: 'SIN_DOMICILIARIO' }, { status: 404 });
    return NextResponse.json({ ok: true, finJornadaAt: r.finJornadaAt });
  } catch (err) {
    console.error('[logistica/mis-envios/fin-jornada] falló', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
