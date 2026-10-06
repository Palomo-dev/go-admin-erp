/**
 * GET /api/pos/cocina/eventos?ticket_id= — línea de tiempo del detalle de la
 * comanda (`kitchen_ticket_events`) con el nombre de quién lo hizo.
 * Lectura con el cliente de la sesión (RLS por pertenencia) y filtrada además
 * por la organización de la sesión. Sin la tabla (migración pendiente)
 * devuelve `{ eventos: [], disponible: false }` y el detalle arma la línea con
 * las horas de la propia comanda.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { SIN_CACHE, errorCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

interface FilaEvento {
  id: number;
  event: string;
  station: string | null;
  actor_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  kitchen_ticket_item_id: number | null;
}

export async function GET(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = Number(new URL(request.url).searchParams.get('ticket_id'));
    if (!Number.isInteger(id) || id <= 0) return errorCocina(400, 'datos_invalidos');

    const { data, error } = await ctx.supabase
      .from('kitchen_ticket_events')
      .select('id, event, station, actor_id, detail, created_at, kitchen_ticket_item_id')
      .eq('organization_id', ctx.organizationId)
      .eq('kitchen_ticket_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      // 42P01 / PGRST205: la tabla aún no existe.
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)) {
        return NextResponse.json({ eventos: [], disponible: false }, { headers: SIN_CACHE });
      }
      console.error('[pos/cocina/eventos]', { organizationId: ctx.organizationId, message: error.message });
      return errorCocina(500, 'error_interno');
    }
    const filas = (data ?? []) as FilaEvento[];
    const actores = Array.from(new Set(filas.map((f) => f.actor_id).filter((x): x is string => !!x)));
    const nombres = new Map<string, string>();
    if (actores.length > 0) {
      const { data: perfiles } = await ctx.supabase.from('profiles').select('id, first_name, last_name').in('id', actores);
      for (const p of (perfiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
        const nombre = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        if (nombre) nombres.set(p.id, nombre);
      }
    }
    return NextResponse.json(
      { disponible: true, eventos: filas.map((f) => ({ ...f, actor_nombre: f.actor_id ? nombres.get(f.actor_id) ?? null : null })) },
      { headers: SIN_CACHE },
    );
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
