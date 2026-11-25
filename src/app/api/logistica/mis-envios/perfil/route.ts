/**
 * GET /api/logistica/mis-envios/perfil — lo que ve en «Mis envíos» quien NO es domiciliario
 * (Figma «21 Logística» b1 v2 3238-19877 / b2 v2 3238-19364).
 *
 * Sesión + organización (`withOrg`). El permiso se resuelve aquí (regla dura 6) con
 * `fn_logistica_gestiona` (la misma función de la RLS de `driver_credentials`): con él se ofrece
 * «Registrarme como domiciliario» (el alta valida otra vez el permiso en su propia ruta), las cifras
 * de despacho y los atajos de despacho; sin él, solo atajos del menú visible y el correo de la
 * sesión para que quien despacha lo vincule. Todo con el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { puedeGestionarDomiciliarios } from '@/lib/logistica/permisosDomiciliarios.server';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';
import { atajosSinPerfil, kpisSinPerfil, type KpisSinPerfil, type PerfilMisEnvios } from '@/lib/logistica/sinPerfil';
import { enviosDeDomiciliarios, listarPorDespachar } from '@/lib/services/logistica/despachoService';
import { pendientesPorCuadrar } from '@/lib/services/logistica/cuadresDomiciliarioService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    const [gestiona, secciones] = await Promise.all([
      puedeGestionarDomiciliarios(ctx),
      // El menú falla abierto en el navegador; aquí, si no se puede leer, no se ofrecen atajos.
      seccionesVisiblesServidor(ctx).catch(() => []),
    ]);

    let kpis: KpisSinPerfil | null = null;
    if (gestiona) {
      const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
      const ahora = new Date();
      const hoy = toPlainDate(ahora, zona);
      const [bandeja, envios, porCuadrar] = await Promise.all([
        listarPorDespachar(ctx.supabase, { organizationId: ctx.organizationId }),
        enviosDeDomiciliarios(ctx.supabase, ctx.organizationId, startOfDayInstant(hoy, zona).toISOString()),
        pendientesPorCuadrar(ctx.supabase, ctx.organizationId),
      ]);
      kpis = kpisSinPerfil({ filas: bandeja.filas, envios, porCuadrar, ahora, zona, hoy });
    }

    const cuerpo: PerfilMisEnvios = {
      gestiona,
      correo: ctx.userEmail,
      userId: ctx.userId,
      atajos: atajosSinPerfil(secciones, gestiona),
      kpis,
    };
    return NextResponse.json(cuerpo);
  } catch (err) {
    console.error('[logistica/mis-envios/perfil] falló', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
