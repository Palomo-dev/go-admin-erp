/**
 * POST /api/reportes/cierres — genera y congela un cierre de periodo, lo
 * recalcula (`reemplaza`: versión nueva con el mismo número) o, con
 * `vistaPrevia`, devuelve qué incluiría sin guardar nada.
 *
 * Los reportes corren con el cliente de la sesión; la sucursal se valida
 * contra el alcance de la persona. Guardar lo hace `fn_cierre_guardar` con el
 * service role (decisión 8 del plan de reportes v2).
 *
 * Permiso `reports.export`. 409 `cierre_existente` trae `existente` (id del
 * cierre vigente) para ofrecer «recalcular».
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirPermisos, leerCuerpo } from '@/lib/services/compras/rutas.server';
import { cierreSchema } from '@/lib/services/reportes/contrato';
import { generarCierre, vistaPreviaCierre, type EntradaCierre } from '@/lib/services/reportes/cierres/cierres.server';
import { respuestaErrorReportes, sujetoDeContexto } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/reportes/cierres';

export const POST = withOrg(async (ctx, req) => {
  try {
    const datos = await leerCuerpo(ctx, req, cierreSchema, RUTA);
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    const entrada: EntradaCierre = {
      periodo: datos.periodo,
      plantilla: datos.plantilla,
      reportes: datos.reportes,
      branchId: datos.sucursalId,
      reemplaza: datos.reemplaza ?? null,
      idioma: datos.idioma,
    };
    const sujeto = sujetoDeContexto(ctx);
    if (datos.vistaPrevia) {
      const resumen = await vistaPreviaCierre(sujeto, entrada);
      return NextResponse.json({ resultado: { resumen } }, { headers: SIN_CACHE });
    }
    const cierre = await generarCierre(sujeto, entrada);
    return NextResponse.json({ resultado: cierre }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
