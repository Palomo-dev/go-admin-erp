import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import { fetchJson } from '@/lib/utils/fetchJson';

const RATES_URL = '/api/crm/commission-rates';

async function postRate(body: { id?: string | null; salesperson_id: string | null; rate: number }): Promise<CommissionRate> {
  const res = await fetchJson<{ success: boolean; data: CommissionRate }>(RATES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.data;
}

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
 * Tabla: vendor_commission_rates (id, organization_id, salesperson_id, rate,
 *        valid_from date, valid_to date, created_at) — verificada por MCP el
 *        2026-09-28. No tiene valid_until, updated_at ni salesperson_name.
 *        Lectura de la tasa vigente: RPC fn_tasa_comision_vigente (día de la
 *        organización). Escritura: SOLO por /api/crm/commission-rates (servidor,
 *        rol de gestión; la tabla ya no admite escritura desde el navegador).
 * Tabla: commissions
 */

export interface CommissionRate {
  id: string;
  organization_id: number;
  salesperson_id: string | null;
  /** Solo en las lecturas de la ruta (join con profiles); no es columna. */
  salesperson_name?: string | null;
  rate: number;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

/** Alias para compatibilidad con el spec original */
export type VendorCommissionRate = CommissionRate;

export interface CommissionRateInput {
  salesperson_id: string;
  rate: number;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface CommissionAccrualResult {
  id: string;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  /** true si ya existía una comisión para la oportunidad en cualquier estado (p. ej. la del trigger de BD al ganar) y no se insertó otra. */
  already_accrued?: boolean;
  /** Estado de la comisión existente cuando `already_accrued` (accrued | paid | cancelled). */
  existing_status?: string;
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
    this.orgId = organizationId ?? getOrganizationId();
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
    // Sin try/catch que devuelva 0: un error de lectura no puede devengar una
    // comisión en cero (accrueCommission lo propaga).
    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select('id, organization_id, salesperson_id, commission_rate, amount, currency')
      .eq('id', opportunityId)
      .eq('organization_id', this.getOrgId())
      .single();
    if (oppError) throw oppError;

    const oppData = opp as OpportunityCommissionRow;
    const salesperson = salespersonId || oppData.salesperson_id;

    // 1. Override en la oportunidad
    if (oppData.commission_rate !== null && oppData.commission_rate > 0) {
      return Number(oppData.commission_rate);
    }
    // 2. Tasa vigente del vendedor y, si no hay, la general (una sola RPC).
    return this.resolveVigente(salesperson ?? null, true);
  }

  /** Tasa vigente hoy en el día de la organización (fn_tasa_comision_vigente). Lanza si la BD falla. */
  private async resolveVigente(salespersonId: string | null, includeGeneral: boolean): Promise<number> {
    const { data, error } = await supabase.rpc('fn_tasa_comision_vigente', {
      p_org: this.getOrgId(),
      p_salesperson: salespersonId,
      p_incluir_general: includeGeneral,
    });
    if (error) throw error;
    return Number(data) || 0;
  }

  /** Tasa general vigente de la organización. */
  async getOrgDefaultRate(): Promise<number> {
    return this.resolveVigente(null, true);
  }

  /** Tasa vigente de un vendedor (sin caer a la general). Lanza si la BD falla. */
  async getVendorRate(salespersonId: string): Promise<number> {
    return this.resolveVigente(salespersonId, false);
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

      // F10 r2/r3: el trigger fn_create_commission_on_opportunity_won ya inserta
      // commissions(source_type='opportunity', source_id) al pasar a ganada, y
      // el modal de cierre corre DESPUÉS del cambio de etapa. Deduplicar por
      // (organization_id, source_type, source_id) en CUALQUIER estado, igual
      // que el trigger (COUNT(*) sin filtrar status, leído por MCP): una
      // comisión `cancelled` es un rechazo o clawback de un gestor y no se
      // vuelve a devengar sola; si procede, se hace desde Comisiones (F13).
      // Carrera residual: lectura + inserción sin índice único en commissions;
      // dos clics simultáneos podrían colarse (documentado, sin migración).
      const { data: existing } = await supabase
        .from('commissions')
        .select('id, base_amount, commission_rate, commission_amount, status')
        .eq('organization_id', orgId)
        .eq('source_type', 'opportunity')
        .eq('source_id', opportunityId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        const row = existing as CommissionAccrualResult;
        return { ...row, already_accrued: true, existing_status: row.status };
      }

      const rate = await this.getRate(opportunityId, salespersonId);
      const amount = (baseAmount * rate) / 100;

      // Obtener moneda de la oportunidad
      const { data: opp } = await supabase
        .from('opportunities')
        .select('currency')
        .eq('id', opportunityId)
        .single();

      // Moneda de la oportunidad; sin ella, NULL y el trigger
      // `trg_00_moneda_base_por_defecto` pone la base de la organización.
      const currency = (opp as { currency?: string } | null)?.currency || null;

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

  // ============== MÉTODOS PARA UI (CommissionsPanel) ==============
  // Todo por la ruta del servidor: la organización sale de la sesión y la
  // escritura exige rol de gestión (dos veces: ruta y RPC).

  /** Guarda la tasa general de la organización. */
  async saveOrgDefaultRate(rate: number): Promise<CommissionRate> {
    return postRate({ salesperson_id: null, rate });
  }

  /** Guarda la tasa de un vendedor (actualiza la existente si ya tiene). */
  async saveVendorRate(salespersonId: string, rate: number, id?: string | null): Promise<CommissionRate> {
    return postRate({ id: id ?? null, salesperson_id: salespersonId, rate });
  }

  /** Tasas por vendedor de la organización, con el nombre del vendedor. */
  async listVendorRates(): Promise<CommissionRate[]> {
    const res = await fetchJson<{ success: boolean; data: { general: CommissionRate | null; vendors: CommissionRate[] } }>(RATES_URL);
    return res.data.vendors;
  }

  /** Tasa general guardada (la fila), o null. */
  async getGeneralRate(): Promise<CommissionRate | null> {
    const res = await fetchJson<{ success: boolean; data: { general: CommissionRate | null; vendors: CommissionRate[] } }>(RATES_URL);
    return res.data.general;
  }

  /** Elimina la tasa de un vendedor. */
  async deleteOverride(id: string): Promise<void> {
    await fetchJson(`${RATES_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /**
   * Simula el cálculo de comisión para un monto dado usando la tasa general.
   * @param amount - Monto base
   * @returns { rate, commission }
   */
  async simulate(amount: number): Promise<SimulationResult> {
    const rate = await this.getOrgDefaultRate();
    return { rate, commission: (amount * rate) / 100 };
  }
}

export const commissionService = new CommissionService();
export default CommissionService;
