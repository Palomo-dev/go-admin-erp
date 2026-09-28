'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { codigoErrorTesoreria, type CodigoErrorTesoreria } from '@/lib/finanzas/movimientoBancario';

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
  branch_id?: number | null;
}

export interface BankAccount {
  id: number;
  name: string;
  bank_name: string | null;
  balance: number;
  currency: string | null;
  is_active: boolean;
}

/** Resultado de una escritura: `codigo` se traduce en `tesoreria.errores.<codigo>`. */
export interface ResultadoTransferencia {
  success: boolean;
  id?: string;
  /** La llamada repetida devolvió la transferencia (o la anulación) que ya existía. */
  repetida?: boolean;
  error?: string;
  codigo?: CodigoErrorTesoreria;
}

function fallo(error: unknown): ResultadoTransferencia {
  const codigo = codigoErrorTesoreria(error);
  const mensaje = (error as { message?: string } | null)?.message;
  return { success: false, codigo, error: mensaje || codigo };
}

class TransferenciasService {
  /**
   * Obtener todas las transferencias
   */
  async getTransfers(branchId?: number | null): Promise<BankTransfer[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    let query = supabase
      .from('bank_transfers')
      .select(`
        *,
        from_account:bank_accounts!bank_transfers_from_account_id_fkey(id, name, bank_name),
        to_account:bank_accounts!bank_transfers_to_account_id_fkey(id, name, bank_name)
      `)
      .eq('organization_id', organizationId);
    if (branchId != null) query = query.eq('branch_id', branchId);
    const { data, error } = await query
      .order('transfer_date', { ascending: false });

    if (error) throw error;
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
      .maybeSingle();

    if (error) throw error;
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
      .select('id, name, bank_name, balance, currency, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * Registrar una transferencia por `fn_transferencia_registrar` (migración
   * 20260928161000): el servidor valida saldo suficiente, misma organización,
   * misma moneda y fecha no futura en la zona de la organización, y los
   * disparadores mueven los dos saldos y el asiento en la MISMA transacción.
   *
   * `idempotencyKey` es el id de la transferencia: el diálogo lo genera una
   * vez por apertura, así un doble clic o un reintento tras un corte de red
   * devuelve la misma transferencia en vez de crear dos.
   *
   * `transfer_date` es el día calendario del formulario ('YYYY-MM-DD'): viaja
   * como `date` y el servidor le pone la hora de pared de la organización
   * (antes caía a medianoche UTC = el día anterior en Bogotá).
   */
  async createTransfer(
    data: TransferFormData,
    idempotencyKey: string = globalThis.crypto.randomUUID(),
  ): Promise<ResultadoTransferencia> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, codigo: 'sin_organizacion', error: 'sin_organizacion' };
    }

    if (data.from_account_id === data.to_account_id) {
      return { success: false, codigo: 'cuentas_iguales', error: 'cuentas_iguales' };
    }
    if (!(data.amount > 0)) {
      return { success: false, codigo: 'monto_invalido', error: 'monto_invalido' };
    }

    const { data: result, error } = await supabase.rpc('fn_transferencia_registrar', {
      p_id: idempotencyKey,
      p_organization_id: organizationId,
      p_cuenta_origen: data.from_account_id,
      p_cuenta_destino: data.to_account_id,
      p_monto: data.amount,
      p_fecha: data.transfer_date || null,
      p_referencia: data.reference ?? null,
      p_notas: data.notes ?? null,
      p_branch_id: data.branch_id ?? null,
    });

    if (error) return fallo(error);
    const fila = (result ?? {}) as { id?: string; repetida?: boolean };
    return { success: true, id: fila.id, repetida: fila.repetida === true };
  }

  /**
   * Anular por `fn_transferencia_anular`: el disparador revierte ambos saldos y
   * el contable genera el contra-asiento. Idempotente (anular dos veces no
   * revierte dos veces). La organización es la de la sesión.
   */
  async cancelTransfer(
    id: string,
    reason?: string
  ): Promise<ResultadoTransferencia> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, codigo: 'sin_organizacion', error: 'sin_organizacion' };
    }

    const { data, error } = await supabase.rpc('fn_transferencia_anular', {
      p_organization_id: organizationId,
      p_id: id,
      p_motivo: reason ?? null,
    });

    if (error) return fallo(error);
    const fila = (data ?? {}) as { id?: string; ya_anulada?: boolean };
    return { success: true, id: fila.id, repetida: fila.ya_anulada === true };
  }

  /**
   * Obtener estadísticas
   */
  async getStats(branchId?: number | null): Promise<{
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

    let query = supabase
      .from('bank_transfers')
      .select('amount, transfer_date, status')
      .eq('organization_id', organizationId)
      .eq('status', 'completed');
    if (branchId != null) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return { total: 0, count: 0, thisMonth: 0, pending: 0 };

    const total = data.reduce((sum, t) => sum + Number(t.amount), 0);
    const count = data.length;
    const monthTransfers = data.filter(
      t => new Date(t.transfer_date) >= firstOfMonth
    );

    // Contar pendientes
    let pendingQuery = supabase
      .from('bank_transfers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');
    if (branchId != null) pendingQuery = pendingQuery.eq('branch_id', branchId);
    const { count: pendingCount, error: pendingError } = await pendingQuery;
    if (pendingError) throw pendingError;

    return {
      total,
      count,
      thisMonth: monthTransfers.reduce((sum, t) => sum + Number(t.amount), 0),
      pending: pendingCount || 0,
    };
  }
}

export const transferenciasService = new TransferenciasService();
