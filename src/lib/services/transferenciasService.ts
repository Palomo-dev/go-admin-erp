'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentUserId } from '@/lib/hooks/useOrganization';

export interface BankTransfer {
  id: string;
  organization_id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transfer_date: string;
  reference?: string;
  status: 'pending' | 'completed' | 'cancelled';
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  from_account?: {
    id: number;
    name: string;
    bank_name: string | null;
  };
  to_account?: {
    id: number;
    name: string;
    bank_name: string | null;
  };
}

export interface TransferFormData {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transfer_date: string;
  reference?: string;
  notes?: string;
}

export interface BankAccount {
  id: number;
  name: string;
  bank_name: string | null;
  balance: number;
  is_active: boolean;
}

class TransferenciasService {
  /**
   * Obtener todas las transferencias
   */
  async getTransfers(): Promise<BankTransfer[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('bank_transfers')
      .select(`
        *,
        from_account:bank_accounts!bank_transfers_from_account_id_fkey(id, name, bank_name),
        to_account:bank_accounts!bank_transfers_to_account_id_fkey(id, name, bank_name)
      `)
      .eq('organization_id', organizationId)
      .order('transfer_date', { ascending: false });

    if (error) {
      console.error('Error fetching transfers:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener transferencia por ID
   */
  async getTransferById(id: string): Promise<BankTransfer | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('bank_transfers')
      .select(`
        *,
        from_account:bank_accounts!bank_transfers_from_account_id_fkey(id, name, bank_name),
        to_account:bank_accounts!bank_transfers_to_account_id_fkey(id, name, bank_name)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error) {
      console.error('Error fetching transfer:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtener cuentas bancarias activas
   */
  async getBankAccounts(): Promise<BankAccount[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id, name, bank_name, balance, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching bank accounts:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Crear nueva transferencia
   */
  async createTransfer(
    data: TransferFormData
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, error: 'No se encontró la organización' };
    }

    const userId = await getCurrentUserId();

    // Validar que las cuentas son diferentes
    if (data.from_account_id === data.to_account_id) {
      return { success: false, error: 'Las cuentas origen y destino deben ser diferentes' };
    }

    // Validar monto positivo
    if (data.amount <= 0) {
      return { success: false, error: 'El monto debe ser mayor a 0' };
    }

    const { data: result, error } = await supabase
      .from('bank_transfers')
      .insert({
        organization_id: organizationId,
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: data.amount,
        transfer_date: data.transfer_date || new Date().toISOString(),
        reference: data.reference,
        notes: data.notes,
        status: 'completed',
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating transfer:', error);
      return { success: false, error: error.message };
    }

    // Actualizar saldos de las cuentas
    await this.updateAccountBalances(
      data.from_account_id,
      data.to_account_id,
      data.amount
    );

    return { success: true, id: result.id };
  }

  /**
   * Actualizar saldos de cuentas después de transferencia
   */
  private async updateAccountBalances(
    fromAccountId: number,
    toAccountId: number,
    amount: number
  ): Promise<void> {
    // Restar de cuenta origen
    await supabase.rpc('update_bank_balance', {
      p_account_id: fromAccountId,
      p_amount: -amount
    }).then(({ error }) => {
      if (error) {
        // Si no existe el RPC, actualizar directamente
        supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', fromAccountId)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase
                .from('bank_accounts')
                .update({ balance: (data.balance || 0) - amount })
                .eq('id', fromAccountId);
            }
          });
      }
    });

    // Sumar a cuenta destino
    await supabase.rpc('update_bank_balance', {
      p_account_id: toAccountId,
      p_amount: amount
    }).then(({ error }) => {
      if (error) {
        // Si no existe el RPC, actualizar directamente
        supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', toAccountId)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase
                .from('bank_accounts')
                .update({ balance: (data.balance || 0) + amount })
                .eq('id', toAccountId);
            }
          });
      }
    });
  }

  /**
   * Anular transferencia
   */
  async cancelTransfer(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const transfer = await this.getTransferById(id);
    if (!transfer) {
      return { success: false, error: 'Transferencia no encontrada' };
    }

    if (transfer.status === 'cancelled') {
      return { success: false, error: 'La transferencia ya está anulada' };
    }

    const { error } = await supabase
      .from('bank_transfers')
      .update({
        status: 'cancelled',
        notes: transfer.notes 
          ? `${transfer.notes}\n\nANULADA: ${reason || 'Sin motivo'}`
          : `ANULADA: ${reason || 'Sin motivo'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error canceling transfer:', error);
      return { success: false, error: error.message };
    }

    // Revertir saldos
    await this.updateAccountBalances(
      transfer.to_account_id,
      transfer.from_account_id,
      transfer.amount
    );

    return { success: true };
  }

  /**
   * Obtener estadísticas
   */
  async getStats(): Promise<{
    total: number;
    count: number;
    thisMonth: number;
    pending: number;
  }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { total: 0, count: 0, thisMonth: 0, pending: 0 };
    }

    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('bank_transfers')
      .select('amount, transfer_date, status')
      .eq('organization_id', organizationId)
      .eq('status', 'completed');

    if (error || !data) {
      return { total: 0, count: 0, thisMonth: 0, pending: 0 };
    }

    const total = data.reduce((sum, t) => sum + Number(t.amount), 0);
    const count = data.length;
    const monthTransfers = data.filter(
      t => new Date(t.transfer_date) >= firstOfMonth
    );

    // Contar pendientes
    const { count: pendingCount } = await supabase
      .from('bank_transfers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    return {
      total,
      count,
      thisMonth: monthTransfers.reduce((sum, t) => sum + Number(t.amount), 0),
      pending: pendingCount || 0,
    };
  }
}

export const transferenciasService = new TransferenciasService();
