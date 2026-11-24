/**
 * Tiempos de los pedidos online — SOLO servidor: leer y guardar la fila de
 * `organization_settings` (`pedidos_online_tiempos`) y calcular los tiempos de un pedido que se
 * confirma solo. Lo puro (fábrica, lector, resolución, minutos, apertura) vive en
 * `@/lib/pos/pedidosWeb/tiemposPedidos`.
 *
 * Cualquier fallo de lectura cuenta como «sin configuración»: la confirmación automática sigue
 * con su lógica de siempre. Un pedido nunca deja de confirmarse por esta tabla.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CLAVE_TIEMPOS_PEDIDOS,
  normalizarAjustesTiempos,
  tiemposConfirmacionAutomatica,
  tipoDeEntrega,
  verticalDeTipo,
  type AjustesTiemposPedidos,
  type TiemposConfirmacionAutomatica,
} from '@/lib/pos/pedidosWeb/tiemposPedidos';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';

/** Ajustes guardados de la organización, o null si no hay fila (o no se pudo leer). */
export async function leerAjustesTiempos(db: SupabaseClient, organizationId: number): Promise<AjustesTiemposPedidos | null> {
  try {
    const { data, error } = await db
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', organizationId)
      .eq('key', CLAVE_TIEMPOS_PEDIDOS)
      .maybeSingle();
    if (error || !data) return null;
    return normalizarAjustesTiempos((data as { settings?: unknown }).settings);
  } catch {
    return null;
  }
}

/** Guarda los ajustes (el llamador ya validó organización y permiso). */
export async function guardarAjustesTiempos(db: SupabaseClient, organizationId: number, ajustes: AjustesTiemposPedidos): Promise<{ ok: boolean }> {
  const { error } = await db.from('organization_settings').upsert(
    { organization_id: organizationId, key: CLAVE_TIEMPOS_PEDIDOS, settings: ajustes, updated_at: new Date().toISOString() },
    { onConflict: 'organization_id,key' },
  );
  if (error) {
    console.error('[tiemposPedidos] no se guardaron', { organizationId, message: error.message });
    return { ok: false };
  }
  return { ok: true };
}

interface PedidoTiempos {
  organization_id: number;
  branch_id?: number | null;
  delivery_type?: string | null;
  delivery_address?: unknown;
}

/** Días de tránsito de la tarifa activa del destino (o de cualquiera con días), o null. */
async function diasTransitoTarifa(db: SupabaseClient, pedido: PedidoTiempos): Promise<number | null> {
  const base = () =>
    db
      .from('shipping_rates')
      .select('estimated_transit_days')
      .eq('organization_id', pedido.organization_id)
      .eq('is_active', true)
      .not('estimated_transit_days', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
  try {
    const addr = (pedido.delivery_address || {}) as Record<string, unknown>;
    const ciudad = typeof addr.city === 'string' ? addr.city : '';
    if (ciudad) {
      const { data } = await base().eq('destination_city', ciudad).maybeSingle();
      const dias = (data as { estimated_transit_days?: number | null } | null)?.estimated_transit_days;
      if (dias) return dias;
    }
    const { data } = await base().maybeSingle();
    return (data as { estimated_transit_days?: number | null } | null)?.estimated_transit_days || null;
  } catch {
    return null;
  }
}

/**
 * Tiempos de la confirmación automática con la configuración del negocio, o null si el negocio
 * no encendió «Usar estos tiempos al confirmarse solo» (o no hay fila): entonces el servidor
 * hace exactamente lo de siempre.
 */
export async function tiemposAutoConfirmacion(
  db: SupabaseClient,
  pedido: PedidoTiempos,
  ahora: Date = new Date(),
): Promise<TiemposConfirmacionAutomatica | null> {
  const ajustes = await leerAjustesTiempos(db, pedido.organization_id);
  if (!ajustes || !ajustes.usar_en_confirmacion_automatica) return null;
  try {
    const { data: org } = await db.from('organizations').select('type_id, timezone').eq('id', pedido.organization_id).maybeSingle();
    const o = (org ?? {}) as { type_id?: number | null; timezone?: string | null };
    const tipo = tipoDeEntrega(pedido.delivery_type);
    const dias = tipo === 'transportadora' ? await diasTransitoTarifa(db, pedido) : null;

    let horarioSede: unknown = null;
    let zonaSede: string | null = null;
    if (ajustes.contar_desde_apertura && pedido.branch_id) {
      const { data: sede } = await db
        .from('branches')
        .select('opening_hours, timezone')
        .eq('id', pedido.branch_id)
        .eq('organization_id', pedido.organization_id)
        .maybeSingle();
      const s = (sede ?? {}) as { opening_hours?: unknown; timezone?: string | null };
      horarioSede = s.opening_hours ?? null;
      zonaSede = resolveTimezoneCascade({ branchTimezone: s.timezone ?? null, organizationTimezone: o.timezone ?? null }).timezone;
    }

    return tiemposConfirmacionAutomatica({
      ajustes,
      sedeId: pedido.branch_id,
      deliveryType: pedido.delivery_type,
      vertical: verticalDeTipo(o.type_id),
      ahora,
      diasTransitoTarifa: dias,
      horarioSede,
      zonaSede,
    });
  } catch (err) {
    console.warn('[tiemposPedidos] no se pudieron calcular; se usan los de siempre', { organizationId: pedido.organization_id, err });
    return null;
  }
}
