import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { BancosService, BankReconciliation, BankReconciliationItem, BankAccount, BankTransaction } from '../bancos/BancosService';

export interface ConciliacionStats {
  total: number;
  draft: number;
  in_progress: number;
  closed: number;
}

export class ConciliacionService {
  private static getOrganizationId(): number {
    const orgId = getOrganizationId();
    if (!orgId) throw new Error('Organization ID no disponible');
    return orgId;
  }

  static async obtenerConciliaciones(filters?: {
    status?: string;
    accountId?: number;
    branchId?: number | null;
  }): Promise<BankReconciliation[]> {
    const organizationId = this.getOrganizationId();

    try {
      let query = supabase
        .from('bank_reconciliations')
        .select(`
          *,
          bank_accounts:bank_account_id(id, name, bank_name, account_number)
        `)
        .eq('organization_id', organizationId)
        .order('period_end', { ascending: false });

      if (filters?.accountId) {
        query = query.eq('bank_account_id', filters.accountId);
      }

      // Filtrar por sucursal: obtener las cuentas bancarias de la sucursal
      // y limitar las conciliaciones a esas cuentas.
      if (filters?.branchId != null) {
        const accounts = await BancosService.obtenerCuentasBancarias(filters.branchId);
        const accountIds = accounts.map(a => a.id);
        if (accountIds.length === 0) {
          return [];
        }
        query = query.in('bank_account_id', accountIds);
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

  static async obtenerConciliacion(id: string): Promise<BankReconciliation | null> {
    return BancosService.obtenerConciliacion(id);
  }

  static async obtenerItemsConciliacion(id: string): Promise<BankReconciliationItem[]> {
    return BancosService.obtenerItemsConciliacion(id);
  }

  static async obtenerCuentasBancarias(branchId?: number | null): Promise<BankAccount[]> {
    return BancosService.obtenerCuentasBancarias(branchId);
  }

  static async obtenerTransaccionesPendientes(
    accountId: number,
    startDate: string,
    endDate: string
  ): Promise<BankTransaction[]> {
    const organizationId = this.getOrganizationId();

    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('bank_account_id', accountId)
        .gte('trans_date', startDate)
        .lte('trans_date', endDate)
        .or('status.is.null,status.neq.matched')
        .order('trans_date', { ascending: false });

      if (error) throw error;

      return (data || []).map(tx => ({
        ...tx,
        amount: parseFloat(tx.amount)
      }));
    } catch (error) {
      console.error('Error obteniendo transacciones pendientes:', error);
      throw error;
    }
  }

  static async obtenerPagosCandidatos(
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const organizationId = this.getOrganizationId();

    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, method, reference, status, created_at, source, source_id')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(p => ({
        ...p,
        amount: parseFloat(p.amount)
      }));
    } catch (error) {
      console.error('Error obteniendo pagos candidatos:', error);
      return [];
    }
  }

  static async crearConciliacion(data: {
    bank_account_id: number;
    period_start: string;
    period_end: string;
    opening_balance: number;
    statement_balance?: number;
  }): Promise<BankReconciliation> {
    return BancosService.crearConciliacion(data);
  }

  static async actualizarConciliacion(
    id: string,
    updates: Partial<BankReconciliation>
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('bank_reconciliations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando conciliación:', error);
      throw error;
    }
  }

  static async cerrarConciliacion(id: string): Promise<void> {
    return BancosService.cerrarConciliacion(id);
  }

  static async matchTransaccion(
    reconciliationId: string,
    transactionId: number,
    matchType: 'payment' | 'journal' | 'manual',
    matchedId?: string | number
  ): Promise<void> {
    return BancosService.matchTransaccion(reconciliationId, transactionId, matchType, matchedId);
  }

  static async unmatchTransaccion(itemId: string, transactionId: number): Promise<void> {
    return BancosService.unmatchTransaccion(itemId, transactionId);
  }

  static async obtenerEstadisticas(branchId?: number | null): Promise<ConciliacionStats> {
    const organizationId = this.getOrganizationId();

    try {
      let query = supabase
        .from('bank_reconciliations')
        .select('id, status')
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'in_progress', 'closed']);

      // Filtrar por sucursal: limitar a las conciliaciones de las cuentas
      // bancarias de la sucursal seleccionada.
      if (branchId != null) {
        const accounts = await BancosService.obtenerCuentasBancarias(branchId);
        const accountIds = accounts.map(a => a.id);
        if (accountIds.length === 0) {
          return { total: 0, draft: 0, in_progress: 0, closed: 0 };
        }
        query = query.in('bank_account_id', accountIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      const reconciliations = data || [];
      return {
        total: reconciliations.length,
        draft: reconciliations.filter(r => r.status === 'draft').length,
        in_progress: reconciliations.filter(r => r.status === 'in_progress').length,
        closed: reconciliations.filter(r => r.status === 'closed').length
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, draft: 0, in_progress: 0, closed: 0 };
    }
  }

  static async recalcularDiferencia(reconciliationId: string): Promise<number> {
    try {
      const reconciliation = await this.obtenerConciliacion(reconciliationId);
      if (!reconciliation) throw new Error('Conciliación no encontrada');

      const items = await this.obtenerItemsConciliacion(reconciliationId);
      const matchedAmount = items
        .filter(i => i.is_matched)
        .reduce((sum, i) => sum + i.amount, 0);

      const difference = (reconciliation.statement_balance || 0) - 
        (reconciliation.opening_balance + matchedAmount);

      await supabase
        .from('bank_reconciliations')
        .update({
          difference,
          closing_balance: reconciliation.opening_balance + matchedAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', reconciliationId);

      return difference;
    } catch (error) {
      console.error('Error recalculando diferencia:', error);
      throw error;
    }
  }

  /**
   * Auto-concilia un pago con una transaccion bancaria despues de un webhook.
   * Version client-side que delega al endpoint del servidor.
   */
  static async autoMatchFromWebhook(
    paymentId: string,
    bankTransactionId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/integrations/qr/auto-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, bankTransactionId }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error en autoMatchFromWebhook:', error);
      return { success: false, message: 'Error al auto-conciliar' };
    }
  }
}
