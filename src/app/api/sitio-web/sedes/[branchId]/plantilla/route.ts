/**
 * /api/sitio-web/sedes/<branchId>/plantilla — el sitio de una sede nace con la plantilla de su
 * tipo de negocio y se le puede volver a aplicar («Aplicar plantilla de <tipo>»).
 *
 * GET  → EstadoPlantillaSede { tipo, sitioId, version, plantillaTipo, intacto, puedeAplicar }.
 * POST { modo: 'auto' }                    → tras crear la sucursal o cambiarle el tipo: crea el
 *        sitio con la plantilla, o lo reemplaza si su borrador no tiene cambios del usuario; si
 *        los tiene responde `pendiente_confirmacion` y no toca nada.
 * POST { modo: 'confirmado', version }     → reemplaza el borrador por la plantilla (el anterior
 *        queda en el historial). Otra versión → 409 `conflicto_version`.
 * Respuesta del POST: ResultadoPlantillaSede { accion, tipo, sitioId, version, … }.
 *
 * Nada de esto publica: la web de la sede cambia cuando se publica desde el editor.
 * La organización sale de la sesión (`withOrg`); una organización ajena en el body → 403 y
 * registro (`readOrgBody`). Permiso `website.sites.edit` resuelto en la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { manejarError, respuestaError, versionDe } from '@/lib/website/v2/respuestasApi';
import { aplicarPlantillaSede, estadoPlantillaSede } from '@/lib/services/website/plantillaSedeService';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

async function sucursalDeRuta(
  routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
): Promise<number | null> {
  const params = routeParams ? await routeParams.params : {};
  const valor = typeof params.branchId === 'string' ? params.branchId : '';
  if (!/^[1-9]\d{0,9}$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/sedes/plantilla' });
    const branchId = await sucursalDeRuta(routeParams);
    if (branchId === null) return respuestaError('sucursal_no_encontrada', 'La sucursal no existe en esta organización.');
    return NextResponse.json(await estadoPlantillaSede(ctx, branchId), { headers: SIN_CACHE });
  } catch (error) {
    return manejarError(error, 'GET sitio-web/sedes/plantilla');
  }
});

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/sedes/plantilla' })) as { modo?: unknown; version?: unknown } | null;
    const branchId = await sucursalDeRuta(routeParams);
    if (branchId === null) return respuestaError('sucursal_no_encontrada', 'La sucursal no existe en esta organización.');
    const modo = body?.modo;
    if (modo !== 'auto' && modo !== 'confirmado') {
      return respuestaError('peticion_invalida', "Se esperaba { modo: 'auto' | 'confirmado' }.");
    }
    const version = modo === 'confirmado' ? versionDe(body?.version) : null;
    if (modo === 'confirmado' && version === null) return respuestaError('peticion_invalida', 'Falta la versión del borrador.');
    return NextResponse.json(await aplicarPlantillaSede(ctx, branchId, modo, version), { headers: SIN_CACHE });
  } catch (error) {
    return manejarError(error, 'POST sitio-web/sedes/plantilla');
  }
});
