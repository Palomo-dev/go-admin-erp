/**
 * Precio de las compras de cupo (usuarios y sucursales extra, créditos de IA).
 *
 * Una sola definición para cobrar y para mostrar: la usan
 * `/api/stripe/create-addon-subscription` y `/api/stripe/purchase-ai-credits`
 * al crear el cobro, y `/api/organizacion/compras/precio` para el desglose del
 * diálogo «Comprar …» (Figma 08, sección 9). Antes el diálogo traía sus propios
 * precios cableados y podía mostrar uno distinto del que se cobraba.
 *
 * Solo servidor: recibe un cliente de servicio y una organización YA validada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TipoComplemento = 'extra_users' | 'extra_branches';

/** Respaldo si el plan no tiene fila en `addon_pricing` (centavos de USD). */
export const PRECIO_COMPLEMENTO_RESPALDO: Record<TipoComplemento, number> = {
  extra_users: 1000,
  extra_branches: 800,
};

/** Respaldo si no hay `pricing_config` activo (centavos de USD por crédito). */
export const PRECIO_CREDITO_RESPALDO = 4;

export interface PrecioComplemento {
  planCode: string;
  unitarioCentavos: number;
  moneda: string;
  minimo: number;
  maximo: number | null;
}

export async function precioComplemento(
  supabase: SupabaseClient,
  organizationId: number,
  tipo: TipoComplemento,
): Promise<PrecioComplemento> {
  const { data: planData } = await supabase.rpc('get_current_plan', { org_id: organizationId });
  const fila = (Array.isArray(planData) ? planData[0] : planData) as { plan_code?: string; code?: string } | null | undefined;
  const planCode = fila?.plan_code || fila?.code || 'free';

  const { data: precio } = await supabase
    .from('addon_pricing')
    .select('unit_price_monthly_cents, currency, min_quantity, max_quantity')
    .eq('plan_code', planCode)
    .eq('addon_type', tipo)
    .eq('is_active', true)
    .maybeSingle();

  return {
    planCode,
    unitarioCentavos: precio?.unit_price_monthly_cents || PRECIO_COMPLEMENTO_RESPALDO[tipo],
    moneda: precio?.currency || 'usd',
    minimo: precio?.min_quantity || 1,
    maximo: precio?.max_quantity ?? null,
  };
}

export async function precioCreditosIa(supabase: SupabaseClient): Promise<{ unitarioCentavos: number; moneda: string }> {
  const { data } = await supabase
    .from('pricing_config')
    .select('ai_credit_unit_price, currency')
    .eq('config_key', 'enterprise_default')
    .eq('is_active', true)
    .maybeSingle();
  return {
    unitarioCentavos: data?.ai_credit_unit_price || PRECIO_CREDITO_RESPALDO,
    moneda: data?.currency || 'usd',
  };
}
