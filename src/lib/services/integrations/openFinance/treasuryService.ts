/**
 * Servicio de tesoreria consolidada multi-banco para Open Finance.
 * Consolida saldos de cuentas bancarias, proyecta flujo de caja,
 * detecta transferencias entre cuentas propias, analiza concentracion
 * de pagos por proveedor y genera alertas de tesoreria.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ============================================================
// Tipos publicos
// ============================================================

/** Posicion de una cuenta bancaria dentro del consolidado */
export interface AccountPosition {
  bankAccountId: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  localBalance: number;
  realBalance: number | null;
  difference: number | null;
  isLinked: boolean;
  lastUpdated: string | null;
}

/** Posicion consolidada de tesoreria de una organizacion */
export interface ConsolidatedPosition {
  totalByCurrency: Record<string, number>;
  accounts: AccountPosition[];
  lastUpdated: string;
}

/** Entrada diaria de la proyeccion de flujo de caja */
export interface ProjectionEntry {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  projectedBalance: number;
  description: string;
}

/** Proyeccion de flujo de caja a N dias */
export interface CashFlowProjection {
  entries: ProjectionEntry[];
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
}

/** Transferencia detectada entre cuentas propias */
export interface InterAccountTransfer {
  id: string;
  date: string;
  amount: number;
  fromAccountId: number;
  fromAccountName: string;
  toAccountId: number;
  toAccountName: string;
  reference: string;
}

/** Concentracion de pagos por proveedor */
export interface PaymentConcentration {
  supplierId: number;
  supplierName: string;
  totalAmount: number;
  paymentCount: number;
  averageAmount: number;
  percentage: number;
}

/** Alerta de tesoreria con severidad */
export interface TreasuryAlert {
  id: string;
  type:
    | 'negative_balance'
    | 'overdue_payable'
    | 'upcoming_payable'
    | 'concentration_risk'
    | 'balance_discrepancy';
  severity: 'high' | 'medium' | 'low';
  message: string;
  amount?: number;
  accountId?: number;
  supplierId?: number;
}

// ============================================================
// Tipos internos de filas (campos usados)
// ============================================================

interface BankAccountRow {
  id: number;
  organization_id: number;
  name: string;
  account_number: string | null;
  bank_name: string | null;
  currency: string | null;
  balance: number;
  is_active: boolean;
}

interface OpenFinanceAccountRow {
  id: string;
  bank_account_id: number | null;
  last_balance: number | null;
  last_balance_at: string | null;
  is_active: boolean;
}

interface AccountsPayableRow {
  id: string;
  supplier_id: number;
  amount: number;
  balance: number;
  due_date: string | null;
  status: string | null;
  days_overdue: number | null;
}

interface AccountsReceivableRow {
  id: string;
  customer_id: string | null;
  amount: number;
  balance: number;
  due_date: string | null;
  status: string | null;
}

interface PaymentRow {
  id: string;
  source: string | null;
  source_id: string | null;
  amount: number;
  payment_date: string | null;
  status: string | null;
}

interface SupplierRow {
  id: number;
  name: string;
}

interface BankTransactionRow {
  id: number;
  bank_account_id: number;
  trans_date: string;
  description: string | null;
  amount: number;
  reference: string | null;
  transaction_type: string;
}

// ============================================================
// Servicio
// ============================================================

export class TreasuryService {
  /**
   * Obtiene la posicion consolidada de tesoreria de una organizacion.
   * Lista todas las bank_accounts activas, obtiene saldo local y saldo
   * real (si tienen vinculacion Open Finance) y agrupa por moneda.
   */
  static async getConsolidatedPosition(
    organizationId: number,
  ): Promise<ConsolidatedPosition> {
    try {
      const supabase = getSupabaseAdmin();

      // Listar bank_accounts activas de la organizacion
      const { data: bankAccounts, error: bankError } = await supabase
        .from('bank_accounts')
        .select(
          'id, organization_id, name, account_number, bank_name, currency, balance, is_active',
        )
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (bankError) {
        throw new Error(`Error al listar cuentas bancarias: ${bankError.message}`);
      }

      const accounts = (bankAccounts || []) as BankAccountRow[];

      // Obtener todas las vinculaciones Open Finance de la organizacion
      const { data: ofAccounts, error: ofError } = await supabase
        .from('open_finance_accounts')
        .select('id, bank_account_id, last_balance, last_balance_at, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (ofError) {
        throw new Error(`Error al listar cuentas vinculadas: ${ofError.message}`);
      }

      // Indexar vinculaciones por bank_account_id para acceso rapido
      const ofByBankAccount = new Map<number, OpenFinanceAccountRow>();
      for (const ofAccount of (ofAccounts || []) as OpenFinanceAccountRow[]) {
        if (ofAccount.bank_account_id) {
          ofByBankAccount.set(ofAccount.bank_account_id, ofAccount);
        }
      }

      const totalByCurrency: Record<string, number> = {};
      const positions: AccountPosition[] = [];

      for (const account of accounts) {
        const currency = account.currency || 'COP';
        const localBalance = Number(account.balance) || 0;

        const ofAccount = ofByBankAccount.get(account.id);
        const isLinked = Boolean(ofAccount);
        const realBalance = ofAccount?.last_balance ?? null;
        const difference =
          realBalance !== null ? realBalance - localBalance : null;

        // Acumular total por moneda usando saldo real si existe, sino local
        const effectiveBalance = realBalance ?? localBalance;
        totalByCurrency[currency] =
          (totalByCurrency[currency] || 0) + effectiveBalance;

        positions.push({
          bankAccountId: account.id,
          bankName: account.bank_name || 'Banco',
          accountName: account.name,
          accountNumber: account.account_number || 'N/A',
          currency,
          localBalance,
          realBalance,
          difference,
          isLinked,
          lastUpdated: ofAccount?.last_balance_at ?? null,
        });
      }

      return {
        totalByCurrency,
        accounts: positions,
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(
        `Error al obtener posicion consolidada: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Proyecta el flujo de caja a N dias.
   * Entradas: cuentas por cobrar pendientes.
   * Salidas: cuentas por pagar pendientes.
   * Calcula saldo proyectado por dia partiendo del saldo consolidado actual.
   */
  static async getCashFlowProjection(
    organizationId: number,
    days: number = 90,
  ): Promise<CashFlowProjection> {
    try {
      const supabase = getSupabaseAdmin();

      const today = new Date();
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + days);
      const todayStr = today.toISOString().split('T')[0];
      const horizonStr = horizon.toISOString().split('T')[0];

      // Saldo consolidado actual como base de la proyeccion
      const consolidated =
        await TreasuryService.getConsolidatedPosition(organizationId);
      const baseBalance = Object.values(consolidated.totalByCurrency).reduce(
        (sum, val) => sum + val,
        0,
      );

      // Cuentas por cobrar pendientes (entradas)
      const { data: receivables, error: recError } = await supabase
        .from('accounts_receivable')
        .select('id, customer_id, amount, balance, due_date, status')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'partial', 'open'])
        .gte('due_date', todayStr)
        .lte('due_date', horizonStr);

      if (recError) {
        throw new Error(`Error al listar cuentas por cobrar: ${recError.message}`);
      }

      // Cuentas por pagar pendientes (salidas)
      const { data: payables, error: payError } = await supabase
        .from('accounts_payable')
        .select('id, supplier_id, amount, balance, due_date, status')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'partial', 'open'])
        .gte('due_date', todayStr)
        .lte('due_date', horizonStr);

      if (payError) {
        throw new Error(`Error al listar cuentas por pagar: ${payError.message}`);
      }

      // Agrupar entradas y salidas por fecha
      const inflowByDate = new Map<string, number>();
      const outflowByDate = new Map<string, number>();

      for (const rec of (receivables || []) as AccountsReceivableRow[]) {
        if (!rec.due_date) continue;
        const date = rec.due_date.split('T')[0];
        const amount = Number(rec.balance) || Number(rec.amount) || 0;
        inflowByDate.set(date, (inflowByDate.get(date) || 0) + amount);
      }

      for (const pay of (payables || []) as AccountsPayableRow[]) {
        if (!pay.due_date) continue;
        const date = pay.due_date.split('T')[0];
        const amount = Number(pay.balance) || Number(pay.amount) || 0;
        outflowByDate.set(date, (outflowByDate.get(date) || 0) + amount);
      }

      // Construir entradas dia por dia
      const entries: ProjectionEntry[] = [];
      let runningBalance = baseBalance;
      let totalInflow = 0;
      let totalOutflow = 0;

      const cursor = new Date(today);
      while (cursor <= horizon) {
        const dateStr = cursor.toISOString().split('T')[0];
        const inflow = inflowByDate.get(dateStr) || 0;
        const outflow = outflowByDate.get(dateStr) || 0;
        const netFlow = inflow - outflow;
        runningBalance += netFlow;

        const parts: string[] = [];
        if (inflow > 0) parts.push(`Entradas: ${inflow.toFixed(0)}`);
        if (outflow > 0) parts.push(`Salidas: ${outflow.toFixed(0)}`);
        const description = parts.length > 0 ? parts.join(' | ') : 'Sin movimientos';

        entries.push({
          date: dateStr,
          inflow,
          outflow,
          netFlow,
          projectedBalance: runningBalance,
          description,
        });

        totalInflow += inflow;
        totalOutflow += outflow;
        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        entries,
        totalInflow,
        totalOutflow,
        netFlow: totalInflow - totalOutflow,
      };
    } catch (err) {
      throw new Error(
        `Error al proyectar flujo de caja: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Detecta transferencias entre cuentas propias de la organizacion.
   * Criterio: mismo monto, fechas cercanas (+/- 2 dias), descripcion
   * contiene "transferencia" o contraparte coincide con otra cuenta.
   */
  static async detectInterAccountTransfers(
    organizationId: number,
    dateFrom: string,
    dateTo: string,
  ): Promise<InterAccountTransfer[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener cuentas bancarias para identificar cuentas propias
      const { data: bankAccounts, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id, name, account_number')
        .eq('organization_id', organizationId);

      if (bankError) {
        throw new Error(`Error al listar cuentas bancarias: ${bankError.message}`);
      }

      const accountsById = new Map<
        number,
        { id: number; name: string; accountNumber: string | null }
      >();
      const accountNumbers = new Set<string>();
      for (const acc of bankAccounts as Pick<
        BankAccountRow,
        'id' | 'name' | 'account_number'
      >[]) {
        accountsById.set(acc.id, {
          id: acc.id,
          name: acc.name,
          accountNumber: acc.account_number,
        });
        if (acc.account_number) {
          accountNumbers.add(acc.account_number.trim());
        }
      }

      // Obtener transacciones del periodo (debitos y creditos)
      const { data: transactions, error: txError } = await supabase
        .from('bank_transactions')
        .select(
          'id, bank_account_id, trans_date, description, amount, reference, transaction_type',
        )
        .eq('organization_id', organizationId)
        .gte('trans_date', dateFrom)
        .lte('trans_date', dateTo)
        .order('trans_date', { ascending: true });

      if (txError) {
        throw new Error(`Error al listar transacciones: ${txError.message}`);
      }

      const txList = (transactions || []) as BankTransactionRow[];

      // Separar salidas (debit) y entradas (credit) con monto absoluto
      const debits = txList.filter((tx) => tx.transaction_type === 'debit');
      const credits = txList.filter((tx) => tx.transaction_type === 'credit');

      const transfers: InterAccountTransfer[] = [];
      const matchedCreditIds = new Set<number>();

      // Comparar cada debito con creditos de monto similar y fecha cercana
      for (const debit of debits) {
        const debitAmount = Math.abs(Number(debit.amount));
        if (debitAmount <= 0) continue;

        const debitDate = new Date(debit.trans_date);
        const descLower = (debit.description || '').toLowerCase();
        const isTransferKeyword = descLower.includes('transfer');

        let bestMatch: BankTransactionRow | null = null;

        for (const credit of credits) {
          if (matchedCreditIds.has(credit.id)) continue;
          if (credit.bank_account_id === debit.bank_account_id) continue;

          const creditAmount = Math.abs(Number(credit.amount));
          // Tolerancia de 1 unidad para coincidencia de monto
          if (Math.abs(creditAmount - debitAmount) > 1) continue;

          const creditDate = new Date(credit.trans_date);
          const diffDays = Math.abs(
            (creditDate.getTime() - debitDate.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (diffDays > 2) continue;

          // Validar criterio: palabra "transferencia" o contraparte coincide
          const creditDescLower = (credit.description || '').toLowerCase();
          const hasKeyword =
            isTransferKeyword || creditDescLower.includes('transfer');

          // Verificar si la descripcion menciona el numero de cuenta destino
          const targetAccount = accountsById.get(credit.bank_account_id);
          const mentionsAccount =
            targetAccount?.accountNumber &&
            targetAccount.accountNumber.length > 3 &&
            (debit.description || '').includes(targetAccount.accountNumber);

          if (hasKeyword || mentionsAccount) {
            bestMatch = credit;
            break;
          }
        }

        if (bestMatch) {
          matchedCreditIds.add(bestMatch.id);
          const fromAccount = accountsById.get(debit.bank_account_id);
          const toAccount = accountsById.get(bestMatch.bank_account_id);

          transfers.push({
            id: `${debit.id}-${bestMatch.id}`,
            date: debit.trans_date,
            amount: debitAmount,
            fromAccountId: debit.bank_account_id,
            fromAccountName: fromAccount?.name || 'Cuenta origen',
            toAccountId: bestMatch.bank_account_id,
            toAccountName: toAccount?.name || 'Cuenta destino',
            reference: debit.reference || bestMatch.reference || '',
          });
        }
      }

      return transfers;
    } catch (err) {
      throw new Error(
        `Error al detectar transferencias: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Analiza la concentracion de pagos por proveedor en un periodo.
   * Agrupa por supplier_id, calcula total, promedio y numero de pagos.
   * Retorna el top 10 ordenado por monto descendente.
   */
  static async getPaymentConcentration(
    organizationId: number,
    dateFrom: string,
    dateTo: string,
  ): Promise<PaymentConcentration[]> {
    try {
      const supabase = getSupabaseAdmin();

      // Pagos del periodo con source='supplier' (source_id = supplier_id)
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('id, source, source_id, amount, payment_date, status')
        .eq('organization_id', organizationId)
        .eq('source', 'supplier')
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)
        .in('status', ['completed', 'confirmed', 'approved']);

      if (payError) {
        throw new Error(`Error al listar pagos: ${payError.message}`);
      }

      const paymentList = (payments || []) as PaymentRow[];

      // Agrupar por supplier_id (source_id)
      const grouped = new Map<
        number,
        { total: number; count: number }
      >();

      for (const payment of paymentList) {
        const supplierId = Number(payment.source_id);
        if (!supplierId) continue;
        const amount = Number(payment.amount) || 0;
        const existing = grouped.get(supplierId) || { total: 0, count: 0 };
        existing.total += amount;
        existing.count += 1;
        grouped.set(supplierId, existing);
      }

      if (grouped.size === 0) {
        return [];
      }

      // Calcular total general para porcentajes
      const grandTotal = Array.from(grouped.values()).reduce(
        (sum, g) => sum + g.total,
        0,
      );

      // Obtener nombres de proveedores
      const supplierIds = Array.from(grouped.keys());
      const { data: suppliers, error: supError } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds);

      if (supError) {
        throw new Error(`Error al listar proveedores: ${supError.message}`);
      }

      const supplierNames = new Map<number, string>();
      for (const sup of (suppliers || []) as SupplierRow[]) {
        supplierNames.set(sup.id, sup.name);
      }

      // Construir resultado ordenado por monto descendente (top 10)
      const concentrations: PaymentConcentration[] = Array.from(
        grouped.entries(),
      )
        .map(([supplierId, data]) => ({
          supplierId,
          supplierName: supplierNames.get(supplierId) || 'Proveedor',
          totalAmount: data.total,
          paymentCount: data.count,
          averageAmount: data.count > 0 ? data.total / data.count : 0,
          percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10);

      return concentrations;
    } catch (err) {
      throw new Error(
        `Error al analizar concentracion de pagos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Genera alertas de tesoreria para una organizacion.
   * - Saldo negativo en alguna cuenta
   * - Cuentas por pagar vencidas
   * - Cuentas por pagar por vencer en 7 dias
   * - Concentracion de pagos (>30% en un proveedor)
   * - Diferencia entre saldo local y real
   */
  static async getTreasuryAlerts(
    organizationId: number,
  ): Promise<TreasuryAlert[]> {
    try {
      const alerts: TreasuryAlert[] = [];

      // 1. Posicion consolidada para saldos negativos y discrepancias
      const consolidated =
        await TreasuryService.getConsolidatedPosition(organizationId);

      for (const account of consolidated.accounts) {
        // Saldo negativo
        const effectiveBalance = account.realBalance ?? account.localBalance;
        if (effectiveBalance < 0) {
          alerts.push({
            id: `neg-${account.bankAccountId}`,
            type: 'negative_balance',
            severity: 'high',
            message: `Saldo negativo en cuenta ${account.accountName} (${account.bankName})`,
            amount: effectiveBalance,
            accountId: account.bankAccountId,
          });
        }

        // Diferencia entre saldo local y real
        if (
          account.isLinked &&
          account.difference !== null &&
          Math.abs(account.difference) > 1
        ) {
          const severity =
            Math.abs(account.difference) > 1000 ? 'medium' : 'low';
          alerts.push({
            id: `disc-${account.bankAccountId}`,
            type: 'balance_discrepancy',
            severity,
            message: `Diferencia de ${account.difference.toFixed(2)} entre saldo local y real en cuenta ${account.accountName}`,
            amount: account.difference,
            accountId: account.bankAccountId,
          });
        }
      }

      const supabase = getSupabaseAdmin();
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const sevenDays = new Date();
      sevenDays.setDate(sevenDays.getDate() + 7);
      const sevenDaysStr = sevenDays.toISOString().split('T')[0];

      // 2. Cuentas por pagar vencidas
      const { data: overdue, error: overdueError } = await supabase
        .from('accounts_payable')
        .select('id, supplier_id, amount, balance, due_date, status, days_overdue')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'partial', 'open'])
        .lt('due_date', todayStr);

      if (overdueError) {
        throw new Error(`Error al listar CxP vencidas: ${overdueError.message}`);
      }

      for (const pay of (overdue || []) as AccountsPayableRow[]) {
        const amount = Number(pay.balance) || Number(pay.amount) || 0;
        alerts.push({
          id: `overdue-${pay.id}`,
          type: 'overdue_payable',
          severity: 'high',
          message: `Cuenta por pagar vencida (${pay.days_overdue || 0} dias) por ${amount.toFixed(2)}`,
          amount,
          supplierId: pay.supplier_id,
        });
      }

      // 3. Cuentas por pagar por vencer en 7 dias
      const { data: upcoming, error: upcomingError } = await supabase
        .from('accounts_payable')
        .select('id, supplier_id, amount, balance, due_date, status')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'partial', 'open'])
        .gte('due_date', todayStr)
        .lte('due_date', sevenDaysStr);

      if (upcomingError) {
        throw new Error(`Error al listar CxP proximas: ${upcomingError.message}`);
      }

      for (const pay of (upcoming || []) as AccountsPayableRow[]) {
        const amount = Number(pay.balance) || Number(pay.amount) || 0;
        alerts.push({
          id: `upcoming-${pay.id}`,
          type: 'upcoming_payable',
          severity: 'medium',
          message: `Cuenta por pagar por vencer el ${pay.due_date?.split('T')[0]} por ${amount.toFixed(2)}`,
          amount,
          supplierId: pay.supplier_id,
        });
      }

      // 4. Concentracion de pagos (>30% en un proveedor)
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const concentrations = await TreasuryService.getPaymentConcentration(
        organizationId,
        yearStart.toISOString().split('T')[0],
        todayStr,
      );

      for (const conc of concentrations) {
        if (conc.percentage > 30) {
          const severity = conc.percentage > 50 ? 'high' : 'medium';
          alerts.push({
            id: `conc-${conc.supplierId}`,
            type: 'concentration_risk',
            severity,
            message: `Concentracion del ${conc.percentage.toFixed(1)}% de pagos en proveedor ${conc.supplierName}`,
            amount: conc.totalAmount,
            supplierId: conc.supplierId,
          });
        }
      }

      // Ordenar alertas por severidad (high -> medium -> low)
      const severityOrder: Record<string, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return alerts;
    } catch (err) {
      throw new Error(
        `Error al generar alertas de tesoreria: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Instancia singleton del servicio de tesoreria */
export const treasuryService = TreasuryService;
