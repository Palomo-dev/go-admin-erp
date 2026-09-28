'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolverTasaComision } from '@/lib/services/comisiones/tasaComision';

/**
 * Hook reutilizable para resolver la tasa de comisión de un vendedor
 * desde `vendor_commission_rates`.
 *
 * Cadena de resolución (una sola, en `resolverTasaComision` → RPC
 * `fn_tasa_comision_vigente`, que también usa el servidor al convertir una
 * cotización en factura). La vigencia se compara contra el día de la
 * organización, nunca contra el día UTC:
 * 1. Tasa específica del vendedor vigente hoy (salesperson_id NOT NULL)
 * 2. Tasa general de la organización vigente hoy (salesperson_id IS NULL)
 * 3. 0 (sin comisión)
 *
 * Lo usan: NuevaFacturaForm, CheckoutDialog (POS), pedidosService,
 * FacturasCompraService y commissionService (CRM).
 */
export function useCommissionRate() {
  const [loading, setLoading] = useState(false);

  /**
   * Resuelve la tasa de comisión para un vendedor.
   * @param salespersonId - ID del usuario (auth.users.id) seleccionado como vendedor
   * @returns tasa (0-100) o 0 si no hay configuración
   */
  const resolveRate = useCallback(async (salespersonId: string | null | undefined): Promise<number> => {
    if (!salespersonId) return 0;

    const orgId = getOrganizationId();
    if (!orgId) return 0;

    setLoading(true);
    try {
      return await resolverTasaComision(supabase, orgId, salespersonId);
    } catch (err) {
      console.warn('Error resolviendo tasa de comisión:', err);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  return { resolveRate, loading };
}
