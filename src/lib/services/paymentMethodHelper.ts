import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { nombreVisibleMetodo } from '@/lib/finanzas/metodosPagoOrganizacion';

/**
 * Obtiene un mapa de códigos de método de pago -> nombre legible
 * desde organization_payment_methods + payment_methods de Supabase.
 * Cachea el resultado en memoria para evitar consultas repetidas.
 *
 * GO-sec (2026-09-28): la caché va POR ORGANIZACIÓN. Antes era una sola
 * variable de módulo: al cambiar de organización en la misma pestaña se servían
 * durante 5 minutos los nombres de la organización anterior. El nombre es el
 * propio de la organización (`settings.display_name`) si lo fijó.
 */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const cachePorOrganizacion = new Map<string, { etiquetas: Record<string, string>; guardadoEn: number }>();

/** Solo pruebas: vacía la caché. */
export function limpiarCacheEtiquetasMetodosPago(): void {
  cachePorOrganizacion.clear();
}

/**
 * Nombres de TODOS los métodos activos de la organización, sin filtrar por
 * sucursal (20261028180000): sirven para nombrar pagos ya hechos, en cualquier
 * sede. Las listas de cobro filtran por sucursal en su propio servicio.
 */
export async function getPaymentMethodLabels(organizationId: number = getOrganizationId()): Promise<Record<string, string>> {
  const now = Date.now();
  const claveCache = String(organizationId);
  const enCache = cachePorOrganizacion.get(claveCache);
  if (enCache && now - enCache.guardadoEn < CACHE_TTL) {
    return enCache.etiquetas;
  }

  try {
    const { data, error } = await supabase
      .from('organization_payment_methods')
      .select(`
        payment_method_code,
        is_active,
        settings,
        payment_methods!inner(code, name)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) throw error;

    const labels: Record<string, string> = {};
    type FilaEtiqueta = { payment_method_code: string; settings: unknown; payment_methods: { name?: string } | Array<{ name?: string }> | null };
    const filas = (data || []) as unknown as FilaEtiqueta[];
    for (const item of filas) {
      const code = item.payment_method_code;
      const pm = item.payment_methods;
      const nombreGlobal = Array.isArray(pm) ? pm[0]?.name : pm?.name;
      labels[code] = nombreVisibleMetodo(item.settings, nombreGlobal, code);
    }

    cachePorOrganizacion.set(claveCache, { etiquetas: labels, guardadoEn: now });
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
export async function resolvePaymentMethodLabel(methodCode: string, organizationId: number = getOrganizationId()): Promise<string> {
  const labels = await getPaymentMethodLabels(organizationId);
  return labels[methodCode] || methodCode;
}
