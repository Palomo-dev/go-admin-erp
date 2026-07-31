import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Obtiene un mapa de códigos de método de pago -> nombre legible
 * desde organization_payment_methods + payment_methods de Supabase.
 * Cachea el resultado en memoria para evitar consultas repetidas.
 */
let cachedLabels: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function getPaymentMethodLabels(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedLabels && now - cacheTimestamp < CACHE_TTL) {
    return cachedLabels;
  }

  try {
    const orgId = getOrganizationId();
    const { data, error } = await supabase
      .from('organization_payment_methods')
      .select(`
        payment_method_code,
        is_active,
        payment_methods!inner(code, name)
      `)
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) throw error;

    const labels: Record<string, string> = {};
    for (const item of (data || []) as any[]) {
      const code = item.payment_method_code as string;
      const pm = item.payment_methods;
      const name: string = Array.isArray(pm) ? (pm[0]?.name || code) : (pm?.name || code);
      labels[code] = name;
    }

    cachedLabels = labels;
    cacheTimestamp = now;
    return labels;
  } catch (error) {
    console.error('Error fetching payment method labels:', error);
    // Fallback con nombres comunes
    return {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      wompi: 'Wompi',
      credit: 'Crédito',
      mixed: 'Mixto',
    };
  }
}

/**
 * Resuelve el nombre legible de un método de pago.
 * Usa getPaymentMethodLabels internamente con cache.
 */
export async function resolvePaymentMethodLabel(methodCode: string): Promise<string> {
  const labels = await getPaymentMethodLabels();
  return labels[methodCode] || methodCode;
}
