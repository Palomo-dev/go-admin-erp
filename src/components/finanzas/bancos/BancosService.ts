import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import type { EstadoMovimientoBancario, TipoMovimientoBancario } from '@/lib/finanzas/movimientoBancario';

export interface BankAccount {
  id: number;
  organization_id: number;
  branch_id: number;
  name: string;
  account_number: string | null;
  bank_name: string | null;
  account_type: string | null;
  currency: string | null;
  balance: number;
  initial_balance: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Calculados
  pending_reconciliation?: number;
  last_transaction_date?: string;
}

export interface BankTransaction {
  id: number;
  organization_id: number;
  bank_account_id: number;
  trans_date: string;
  description: string | null;
  amount: number;
  reference: string | null;
  matched_journal_line_id: number | null;
  /** CHECK de la base. El sentido lo da el signo de `amount` (`esEntradaBancaria`). */
  transaction_type: TipoMovimientoBancario;
  status: EstadoMovimientoBancario | null;
  import_source: string | null;
  import_id: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  bank_account?: BankAccount;
}

export interface BankReconciliation {
  id: string;
  organization_id: number;
  bank_account_id: number;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  statement_balance: number | null;
  difference: number | null;
  status: 'draft' | 'in_progress' | 'closed';
  notes: string | null;
  created_by: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  // Relaciones
  bank_account?: BankAccount;
  items_count?: number;
  matched_count?: number;
}

export interface BankReconciliationItem {
  id: string;
  reconciliation_id: string;
  bank_transaction_id: number | null;
  match_type: 'payment' | 'journal' | 'manual' | 'unmatched';
  matched_payment_id: string | null;
  matched_journal_line_id: number | null;
  amount: number;
  is_matched: boolean;
  match_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface BankAccountStats {
  total_accounts: number;
  active_accounts: number;
  total_balance: number;
  pending_reconciliations: number;
}

export class BancosService {
  private static getOrganizationId(): number {
    const orgId = getOrganizationId();
    if (!orgId) throw new Error('Organization ID no disponible');
    return orgId;
  }

  private static getBranchId(): number {
    const branchId = getCurrentBranchId();
    if (!branchId) throw new Error('Branch ID no disponible');
    return branchId;
  }

  // ==================== CUENTAS BANCARIAS ====================

  static async obtenerCuentasBancarias(branchId?: number | null): Promise<BankAccount[]> {
    const organizationId = this.getOrganizationId();

    try {
      let query = supabase
        .from('bank_accounts')
        .select('*')
        .eq('organization_id', organizationId);

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      return (data || []).map(account => ({
        ...account,
        balance: parseFloat(account.balance || 0),
        initial_balance: account.initial_balance ? parseFloat(account.initial_balance) : null
      }));
    } catch (error) {
      console.error('Error obteniendo cuentas bancarias:', error);
      throw error;
    }
  }

  static async obtenerCuentaBancaria(accountId: number): Promise<BankAccount | null> {
    const organizationId = this.getOrganizationId();

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return {
        ...data,
        balance: parseFloat(data.balance || 0),
        initial_balance: data.initial_balance ? parseFloat(data.initial_balance) : null
      };
    } catch (error) {
      console.error('Error obteniendo cuenta bancaria:', error);
      throw error;
    }
  }

  static async crearCuentaBancaria(cuenta: Partial<BankAccount>): Promise<BankAccount> {
    const organizationId = this.getOrganizationId();
    const branchId = this.getBranchId();

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          name: cuenta.name,
          account_number: cuenta.account_number,
          bank_name: cuenta.bank_name,
          account_type: cuenta.account_type || 'checking',
          // Sin moneda elegida, la base de la organización la pone el trigger
          // `trg_00_moneda_base_por_defecto` (nunca COP supuesto).
          currency: cuenta.currency || null,
          balance: cuenta.initial_balance || 0,
          initial_balance: cuenta.initial_balance || 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creando cuenta bancaria:', error);
      throw error;
    }
  }

  static async actualizarCuentaBancaria(accountId: number, updates: Partial<BankAccount>): Promise<void> {
    const organizationId = this.getOrganizationId();
    // El saldo lo mueven los movimientos (disparador de 20260928160000) y la
    // organización no se reasigna: ninguno de los dos viaja en la edición.
    const editables: Partial<BankAccount> = { ...updates };
    delete editables.balance;
    delete editables.organization_id;
    delete editables.id;
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .update({
          ...editables,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando cuenta bancaria:', error);
      throw error;
    }
  }

  static async toggleActivoCuenta(accountId: number, isActive: boolean): Promise<void> {
    const organizationId = this.getOrganizationId();
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error cambiando estado de cuenta:', error);
      throw error;
    }
  }

  // ==================== TRANSACCIONES BANCARIAS ====================

  static async obtenerTransacciones(
    accountId: number,
    filters?: {
      startDate?: string;
      endDate?: string;
      status?: string;
      limit?: number;
    }
  ): Promise<BankTransaction[]> {
    const organizationId = this.getOrganizationId();

    try {
      let query = supabase
        .from('bank_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('bank_account_id', accountId)
        .order('trans_date', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('trans_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('trans_date', filters.endDate);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(tx => ({
        ...tx,
        amount: parseFloat(tx.amount)
      }));
    } catch (error) {
      console.error('Error obteniendo transacciones:', error);
      throw error;
    }
  }

  /**
   * Movimiento manual de la cuenta. `amount` llega positivo y el signo lo pone
   * `transaction_type` (deposit entra, withdrawal sale). El saldo NO se toca
   * aquí: lo mueve el disparador `trg_bank_tx_saldo` en la misma transacción
   * del INSERT (antes era un leer-y-escribir desde el navegador sin filtro de
   * organización, y el INSERT fallaba igual por 'credit'/'pending').
   */
  static async crearTransaccion(transaction: {
    bank_account_id: number;
    transaction_type: 'deposit' | 'withdrawal';
    amount: number;
    description?: string | null;
    reference?: string | null;
    trans_date?: string;
  }): Promise<BankTransaction> {
    const organizationId = this.getOrganizationId();
    const monto = Math.abs(transaction.amount);

    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .insert({
          organization_id: organizationId,
          bank_account_id: transaction.bank_account_id,
          trans_date: transaction.trans_date || new Date().toISOString(),
          description: transaction.description,
          amount: transaction.transaction_type === 'deposit' ? monto : -monto,
          reference: transaction.reference,
          transaction_type: transaction.transaction_type,
          status: 'unmatched',
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, amount: parseFloat(data.amount) };
    } catch (error) {
      console.error('Error creando transacción:', error);
      throw error;
    }
  }

  // ==================== CONCILIACIÓN BANCARIA ====================

  static async obtenerConciliaciones(accountId?: number): Promise<BankReconciliation[]> {
    const organizationId = this.getOrganizationId();

    try {
      let query = supabase
        .from('bank_reconciliations')
        .select(`
          *,
          bank_accounts:bank_account_id(id, name, bank_name, account_number, currency)
        `)
        .eq('organization_id', organizationId)
        .order('period_end', { ascending: false });

      if (accountId) {
        query = query.eq('bank_account_id', accountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(rec => ({
        ...rec,
        opening_balance: parseFloat(rec.opening_balance),
        closing_balance: parseFloat(rec.closing_balance),
        statement_balance: rec.statement_balance ? parseFloat(rec.statement_balance) : null,
        difference: rec.difference ? parseFloat(rec.difference) : null,
        bank_account: rec.bank_accounts
      }));
    } catch (error) {
      console.error('Error obteniendo conciliaciones:', error);
      throw error;
    }
  }

  static async obtenerConciliacion(reconciliationId: string): Promise<BankReconciliation | null> {
    const organizationId = this.getOrganizationId();
    try {
      const { data, error } = await supabase
        .from('bank_reconciliations')
        .select(`
          *,
          bank_accounts:bank_account_id(id, name, bank_name, account_number, balance, currency)
        `)
        .eq('id', reconciliationId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return {
        ...data,
        opening_balance: parseFloat(data.opening_balance),
        closing_balance: parseFloat(data.closing_balance),
        statement_balance: data.statement_balance ? parseFloat(data.statement_balance) : null,
        difference: data.difference ? parseFloat(data.difference) : null,
        bank_account: data.bank_accounts
      };
    } catch (error) {
      console.error('Error obteniendo conciliación:', error);
      throw error;
    }
  }

  static async crearConciliacion(data: {
    bank_account_id: number;
    period_start: string;
    period_end: string;
    opening_balance: number;
    statement_balance?: number;
  }): Promise<BankReconciliation> {
    const organizationId = this.getOrganizationId();

    try {
      const { data: reconciliation, error } = await supabase
        .from('bank_reconciliations')
        .insert({
          organization_id: organizationId,
          bank_account_id: data.bank_account_id,
          period_start: data.period_start,
          period_end: data.period_end,
          opening_balance: data.opening_balance,
          closing_balance: data.opening_balance,
          statement_balance: data.statement_balance || null,
          difference: 0,
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return reconciliation;
    } catch (error) {
      console.error('Error creando conciliación:', error);
      throw error;
    }
  }

  static async cerrarConciliacion(reconciliationId: string): Promise<void> {
    const organizationId = this.getOrganizationId();
    try {
      const { error } = await supabase
        .from('bank_reconciliations')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', reconciliationId)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error cerrando conciliación:', error);
      throw error;
    }
  }

  // ==================== ITEMS DE CONCILIACIÓN ====================

  static async obtenerItemsConciliacion(reconciliationId: string): Promise<BankReconciliationItem[]> {
    try {
      const { data, error } = await supabase
        .from('bank_reconciliation_items')
        .select(`
          *,
          bank_transactions:bank_transaction_id(id, trans_date, description, amount, transaction_type)
        `)
        .eq('reconciliation_id', reconciliationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        amount: parseFloat(item.amount)
      }));
    } catch (error) {
      console.error('Error obteniendo items de conciliación:', error);
      throw error;
    }
  }

  static async matchTransaccion(
    reconciliationId: string,
    transactionId: number,
    matchType: 'payment' | 'journal' | 'manual',
    matchedId?: string | number
  ): Promise<void> {
    const organizationId = this.getOrganizationId();
    try {
      // Obtener transacción (de la organización)
      const { data: tx, error: txError } = await supabase
        .from('bank_transactions')
        .select('amount')
        .eq('id', transactionId)
        .eq('organization_id', organizationId)
        .single();

      if (txError) throw txError;

      // Crear item de conciliación
      const { error } = await supabase
        .from('bank_reconciliation_items')
        .insert({
          reconciliation_id: reconciliationId,
          bank_transaction_id: transactionId,
          match_type: matchType,
          matched_payment_id: matchType === 'payment' ? matchedId : null,
          matched_journal_line_id: matchType === 'journal' ? matchedId : null,
          amount: tx.amount,
          is_matched: true,
          match_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      // Actualizar transacción como matched
      const { error: statusError } = await supabase
        .from('bank_transactions')
        .update({ status: 'matched', updated_at: new Date().toISOString() })
        .eq('id', transactionId)
        .eq('organization_id', organizationId);
      if (statusError) throw statusError;

    } catch (error) {
      console.error('Error haciendo match:', error);
      throw error;
    }
  }

  static async unmatchTransaccion(itemId: string, transactionId: number): Promise<void> {
    const organizationId = this.getOrganizationId();
    try {
      // Eliminar item
      const { error } = await supabase
        .from('bank_reconciliation_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Actualizar transacción como unmatched ('pending' no existe en el CHECK)
      const { error: statusError } = await supabase
        .from('bank_transactions')
        .update({ status: 'unmatched', updated_at: new Date().toISOString() })
        .eq('id', transactionId)
        .eq('organization_id', organizationId);
      if (statusError) throw statusError;

    } catch (error) {
      console.error('Error deshaciendo match:', error);
      throw error;
    }
  }

  // ==================== ESTADÍSTICAS ====================

  static async obtenerEstadisticas(branchId?: number | null): Promise<BankAccountStats> {
    const organizationId = this.getOrganizationId();

    try {
      let accountsQuery = supabase
        .from('bank_accounts')
        .select('id, balance, is_active')
        .eq('organization_id', organizationId);

      if (branchId != null) {
        accountsQuery = accountsQuery.eq('branch_id', branchId);
      }

      const { data: accounts, error } = await accountsQuery;

      if (error) throw error;

      const activeAccounts = (accounts || []).filter(a => a.is_active);
      const totalBalance = activeAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);

      // Contar conciliaciones pendientes.
      // Cuando se filtra por sucursal, limitar el conteo a las
      // reconciliaciones de las cuentas bancarias de esa sucursal (join vía
      // bank_account_id) para no inflar el número con conciliaciones de
      // otras sucursales.
      // Si branchId != null pero no hay cuentas bancarias en esa sucursal,
      // no puede haber conciliaciones pendientes: retornar 0 directamente
      // sin ejecutar la query (evita contar conciliaciones de otras sucursales
      // al no aplicar el filtro bank_account_id).
      let pendingRec: number | null = 0;

      if (branchId != null && (accounts || []).length === 0) {
        pendingRec = 0;
      } else {
        let pendingRecQuery = supabase
          .from('bank_reconciliations')
          .select('id, bank_account_id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('status', ['draft', 'in_progress']);

        if (branchId != null && (accounts || []).length > 0) {
          const accountIds = (accounts || []).map(a => a.id);
          pendingRecQuery = pendingRecQuery.in('bank_account_id', accountIds);
        }

        const { count: pendingRecCount, error: pendingRecError } = await pendingRecQuery;

        if (pendingRecError) {
          console.error('Error obteniendo conciliaciones pendientes:', pendingRecError);
          pendingRec = 0;
        } else {
          pendingRec = pendingRecCount;
        }
      }

      return {
        total_accounts: (accounts || []).length,
        active_accounts: activeAccounts.length,
        total_balance: totalBalance,
        pending_reconciliations: pendingRec || 0
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  // ==================== MONEDAS ====================

  static async obtenerMonedasOrganizacion(): Promise<{ code: string; name: string; symbol: string }[]> {
    const organizationId = this.getOrganizationId();
    // Respaldo: la moneda base resuelta de la organización (resolveOrgCurrency no lanza).
    const soloLaBase = async () => {
      const base = await resolveOrgCurrency(supabase, organizationId);
      return [{ code: base.code, name: base.code, symbol: base.symbol || '$' }];
    };

    try {
      const { data: orgCurrencies, error: orgError } = await supabase
        .from('organization_currencies')
        .select('currency_code')
        .eq('organization_id', organizationId);

      if (orgError) throw orgError;

      if (!orgCurrencies || orgCurrencies.length === 0) {
        return await soloLaBase();
      }

      const codes = orgCurrencies.map(c => c.currency_code);
      const { data: currencies, error: currError } = await supabase
        .from('currencies')
        .select('code, name, symbol')
        .in('code', codes);

      if (currError) throw currError;

      return currencies && currencies.length > 0 ? currencies : await soloLaBase();
    } catch (error) {
      console.error('Error obteniendo monedas:', error);
      return await soloLaBase();
    }
  }
}
