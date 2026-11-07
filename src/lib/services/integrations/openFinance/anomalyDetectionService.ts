/**
 * Servicio de deteccion de anomalias en transacciones bancarias.
 * Detecta duplicados, montos inusuales, patrones sospechosos
 * y discrepancias de saldo entre el ERP y Open Finance.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { plainDayOfInstant } from '@/lib/services/businessInstant';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TABLA_REVISIONES,
  claveDiferenciaSaldo,
  claveDuplicado,
  claveDuplicadoExterno,
  claveMovimiento,
  esTablaRevisionesInexistente,
  etiquetaCuenta,
  nombrePerfil,
  type EntradaRevision,
  type MovimientoAlerta,
  type ResultadoRevision,
  type RevisionAlerta,
  type TipoAlerta,
} from './alertasBancarias';

// ============================================================
// Fase B, tanda 9 (arrastre). `bank_transactions.trans_date` y
// `open_finance_transactions.transaction_date` son **timestamptz**. La clave de
// agrupacion de duplicados incluye el DIA, y ese dia se sacaba con
// `valor.split('T')[0]`, que la regla 2 de `docs/reglas-fechas-timezone.md`
// prohibe: se queda con el dia UTC. Dos cargos identicos hechos a las 19:30 y a
// las 20:30 en Bogota (mismo dia del negocio) caian en grupos distintos y el
// duplicado no se detectaba.
// ============================================================

// ============================================================
// Finanzas, ronda 2 (A1/A2, 2026-11-07). Los ids de las alertas eran
// posicionales (`dup-1`, `unusual-3`): cambiaban en cada lectura y no servian
// para guardar nada. Ahora son claves estables (`alertasBancarias.ts`) y la
// revision de cada alerta se guarda en `bank_alert_reviews` con autor, fecha y
// motivo.
// ============================================================

const COLUMNAS_REVISION =
  'alert_key, alert_type, outcome, reason, reviewed_by, reviewed_at, voided_bank_transaction_id';

interface FilaRevision {
  alert_key: string;
  alert_type: TipoAlerta;
  outcome: ResultadoRevision;
  reason: string;
  reviewed_by: string | null;
  reviewed_at: string;
  voided_bank_transaction_id: number | null;
}

function revisionDesdeFila(f: FilaRevision, nombres: Map<string, string>): RevisionAlerta {
  return {
    clave: f.alert_key,
    tipo: f.alert_type,
    resultado: f.outcome,
    motivo: f.reason,
    revisadoPor: f.reviewed_by,
    revisadoPorNombre: f.reviewed_by ? nombres.get(f.reviewed_by) ?? null : null,
    revisadoEn: f.reviewed_at,
    movimientoAnuladoId: f.voided_bank_transaction_id,
  };
}

/** Alerta de transaccion duplicada */
export interface DuplicateAlert {
  id: string;
  transactionIds: number[];
  amount: number;
  date: string;
  description: string;
  count: number;
  severity: 'high' | 'medium';
  /** Cuenta del primer movimiento del grupo (null si el duplicado vino del banco sin vincular). */
  bankAccountId?: number | null;
  /** «Bancolombia ··4321»; lo llena `getAllAnomalies`. */
  bankAccountName?: string | null;
  /** Movimientos de GO Admin del grupo (para «Es un duplicado: anular uno»). */
  movimientos?: MovimientoAlerta[];
}

/** Alerta generica de anomalia */
export interface AnomalyAlert {
  id: string;
  type: 'unusual_amount' | 'unusual_time' | 'fragmentation' | 'weekend_high_amount';
  severity: 'high' | 'medium' | 'low';
  transactionId?: number;
  amount?: number;
  date?: string;
  description: string;
  expectedValue?: number;
  actualValue?: number;
  bankAccountId?: number | null;
  /** «Bancolombia ··4321»; lo llena `getAllAnomalies`. */
  bankAccountName?: string | null;
}

/** Discrepancia de saldo entre fuentes */
export interface BalanceDiscrepancy {
  id: string;
  bankAccountId: number;
  bankAccountName: string;
  localBalance: number;
  calculatedBalance: number;
  realBalance: number | null;
  difference: number;
  severity: 'high' | 'medium';
}

/** Resumen consolidado de anomalias */
export interface AnomalySummary {
  duplicates: DuplicateAlert[];
  unusualAmounts: AnomalyAlert[];
  suspiciousPatterns: AnomalyAlert[];
  balanceDiscrepancies: BalanceDiscrepancy[];
  totalAlerts: number;
  highSeverity: number;
}

/** Fila de bank_transactions (campos usados) */
interface BankTransactionRow {
  id: number;
  organization_id: number;
  bank_account_id: number;
  trans_date: string;
  description: string | null;
  amount: number;
  reference: string | null;
  transaction_type: string;
  status: string | null;
  import_source: string | null;
  import_id: string | null;
}

/** Fila de open_finance_transactions (campos usados) */
interface OpenFinanceTransactionRow {
  id: string;
  link_id: string;
  account_id: string;
  organization_id: number;
  bank_transaction_id: number | null;
  external_transaction_id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  counterparty: string | null;
  reference: string | null;
  transaction_type: string | null;
  is_imported: boolean;
}

/** Fila de bank_accounts (campos usados) */
interface BankAccountRow {
  id: number;
  organization_id: number;
  name: string;
  balance: number;
  initial_balance: number | null;
  is_active: boolean;
}

/** Fila de open_finance_accounts (campos usados) */
interface OpenFinanceAccountRow {
  id: string;
  link_id: string;
  organization_id: number;
  bank_account_id: number | null;
  last_balance: number | null;
  last_balance_at: string | null;
  is_active: boolean;
}

/** Estadisticas calculadas de montos */
interface AmountStats {
  mean: number;
  stdDev: number;
}

export class AnomalyDetectionService {
  /**
   * Detecta transacciones duplicadas en bank_transactions.
   * Agrupa por (amount, trans_date::date, description) y marca
   * los grupos con count > 1. Tambien busca duplicados en
   * open_finance_transactions con mismo external_transaction_id.
   * @param organizationId ID de la organizacion
   * @param dateFrom Fecha inicial opcional (ISO)
   * @param dateTo Fecha final opcional (ISO)
   * @returns Lista de alertas de duplicados
   */
  static async detectDuplicates(
    organizationId: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<DuplicateAlert[]> {
    try {
      const supabase = getSupabaseAdmin();
      const alerts: DuplicateAlert[] = [];

      // El dia con el que se agrupa sale de la zona de la organizacion
      // (ADR-003: el servicio ya recibe la identidad).
      const timezone = await resolveTimezone(organizationId);

      // Consultar transacciones bancarias en el rango
      let query = supabase
        .from('bank_transactions')
        .select('id, organization_id, bank_account_id, trans_date, description, amount, reference, transaction_type, status, import_source, import_id')
        .eq('organization_id', organizationId);

      if (dateFrom) {
        query = query.gte('trans_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('trans_date', dateTo);
      }

      const { data: transactions, error } = await query;

      if (error) {
        throw new Error(`Error al consultar transacciones: ${error.message}`);
      }

      const txList = (transactions || []) as BankTransactionRow[];

      // Agrupar por (amount, fecha, descripcion) en memoria
      const groups = new Map<string, BankTransactionRow[]>();
      for (const tx of txList) {
        const dateStr = plainDayOfInstant(tx.trans_date, timezone) || 'sin-fecha';
        const desc = (tx.description || '').trim().toLowerCase();
        const key = `${tx.amount}|${dateStr}|${desc}`;
        const existing = groups.get(key);
        if (existing) {
          existing.push(tx);
        } else {
          groups.set(key, [tx]);
        }
      }

      // Generar alertas para grupos con mas de 1 transaccion
      for (const [, group] of groups) {
        if (group.length > 1) {
          const first = group[0];
          const dateStr = plainDayOfInstant(first.trans_date, timezone);
          // Severidad: high si 3 o mas duplicados, medium si 2
          const severity: 'high' | 'medium' = group.length >= 3 ? 'high' : 'medium';
          // Clave estable (los ids del grupo): casa la alerta con su revisión.
          alerts.push({
            id: claveDuplicado(group.map((t) => t.id)),
            transactionIds: group.map((t) => t.id),
            amount: Number(first.amount),
            date: dateStr,
            description: first.description || '',
            count: group.length,
            severity,
            bankAccountId: first.bank_account_id ?? null,
            movimientos: group.map((t) => ({
              id: t.id,
              fecha: t.trans_date,
              descripcion: t.description,
              referencia: t.reference,
              monto: Number(t.amount),
            })),
          });
        }
      }

      // Buscar duplicados en open_finance_transactions por external_transaction_id
      const { data: ofTransactions, error: ofError } = await supabase
        .from('open_finance_transactions')
        .select('id, link_id, account_id, organization_id, bank_transaction_id, external_transaction_id, transaction_date, description, amount, counterparty, reference, transaction_type, is_imported')
        .eq('organization_id', organizationId);

      if (ofError) {
        throw new Error(`Error al consultar transacciones OF: ${ofError.message}`);
      }

      const ofList = (ofTransactions || []) as OpenFinanceTransactionRow[];

      // Agrupar por external_transaction_id
      const ofGroups = new Map<string, OpenFinanceTransactionRow[]>();
      for (const tx of ofList) {
        const key = tx.external_transaction_id;
        const existing = ofGroups.get(key);
        if (existing) {
          existing.push(tx);
        } else {
          ofGroups.set(key, [tx]);
        }
      }

      for (const [, group] of ofGroups) {
        if (group.length > 1) {
          const first = group[0];
          const dateStr = plainDayOfInstant(first.transaction_date, timezone);
          const severity: 'high' | 'medium' = group.length >= 3 ? 'high' : 'medium';
          alerts.push({
            id: claveDuplicadoExterno(first.external_transaction_id),
            transactionIds: group
              .map((t) => t.bank_transaction_id)
              .filter((id): id is number => id !== null),
            amount: Number(first.amount),
            date: dateStr,
            description: first.description || '',
            count: group.length,
            severity,
          });
        }
      }

      return alerts;
    } catch (err) {
      throw new Error(
        `Error al detectar duplicados: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Detecta transacciones con montos inusuales.
   * Calcula media y desviacion estandar de los ultimos 90 dias
   * y marca transacciones que excedan 3 desviaciones estandar
   * o 10x el promedio.
   * @param organizationId ID de la organizacion
   * @param bankAccountId ID de cuenta bancaria opcional (filtra)
   * @returns Lista de alertas de montos inusuales
   */
  static async detectUnusualAmounts(
    organizationId: number,
    bankAccountId?: number,
  ): Promise<AnomalyAlert[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Rango de ultimos 90 dias
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 90);
      const dateFromStr = dateFrom.toISOString();

      let query = supabase
        .from('bank_transactions')
        .select('id, organization_id, bank_account_id, trans_date, description, amount, reference, transaction_type, status, import_source, import_id')
        .eq('organization_id', organizationId)
        .gte('trans_date', dateFromStr);

      if (bankAccountId) {
        query = query.eq('bank_account_id', bankAccountId);
      }

      const { data: transactions, error } = await query;

      if (error) {
        throw new Error(`Error al consultar transacciones: ${error.message}`);
      }

      const txList = (transactions || []) as BankTransactionRow[];
      if (txList.length === 0) {
        return [];
      }

      // Calcular estadisticas: media y desviacion estandar
      const amounts = txList.map((t) => Number(t.amount));
      const stats = AnomalyDetectionService.calculateStats(amounts);

      const alerts: AnomalyAlert[] = [];

      for (const tx of txList) {
        const amount = Number(tx.amount);
        const absAmount = Math.abs(amount);

        // Umbral: 3 desviaciones estandar sobre la media absoluta
        const threeStdDevThreshold = Math.abs(stats.mean) + 3 * stats.stdDev;
        // Umbral: 10x el promedio absoluto
        const tenTimesThreshold = Math.abs(stats.mean) * 10;

        if (absAmount > tenTimesThreshold && absAmount > 0) {
          // Severidad alta: excede 10x el promedio
          alerts.push({
            id: claveMovimiento('unusual_amount', tx.id),
            type: 'unusual_amount',
            severity: 'high',
            transactionId: tx.id,
            bankAccountId: tx.bank_account_id,
            amount,
            date: tx.trans_date,
            description: `Monto ${amount.toFixed(2)} excede 10x el promedio (${stats.mean.toFixed(2)})`,
            expectedValue: stats.mean,
            actualValue: amount,
          });
        } else if (absAmount > threeStdDevThreshold && stats.stdDev > 0) {
          // Severidad media: excede 3 desviaciones estandar
          alerts.push({
            id: claveMovimiento('unusual_amount', tx.id),
            type: 'unusual_amount',
            severity: 'medium',
            transactionId: tx.id,
            bankAccountId: tx.bank_account_id,
            amount,
            date: tx.trans_date,
            description: `Monto ${amount.toFixed(2)} excede 3 desviaciones estandar (media: ${stats.mean.toFixed(2)}, desv: ${stats.stdDev.toFixed(2)})`,
            expectedValue: stats.mean,
            actualValue: amount,
          });
        }
      }

      return alerts;
    } catch (err) {
      throw new Error(
        `Error al detectar montos inusuales: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Detecta patrones sospechosos en transacciones:
   * - Fragmentacion: multiples transacciones pequenas en 1 hora
   * - Horario inusual: antes de 6am o despues de 10pm
   * - Fin de semana con monto > 3x el promedio
   * @param organizationId ID de la organizacion
   * @returns Lista de alertas de patrones sospechosos
   */
  static async detectSuspiciousPatterns(
    organizationId: number,
  ): Promise<AnomalyAlert[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Rango de ultimos 90 dias para calcular promedio
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 90);
      const dateFromStr = dateFrom.toISOString();

      const { data: transactions, error } = await supabase
        .from('bank_transactions')
        .select('id, organization_id, bank_account_id, trans_date, description, amount, reference, transaction_type, status, import_source, import_id')
        .eq('organization_id', organizationId)
        .gte('trans_date', dateFromStr)
        .order('trans_date', { ascending: true });

      if (error) {
        throw new Error(`Error al consultar transacciones: ${error.message}`);
      }

      const txList = (transactions || []) as BankTransactionRow[];
      if (txList.length === 0) {
        return [];
      }

      // Calcular promedio de montos absolutos
      const amounts = txList.map((t) => Math.abs(Number(t.amount)));
      const avgAmount = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;

      const alerts: AnomalyAlert[] = [];

      // 1. Detectar fragmentacion: >5 transacciones <1% del promedio en 1 hora
      const smallThreshold = avgAmount * 0.01;
      if (smallThreshold > 0) {
        const smallTxs = txList.filter((t) => Math.abs(Number(t.amount)) < smallThreshold);
        // Agrupar por ventana de 1 hora
        for (let i = 0; i < smallTxs.length; i++) {
          const windowStart = new Date(smallTxs[i].trans_date).getTime();
          const windowEnd = windowStart + 60 * 60 * 1000; // 1 hora
          const windowTxs = smallTxs.filter((t) => {
            const tTime = new Date(t.trans_date).getTime();
            return tTime >= windowStart && tTime <= windowEnd;
          });
          if (windowTxs.length > 5) {
            alerts.push({
              id: claveMovimiento('fragmentation', smallTxs[i].id),
              type: 'fragmentation',
              severity: 'medium',
              transactionId: smallTxs[i].id,
              bankAccountId: smallTxs[i].bank_account_id,
              amount: Number(smallTxs[i].amount),
              date: smallTxs[i].trans_date,
              description: `${windowTxs.length} transacciones pequenas (<1% del promedio) en 1 hora. Posible fragmentacion.`,
              expectedValue: smallThreshold,
              actualValue: Number(smallTxs[i].amount),
            });
            // Evitar duplicados: saltar las que ya estan en esta ventana
            i += windowTxs.length - 1;
          }
        }
      }

      // 2. Detectar horario inusual: antes de 6am o despues de 10pm
      for (const tx of txList) {
        const txDate = new Date(tx.trans_date);
        const hour = txDate.getHours();
        if (hour < 6 || hour >= 22) {
          alerts.push({
            id: claveMovimiento('unusual_time', tx.id),
            type: 'unusual_time',
            severity: 'low',
            transactionId: tx.id,
            bankAccountId: tx.bank_account_id,
            amount: Number(tx.amount),
            date: tx.trans_date,
            description: `Transaccion fuera de horario normal (${hour}:00h). ${tx.description || ''}`,
          });
        }
      }

      // 3. Detectar fin de semana con monto > 3x promedio
      for (const tx of txList) {
        const txDate = new Date(tx.trans_date);
        const dayOfWeek = txDate.getDay(); // 0=domingo, 6=sabado
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const absAmount = Math.abs(Number(tx.amount));
        if (isWeekend && absAmount > avgAmount * 3 && avgAmount > 0) {
          alerts.push({
            id: claveMovimiento('weekend_high_amount', tx.id),
            type: 'weekend_high_amount',
            severity: 'medium',
            transactionId: tx.id,
            bankAccountId: tx.bank_account_id,
            amount: Number(tx.amount),
            date: tx.trans_date,
            description: `Transaccion de fin de semana con monto ${absAmount.toFixed(2)} (>3x promedio ${avgAmount.toFixed(2)}). ${tx.description || ''}`,
            expectedValue: avgAmount,
            actualValue: Number(tx.amount),
          });
        }
      }

      return alerts;
    } catch (err) {
      throw new Error(
        `Error al detectar patrones sospechosos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Detecta discrepancias de saldo entre el saldo local (bank_accounts.balance),
   * el saldo calculado (initial_balance + suma de transacciones) y el saldo
   * real de Open Finance (last_balance en open_finance_accounts).
   * @param organizationId ID de la organizacion
   * @returns Lista de discrepancias de saldo
   */
  static async detectBalanceDiscrepancies(
    organizationId: number,
  ): Promise<BalanceDiscrepancy[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener cuentas bancarias activas
      const { data: bankAccounts, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, organization_id, name, balance, initial_balance, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (bankError) {
        throw new Error(`Error al consultar cuentas bancarias: ${bankError.message}`);
      }

      const accounts = (bankAccounts || []) as BankAccountRow[];
      const discrepancies: BalanceDiscrepancy[] = [];

      // Obtener cuentas de Open Finance vinculadas
      const { data: ofAccounts, error: ofError } = await supabase
        .from('open_finance_accounts')
        .select('id, link_id, organization_id, bank_account_id, last_balance, last_balance_at, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (ofError) {
        throw new Error(`Error al consultar cuentas OF: ${ofError.message}`);
      }

      const ofList = (ofAccounts || []) as OpenFinanceAccountRow[];

      // Mapa de bank_account_id -> last_balance de Open Finance
      const ofBalanceMap = new Map<number, number>();
      for (const ofAccount of ofList) {
        if (ofAccount.bank_account_id !== null && ofAccount.last_balance !== null) {
          ofBalanceMap.set(ofAccount.bank_account_id, Number(ofAccount.last_balance));
        }
      }


      for (const account of accounts) {
        // Sumar todas las transacciones de la cuenta
        const { data: txData, error: txError } = await supabase
          .from('bank_transactions')
          .select('amount')
          .eq('bank_account_id', account.id);

        if (txError) {
          console.error(`[AnomalyDetection] Error al sumar transacciones de cuenta ${account.id}:`, txError);
          continue;
        }

        const txAmounts = (txData || []) as { amount: number }[];
        const txSum = txAmounts.reduce((sum, t) => sum + Number(t.amount), 0);
        const initialBalance = Number(account.initial_balance ?? 0);
        const calculatedBalance = initialBalance + txSum;
        const localBalance = Number(account.balance);
        const realBalance = ofBalanceMap.get(account.id) ?? null;

        // Diferencia entre saldo local y calculado
        const difference = localBalance - calculatedBalance;

        // Si la diferencia > 1 unidad, es una discrepancia
        if (Math.abs(difference) > 1) {
          // Severidad: high si hay saldo real de OF y tambien difiere, medium si solo local vs calculado
          let severity: 'high' | 'medium' = 'medium';
          if (realBalance !== null && Math.abs(realBalance - localBalance) > 1) {
            severity = 'high';
          }
          discrepancies.push({
            id: claveDiferenciaSaldo(account.id, difference),
            bankAccountId: account.id,
            bankAccountName: account.name,
            localBalance,
            calculatedBalance,
            realBalance,
            difference,
            severity,
          });
        }
      }

      return discrepancies;
    } catch (err) {
      throw new Error(
        `Error al detectar discrepancias de saldo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Ejecuta todas las detecciones de anomalias y consolida
   * los resultados en un resumen unico.
   * @param organizationId ID de la organizacion
   * @returns Resumen consolidado de anomalias
   */
  static async getAllAnomalies(organizationId: number): Promise<AnomalySummary> {
    try {
      // Ejecutar todas las detecciones en paralelo
      const [duplicates, unusualAmounts, suspiciousPatterns, balanceDiscrepancies] =
        await Promise.all([
          AnomalyDetectionService.detectDuplicates(organizationId),
          AnomalyDetectionService.detectUnusualAmounts(organizationId),
          AnomalyDetectionService.detectSuspiciousPatterns(organizationId),
          AnomalyDetectionService.detectBalanceDiscrepancies(organizationId),
        ]);

      // Contar alertas de alta severidad
      let highSeverity = 0;
      highSeverity += duplicates.filter((d) => d.severity === 'high').length;
      highSeverity += unusualAmounts.filter((a) => a.severity === 'high').length;
      highSeverity += suspiciousPatterns.filter((a) => a.severity === 'high').length;
      highSeverity += balanceDiscrepancies.filter((d) => d.severity === 'high').length;

      const totalAlerts =
        duplicates.length +
        unusualAmounts.length +
        suspiciousPatterns.length +
        balanceDiscrepancies.length;

      // Nombre de la cuenta en una línea («Bancolombia ··4321») para la tabla.
      await AnomalyDetectionService.nombrarCuentas(organizationId, [...duplicates, ...unusualAmounts, ...suspiciousPatterns]);

      return {
        duplicates,
        unusualAmounts,
        suspiciousPatterns,
        balanceDiscrepancies,
        totalAlerts,
        highSeverity,
      };
    } catch (err) {
      throw new Error(
        `Error al obtener todas las anomalias: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Pone el nombre de la cuenta a las alertas que solo traen su id. Si la
   * lectura falla, las alertas salen sin nombre (no se pierde la detección).
   */
  private static async nombrarCuentas(
    organizationId: number,
    alertas: Array<{ bankAccountId?: number | null; bankAccountName?: string | null }>,
  ): Promise<void> {
    const ids = [...new Set(alertas.map((a) => a.bankAccountId).filter((id): id is number => typeof id === 'number'))];
    if (ids.length === 0) return;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id, name, account_number')
      .eq('organization_id', organizationId)
      .in('id', ids);
    if (error) {
      console.error('[AnomalyDetection] No se pudieron leer los nombres de las cuentas');
      return;
    }
    const nombres = new Map(
      ((data ?? []) as Array<{ id: number; name: string | null; account_number: string | null }>).map((c) => [
        c.id,
        etiquetaCuenta(c.name, c.account_number),
      ]),
    );
    for (const alerta of alertas) {
      if (typeof alerta.bankAccountId === 'number') alerta.bankAccountName = nombres.get(alerta.bankAccountId) ?? null;
    }
  }

  /**
   * Revisiones guardadas de la organización (`bank_alert_reviews`), con el
   * nombre de quien revisó. `disponible: false` si la tabla aún no existe
   * (migración 20261107210000 sin aplicar): la pantalla lo avisa.
   *
   * Recibe el cliente de la SESIÓN (RLS por pertenencia), no el service role.
   */
  static async listarRevisiones(
    supabase: SupabaseClient,
    organizationId: number,
  ): Promise<{ disponible: boolean; revisiones: RevisionAlerta[] }> {
    const { data, error } = await supabase
      .from(TABLA_REVISIONES)
      .select(COLUMNAS_REVISION)
      .eq('organization_id', organizationId)
      .order('reviewed_at', { ascending: false })
      .limit(1000);

    if (error) {
      if (esTablaRevisionesInexistente(error)) return { disponible: false, revisiones: [] };
      throw new Error(`Error al leer las revisiones de alertas: ${error.message}`);
    }

    const filas = (data ?? []) as unknown as FilaRevision[];
    const nombres = await AnomalyDetectionService.nombresDeUsuarios(
      supabase,
      filas.map((f) => f.reviewed_by),
    );
    return { disponible: true, revisiones: filas.map((f) => revisionDesdeFila(f, nombres)) };
  }

  /**
   * Guarda la revisión de una alerta: autor (la sesión), fecha (`now()` de la
   * base), motivo y resultado. Antes solo hacía `console.log`.
   *
   * - La entrada ya viene validada (`validarRevision`).
   * - Se escribe con el cliente de la SESIÓN: la RLS exige pertenencia,
   *   `finance.create` y que `reviewed_by` sea quien escribe.
   * - Una alerta ya revisada responde `ya_revisada` (historial inmutable).
   * - Sin la tabla (migración sin aplicar) responde `revision_no_disponible`.
   */
  static async markAnomalyResolved(
    supabase: SupabaseClient,
    organizationId: number,
    entrada: EntradaRevision,
    userId: string,
  ): Promise<{ success: true; revision: RevisionAlerta }> {
    const { data, error } = await supabase
      .from(TABLA_REVISIONES)
      .insert({
        organization_id: organizationId,
        alert_key: entrada.clave,
        alert_type: entrada.tipo,
        bank_account_id: entrada.cuentaId,
        outcome: entrada.resultado,
        reason: entrada.motivo,
        voided_bank_transaction_id: entrada.movimientoAnuladoId,
        reviewed_by: userId,
      })
      .select(COLUMNAS_REVISION)
      .single();

    if (error) {
      if (esTablaRevisionesInexistente(error)) throw new ErrorRevisionAlerta('revision_no_disponible', 503);
      if (error.code === '23505') throw new ErrorRevisionAlerta('ya_revisada', 409);
      if (error.code === '42501') throw new ErrorRevisionAlerta('sin_permiso', 403);
      if (error.code === '23503') throw new ErrorRevisionAlerta('referencia_invalida', 400);
      throw new Error(`Error al guardar la revision de la alerta: ${error.message}`);
    }

    const fila = data as unknown as FilaRevision;
    const nombres = await AnomalyDetectionService.nombresDeUsuarios(supabase, [fila.reviewed_by]);
    return { success: true, revision: revisionDesdeFila(fila, nombres) };
  }

  /** Nombre visible de cada usuario (perfil); sin perfil legible, sin nombre. */
  private static async nombresDeUsuarios(
    supabase: SupabaseClient,
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))];
    if (unicos.length === 0) return new Map();
    const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', unicos);
    if (error) return new Map();
    const mapa = new Map<string, string>();
    for (const p of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      const nombre = nombrePerfil(p);
      if (nombre) mapa.set(p.id, nombre);
    }
    return mapa;
  }

  /**
   * Calcula la media y desviacion estandar de un arreglo de numeros.
   * @param values Arreglo de valores numericos
   * @returns Estadisticas con media y desviacion estandar
   */
  private static calculateStats(values: number[]): AmountStats {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0 };
    }
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return { mean, stdDev };
  }
}

/** Error esperado al guardar una revisión: código para la pantalla y estado HTTP. */
export class ErrorRevisionAlerta extends Error {
  constructor(
    public readonly codigo: 'revision_no_disponible' | 'ya_revisada' | 'sin_permiso' | 'referencia_invalida',
    public readonly status: number,
  ) {
    super(codigo);
    this.name = 'ErrorRevisionAlerta';
  }
}

/** Instancia singleton del servicio de deteccion de anomalias */
export const anomalyDetectionService = AnomalyDetectionService;
