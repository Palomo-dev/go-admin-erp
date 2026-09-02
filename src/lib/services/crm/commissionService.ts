import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestión de comisiones de oportunidades.
 *
 * Dos responsabilidades sobre infraestructura existente:
 *
 * 1. Config (lectura): cadena de resolución de tasa:
 *    - override en opportunity (opportunity.commission_rate)
 *    - tasa vigente del vendedor (vendor_commission_rates con salesperson_id NOT NULL)
 *    - % general de la org (fila con salesperson_id IS NULL)
 *
 * 2. Devengo (escritura): al ganar oportunidad, INSERT en commissions con:
 *    - source_type='opportunity'
 *    - commission_type='salesperson'
 *    - status='accrued'
 *    - base_amount, rate, amount
 *
 * Tabla: vendor_commission_rates (id, organization_id, salesperson_id, salesperson_name,
 *        rate, valid_from, valid_until, created_at, updated_at)
 * Tabla: commissions (ver esquema existente en commissionsService.ts)
 */

export interface CommissionRate {
  id: string;
  organization_id: number;
  salesperson_id: string | null;
  salesperson_name: string | null;
  rate: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Alias para compatibilidad con el spec original */
export type VendorCommissionRate = CommissionRate;

export interface CommissionRateInput {
  salesperson_id: string;
  salesperson_name?: string;
  rate: number;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface CommissionAccrualResult {
  id: string;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
}

export interface SimulationResult {
  rate: number;
  commission: number;
}

interface OpportunityCommissionRow {
  id: string;
  organization_id: number;
  salesperson_id: string | null;
  commission_rate: number | null;
  amount: number | null;
  currency: string | null;
}

class CommissionService {
  private orgId: number;

  constructor(organizationId?: number) {
    this.orgId = organizationId ?? getOrganizationIdFromContext();
  }

  private getOrgId(): number {
    return this.orgId;
  }

  // ============== MÉTODOS DEL SPEC (FASE 1) ==============

  /**
   * Resuelve la tasa de comisión siguiendo la cadena de prioridad:
   * 1. Override en la oportunidad (opportunity.commission_rate > 0)
   * 2. Tasa del vendedor (vendor_commission_rates con salesperson_id NOT NULL)
   * 3. Tasa general de la org (vendor_commission_rates con salesperson_id IS NULL)
   *
   * @param opportunityId - ID de la oportunidad
   * @param salespersonId - ID del vendedor (opcional, fallback al de la oportunidad)
   * @returns Tasa de comisión (0-100)
   */
  async getRate(opportunityId: string, salespersonId?: string): Promise<number> {
    try {
      // 1. Obtener la oportunidad
      const { data: opp, error: oppError } = await supabase
        .from('opportunities')
        .select('id, organization_id, salesperson_id, commission_rate, amount, currency')
        .eq('id', opportunityId)
        .single();

      if (oppError || !opp) {
        console.warn('No se pudo obtener la oportunidad para resolver tasa:', oppError?.message);
        return 0;
      }

      const oppData = opp as OpportunityCommissionRow;
      const salesperson = salespersonId || oppData.salesperson_id;

      // 2. Override en la oportunidad
      if (oppData.commission_rate !== null && oppData.commission_rate > 0) {
        return Number(oppData.commission_rate);
      }

      // 3. Tasa del vendedor
      if (salesperson) {
        const vendorRate = await this.getVendorRate(salesperson);
        if (vendorRate > 0) return vendorRate;
      }

      // 4. Tasa general de la org
      const orgRate = await this.getOrgDefaultRate();
      return orgRate;
    } catch (err) {
      console.error('Error en commissionService.getRate:', err);
      return 0;
    }
  }

  /**
   * Obtiene la tasa general de la organización (fila con salesperson_id IS NULL).
   */
  async getOrgDefaultRate(): Promise<number> {
    try {
      const rate = await this.getGeneralRate();
      return rate?.rate ?? 0;
    } catch (err) {
      console.warn('Error en commissionService.getOrgDefaultRate:', err);
      return 0;
    }
  }

  /**
   * Obtiene la tasa de un vendedor específico (fila con salesperson_id NOT NULL).
   */
  async getVendorRate(salespersonId: string): Promise<number> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('vendor_commission_rates')
        .select('rate, valid_from, valid_until')
        .eq('organization_id', orgId)
        .eq('salesperson_id', salespersonId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Advertencia obteniendo tasa del vendedor:', error.message);
        return 0;
      }
      if (!data) return 0;

      // Verificar vigencia
      const now = new Date();
      const validFrom = (data as { valid_from?: string | null }).valid_from;
      const validUntil = (data as { valid_until?: string | null }).valid_until;
      if (validFrom && now < new Date(validFrom)) return 0;
      if (validUntil && now > new Date(validUntil)) return 0;

      return Number((data as { rate: number }).rate);
    } catch (err) {
      console.warn('Error en commissionService.getVendorRate:', err);
      return 0;
    }
  }

  /**
   * Registra el devengo de comisión al ganar una oportunidad.
   * INSERT en commissions con source_type='opportunity', commission_type='salesperson', status='accrued'.
   *
   * @param opportunityId - ID de la oportunidad ganada
   * @param salespersonId - ID del vendedor
   * @param baseAmount - Monto base (amount de la oportunidad)
   * @returns Registro de comisión creado
   */
  async accrueCommission(
    opportunityId: string,
    salespersonId: string,
    baseAmount: number
  ): Promise<CommissionAccrualResult | null> {
    try {
      const orgId = this.getOrgId();
      const rate = await this.getRate(opportunityId, salespersonId);
      const amount = (baseAmount * rate) / 100;

      // Obtener moneda de la oportunidad
      const { data: opp } = await supabase
        .from('opportunities')
        .select('currency')
        .eq('id', opportunityId)
        .single();

      const currency = (opp as { currency?: string } | null)?.currency || 'COP';

      const { data, error } = await supabase
        .from('commissions')
        .insert({
          organization_id: orgId,
          commission_type: 'salesperson',
          source_type: 'opportunity',
          source_id: opportunityId,
          payee_type: 'employee',
          payee_id: salespersonId,
          base_amount: baseAmount,
          commission_rate: rate,
          commission_amount: amount,
          currency,
          status: 'accrued',
          accrued_at: new Date().toISOString(),
          metadata: { opportunity_id: opportunityId },
        })
        .select('id, base_amount, commission_rate, commission_amount, status')
        .single();

      if (error) throw error;
      return data as CommissionAccrualResult;
    } catch (err) {
      console.error('Error en commissionService.accrueCommission:', err);
      throw err;
    }
  }

  /**
   * Guarda (upsert) la tasa general de la organización (salesperson_id IS NULL).
   */
  async saveOrgDefaultRate(rate: number): Promise<CommissionRate | null> {
    return this.setGeneralRate(rate);
  }

  /**
   * Guarda (upsert) la tasa de un vendedor específico.
   */
  async saveVendorRate(salespersonId: string, rate: number): Promise<CommissionRate | null> {
    return this.setOverride(null, {
      salesperson_id: salespersonId,
      rate,
    });
  }

  /**
   * Obtiene todas las tasas de comisión de la organización (generales + por vendedor).
   */
  async listVendorRates(): Promise<CommissionRate[]> {
    return this.getOverrides();
  }

  // ============== MÉTODOS PARA UI (CommissionsPanel) ==============

  /**
   * Obtiene la tasa general de la organización (fila con salesperson_id IS NULL).
   * @returns Registro CommissionRate o null si no existe
   */
  async getGeneralRate(): Promise<CommissionRate | null> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('vendor_commission_rates')
        .select('*')
        .eq('organization_id', orgId)
        .is('salesperson_id', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Advertencia obteniendo tasa general:', error.message);
        return null;
      }
      return (data as CommissionRate) || null;
    } catch (err) {
      console.warn('Error en commissionService.getGeneralRate:', err);
      return null;
    }
  }

  /**
   * Obtiene todos los overrides por vendedor (salesperson_id NOT NULL).
   */
  async getOverrides(): Promise<CommissionRate[]> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('vendor_commission_rates')
        .select('*')
        .eq('organization_id', orgId)
        .not('salesperson_id', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn('Advertencia obteniendo overrides:', error.message);
        return [];
      }
      return (data || []) as CommissionRate[];
    } catch (err) {
      console.warn('Error en commissionService.getOverrides:', err);
      return [];
    }
  }

  /**
   * Guarda la tasa general de la organización.
   */
  async setGeneralRate(rate: number): Promise<CommissionRate | null> {
    try {
      const orgId = this.getOrgId();

      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('vendor_commission_rates')
        .select('id')
        .eq('organization_id', orgId)
        .is('salesperson_id', null)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('vendor_commission_rates')
          .update({
            rate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as { id: string }).id)
          .select()
          .single();

        if (error) throw error;
        return data as CommissionRate;
      }

      const { data, error } = await supabase
        .from('vendor_commission_rates')
        .insert({
          organization_id: orgId,
          salesperson_id: null,
          salesperson_name: null,
          rate,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CommissionRate;
    } catch (err) {
      console.error('Error en commissionService.setGeneralRate:', err);
      throw err;
    }
  }

  /**
   * Guarda (upsert) un override por vendedor.
   * @param id - ID del override existente (null para crear nuevo)
   * @param data - Datos del override
   */
  async setOverride(id: string | null, data: CommissionRateInput): Promise<CommissionRate | null> {
    try {
      const orgId = this.getOrgId();

      if (id) {
        // Actualizar existente
        const { data: result, error } = await supabase
          .from('vendor_commission_rates')
          .update({
            salesperson_id: data.salesperson_id,
            salesperson_name: data.salesperson_name || null,
            rate: data.rate,
            valid_from: data.valid_from || null,
            valid_until: data.valid_until || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return result as CommissionRate;
      }

      // Crear nuevo
      const { data: result, error } = await supabase
        .from('vendor_commission_rates')
        .insert({
          organization_id: orgId,
          salesperson_id: data.salesperson_id,
          salesperson_name: data.salesperson_name || null,
          rate: data.rate,
          valid_from: data.valid_from || null,
          valid_until: data.valid_until || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result as CommissionRate;
    } catch (err) {
      console.error('Error en commissionService.setOverride:', err);
      throw err;
    }
  }

  /**
   * Elimina un override por vendedor.
   */
  async deleteOverride(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('vendor_commission_rates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error en commissionService.deleteOverride:', err);
      throw err;
    }
  }

  /**
   * Simula el cálculo de comisión para un monto dado usando la tasa general.
   * @param amount - Monto base
   * @returns { rate, commission }
   */
  async simulate(amount: number): Promise<SimulationResult> {
    try {
      const rate = await this.getOrgDefaultRate();
      const commission = (amount * rate) / 100;
      return { rate, commission };
    } catch (err) {
      console.error('Error en commissionService.simulate:', err);
      return { rate: 0, commission: 0 };
    }
  }
}

export const commissionService = new CommissionService();
export default CommissionService;

// ─── Funciones server-side (F13) — gestión de comisiones ─────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommissionRow {
  id: string;
  organization_id: number;
  commission_type: string;
  source_type: string;
  source_id: string;
  payee_type: string;
  payee_id: string | null;
  payee_name: string | null;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  currency: string | null;
  status: string;
  accrued_at: string | null;
  paid_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CommissionStatsFilters {
  status?: string;
  payee_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface CommissionStats {
  total_accrued: number;
  total_paid: number;
  total_pending: number;
  total_rejected: number;
  count_by_status: Record<string, number>;
}

/**
 * Marca una comisión como pagada.
 */
export async function payCommission(
  commissionId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CommissionRow | null> {
  const { data, error } = await supabase
    .from('commissions')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', commissionId)
    .eq('organization_id', orgId)
    .eq('status', 'accrued')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[commissionService.payCommission] error:', error.message);
    throw error;
  }

  return data as CommissionRow | null;
}

/**
 * Rechaza una comisión con un motivo.
 */
export async function rejectCommission(
  commissionId: string,
  orgId: number,
  reason: string,
  supabase: SupabaseClient
): Promise<CommissionRow | null> {
  const { data, error } = await supabase
    .from('commissions')
    .update({
      status: 'rejected',
      notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commissionId)
    .eq('organization_id', orgId)
    .in('status', ['accrued', 'paid'])
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[commissionService.rejectCommission] error:', error.message);
    throw error;
  }

  return data as CommissionRow | null;
}

/**
 * Clawback: revierte una comisión pagada (devuelve a estado 'accrued' o 'rejected').
 */
export async function clawbackCommission(
  commissionId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CommissionRow | null> {
  const { data, error } = await supabase
    .from('commissions')
    .update({
      status: 'rejected',
      paid_at: null,
      notes: 'Clawback aplicado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', commissionId)
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[commissionService.clawbackCommission] error:', error.message);
    throw error;
  }

  return data as CommissionRow | null;
}

/**
 * Pago masivo de comisiones.
 */
export async function bulkPayCommissions(
  commissionIds: string[],
  orgId: number,
  supabase: SupabaseClient
): Promise<{ paid: number; failed: number }> {
  const now = new Date().toISOString();
  let paid = 0;
  let failed = 0;

  // Procesar una por una para validar que cada una esté en estado 'accrued'
  for (const id of commissionIds) {
    const result = await payCommission(id, orgId, supabase);
    if (result) {
      paid++;
    } else {
      failed++;
    }
  }

  return { paid, failed };
}

/**
 * Obtiene estadísticas de comisiones de una organización.
 */
export async function getCommissionStats(
  orgId: number,
  supabase: SupabaseClient,
  filters?: CommissionStatsFilters
): Promise<CommissionStats> {
  let query = supabase
    .from('commissions')
    .select('status, commission_amount')
    .eq('organization_id', orgId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.payee_id) {
    query = query.eq('payee_id', filters.payee_id);
  }
  if (filters?.from_date) {
    query = query.gte('accrued_at', filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte('accrued_at', filters.to_date);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('[commissionService.getCommissionStats] error:', error?.message);
    return {
      total_accrued: 0,
      total_paid: 0,
      total_pending: 0,
      total_rejected: 0,
      count_by_status: {},
    };
  }

  const rows = data as Array<{ status: string; commission_amount: number }>;

  const stats: CommissionStats = {
    total_accrued: 0,
    total_paid: 0,
    total_pending: 0,
    total_rejected: 0,
    count_by_status: {},
  };

  for (const row of rows) {
    const amount = Number(row.commission_amount) || 0;
    stats.count_by_status[row.status] = (stats.count_by_status[row.status] || 0) + 1;

    switch (row.status) {
      case 'accrued':
        stats.total_accrued += amount;
        stats.total_pending += amount;
        break;
      case 'paid':
        stats.total_paid += amount;
        break;
      case 'rejected':
        stats.total_rejected += amount;
        break;
    }
  }

  return stats;
}
