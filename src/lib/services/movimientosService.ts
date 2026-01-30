'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export type MovementType = 'income' | 'expense';
export type MovementSource = 'cash' | 'bank';

// Interfaz unificada para mostrar movimientos de caja y banco juntos
export interface UnifiedMovement {
  id: number;
  uuid: string;
  source: MovementSource;
  concept: string;
  amount: number;
  notes?: string;
  created_at: string;
  bank_account_name?: string;
}

export interface CashMovement {
  id: number;
  organization_id: number;
  cash_session_id: number;
  type: MovementType;
  concept: string;
  amount: number;
  user_id: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  cash_session?: {
    id: number;
    status: string;
    opened_at: string;
  };
}

export interface BankTransaction {
  id: number;
  organization_id: number;
  bank_account_id: number;
  trans_date: string;
  description?: string;
  amount: number;
  reference?: string;
  transaction_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  bank_account?: {
    id: number;
    account_name: string;
    bank_name: string;
  };
}

export interface MovementFormData {
  type: MovementType;
  concept: string;
  amount: number;
  notes?: string;
  source: 'cash' | 'bank';
  bank_account_id?: number;
}

export interface CashSession {
  id: number;
  uuid: string;
  organization_id: number;
  branch_id: number;
  status: string;
  opened_at: string;
  closed_at?: string;
  initial_amount: number;
  final_amount?: number;
}

export interface BankAccount {
  id: number;
  organization_id: number;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  balance: number;
  is_active: boolean;
}

class MovimientosService {
  /**
   * Obtener movimientos de caja filtrados por tipo
   */
  async getMovements(type: MovementType): Promise<CashMovement[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    // Mapear tipo de UI a valor de BD: 'income' -> 'in', 'expense' -> 'out'
    const dbType = type === 'income' ? 'in' : 'out';

    const { data, error } = await supabase
      .from('cash_movements')
      .select(`
        *,
        cash_session:cash_sessions(id, status, opened_at)
      `)
      .eq('organization_id', organizationId)
      .eq('type', dbType)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching movements:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener un movimiento por ID
   */
  async getMovementById(id: number): Promise<CashMovement | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('cash_movements')
      .select(`
        *,
        cash_session:cash_sessions(id, status, opened_at, branch_id)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error) {
      console.error('Error fetching movement:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtener movimiento por UUID (busca en cash_movements y bank_transactions)
   */
  async getMovementByUuid(uuid: string): Promise<UnifiedMovement | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    // Buscar en cash_movements
    const { data: cashData } = await supabase
      .from('cash_movements')
      .select('id, uuid, type, concept, amount, notes, created_at')
      .eq('uuid', uuid)
      .eq('organization_id', organizationId)
      .single();

    if (cashData) {
      return {
        id: cashData.id,
        uuid: cashData.uuid,
        source: 'cash' as MovementSource,
        concept: cashData.concept,
        amount: Math.abs(Number(cashData.amount)),
        notes: cashData.notes,
        created_at: cashData.created_at,
      };
    }

    // Buscar en bank_transactions
    const { data: bankData } = await supabase
      .from('bank_transactions')
      .select(`
        id,
        uuid,
        transaction_type,
        description,
        amount,
        reference,
        created_at,
        bank_account:bank_accounts(name, bank_name)
      `)
      .eq('uuid', uuid)
      .eq('organization_id', organizationId)
      .single();

    if (bankData) {
      return {
        id: bankData.id,
        uuid: bankData.uuid,
        source: 'bank' as MovementSource,
        concept: bankData.description || 'Transacción bancaria',
        amount: Math.abs(Number(bankData.amount)),
        notes: bankData.reference,
        created_at: bankData.created_at,
        bank_account_name: (bankData.bank_account as { name?: string; bank_name?: string })?.name || (bankData.bank_account as { name?: string; bank_name?: string })?.bank_name,
      };
    }

    return null;
  }

  /**
   * Obtener sesión de caja activa
   */
  async getActiveSession(): Promise<CashSession | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Obtener cuentas bancarias
   */
  async getBankAccounts(): Promise<BankAccount[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
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
   * Crear movimiento de caja
   */
  async createCashMovement(
    data: MovementFormData,
    userId: string
  ): Promise<{ success: boolean; id?: number; error?: string }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, error: 'No se encontró la organización' };
    }

    // Obtener sesión activa
    const session = await this.getActiveSession();
    if (!session) {
      return { success: false, error: 'No hay una sesión de caja abierta' };
    }

    // Mapear tipo a valores válidos del check constraint: 'in', 'out'
    const mappedType = data.type === 'income' ? 'in' : 'out';

    const { data: result, error } = await supabase
      .from('cash_movements')
      .insert({
        organization_id: organizationId,
        cash_session_id: session.id,
        type: mappedType,
        concept: data.concept,
        amount: data.amount,
        notes: data.notes,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating movement:', JSON.stringify(error));
      return { success: false, error: error.message || 'Error de permisos o datos inválidos. Verifique que tiene una sesión de caja abierta.' };
    }

    return { success: true, id: result.id };
  }

  /**
   * Crear transacción bancaria
   */
  async createBankTransaction(
    data: MovementFormData,
  ): Promise<{ success: boolean; id?: number; error?: string }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, error: 'No se encontró la organización' };
    }

    if (!data.bank_account_id) {
      return { success: false, error: 'Debe seleccionar una cuenta bancaria' };
    }

    // Mapear tipo a valores válidos del check constraint: 'deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'other'
    const mappedTransactionType = data.type === 'income' ? 'deposit' : 'withdrawal';

    const { data: result, error } = await supabase
      .from('bank_transactions')
      .insert({
        organization_id: organizationId,
        bank_account_id: data.bank_account_id,
        trans_date: new Date().toISOString(),
        description: data.concept,
        amount: data.type === 'income' ? data.amount : -data.amount,
        transaction_type: mappedTransactionType,
        reference: data.notes,
        status: 'unmatched',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bank transaction:', JSON.stringify(error));
      return { success: false, error: error.message || 'Error de permisos o datos inválidos. Verifique la cuenta bancaria seleccionada.' };
    }

    return { success: true, id: result.id };
  }

  /**
   * Actualizar movimiento
   */
  async updateMovement(
    id: number,
    data: Partial<MovementFormData>
  ): Promise<{ success: boolean; error?: string }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, error: 'No se encontró la organización' };
    }

    const { error } = await supabase
      .from('cash_movements')
      .update({
        concept: data.concept,
        amount: data.amount,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error updating movement:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Anular movimiento (no elimina, marca como anulado)
   */
  async cancelMovement(
    id: number,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, error: 'No se encontró la organización' };
    }

    // Crear movimiento inverso
    const original = await this.getMovementById(id);
    if (!original) {
      return { success: false, error: 'Movimiento no encontrado' };
    }

    const session = await this.getActiveSession();
    if (!session) {
      return { success: false, error: 'No hay una sesión de caja abierta' };
    }

    const { error } = await supabase
      .from('cash_movements')
      .insert({
        organization_id: organizationId,
        cash_session_id: session.id,
        type: original.type === 'income' ? 'expense' : 'income',
        concept: `ANULACIÓN: ${original.concept}`,
        amount: original.amount,
        notes: reason || `Anulación del movimiento #${id}`,
        user_id: original.user_id,
      });

    if (error) {
      console.error('Error canceling movement:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Duplicar movimiento
   */
  async duplicateMovement(
    id: number,
    userId: string
  ): Promise<{ success: boolean; id?: number; error?: string }> {
    const original = await this.getMovementById(id);
    if (!original) {
      return { success: false, error: 'Movimiento no encontrado' };
    }

    return this.createCashMovement(
      {
        type: original.type as MovementType,
        concept: `Copia de: ${original.concept}`,
        amount: original.amount,
        notes: original.notes,
        source: 'cash',
      },
      userId
    );
  }

  /**
   * Obtener estadísticas (incluye cash_movements y bank_transactions)
   */
  async getStats(type: MovementType): Promise<{
    total: number;
    count: number;
    today: number;
    thisMonth: number;
  }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { total: 0, count: 0, today: 0, thisMonth: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Mapear tipo de UI a BD
    const dbCashType = type === 'income' ? 'in' : 'out';
    const dbBankType = type === 'income' ? 'deposit' : 'withdrawal';

    // Obtener movimientos de caja
    const { data: cashData } = await supabase
      .from('cash_movements')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('type', dbCashType);

    // Obtener transacciones bancarias
    const { data: bankData } = await supabase
      .from('bank_transactions')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('transaction_type', dbBankType);

    // Combinar datos
    const allData = [
      ...(cashData || []).map(m => ({ amount: Math.abs(Number(m.amount)), created_at: m.created_at })),
      ...(bankData || []).map(m => ({ amount: Math.abs(Number(m.amount)), created_at: m.created_at })),
    ];

    const total = allData.reduce((sum, m) => sum + m.amount, 0);
    const count = allData.length;
    const todayMovements = allData.filter(
      m => new Date(m.created_at) >= today
    );
    const monthMovements = allData.filter(
      m => new Date(m.created_at) >= firstOfMonth
    );

    return {
      total,
      count,
      today: todayMovements.reduce((sum, m) => sum + m.amount, 0),
      thisMonth: monthMovements.reduce((sum, m) => sum + m.amount, 0),
    };
  }

  /**
   * Obtener transacciones bancarias por tipo
   */
  async getBankTransactions(type: MovementType): Promise<BankTransaction[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    // Mapear tipo de UI a BD: 'income' -> 'deposit', 'expense' -> 'withdrawal'
    const dbType = type === 'income' ? 'deposit' : 'withdrawal';

    const { data, error } = await supabase
      .from('bank_transactions')
      .select(`
        *,
        bank_account:bank_accounts(id, account_name, bank_name)
      `)
      .eq('organization_id', organizationId)
      .eq('transaction_type', dbType)
      .order('trans_date', { ascending: false });

    if (error) {
      console.error('Error fetching bank transactions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener todos los movimientos unificados (caja + banco)
   */
  async getAllMovements(type: MovementType): Promise<UnifiedMovement[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    // Mapear tipos
    const dbCashType = type === 'income' ? 'in' : 'out';
    const dbBankType = type === 'income' ? 'deposit' : 'withdrawal';

    // Obtener movimientos de caja
    const { data: cashData, error: cashError } = await supabase
      .from('cash_movements')
      .select('id, uuid, concept, amount, notes, created_at')
      .eq('organization_id', organizationId)
      .eq('type', dbCashType)
      .order('created_at', { ascending: false });

    if (cashError) {
      console.error('Error fetching cash movements:', cashError);
    }

    // Obtener transacciones bancarias
    const { data: bankData, error: bankError } = await supabase
      .from('bank_transactions')
      .select(`
        id,
        uuid,
        description,
        amount,
        reference,
        created_at,
        bank_account:bank_accounts(name, bank_name)
      `)
      .eq('organization_id', organizationId)
      .eq('transaction_type', dbBankType)
      .order('created_at', { ascending: false });

    if (bankError) {
      console.error('Error fetching bank transactions:', bankError);
    }

    // Unificar y ordenar
    const unified: UnifiedMovement[] = [
      ...(cashData || []).map(m => ({
        id: m.id,
        uuid: m.uuid,
        source: 'cash' as MovementSource,
        concept: m.concept,
        amount: Math.abs(Number(m.amount)),
        notes: m.notes,
        created_at: m.created_at,
      })),
      ...(bankData || []).map(m => ({
        id: m.id,
        uuid: m.uuid,
        source: 'bank' as MovementSource,
        concept: m.description || 'Transacción bancaria',
        amount: Math.abs(Number(m.amount)),
        notes: m.reference,
        created_at: m.created_at,
        bank_account_name: (m.bank_account as { name?: string; bank_name?: string })?.name || (m.bank_account as { name?: string; bank_name?: string })?.bank_name,
      })),
    ];

    // Ordenar por fecha descendente
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return unified;
  }
}

export const movimientosService = new MovimientosService();
