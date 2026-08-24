/**
 * Servicio de saldos en tiempo real para Open Finance.
 * Consulta saldos reales desde el proveedor (Prometeo) y los compara
 * con los saldos locales del ERP.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { openFinanceService } from './openFinanceService';

/** Saldo en tiempo real de una cuenta bancaria */
export interface RealTimeBalance {
  bankAccountId: number;
  bankAccountName: string;
  realBalance: number;
  localBalance: number;
  difference: number;
  lastUpdated: string;
  currency: string;
  isLinked: boolean;
}

/** Resultado de validacion de saldo vs conciliacion */
export interface BalanceValidation {
  reconciliationId: number;
  realBalance: number;
  statementBalance: number;
  difference: number;
  isValid: boolean;
  warnings: string[];
}

/** Entrada del historial de saldos proyectados */
export interface BalanceHistoryEntry {
  date: string;
  balance: number;
  change: number;
}

/** Tipo de fila de bank_accounts (campos usados) */
interface BankAccountRow {
  id: number;
  organization_id: number;
  name: string;
  currency: string | null;
  balance: number;
  is_active: boolean;
}

/** Tipo de fila de open_finance_accounts (campos usados) */
interface OpenFinanceAccountRow {
  id: string;
  link_id: string;
  organization_id: number;
  bank_account_id: string | null;
  external_account_id: string | null;
  account_number: string | null;
  currency: string | null;
  is_active: boolean;
  last_balance: number | null;
  last_balance_at: string | null;
}

/** Tipo de fila de open_finance_links (campos usados) */
interface OpenFinanceLinkRow {
  id: string;
  organization_id: number;
  provider: string;
  session_key: string | null;
  status: string;
}

/** Tipo de fila de bank_reconciliations (campos usados) */
interface BankReconciliationRow {
  id: string;
  organization_id: number;
  bank_account_id: number;
  statement_balance: number | null;
  status: string;
}

/** Tipo de fila de open_finance_transactions (campos usados) */
interface OpenFinanceTransactionRow {
  id: string;
  transaction_date: string;
  amount: number;
}

export class BalanceService {
  /**
   * Obtiene el saldo en tiempo real de una cuenta bancaria especifica.
   * Busca la vinculacion Open Finance, consulta el saldo real al proveedor
   * y actualiza last_balance en open_finance_accounts.
   * @param bankAccountId ID de la cuenta bancaria
   * @returns Saldo en tiempo real o null si no hay vinculacion
   */
  static async getRealTimeBalance(bankAccountId: number): Promise<RealTimeBalance | null> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener la cuenta bancaria
      const { data: bankAccount, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, organization_id, name, currency, balance')
        .eq('id', bankAccountId)
        .single();

      if (bankError || !bankAccount) {
        return null;
      }

      const bankAccountRow = bankAccount as BankAccountRow;

      // Buscar vinculacion Open Finance
      const { data: ofAccount, error: ofError } = await supabase
        .from('open_finance_accounts')
        .select('id, link_id, organization_id, external_account_id, currency, last_balance, last_balance_at')
        .eq('bank_account_id', String(bankAccountId))
        .eq('is_active', true)
        .maybeSingle();

      if (ofError || !ofAccount) {
        // No hay vinculacion: retornar estructura con isLinked false
        return {
          bankAccountId,
          bankAccountName: bankAccountRow.name,
          realBalance: bankAccountRow.balance,
          localBalance: bankAccountRow.balance,
          difference: 0,
          lastUpdated: new Date().toISOString(),
          currency: bankAccountRow.currency || 'COP',
          isLinked: false,
        };
      }

      const ofAccountRow = ofAccount as OpenFinanceAccountRow;

      // Obtener el link asociado
      const { data: link, error: linkError } = await supabase
        .from('open_finance_links')
        .select('id, organization_id, provider, session_key, status')
        .eq('id', ofAccountRow.link_id)
        .single();

      if (linkError || !link) {
        return null;
      }

      const linkRow = link as OpenFinanceLinkRow;

      // Consultar saldo real desde el proveedor
      let realBalance = ofAccountRow.last_balance ?? bankAccountRow.balance;
      try {
        const balances = await openFinanceService.getBalances(
          linkRow.id,
          ofAccountRow.external_account_id || undefined,
        );
        if (balances.length > 0) {
          realBalance = balances[0].current;
        }
      } catch (err) {
        // Si falla la consulta al proveedor, se usa el ultimo saldo conocido
        console.error('[BalanceService] Error al consultar saldo real:', err);
      }

      // Actualizar last_balance y last_balance_at en open_finance_accounts
      await supabase
        .from('open_finance_accounts')
        .update({
          last_balance: realBalance,
          last_balance_at: new Date().toISOString(),
        })
        .eq('id', ofAccountRow.id);

      const difference = realBalance - bankAccountRow.balance;

      return {
        bankAccountId,
        bankAccountName: bankAccountRow.name,
        realBalance,
        localBalance: bankAccountRow.balance,
        difference,
        lastUpdated: new Date().toISOString(),
        currency: ofAccountRow.currency || bankAccountRow.currency || 'COP',
        isLinked: true,
      };
    } catch (err) {
      throw new Error(
        `Error al obtener saldo en tiempo real: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Obtiene los saldos en tiempo real de todas las cuentas activas
   * de una organizacion que tengan vinculacion Open Finance.
   * @param organizationId ID de la organizacion
   * @returns Lista de saldos en tiempo real
   */
  static async getRealTimeBalances(organizationId: number): Promise<RealTimeBalance[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Listar bank_accounts activas de la organizacion
      const { data: bankAccounts, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, organization_id, name, currency, balance, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (bankError) {
        throw new Error(`Error al listar cuentas bancarias: ${bankError.message}`);
      }

      const results: RealTimeBalance[] = [];
      for (const account of (bankAccounts || []) as BankAccountRow[]) {
        const balance = await BalanceService.getRealTimeBalance(account.id);
        if (balance) {
          results.push(balance);
        }
      }

      return results;
    } catch (err) {
      throw new Error(
        `Error al obtener saldos en tiempo real: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Valida el saldo real del banco contra el saldo del extracto de una conciliacion.
   * @param reconciliationId ID de la conciliacion bancaria
   * @returns Resultado de la validacion con advertencias
   */
  static async validateBalance(reconciliationId: number): Promise<BalanceValidation> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener la conciliacion
      const { data: reconciliation, error: reconError } = await supabase
        .from('bank_reconciliations')
        .select('id, organization_id, bank_account_id, statement_balance, status')
        .eq('id', String(reconciliationId))
        .single();

      if (reconError || !reconciliation) {
        throw new Error('Conciliacion no encontrada');
      }

      const reconRow = reconciliation as BankReconciliationRow;
      const statementBalance = reconRow.statement_balance ?? 0;
      const warnings: string[] = [];

      // Obtener saldo real del banco
      const realTimeBalance = await BalanceService.getRealTimeBalance(reconRow.bank_account_id);

      if (!realTimeBalance) {
        warnings.push('No se pudo obtener el saldo real del banco');
        return {
          reconciliationId,
          realBalance: 0,
          statementBalance,
          difference: statementBalance,
          isValid: false,
          warnings,
        };
      }

      if (!realTimeBalance.isLinked) {
        warnings.push('La cuenta no tiene vinculacion Open Finance activa');
      }

      const difference = realTimeBalance.realBalance - statementBalance;

      // Tolerancia de redondeo: diferencia menor a 1 unidad se considera valida
      const isValid = Math.abs(difference) < 1;

      if (!isValid) {
        warnings.push(
          `Diferencia de ${difference.toFixed(2)} entre saldo real y saldo del extracto`,
        );
      }

      return {
        reconciliationId,
        realBalance: realTimeBalance.realBalance,
        statementBalance,
        difference,
        isValid,
        warnings,
      };
    } catch (err) {
      throw new Error(
        `Error al validar saldo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Refresca los saldos de todas las cuentas vinculadas de una organizacion.
   * Consulta saldos reales al proveedor y actualiza last_balance en BD.
   * @param organizationId ID de la organizacion
   * @returns Estadisticas de refresco (refrescadas y errores)
   */
  static async refreshAllBalances(
    organizationId: number,
  ): Promise<{ refreshed: number; errors: number }> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener todas las cuentas vinculadas activas de la organizacion
      const { data: ofAccounts, error: ofError } = await supabase
        .from('open_finance_accounts')
        .select('id, link_id, bank_account_id, external_account_id')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .not('bank_account_id', 'is', null);

      if (ofError) {
        throw new Error(`Error al listar cuentas vinculadas: ${ofError.message}`);
      }

      let refreshed = 0;
      let errors = 0;

      for (const ofAccount of (ofAccounts || []) as OpenFinanceAccountRow[]) {
        const bankAccountId = Number(ofAccount.bank_account_id);
        if (!bankAccountId) continue;

        try {
          const balance = await BalanceService.getRealTimeBalance(bankAccountId);
          if (balance) {
            refreshed++;
          } else {
            errors++;
          }
        } catch (err) {
          console.error(`[BalanceService] Error al refrescar cuenta ${bankAccountId}:`, err);
          errors++;
        }
      }

      return { refreshed, errors };
    } catch (err) {
      throw new Error(
        `Error al refrescar saldos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Obtiene el historial de saldos proyectados de una cuenta bancaria
   * basado en las transacciones de Open Finance de los ultimos N dias.
   * @param bankAccountId ID de la cuenta bancaria
   * @param days Cantidad de dias hacia atras (default: 30)
   * @returns Historial de saldos dia por dia
   */
  static async getBalanceHistory(
    bankAccountId: number,
    days: number = 30,
  ): Promise<BalanceHistoryEntry[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener la cuenta bancaria para saldo inicial
      const { data: bankAccount, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, balance')
        .eq('id', bankAccountId)
        .single();

      if (bankError || !bankAccount) {
        throw new Error('Cuenta bancaria no encontrada');
      }

      const currentBalance = (bankAccount as BankAccountRow).balance;

      // Calcular rango de fechas
      const dateTo = new Date();
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      const dateFromStr = dateFrom.toISOString().split('T')[0];
      const dateToStr = dateTo.toISOString().split('T')[0];

      // Consultar transacciones de Open Finance de la cuenta
      const { data: transactions, error: txError } = await supabase
        .from('open_finance_transactions')
        .select('id, transaction_date, amount')
        .eq('account_id', String(bankAccountId))
        .gte('transaction_date', dateFromStr)
        .lte('transaction_date', dateToStr)
        .order('transaction_date', { ascending: true });

      if (txError) {
        throw new Error(`Error al obtener transacciones: ${txError.message}`);
      }

      const txList = (transactions || []) as OpenFinanceTransactionRow[];

      // Agrupar transacciones por dia y calcular saldo proyectado
      const dailyChanges = new Map<string, number>();
      for (const tx of txList) {
        const date = tx.transaction_date.split('T')[0];
        const current = dailyChanges.get(date) ?? 0;
        dailyChanges.set(date, current + tx.amount);
      }

      // Construir historial dia por dia
      const history: BalanceHistoryEntry[] = [];
      // Saldo inicial: restar todos los cambios para llegar al saldo al inicio del periodo
      let runningBalance = currentBalance;
      for (const tx of txList) {
        runningBalance -= tx.amount;
      }

      const cursor = new Date(dateFrom);
      while (cursor <= dateTo) {
        const dateStr = cursor.toISOString().split('T')[0];
        const change = dailyChanges.get(dateStr) ?? 0;
        runningBalance += change;
        history.push({
          date: dateStr,
          balance: runningBalance,
          change,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      return history;
    } catch (err) {
      throw new Error(
        `Error al obtener historial de saldos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Instancia singleton del servicio de saldos */
export const balanceService = BalanceService;
