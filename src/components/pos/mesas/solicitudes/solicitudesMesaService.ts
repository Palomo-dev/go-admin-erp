/**
 * Lectura, tiempo real y atención de las solicitudes de la Carta QR en POS ›
 * Mesas. Lee `table_service_requests` con la sesión del usuario (RLS por
 * pertenencia y sede) y marca con POST /api/pos/mesas/solicitudes (la RPC de
 * staff). La organización solo viaja como cabecera de contexto.
 *
 * Mientras la migración de la Carta QR no esté aplicada, la tabla no existe:
 * `listarPendientes` devuelve `disponible: false` y la pantalla sigue igual.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { esFuncionFaltante } from '@/components/pos/mesas/cuenta/cuentaMesaService';
import { CocinaError } from '@/components/pos/cocina/cocinaCliente';
import { aSolicitudMesa, ordenarSolicitudes, type FilaSolicitudMesa, type SolicitudMesa } from './solicitudesMesaLogica';

const COLUMNAS = 'id, organization_id, branch_id, restaurant_table_id, table_session_id, kind, reason, status, created_at, ack_by, ack_at';

/** Tabla ausente: PostgREST la reporta como 42P01 / PGRST205. */
function tablaFaltante(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || esFuncionFaltante(e) || /relation .* does not exist|could not find the table/i.test(e.message ?? ''));
}

export async function listarSolicitudesPendientes(sedeId: number | null): Promise<{ disponible: boolean; solicitudes: SolicitudMesa[] }> {
  const organizationId = getOrganizationId();
  let consulta = supabase
    .from('table_service_requests')
    .select(COLUMNAS)
    .eq('organization_id', organizationId)
    .in('status', ['open', 'ack'])
    .order('created_at', { ascending: true })
    .limit(200);
  if (sedeId != null) consulta = consulta.eq('branch_id', sedeId);
  const { data, error } = await consulta;
  if (error) {
    if (tablaFaltante(error)) return { disponible: false, solicitudes: [] };
    throw error;
  }
  return { disponible: true, solicitudes: ordenarSolicitudes(((data ?? []) as FilaSolicitudMesa[]).map(aSolicitudMesa)) };
}

let contadorCanales = 0;

/** Tiempo real de las solicitudes de la organización (filtra la sede en el cliente). */
export function suscribirSolicitudes(
  callback: (evento: { tipo: 'INSERT' | 'UPDATE' | 'DELETE'; solicitud: SolicitudMesa }) => void,
  sedeId: number | null,
): () => void {
  const organizationId = getOrganizationId();
  contadorCanales += 1;
  const canal: RealtimeChannel = supabase
    .channel(`table_service_requests_${organizationId}_${sedeId ?? 'todas'}_${contadorCanales}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_service_requests', filter: `organization_id=eq.${organizationId}` },
      (payload) => {
        const fila = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as FilaSolicitudMesa;
        if (!fila?.id) return;
        if (sedeId != null && fila.branch_id != null && fila.branch_id !== sedeId) return;
        callback({ tipo: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', solicitud: aSolicitudMesa(fila) });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}

/** «Voy» (`ack`) o «Atendida» (`done`). */
export async function atenderSolicitud(requestId: string, estado: 'ack' | 'done'): Promise<void> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const org = Number(getOrganizationId()) || 0;
  if (org > 0) h['x-organization-id'] = String(org);
  const respuesta = await fetch('/api/pos/mesas/solicitudes', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: h,
    body: JSON.stringify({ request_id: requestId, estado }),
  });
  if (!respuesta.ok) {
    let codigo = 'error_interno';
    try {
      const cuerpo = (await respuesta.json()) as { codigo?: unknown };
      if (typeof cuerpo.codigo === 'string') codigo = cuerpo.codigo;
    } catch {
      /* sin cuerpo */
    }
    throw new CocinaError(codigo, respuesta.status);
  }
}
