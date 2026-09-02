import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM para gestión de cuotas comerciales (F13).
 * Tablas: sales_targets, opportunities, invoice_sales, activities, calls
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface SalesTarget {
  id: string;
  organization_id: number;
  user_id: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  target_amount: number;
  target_currency: string;
  target_type: 'revenue' | 'deals' | 'activities' | 'calls';
  achieved_amount: number;
  created_at: string;
  updated_at: string;
}

export interface SalesTargetInput {
  user_id: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  target_amount: number;
  target_currency?: string;
  target_type?: 'revenue' | 'deals' | 'activities' | 'calls';
}

export interface SalesTargetUpdateInput {
  period?: 'monthly' | 'quarterly' | 'yearly';
  period_start?: string;
  period_end?: string;
  target_amount?: number;
  target_currency?: string;
  target_type?: 'revenue' | 'deals' | 'activities' | 'calls';
  achieved_amount?: number;
}

export interface SalesTargetFilters {
  user_id?: string;
  period?: string;
  target_type?: string;
  period_start?: string;
  period_end?: string;
  limit?: number;
  offset?: number;
}

export interface TargetProgress {
  target_id: string;
  user_id: string;
  target_type: string;
  target_amount: number;
  achieved_amount: number;
  progress_pct: number;
  period: string;
  period_start: string;
  period_end: string;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista las cuotas de una organización con filtros opcionales.
 */
export async function getSalesTargets(
  orgId: number,
  supabase: SupabaseClient,
  filters?: SalesTargetFilters
): Promise<{ data: SalesTarget[]; count: number }> {
  let query = supabase
    .from('sales_targets')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('period_start', { ascending: false });

  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters?.period) {
    query = query.eq('period', filters.period);
  }
  if (filters?.target_type) {
    query = query.eq('target_type', filters.target_type);
  }
  if (filters?.period_start) {
    query = query.gte('period_start', filters.period_start);
  }
  if (filters?.period_end) {
    query = query.lte('period_end', filters.period_end);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[salesTargetService.getSalesTargets] error:', error.message);
    return { data: [], count: 0 };
  }

  return {
    data: (data || []) as SalesTarget[],
    count: count || 0,
  };
}

/**
 * Crea una cuota comercial.
 */
export async function createSalesTarget(
  orgId: number,
  data: SalesTargetInput,
  supabase: SupabaseClient
): Promise<SalesTarget | null> {
  const { data: result, error } = await supabase
    .from('sales_targets')
    .insert({
      organization_id: orgId,
      user_id: data.user_id,
      period: data.period,
      period_start: data.period_start,
      period_end: data.period_end,
      target_amount: data.target_amount,
      target_currency: data.target_currency || 'USD',
      target_type: data.target_type || 'revenue',
      achieved_amount: 0,
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as SalesTarget;
}

/**
 * Actualiza una cuota comercial.
 */
export async function updateSalesTarget(
  id: string,
  orgId: number,
  data: SalesTargetUpdateInput,
  supabase: SupabaseClient
): Promise<SalesTarget | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.period !== undefined) updateData.period = data.period;
  if (data.period_start !== undefined) updateData.period_start = data.period_start;
  if (data.period_end !== undefined) updateData.period_end = data.period_end;
  if (data.target_amount !== undefined) updateData.target_amount = data.target_amount;
  if (data.target_currency !== undefined) updateData.target_currency = data.target_currency;
  if (data.target_type !== undefined) updateData.target_type = data.target_type;
  if (data.achieved_amount !== undefined) updateData.achieved_amount = data.achieved_amount;

  const { data: result, error } = await supabase
    .from('sales_targets')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return result as SalesTarget | null;
}

/**
 * Elimina una cuota comercial.
 */
export async function deleteSalesTarget(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('sales_targets')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Calcula el progreso de una cuota desde datos reales.
 * Según target_type:
 * - revenue: suma de amount de opportunities ganadas en el periodo
 * - deals: conteo de opportunities ganadas en el periodo
 * - activities: conteo de activities en el periodo
 * - calls: conteo de calls en el periodo
 */
export async function getTargetProgress(
  orgId: number,
  userId: string,
  period: 'monthly' | 'quarterly' | 'yearly',
  supabase: SupabaseClient
): Promise<TargetProgress[]> {
  // 1. Obtener las cuotas del usuario para el periodo indicado
  const { data: targets, error: targetError } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('period', period)
    .order('period_start', { ascending: false });

  if (targetError || !targets || targets.length === 0) {
    return [];
  }

  const results: TargetProgress[] = [];

  for (const targetRow of targets as SalesTarget[]) {
    const achieved = await calculateAchievedAmount(
      orgId,
      userId,
      targetRow.target_type,
      targetRow.period_start,
      targetRow.period_end,
      supabase
    );

    // Actualizar achieved_amount en la BD
    await supabase
      .from('sales_targets')
      .update({
        achieved_amount: achieved,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetRow.id);

    const progressPct = targetRow.target_amount > 0
      ? Math.round((achieved / targetRow.target_amount) * 100)
      : 0;

    results.push({
      target_id: targetRow.id,
      user_id: userId,
      target_type: targetRow.target_type,
      target_amount: Number(targetRow.target_amount),
      achieved_amount: achieved,
      progress_pct: progressPct,
      period: targetRow.period,
      period_start: targetRow.period_start,
      period_end: targetRow.period_end,
    });
  }

  return results;
}

/**
 * Calcula el achieved_amount desde datos reales según el target_type.
 */
async function calculateAchievedAmount(
  orgId: number,
  userId: string,
  targetType: string,
  periodStart: string,
  periodEnd: string,
  supabase: SupabaseClient
): Promise<number> {
  switch (targetType) {
    case 'revenue': {
      // Suma de amount de opportunities ganadas asignadas al usuario en el periodo
      const { data, error } = await supabase
        .from('opportunities')
        .select('amount')
        .eq('organization_id', orgId)
        .eq('salesperson_id', userId)
        .eq('status', 'won')
        .gte('updated_at', periodStart)
        .lte('updated_at', periodEnd + 'T23:59:59');

      if (error || !data) return 0;

      return data.reduce((sum: number, row: { amount: number | null }) => {
        return sum + (Number(row.amount) || 0);
      }, 0);
    }

    case 'deals': {
      // Conteo de opportunities ganadas
      const { count, error } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('salesperson_id', userId)
        .eq('status', 'won')
        .gte('updated_at', periodStart)
        .lte('updated_at', periodEnd + 'T23:59:59');

      if (error) return 0;

      return count || 0;
    }

    case 'activities': {
      // Conteo de activities del usuario en el periodo
      const { count, error } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59');

      if (error) return 0;

      return count || 0;
    }

    case 'calls': {
      // Conteo de calls del usuario en el periodo
      const { count, error } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .gte('started_at', periodStart)
        .lte('started_at', periodEnd + 'T23:59:59');

      if (error) return 0;

      return count || 0;
    }

    default:
      return 0;
  }
}
