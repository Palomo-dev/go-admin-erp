/**
 * GET /api/membresias/exportar?tipo=membresias|miembros|pagos&idioma=es|en|fr|pt&<filtros>
 *
 * CSV generado en el servidor con la organización de la sesión y `memberships.view`, con los MISMOS
 * filtros que la pantalla: membresías (q, estado, plan, cliente), miembros (q, estado) y pagos
 * (desde, hasta). Fechas en la zona de la organización; importes con los separadores de su moneda.
 * Cabeceras `X-Exportacion-Filas` y `X-Exportacion-Truncado` (tope de 5 000 filas).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exportarListado, type FiltrosExportacion } from '@/lib/services/membresias/exportar.server';
import { SIN_CACHE, fallo, responder } from '@/lib/services/membresias/respuestaHttp';
import type { TipoExportacion } from '@/lib/services/membresias/tipos';
import { leerCliente, leerFiltroEstado, leerPlan } from '@/components/membresias/logica';

export const dynamic = 'force-dynamic';

const TIPOS: readonly TipoExportacion[] = ['membresias', 'miembros', 'pagos'];
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function filtrosDesde(tipo: TipoExportacion, sp: URLSearchParams): FiltrosExportacion {
  const q = (sp.get('q') ?? '').slice(0, 120);
  if (tipo === 'membresias') {
    return {
      membresias: {
        q,
        estado: leerFiltroEstado(sp.get('estado')),
        planId: leerPlan(sp.get('plan')) ?? undefined,
        clienteId: leerCliente(sp.get('cliente')) ?? undefined,
      },
    };
  }
  if (tipo === 'miembros') {
    const estado = sp.get('estado');
    return { miembros: { q, estado: estado === 'con_vigente' || estado === 'sin_vigente' ? estado : 'todos' } };
  }
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  return { pagos: { desde: desde && DIA.test(desde) ? desde : undefined, hasta: hasta && DIA.test(hasta) ? hasta : undefined } };
}

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/exportar' });
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get('tipo') as TipoExportacion | null;
  if (!tipo || !TIPOS.includes(tipo)) return fallo(400, 'datos_invalidos');
  try {
    const archivo = await exportarListado(ctx, tipo, filtrosDesde(tipo, sp), sp.get('idioma'));
    return new Response(archivo.contenido, {
      status: 200,
      headers: {
        ...SIN_CACHE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
        'X-Exportacion-Filas': String(archivo.filas),
        'X-Exportacion-Truncado': archivo.truncado ? '1' : '0',
      },
    });
  } catch (err) {
    return responder(() => Promise.reject(err));
  }
});
