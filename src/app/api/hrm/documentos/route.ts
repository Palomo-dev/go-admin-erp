/**
 * POST /api/hrm/documentos
 *   { accion: 'subida', persona_id, grupo, tipo, tamano }
 *       → URL firmada de subida a una ruta que arma el servidor
 *   { accion: 'registrar', persona_id, grupo, categoria, ruta, nombre, tipo, tamano, sha256?, vence_el?, vinculo_id? }
 *       → guarda los metadatos después de subir y deja el registro de acceso
 *
 * ADR-001 §10: bucket privado `hr-documentos`, permiso hr.data.<grupo>.edit.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearUrlSubida, registrarDocumento } from '@/lib/services/hrm/documentosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion, esGrupoDatos } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

type Cuerpo = Record<string, unknown>;

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Cuerpo>(ctx, req, { route: 'hrm/documentos' });
    const grupo = b?.grupo;
    if (!esGrupoDatos(grupo)) throw new HrmError(400, 'grupo_invalido');
    if (b.accion === 'subida') {
      const r = await crearUrlSubida(ctx, { personaId: texto(b.persona_id), grupo, mime: texto(b.tipo), tamano: Number(b.tamano) });
      return NextResponse.json(r, { headers: SIN_CACHE });
    }
    if (b.accion === 'registrar') {
      const r = await registrarDocumento(
        ctx,
        {
          personaId: texto(b.persona_id),
          grupo,
          categoria: texto(b.categoria),
          ruta: texto(b.ruta),
          nombre: texto(b.nombre),
          mime: texto(b.tipo),
          tamano: Number(b.tamano),
          sha256: typeof b.sha256 === 'string' ? b.sha256 : null,
          venceEl: typeof b.vence_el === 'string' ? b.vence_el : null,
          vinculoId: typeof b.vinculo_id === 'string' ? b.vinculo_id : null,
        },
        contextoDePeticion(req)
      );
      return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
    }
    throw new HrmError(400, 'accion_invalida');
  } catch (err) {
    return responderError(err, 'documentos');
  }
});
