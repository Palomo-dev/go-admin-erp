// ============================================================
// Modelo B (PayFac/Agregador) — Servicio de comisiones
// ============================================================
// Gestiona las comisiones que el ERP admin cobra a cada
// organizacion por usar credenciales maestras (Modelo B).
// ============================================================

import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Tipo de comision aplicable */
export type CommissionType = 'percentage' | 'fixed_amount';

/** Tarifa de comision vigente para una organizacion y proveedor */
export interface CommissionRate {
  id: string;
  organization_id: number;
  provider_code: string;
  commission_type: CommissionType;
  commission_value: number;
  min_commission_amount: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

/** Configuracion de entrada para crear/actualizar una comision */
export interface CommissionConfig {
  commissionType: CommissionType;
  commissionValue: number;
  minCommissionAmount?: number;
}

/** Resultado del calculo de comision */
export interface CommissionCalculation {
  commissionAmount: number;
  netAmount: number;
}

/** Fila de organizacion con comision y total recaudado */
export interface OrganizationWithCommission {
  organizationId: number;
  organizationName: string;
  providerCode: string;
  commissionType: string;
  commissionValue: number;
  totalCollected: number;
}

class CommissionService {
  /**
   * Obtiene la comision vigente para una organizacion y proveedor.
   * Busca la tarifa activa con effective_from <= ahora y sin effective_to
   * o con effective_to >= ahora.
   */
  static async getCommissionRate(
    organizationId: number,
    providerCode: string,
  ): Promise<CommissionRate | null> {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('organization_commission_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('provider_code', providerCode)
        .eq('is_active', true)
        .lte('effective_from', now)
        .or(`effective_to.is.null,effective_to.gte.${now}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[Commission] Error obteniendo tarifa:', error);
        return null;
      }

      if (!data) return null;

      return data as unknown as CommissionRate;
    } catch (err) {
      console.error('[Commission] Excepcion en getCommissionRate:', err);
      return null;
    }
  }

  /**
   * Calcula la comision para un monto bruto dado una tarifa.
   * - percentage: commission = gross * (value / 100)
   * - fixed_amount: commission = value
   * Aplica min_commission_amount: si commission < min, usar min.
   * net = gross - commission
   */
  static calculateCommission(
    grossAmount: number,
    rate: CommissionRate,
  ): CommissionCalculation {
    let commissionAmount: number;

    if (rate.commission_type === 'percentage') {
      commissionAmount = grossAmount * (rate.commission_value / 100);
    } else {
      // fixed_amount
      commissionAmount = rate.commission_value;
    }

    // Aplicar minimo de comision
    const minAmount = rate.min_commission_amount ?? 0;
    if (commissionAmount < minAmount) {
      commissionAmount = minAmount;
    }

    // La comision no puede exceder el monto bruto
    if (commissionAmount > grossAmount) {
      commissionAmount = grossAmount;
    }

    const netAmount = grossAmount - commissionAmount;

    return {
      commissionAmount: Math.round(commissionAmount * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
    };
  }

  /**
   * Crea o actualiza la tarifa de comision para una organizacion y proveedor.
   * Si ya existe una tarifa activa, la marca como inactiva (effective_to = ahora)
   * e inserta una nueva con la nueva configuracion.
   */
  static async setCommissionRate(
    organizationId: number,
    providerCode: string,
    config: CommissionConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      // Cerrar tarifa vigente anterior si existe
      const { data: current, error: findError } = await supabase
        .from('organization_commission_rates')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('provider_code', providerCode)
        .eq('is_active', true)
        .or(`effective_to.is.null,effective_to.gte.${now}`)
        .maybeSingle();

      if (findError) {
        return { success: false, error: `Error al buscar tarifa vigente: ${findError.message}` };
      }

      if (current) {
        await supabase
          .from('organization_commission_rates')
          .update({
            effective_to: now,
            updated_at: now,
          })
          .eq('id', current.id);
      }

      // Insertar nueva tarifa
      const { error: insertError } = await supabase
        .from('organization_commission_rates')
        .insert({
          organization_id: organizationId,
          provider_code: providerCode,
          commission_type: config.commissionType,
          commission_value: config.commissionValue,
          min_commission_amount: config.minCommissionAmount ?? 0,
          is_active: true,
          effective_from: now,
          effective_to: null,
          updated_at: now,
        });

      if (insertError) {
        return { success: false, error: `Error al insertar tarifa: ${insertError.message}` };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Commission] Excepcion en setCommissionRate:', err);
      return { success: false, error: message };
    }
  }

  /**
   * Lista tarifas de comision.
   * Si se pasa organizationId, filtra por esa organizacion.
   */
  static async listCommissionRates(organizationId?: number): Promise<CommissionRate[]> {
    try {
      const supabase = getSupabaseAdmin();

      let query = supabase
        .from('organization_commission_rates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (organizationId !== undefined) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Commission] Error listando tarifas:', error);
        return [];
      }

      return (data ?? []) as unknown as CommissionRate[];
    } catch (err) {
      console.error('[Commission] Excepcion en listCommissionRates:', err);
      return [];
    }
  }

  /**
   * Lista organizaciones con comisiones configuradas y el total recaudado.
   * El total recaudado se calcula sumando commission_amount de payout_items
   * para payouts completados.
   */
  static async listOrganizationsWithCommissions(): Promise<OrganizationWithCommission[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener tarifas activas con join a organizations
      const { data: rates, error: ratesError } = await supabase
        .from('organization_commission_rates')
        .select(`
          organization_id,
          provider_code,
          commission_type,
          commission_value,
          is_active,
          organizations:organization_id ( name )
        `)
        .eq('is_active', true)
        .order('organization_id', { ascending: true });

      if (ratesError) {
        console.error('[Commission] Error listando organizaciones con comision:', ratesError);
        return [];
      }

      if (!rates || rates.length === 0) return [];

      // Obtener totales recaudados por organizacion desde payout_items
      // Sumando commission_amount donde el payout este completado
      const { data: totals, error: totalsError } = await supabase
        .from('payout_items')
        .select(`
          commission_amount,
          payout:payout_id (
            organization_id,
            status
          )
        `);

      if (totalsError) {
        console.error('[Commission] Error obteniendo totales recaudados:', totalsError);
      }

      // Agrupar totales por (organization_id)
      const collectedByOrg = new Map<number, number>();

      if (totals) {
        for (const item of totals) {
          // Supabase devuelve array en joins; tomar primer elemento
          const payoutArr = item.payout as unknown as Array<{ organization_id: number; status: string }>;
          const payout = Array.isArray(payoutArr) ? payoutArr[0] : null;
          if (payout && payout.status === 'completed') {
            const current = collectedByOrg.get(payout.organization_id) ?? 0;
            collectedByOrg.set(
              payout.organization_id,
              current + Number(item.commission_amount ?? 0),
            );
          }
        }
      }

      // Construir resultado
      const result: OrganizationWithCommission[] = [];

      for (const rate of rates) {
        // Supabase devuelve array en joins; tomar primer elemento
        const orgArr = rate.organizations as unknown as Array<{ name: string }>;
        const orgData = Array.isArray(orgArr) ? orgArr[0] : null;
        result.push({
          organizationId: rate.organization_id as number,
          organizationName: orgData?.name ?? 'Sin nombre',
          providerCode: rate.provider_code as string,
          commissionType: rate.commission_type as string,
          commissionValue: Number(rate.commission_value),
          totalCollected: collectedByOrg.get(rate.organization_id as number) ?? 0,
        });
      }

      return result;
    } catch (err) {
      console.error('[Commission] Excepcion en listOrganizationsWithCommissions:', err);
      return [];
    }
  }
  // --------------------------------------------------------
  // Metodos alias compatibles con API routes (reciben supabase)
  // --------------------------------------------------------

  /** Lista comisiones (alias para API routes) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async list(_supabase: unknown, organizationId?: number): Promise<CommissionRate[]> {
    return CommissionService.listCommissionRates(organizationId);
  }

  /** Crea/actualiza comision (alias para API routes) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async upsert(
    _supabase: unknown,
    config: { organizationId: number; providerCode: string; commissionType: 'percentage' | 'fixed_amount'; commissionValue: number; minCommissionAmount?: number },
  ): Promise<{ success: boolean; error?: string }> {
    return CommissionService.setCommissionRate(
      config.organizationId,
      config.providerCode,
      {
        commissionType: config.commissionType,
        commissionValue: config.commissionValue,
        minCommissionAmount: config.minCommissionAmount,
      },
    );
  }

  /** Resumen de comisiones por organizacion (alias para API routes) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async getSummary(_supabase: unknown): Promise<ReturnType<typeof CommissionService.listOrganizationsWithCommissions>> {
    return CommissionService.listOrganizationsWithCommissions();
  }
}

export const commissionService = CommissionService;
export default commissionService;
