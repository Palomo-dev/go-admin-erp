'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface VendorRateRow {
  rate: number;
  valid_from: string | null;
  valid_to: string | null;
}

/**
 * Hook reutilizable para resolver la tasa de comisión de un vendedor
 * desde `vendor_commission_rates`.
 *
 * Cadena de resolución:
 * 1. Tasa específica del vendedor (salesperson_id NOT NULL)
 * 2. Tasa general de la organización (salesperson_id IS NULL)
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
      // 1. Tasa específica del vendedor
      const { data: vendorRate } = await supabase
        .from('vendor_commission_rates')
        .select('rate, valid_from, valid_to')
        .eq('organization_id', orgId)
        .eq('salesperson_id', salespersonId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vendorRate) {
        const row = vendorRate as VendorRateRow;
        // Verificar vigencia
        const now = new Date();
        if (row.valid_from && now < new Date(row.valid_from)) {
          // Aún no vigente — continuar a tasa general
        } else if (row.valid_to && now > new Date(row.valid_to)) {
          // Vencida — continuar a tasa general
        } else {
          return Number(row.rate) || 0;
        }
      }

      // 2. Tasa general de la organización (salesperson_id IS NULL)
      const { data: orgRate } = await supabase
        .from('vendor_commission_rates')
        .select('rate, valid_from, valid_to')
        .eq('organization_id', orgId)
        .is('salesperson_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orgRate) {
        const row = orgRate as VendorRateRow;
        const now = new Date();
        if (row.valid_from && now < new Date(row.valid_from)) return 0;
        if (row.valid_to && now > new Date(row.valid_to)) return 0;
        return Number(row.rate) || 0;
      }

      // 3. Sin configuración
      return 0;
    } catch (err) {
      console.warn('Error resolviendo tasa de comisión:', err);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  return { resolveRate, loading };
}
