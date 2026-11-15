/**
 * GET /api/hrm/configuracion/accesos — registro de accesos a datos sensibles
 * (diseño 10.RH.3). Filtros: desde, hasta (instantes ISO), busca, persona,
 * grupo, accion, pagina. Sin hr.access_log.view responde `permitido: false` y
 * la base deja el intento registrado.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { listarRegistro } from '@/lib/services/hrm/configuracion/registroAccesosConfig.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    const lista = await listarRegistro(ctx, {
      desde: q.get('desde'),
      hasta: q.get('hasta'),
      busca: q.get('busca'),
      persona: q.get('persona'),
      grupo: q.get('grupo'),
      accion: q.get('accion'),
      pagina: Number(q.get('pagina') ?? '1'),
    });
    return NextResponse.json(lista, { status: lista.permitido ? 200 : 403, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:accesos');
  }
});
