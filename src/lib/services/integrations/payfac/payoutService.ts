// ============================================================
// Modelo B (PayFac/Agregador) — Servicio de dispersiones (payouts)
// ============================================================
// Gestiona la creacion, procesamiento y seguimiento de
// dispersiones a organizaciones, incluyendo el calculo de
// comisiones por payment.
// ============================================================

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { commissionService } from './commissionService';
import type { CommissionRate } from './commissionService';

/** Estado de un payout */
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** Metodo de dispersion */
export type PayoutMethod = 'breb' | 'ach' | 'manual' | 'mono_turbo';

/** Payout completo con sus items */
export interface Payout {
  id: string;
  organization_id: number;
  payout_reference: string;
  provider_code: string;
  total_amount: number;
  commission_amount: number;
  net_amount: number;
  currency: string;
  status: PayoutStatus;
  payout_method: PayoutMethod;
  bank_account_id: number | null;
  provider_payout_id: string | null;
  provider_response: Record<string, unknown> | null;
  period_start: string;
  period_end: string;
  scheduled_at: string | null;
  processed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  items?: PayoutItem[];
}

/** Item individual de un payout */
export interface PayoutItem {
  id: string;
  payout_id: string;
  payment_id: string;
  payment_qr_session_id: string | null;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  reference: string | null;
  created_at: string;
}

/** Resumen financiero de una organizacion */
export interface PayoutSummary {
  totalCollected: number;
  totalCommission: number;
  totalDispersed: number;
  pendingDispersal: number;
  lastPayoutAt?: string;
}

/** Parametros de entrada para crear un payout */
export interface CreatePayoutInput {
  providerCode: string;
  periodStart: string;
  periodEnd: string;
  payoutMethod?: PayoutMethod;
  bankAccountId?: number;
}

/** Payment pendiente de incluir en un payout */
interface PendingPayment {
  id: string;
  amount: number;
  reference: string | null;
  currency: string;
}

class PayoutService {
  /**
   * Crea un payout para una organizacion en un periodo especifico.
   * - Busca payments completados en el periodo que no esten en payout_items
   * - Calcula comision para cada payment
   * - Suma total_amount, commission_amount, net_amount
   * - Inserta en organization_payouts y payout_items
   */
  static async createPayout(
    organizationId: number,
    params: CreatePayoutInput,
  ): Promise<{ success: boolean; payoutId?: string; error?: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      // 1. Buscar payments completados en el periodo que no tengan payout_items
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, amount, reference, currency')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('payment_date', params.periodStart)
        .lte('payment_date', params.periodEnd)
        .order('payment_date', { ascending: true });

      if (paymentsError) {
        return { success: false, error: `Error al buscar payments: ${paymentsError.message}` };
      }

      if (!payments || payments.length === 0) {
        return { success: false, error: 'No hay payments completados en el periodo indicado' };
      }

      // 2. Filtrar payments que ya estan en payout_items
      const paymentIds = payments.map((p) => p.id as string);

      const { data: alreadyInPayouts, error: payoutItemsError } = await supabase
        .from('payout_items')
        .select('payment_id')
        .in('payment_id', paymentIds);

      if (payoutItemsError) {
        return { success: false, error: `Error al verificar payout_items: ${payoutItemsError.message}` };
      }

      const usedPaymentIds = new Set(
        (alreadyInPayouts ?? []).map((item) => item.payment_id as string),
      );

      const pendingPayments: PendingPayment[] = payments
        .filter((p) => !usedPaymentIds.has(p.id as string))
        .map((p) => ({
          id: p.id as string,
          amount: Number(p.amount),
          reference: (p.reference as string) ?? null,
          currency: (p.currency as string) ?? 'COP',
        }));

      if (pendingPayments.length === 0) {
        return { success: false, error: 'Todos los payments del periodo ya tienen payout asignado' };
      }

      // 3. Obtener tarifa de comision vigente
      const rate: CommissionRate | null = await commissionService.getCommissionRate(
        organizationId,
        params.providerCode,
      );

      // 4. Calcular comision y totales para cada payment
      let totalAmount = 0;
      let totalCommission = 0;
      let totalNet = 0;

      const payoutItemsToInsert: Array<{
        payment_id: string;
        gross_amount: number;
        commission_amount: number;
        net_amount: number;
        reference: string | null;
      }> = [];

      for (const payment of pendingPayments) {
        let commissionAmount = 0;
        let netAmount = payment.amount;

        if (rate) {
          const calc = commissionService.calculateCommission(payment.amount, rate);
          commissionAmount = calc.commissionAmount;
          netAmount = calc.netAmount;
        }

        totalAmount += payment.amount;
        totalCommission += commissionAmount;
        totalNet += netAmount;

        payoutItemsToInsert.push({
          payment_id: payment.id,
          gross_amount: payment.amount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          reference: payment.reference,
        });
      }

      // Redondear a 2 decimales
      totalAmount = Math.round(totalAmount * 100) / 100;
      totalCommission = Math.round(totalCommission * 100) / 100;
      totalNet = Math.round(totalNet * 100) / 100;

      // 5. Generar referencia de payout
      const payoutReference = `PO-${organizationId}-${Date.now()}`;

      // 6. Insertar payout
      const { data: payout, error: insertPayoutError } = await supabase
        .from('organization_payouts')
        .insert({
          organization_id: organizationId,
          payout_reference: payoutReference,
          provider_code: params.providerCode,
          total_amount: totalAmount,
          commission_amount: totalCommission,
          net_amount: totalNet,
          currency: 'COP',
          status: 'pending',
          payout_method: params.payoutMethod ?? 'breb',
          bank_account_id: params.bankAccountId ?? null,
          period_start: params.periodStart,
          period_end: params.periodEnd,
          updated_at: now,
        })
        .select('id')
        .single();

      if (insertPayoutError || !payout) {
        return { success: false, error: `Error al crear payout: ${insertPayoutError?.message ?? 'desconocido'}` };
      }

      const payoutId = payout.id as string;

      // 7. Insertar payout_items
      const itemsWithPayoutId = payoutItemsToInsert.map((item) => ({
        ...item,
        payout_id: payoutId,
      }));

      const { error: insertItemsError } = await supabase
        .from('payout_items')
        .insert(itemsWithPayoutId);

      if (insertItemsError) {
        // Rollback: marcar payout como failed
        await supabase
          .from('organization_payouts')
          .update({
            status: 'failed',
            failure_reason: `Error al insertar items: ${insertItemsError.message}`,
            failed_at: now,
            updated_at: now,
          })
          .eq('id', payoutId);

        return { success: false, error: `Error al insertar payout_items: ${insertItemsError.message}` };
      }

      return { success: true, payoutId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Payout] Excepcion en createPayout:', err);
      return { success: false, error: message };
    }
  }

  /**
   * Procesa un payout segun su metodo de dispersion.
   * - manual: marca como completed inmediatamente
   * - breb / mono_turbo: simula dispersion via Mono (processing -> completed)
   * - ach: marca como processing (pendiente de implementar ACH)
   */
  static async processPayout(payoutId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      // Obtener el payout
      const { data: payout, error: fetchError } = await supabase
        .from('organization_payouts')
        .select('id, status, payout_method')
        .eq('id', payoutId)
        .maybeSingle();

      if (fetchError || !payout) {
        return { success: false, error: 'Payout no encontrado' };
      }

      if (payout.status !== 'pending' && payout.status !== 'processing') {
        return { success: false, error: `Payout no se puede procesar (estado: ${payout.status})` };
      }

      const method = payout.payout_method as PayoutMethod;

      switch (method) {
        case 'manual': {
          // Marcar como completed inmediatamente
          const { error: updateError } = await supabase
            .from('organization_payouts')
            .update({
              status: 'completed',
              processed_at: now,
              updated_at: now,
            })
            .eq('id', payoutId);

          if (updateError) {
            return { success: false, error: `Error al completar: ${updateError.message}` };
          }

          return { success: true };
        }

        case 'breb':
        case 'mono_turbo': {
          // Simular dispersion via Mono: marcar como processing
          const { error: processingError } = await supabase
            .from('organization_payouts')
            .update({
              status: 'processing',
              updated_at: now,
            })
            .eq('id', payoutId);

          if (processingError) {
            return { success: false, error: `Error al marcar processing: ${processingError.message}` };
          }

          // Simular respuesta del provider y marcar como completed
          const providerResponse: Record<string, unknown> = {
            simulated: true,
            method,
            timestamp: now,
            message: 'Dispersion simulada via Mono',
          };

          const { error: completeError } = await supabase
            .from('organization_payouts')
            .update({
              status: 'completed',
              processed_at: now,
              provider_response: providerResponse,
              updated_at: now,
            })
            .eq('id', payoutId);

          if (completeError) {
            return { success: false, error: `Error al completar: ${completeError.message}` };
          }

          return { success: true };
        }

        case 'ach': {
          // Marcar como processing (pendiente de implementar ACH real)
          const { error: processingError } = await supabase
            .from('organization_payouts')
            .update({
              status: 'processing',
              updated_at: now,
            })
            .eq('id', payoutId);

          if (processingError) {
            return { success: false, error: `Error al marcar processing: ${processingError.message}` };
          }

          return { success: true };
        }

        default:
          return { success: false, error: `Metodo de dispersion no soportado: ${method}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Payout] Excepcion en processPayout:', err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene un payout con sus items.
   */
  static async getPayout(payoutId: string): Promise<Payout | null> {
    try {
      const supabase = getSupabaseAdmin();

      const { data: payout, error: payoutError } = await supabase
        .from('organization_payouts')
        .select('*')
        .eq('id', payoutId)
        .maybeSingle();

      if (payoutError || !payout) {
        console.error('[Payout] Error obteniendo payout:', payoutError);
        return null;
      }

      const { data: items, error: itemsError } = await supabase
        .from('payout_items')
        .select('*')
        .eq('payout_id', payoutId)
        .order('created_at', { ascending: true });

      if (itemsError) {
        console.error('[Payout] Error obteniendo items:', itemsError);
      }

      return {
        ...(payout as unknown as Payout),
        items: (items ?? []) as unknown as PayoutItem[],
      };
    } catch (err) {
      console.error('[Payout] Excepcion en getPayout:', err);
      return null;
    }
  }

  /**
   * Lista payouts con filtros opcionales.
   */
  static async listPayouts(filters: {
    organizationId?: number;
    status?: PayoutStatus;
    limit?: number;
  }): Promise<Payout[]> {
    try {
      const supabase = getSupabaseAdmin();

      let query = supabase
        .from('organization_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.organizationId !== undefined) {
        query = query.eq('organization_id', filters.organizationId);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.limit !== undefined) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Payout] Error listando payouts:', error);
        return [];
      }

      return (data ?? []) as unknown as Payout[];
    } catch (err) {
      console.error('[Payout] Excepcion en listPayouts:', err);
      return [];
    }
  }

  /**
   * Lista payouts pendientes (status = pending).
   */
  static async getPendingPayouts(organizationId?: number): Promise<Payout[]> {
    return this.listPayouts({ organizationId, status: 'pending' });
  }

  /**
   * Obtiene los items de un payout.
   */
  static async getPayoutItems(payoutId: string): Promise<PayoutItem[]> {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from('payout_items')
        .select('*')
        .eq('payout_id', payoutId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Payout] Error obteniendo items:', error);
        return [];
      }

      return (data ?? []) as unknown as PayoutItem[];
    } catch (err) {
      console.error('[Payout] Excepcion en getPayoutItems:', err);
      return [];
    }
  }

  /**
   * Cancela un payout pendiente o en procesamiento.
   */
  static async cancelPayout(
    payoutId: string,
    reason: string,
  ): Promise<{ success: boolean }> {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('organization_payouts')
        .update({
          status: 'cancelled',
          failure_reason: reason,
          updated_at: now,
        })
        .eq('id', payoutId)
        .in('status', ['pending', 'processing']);

      if (error) {
        console.error('[Payout] Error al cancelar payout:', error);
        return { success: false };
      }

      return { success: true };
    } catch (err) {
      console.error('[Payout] Excepcion en cancelPayout:', err);
      return { success: false };
    }
  }

  /**
   * Obtiene el resumen financiero de una organizacion.
   * - totalCollected: suma de gross_amount de todos los payout_items
   * - totalCommission: suma de commission_amount de todos los payout_items
   * - totalDispersed: suma de net_amount de payouts completados
   * - pendingDispersal: suma de net_amount de payouts pendientes/processing
   * - lastPayoutAt: fecha del ultimo payout
   */
  static async getOrganizationSummary(
    organizationId: number,
  ): Promise<PayoutSummary> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener todos los payouts de la organizacion
      const { data: payouts, error: payoutsError } = await supabase
        .from('organization_payouts')
        .select('id, net_amount, status, processed_at, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (payoutsError) {
        console.error('[Payout] Error obteniendo summary:', payoutsError);
        return {
          totalCollected: 0,
          totalCommission: 0,
          totalDispersed: 0,
          pendingDispersal: 0,
        };
      }

      const allPayouts = payouts ?? [];
      const completedPayouts = allPayouts.filter((p) => p.status === 'completed');
      const pendingPayouts = allPayouts.filter(
        (p) => p.status === 'pending' || p.status === 'processing',
      );

      // Obtener items de todos los payouts para sumar gross y commission
      const payoutIds = allPayouts.map((p) => p.id as string);

      let totalCollected = 0;
      let totalCommission = 0;

      if (payoutIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('payout_items')
          .select('gross_amount, commission_amount')
          .in('payout_id', payoutIds);

        if (itemsError) {
          console.error('[Payout] Error obteniendo items para summary:', itemsError);
        }

        if (items) {
          for (const item of items) {
            totalCollected += Number(item.gross_amount ?? 0);
            totalCommission += Number(item.commission_amount ?? 0);
          }
        }
      }

      // Sumar net_amount de completados y pendientes
      const totalDispersed = completedPayouts.reduce(
        (sum, p) => sum + Number(p.net_amount ?? 0),
        0,
      );

      const pendingDispersal = pendingPayouts.reduce(
        (sum, p) => sum + Number(p.net_amount ?? 0),
        0,
      );

      // Ultima fecha de payout
      const lastCompleted = completedPayouts.find((p) => p.processed_at);
      const lastPayoutAt = lastCompleted?.processed_at ?? undefined;

      return {
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalDispersed: Math.round(totalDispersed * 100) / 100,
        pendingDispersal: Math.round(pendingDispersal * 100) / 100,
        lastPayoutAt,
      };
    } catch (err) {
      console.error('[Payout] Excepcion en getOrganizationSummary:', err);
      return {
        totalCollected: 0,
        totalCommission: 0,
        totalDispersed: 0,
        pendingDispersal: 0,
      };
    }
  }
  // --------------------------------------------------------
  // Metodos alias compatibles con API routes (reciben supabase)
  // --------------------------------------------------------

  /** Lista payouts con filtros (alias para API routes) */
  static async list(
    _supabase: unknown,
    filters: { organizationId?: number; status?: PayoutStatus; limit?: number },
  ): Promise<Payout[]> {
    return PayoutService.listPayouts(filters);
  }

  /** Crea un payout (alias para API routes) */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  static async create(
    _supabase: unknown,
    params: CreatePayoutInput & { organizationId: number },
    _userId: string,
  ): Promise<{ success: boolean; payoutId?: string; error?: string }> {
    return PayoutService.createPayout(params.organizationId, params);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /** Obtiene un payout con items (alias para API routes) */
  static async getById(_supabase: unknown, id: string): Promise<Payout | null> {
    return PayoutService.getPayout(id);
  }

  /** Procesa o cancela un payout (alias para API routes) */
  static async process(
    _supabase: unknown,
    id: string,
    action: 'process' | 'cancel',
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (action === 'cancel') {
      return PayoutService.cancelPayout(id, reason ?? 'Cancelado por admin');
    }
    return PayoutService.processPayout(id);
  }

  /** Lista payouts pendientes (alias para API routes) */
  static async listPending(_supabase: unknown, organizationId?: number): Promise<Payout[]> {
    return PayoutService.getPendingPayouts(organizationId);
  }

  /** Resumen de organizacion (alias para API routes) */
  static async getSummary(_supabase: unknown, organizationId: number): Promise<PayoutSummary> {
    return PayoutService.getOrganizationSummary(organizationId);
  }

  /** Lista cuentas de dispersion de una organizacion con su cuenta contable vinculada */
  static async listAccounts(_supabase: unknown, organizationId: number): Promise<unknown[]> {
    try {
      const supabase = getSupabaseAdmin();
      // JOIN con bank_accounts para traer los datos de la cuenta contable vinculada
      const { data, error } = await supabase
        .from('organization_payout_accounts')
        .select(
          '*, bank_account:bank_accounts(id, name, bank_name, account_number, account_type, currency)',
        )
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[Payout] Error listando cuentas:', error);
        return [];
      }
      return data ?? [];
    } catch (err) {
      console.error('[Payout] Excepcion en listAccounts:', err);
      return [];
    }
  }

  /** Crea una cuenta de dispersion */
  static async createAccount(
    _supabase: unknown,
    input: {
      bankName: string;
      accountType: string;
      accountNumber: string;
      accountHolderName: string;
      accountHolderId: string;
      accountHolderIdType: string;
      brebKeyValue?: string;
      bankAccountId?: number;
    },
    organizationId: number,
  ): Promise<{ id?: string; error?: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('organization_payout_accounts')
        .insert({
          organization_id: organizationId,
          bank_name: input.bankName,
          account_type: input.accountType,
          account_number: input.accountNumber,
          account_holder_name: input.accountHolderName,
          account_holder_id: input.accountHolderId,
          account_holder_id_type: input.accountHolderIdType,
          breb_key_value: input.brebKeyValue ?? null,
          // Vinculacion opcional con cuenta contable (bank_accounts)
          bank_account_id: input.bankAccountId ?? null,
          is_active: true,
          is_verified: false,
        })
        .select('id')
        .single();
      if (error) {
        return { error: error.message };
      }
      return { id: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return { error: message };
    }
  }

  /** Desactiva una cuenta de dispersion */
  static async deactivateAccount(_supabase: unknown, id: string): Promise<{ success: boolean }> {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('organization_payout_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        return { success: false };
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }
}

export const payoutService = PayoutService;
export default payoutService;
