/**
 * GET  /api/hrm/personas/[id]/documentos — documentos de los grupos que el
 *      usuario puede ver (los demás llegan como «restringido», sin nombre).
 * POST /api/hrm/personas/[id]/documentos
 *      { accion: 'subida', categoria, tipo, tamano } → URL firmada de subida
 *      { accion: 'registrar', categoria, ruta, nombre, tipo, tamano, sha256?, vence_el?, vinculo_id? }
 *
 * El grupo de datos lo decide el SERVIDOR a partir de la categoría (un
 * concepto médico nunca se puede subir como «identificación»).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { listarDocumentos } from '@/lib/services/hrm/personasService.server';
import { crearUrlSubida, registrarDocumento } from '@/lib/services/hrm/documentosService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion } from '@/lib/services/hrm/tipos';
import { grupoDeCategoria } from '@/lib/hrm/personas/catalogo';

export const dynamic = 'force-dynamic';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await listarDocumentos(ctx, persona, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'documentos:listar');
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/documentos' });
    const categoria = texto(b?.categoria);
    const grupo = grupoDeCategoria(categoria);
    if (!grupo) throw new HrmError(422, 'categoria_invalida');
    if (b.accion === 'subida') {
      return NextResponse.json(await crearUrlSubida(ctx, { personaId: persona, grupo, mime: texto(b.tipo), tamano: Number(b.tamano) }), {
        headers: SIN_CACHE,
      });
    }
    if (b.accion === 'registrar') {
      const r = await registrarDocumento(
        ctx,
        {
          personaId: persona,
          grupo,
          categoria,
          ruta: texto(b.ruta),
          nombre: texto(b.nombre),
          mime: texto(b.tipo),
          tamano: Number(b.tamano),
          sha256: typeof b.sha256 === 'string' ? b.sha256 : null,
          venceEl: typeof b.vence_el === 'string' && b.vence_el ? b.vence_el : null,
          vinculoId: typeof b.vinculo_id === 'string' && b.vinculo_id ? b.vinculo_id : null,
        },
        contextoDePeticion(req)
      );
      return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
    }
    throw new HrmError(400, 'accion_invalida');
  } catch (err) {
    return responderError(err, 'documentos:persona');
  }
});
