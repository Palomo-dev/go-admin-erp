/**
 * GET /api/sitio-web/analitica/trafico?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&sucursal=N]
 *
 * Bloques nuevos de «Analítica» (Figma B/09-01): fuentes, páginas más vistas y
 * conversión a pedido y a reserva, en una llamada a `fn_analitica_web_trafico`
 * (SECURITY INVOKER; migración pendiente 20261008090100).
 *
 * MISMA regla de acceso y misma validación de la petición que
 * `GET /api/analitica-web` (`puedeVerAnaliticaWeb`, `leerPeticion`): quien ve
 * los KPIs ve estos bloques, con el mismo periodo y la misma zona horaria.
 * Sin la función en la base responde `{ disponible: false }` y la pantalla
 * muestra esos bloques como «aún no disponible» (sin error).
 * Caché de 60 s por organización, usuario y petición (las visitas son la tabla
 * más grande).
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError } from '@/lib/utils/orgContext';
import { puedeVerAnaliticaWeb } from '@/lib/navigation/capacidadesNav.server';
import { leerPeticion } from '@/lib/analiticaWeb/analiticaWeb';
import { mapearTrafico, type TraficoAnalitica } from '@/lib/analiticaWeb/trafico';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';

/** «Conversión a reserva» sigue la MISMA regla de visibilidad que «Carta» (organization_module_pages por giro). */
const PAGINA_CARTA = '/app/sitio-web/carta';

export const dynamic = 'force-dynamic';

const SIN_FUNCION = new Set(['42883', 'PGRST202']);
const TTL_MS = 60_000;
type Respuesta = { disponible: boolean; trafico: TraficoAnalitica | null; conReservas: boolean };
const cache = new Map<string, { hasta: number; valor: Respuesta }>();

export const GET = withOrg(async (ctx, req) => {
  if (!(await puedeVerAnaliticaWeb(ctx))) return jsonError(403, 'SIN_PERMISO', 'No tienes acceso a la analítica web');
  const peticion = leerPeticion(new URL(req.url).searchParams);
  if (!peticion.ok) return jsonError(400, peticion.codigo);
  const { desde, hasta, sucursal } = peticion.valor;

  const clave = `${ctx.organizationId}|${ctx.userId}|${desde}|${hasta}|${sucursal ?? ''}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > Date.now()) return NextResponse.json(guardado.valor, { headers: { 'Cache-Control': 'private, no-store' } });

  const [rpc, secciones] = await Promise.all([
    ctx.supabase.rpc('fn_analitica_web_trafico', {
      p_organization_id: ctx.organizationId,
      p_desde: desde,
      p_hasta: hasta,
      p_branch_id: sucursal,
    }),
    seccionesVisiblesServidor(ctx).catch(() => []),
  ]);
  const conReservas = secciones.some((s) => s.modulos.some((m) => m.paginas.some((p) => p.href === PAGINA_CARTA)));
  if (rpc.error) {
    const codigo = (rpc.error as { code?: string }).code ?? '';
    if (SIN_FUNCION.has(codigo)) return NextResponse.json({ disponible: false, trafico: null, conReservas } satisfies Respuesta);
    if (codigo === '42501' && sucursal !== null) return jsonError(400, 'SUCURSAL_INVALIDA');
    if (codigo === '22023') return jsonError(400, 'PETICION_INVALIDA', rpc.error.message);
    if (codigo === '42501') return jsonError(403, 'SIN_ACCESO');
    console.error('[api/sitio-web/analitica/trafico]', rpc.error.message);
    return NextResponse.json({ error: 'No se pudo calcular el tráfico del sitio' }, { status: 500 });
  }
  const valor: Respuesta = { disponible: true, trafico: mapearTrafico(rpc.data), conReservas };
  if (cache.size > 500) cache.clear();
  cache.set(clave, { hasta: Date.now() + TTL_MS, valor });
  return NextResponse.json(valor, { headers: { 'Cache-Control': 'private, no-store' } });
});
