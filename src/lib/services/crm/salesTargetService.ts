import type { SupabaseClient } from '@supabase/supabase-js';
import { plainDateToInstant } from '@/lib/utils/dateDisplay';
import { addDaysPlain } from './quotaProgress';

/**
 * Servicio CRM para gestión de cuotas comerciales (F13).
 * Tablas: sales_targets, opportunities, activities, calls, organization_members
 * (columnas verificadas por MCP el 2026-09-15).
 */

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * Error de lectura/escritura en la BD que NO se disfraza de cero ni de lista
 * vacía (ronda 2). Las rutas lo mapean a 502 con mensaje honesto y la UI a un
 * estado de error, nunca a «Sin comisiones» o «0 %».
 */
export class DataSourceError extends Error {
  readonly statusCode = 502;
  readonly code = 'UPSTREAM_DATA';
  readonly table: string;
  readonly cause: unknown;
  constructor(table: string, cause: { message?: string } | null | undefined) {
    super(`No se pudo leer ${table}: ${cause?.message || 'error desconocido'}`);
    this.name = 'DataSourceError';
    this.table = table;
    this.cause = cause;
  }
}

/** Lanza `DataSourceError` si la respuesta de Supabase trae `error`. */
export function assertNoDbError(table: string, error: { message?: string } | null | undefined): void {
  if (error) throw new DataSourceError(table, error);
}

/**
 * Moneda base de la organización (`organization_currencies.is_base`). `null`
 * si no está configurada: quien llama decide (400 honesto o moneda explícita);
 * nunca se cablea «COP» aquí.
 */
export async function getOrgBaseCurrency(orgId: number, supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', orgId)
    .eq('is_base', true)
    .maybeSingle();
  assertNoDbError('organization_currencies', error);
  const code = (data?.currency_code as string | undefined)?.trim().toUpperCase();
  return code || null;
}

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
  /** Ya resuelta por la ruta: la del body o la moneda base de la organización. */
  target_currency: string;
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

export type SalesTargetWithProgress = SalesTarget & { progress: TargetProgress };

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

  assertNoDbError('sales_targets', error);

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
      target_currency: data.target_currency,
      target_type: data.target_type || 'revenue',
      achieved_amount: 0,
    })
    .select('*')
    .single();

  if (error) throw error;

  return result as SalesTarget;
}

/** Una cuota de la organización (o `null`): base para validar un PATCH parcial contra la fila existente. */
export async function getSalesTargetById(id: string, orgId: number, supabase: SupabaseClient): Promise<SalesTarget | null> {
  const { data, error } = await supabase.from('sales_targets').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  assertNoDbError('sales_targets', error);
  return (data as SalesTarget | null) ?? null;
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
 * Calcula el progreso de las cuotas de un usuario para un periodo desde datos
 * reales y persiste `achieved_amount` (histórico). `tz` es la zona horaria de
 * la organización: los límites del periodo (`date`) se convierten a instantes
 * con `plainDateToInstant`, nunca con sufijos `T23:59:59` en UTC.
 */
export async function getTargetProgress(
  orgId: number,
  userId: string,
  period: 'monthly' | 'quarterly' | 'yearly',
  supabase: SupabaseClient,
  tz: string
): Promise<TargetProgress[]> {
  const { data: targets, error: targetError } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('period', period)
    .order('period_start', { ascending: false });

  assertNoDbError('sales_targets', targetError);
  if (!targets || targets.length === 0) return [];

  const results: TargetProgress[] = [];

  for (const targetRow of targets as SalesTarget[]) {
    const achieved = await calculateAchievedAmount(
      orgId,
      userId,
      targetRow.target_type,
      targetRow.period_start,
      targetRow.period_end,
      supabase,
      tz
    );

    const { error: writeError } = await supabase
      .from('sales_targets')
      .update({
        achieved_amount: achieved,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetRow.id)
      .eq('organization_id', orgId);
    assertNoDbError('sales_targets', writeError);

    results.push(toProgress(targetRow, achieved));
  }

  return results;
}

/**
 * Historial de cuotas de un miembro con el cumplimiento calculado en vivo.
 * Solo lectura: no persiste `achieved_amount` (eso lo hace `getTargetProgress`).
 */
export async function listTargetsWithProgress(
  orgId: number,
  userId: string,
  supabase: SupabaseClient,
  tz: string
): Promise<SalesTargetWithProgress[]> {
  const { data, error } = await supabase
    .from('sales_targets')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .order('period_start', { ascending: false });

  assertNoDbError('sales_targets', error);

  const rows = (data || []) as SalesTarget[];
  const out: SalesTargetWithProgress[] = [];
  for (const row of rows) {
    const achieved = await calculateAchievedAmount(orgId, userId, row.target_type, row.period_start, row.period_end, supabase, tz);
    out.push({ ...row, achieved_amount: achieved, progress: toProgress(row, achieved) });
  }
  return out;
}

function toProgress(row: SalesTarget, achieved: number): TargetProgress {
  const target = Number(row.target_amount);
  return {
    target_id: row.id,
    user_id: row.user_id,
    target_type: row.target_type,
    target_amount: target,
    achieved_amount: achieved,
    progress_pct: target > 0 ? Math.round((achieved / target) * 100) : 0,
    period: row.period,
    period_start: row.period_start,
    period_end: row.period_end,
  };
}

/** ¿`userId` es miembro activo de la organización? (las cuotas solo se asignan a miembros). */
export async function isActiveMember(orgId: number, userId: string, supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Calcula el logrado desde datos reales según el target_type, en el periodo
 * [period_start, period_end] de la zona horaria de la organización. Un error
 * de BD se PROPAGA (`DataSourceError`): un 0 mentiría en la barra de cuota.
 * - revenue: suma de `amount` de oportunidades ganadas (`closed_at`) del vendedor
 * - deals: conteo de oportunidades ganadas
 * - activities: conteo de `activities` del usuario (`occurred_at`)
 * - calls: conteo de `calls` del usuario (`started_at`)
 */
export async function calculateAchievedAmount(
  orgId: number,
  userId: string,
  targetType: string,
  periodStart: string,
  periodEnd: string,
  supabase: SupabaseClient,
  tz: string
): Promise<number> {
  const from = plainDateToInstant(periodStart, tz, '00:00');
  // Exclusivo: medianoche del día siguiente al fin del periodo.
  const to = plainDateToInstant(addDaysPlain(periodEnd, 1), tz, '00:00');

  switch (targetType) {
    case 'revenue': {
      const { data, error } = await supabase
        .from('opportunities')
        .select('amount')
        .eq('organization_id', orgId)
        .eq('salesperson_id', userId)
        .eq('status', 'won')
        .gte('closed_at', from)
        .lt('closed_at', to);

      assertNoDbError('opportunities', error);
      return (data || []).reduce((sum: number, row: { amount: number | null }) => sum + (Number(row.amount) || 0), 0);
    }

    case 'deals': {
      const { count, error } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('salesperson_id', userId)
        .eq('status', 'won')
        .gte('closed_at', from)
        .lt('closed_at', to);

      assertNoDbError('opportunities', error);
      return count || 0;
    }

    case 'activities': {
      const { count, error } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .gte('occurred_at', from)
        .lt('occurred_at', to);

      assertNoDbError('activities', error);
      return count || 0;
    }

    case 'calls': {
      const { count, error } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .gte('started_at', from)
        .lt('started_at', to);

      assertNoDbError('calls', error);
      return count || 0;
    }

    default:
      throw new Error(`target_type desconocido: ${targetType}`);
  }
}
