/**
 * POST /api/hrm/nomina/periodos/[id]/archivo-banco — { formato? }
 *
 * Archivo para el banco (CSV genérico por ahora). `hr.payroll.pay` y ver cuentas bancarias; cada persona
 * queda en el registro de accesos. Con una fila inválida responde 422 con los errores y sin archivo.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { archivoBanco } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    const body = await readOrgBody<{ formato?: unknown }>(ctx, req, { route: 'hrm/nomina/archivo-banco' });
    const formato = typeof body?.formato === 'string' ? body.formato : 'csv_generico';
    const r = await archivoBanco(ctx, await parametroDeRuta(rp, 'id'), formato, contextoDePeticion(req));
    if (!r.archivo) return NextResponse.json({ error: 'archivo_banco_invalido', errores: r.errores }, { status: 422, headers: SIN_CACHE });
    return new NextResponse(r.archivo.contenido, {
      headers: { ...SIN_CACHE, 'Content-Type': r.archivo.tipo_contenido, 'Content-Disposition': `attachment; filename="${r.archivo.nombre_archivo}"` },
    });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/archivo-banco');
  }
});
