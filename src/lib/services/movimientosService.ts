'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { RPC_MOVIMIENTO_CAJA, parametrosMovimiento } from '@/lib/pos/cajas/movimientoRpc';
import {
  codigoErrorTesoreria,
  movimientoBancario,
  tipoBanco,
  tipoCaja,
  tipoDesdeCaja,
  tipoDesdeImporteBancario,
  uuidDeterminista,
  type CodigoErrorTesoreria,
  type TipoMovimiento,
} from '@/lib/finanzas/movimientoBancario';

export type MovementType = TipoMovimiento;
export type MovementSource = 'cash' | 'bank';

/**
 * Un movimiento se identifica por su fuente Y su id: los ids de
 * `cash_movements` y `bank_transactions` son secuencias distintas y se pisan
 * (el #12 de caja no es el #12 del banco).
 */
export interface MovementRef {
  id: number;
  source: MovementSource;
}

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
  uuid: string;
  organization_id: number;
  cash_session_id: number;
  branch_id: number | null;
  /** Valor de la base: 'in' | 'out'. Para el formulario, `tipoDesdeCaja`. */
  type: 'in' | 'out';
  concept: string;
  amount: number;
  user_id: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  cash_session?: {
    id: number;
    status: string;
    opened_at: string;
    branch_id: number | null;
  };
}

export interface BankTransaction {
  id: number;
  uuid: string;
  organization_id: number;
  bank_account_id: number;
  branch_id: number | null;
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
    name: string;
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
  branch_id?: number | null;
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

/** Resultado de una escritura: `codigo` se traduce en `tesoreria.errores.<codigo>`. */
export interface ResultadoMovimiento {
  success: boolean;
  id?: number;
  uuid?: string;
  error?: string;
  codigo?: CodigoErrorTesoreria;
}

function fallo(error: unknown): ResultadoMovimiento {
  const codigo = codigoErrorTesoreria(error);
  const mensaje = (error as { message?: string } | null)?.message;
  return { success: false, codigo, error: mensaje || codigo };
}

class MovimientosService {
  /**
   * Obtener movimientos de caja filtrados por tipo
   */
  async getMovements(type: MovementType): Promise<CashMovement[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('cash_movements')
      .select(`
        *,
        cash_session:cash_sessions(id, status, opened_at, branch_id)
      `)
      .eq('organization_id', organizationId)
      .eq('type', tipoCaja(type))
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Movimiento de CAJA por id (con su sesión). Solo caja: un id de banco no se
   * busca aquí nunca.
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
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /** Movimiento BANCARIO por id, de la organización. */
  async getBankTransactionById(id: number): Promise<BankTransaction | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Movimiento por UUID para la pantalla de detalle de `type` (ingreso o
   * egreso). Un egreso abierto en /ingresos/[uuid] responde «no encontrado»:
   * el filtro de tipo va en la consulta, igual que en el listado.
   */
  async getMovementByUuid(uuid: string, type: MovementType): Promise<UnifiedMovement | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data: cashData, error: cashError } = await supabase
      .from('cash_movements')
      .select('id, uuid, type, concept, amount, notes, created_at')
      .eq('uuid', uuid)
      .eq('organization_id', organizationId)
      .eq('type', tipoCaja(type))
      .maybeSingle();

    if (cashError) throw cashError;
    if (cashData) {
      return {
        id: cashData.id,
        uuid: cashData.uuid,
        source: 'cash',
        concept: cashData.concept,
        amount: Math.abs(Number(cashData.amount)),
        notes: cashData.notes,
        created_at: cashData.created_at,
      };
    }

    const { data: bankData, error: bankError } = await supabase
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
      .eq('transaction_type', tipoBanco(type))
      .maybeSingle();

    if (bankError) throw bankError;
    if (bankData) {
      const cuenta = bankData.bank_account as { name?: string; bank_name?: string } | null;
      return {
        id: bankData.id,
        uuid: bankData.uuid,
        source: 'bank',
        concept: bankData.description || 'Transacción bancaria',
        amount: Math.abs(Number(bankData.amount)),
        notes: bankData.reference,
        created_at: bankData.created_at,
        bank_account_name: cuenta?.name || cuenta?.bank_name,
      };
    }

    return null;
  }

  /**
   * Caja abierta donde registrar un movimiento de la sucursal `branchId`, con
   * la misma regla que el servidor usa para cobrar (`fn_caja_abierta_para`):
   * en modo 'user' la del cajero en esa sucursal; en modo 'branch' la de la
   * sucursal o, si no hay, la global. Nunca la última abierta de TODA la
   * organización.
   */
  async getOpenSessionIdForBranch(branchId: number | null): Promise<number | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase.rpc('fn_caja_abierta_para', {
      p_org: organizationId,
      p_branch: branchId,
      p_user: userId,
    });
    if (error) throw error;
    return data == null ? null : Number(data);
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

    if (error) throw error;
    return data || [];
  }

  /**
   * Crear movimiento de caja en la caja abierta de la sucursal elegida.
   */
  async createCashMovement(
    data: MovementFormData,
    userId: string
  ): Promise<ResultadoMovimiento> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, codigo: 'sin_organizacion', error: 'sin_organizacion' };
    }
    // `userId` queda por compatibilidad de la firma; el autor lo pone el servidor.
    void userId;

    try {
      const branchId = data.branch_id ?? getCurrentBranchId();
      const sessionId = await this.getOpenSessionIdForBranch(branchId);
      if (!sessionId) {
        return { success: false, codigo: 'sin_caja_abierta_sucursal', error: 'sin_caja_abierta_sucursal' };
      }

      const { data: result, error } = await supabase.rpc(
        RPC_MOVIMIENTO_CAJA,
        parametrosMovimiento(sessionId, {
          type: tipoCaja(data.type),
          amount: data.amount,
          concept: data.concept,
          notes: data.notes ?? null,
        }),
      );
      if (error) return fallo(error);

      const fila = (result ?? {}) as { id?: number; uuid?: string };
      return { success: true, id: Number(fila.id), uuid: fila.uuid };
    } catch (error) {
      return fallo(error);
    }
  }

  /**
   * Crear transacción bancaria. El saldo de la cuenta lo mueve el disparador
   * `trg_bank_tx_saldo` (regla única: 20260928160000); aquí no se toca.
   */
  async createBankTransaction(
    data: MovementFormData,
  ): Promise<ResultadoMovimiento> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, codigo: 'sin_organizacion', error: 'sin_organizacion' };
    }

    if (!data.bank_account_id) {
      return { success: false, codigo: 'cuenta_requerida', error: 'cuenta_requerida' };
    }

    const { data: result, error } = await supabase
      .from('bank_transactions')
      .insert({
        organization_id: organizationId,
        branch_id: data.branch_id ?? undefined,
        bank_account_id: data.bank_account_id,
        trans_date: new Date().toISOString(),
        description: data.concept,
        ...movimientoBancario(data.type, data.amount),
        reference: data.notes,
        status: 'unmatched',
      })
      .select('id, uuid')
      .single();

    if (error) return fallo(error);
    return { success: true, id: result.id, uuid: result.uuid };
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
      return { success: false, error: 'sin_organizacion' };
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
   * Anular un movimiento, cada fuente por su vía:
   *  - banco: `fn_movimiento_banco_anular` (movimiento contrario en la misma
   *    cuenta; no anula conciliados ni importados). Nunca toca la caja.
   *  - caja: movimiento inverso por `pos_caja_registrar_movimiento` en la
   *    sesión del ORIGINAL. Si esa sesión ya cerró, el reverso va a la caja
   *    abierta de la MISMA sucursal y la nota lo deja escrito. Idempotente:
   *    el uuid del reverso se deriva del uuid del original.
   */
  async cancelMovement(ref: MovementRef, reason?: string): Promise<ResultadoMovimiento> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { success: false, codigo: 'sin_organizacion', error: 'sin_organizacion' };
    }

    try {
      if (ref.source === 'bank') {
        const { data, error } = await supabase.rpc('fn_movimiento_banco_anular', {
          p_organization_id: organizationId,
          p_id: ref.id,
          p_motivo: reason ?? null,
        });
        if (error) return fallo(error);
        const fila = (data ?? {}) as { id?: number; uuid?: string };
        return { success: true, id: Number(fila.id), uuid: fila.uuid };
      }

      const original = await this.getMovementById(ref.id);
      if (!original) {
        return { success: false, codigo: 'movimiento_no_encontrado', error: 'movimiento_no_encontrado' };
      }

      const sesionOriginal = original.cash_session;
      const branchId = sesionOriginal?.branch_id ?? original.branch_id ?? null;
      let sessionId: number | null = sesionOriginal?.status === 'open' ? original.cash_session_id : null;
      if (!sessionId) sessionId = await this.getOpenSessionIdForBranch(branchId);
      if (!sessionId) {
        return { success: false, codigo: 'sin_caja_abierta_sucursal', error: 'sin_caja_abierta_sucursal' };
      }

      const motivo = reason?.trim() || `Anulación del movimiento #${original.id}`;
      const notas = sessionId === original.cash_session_id
        ? motivo
        : `${motivo} · Caja original #${original.cash_session_id} cerrada: reverso en la caja #${sessionId} de la misma sucursal`;

      const { data, error } = await supabase.rpc(
        RPC_MOVIMIENTO_CAJA,
        parametrosMovimiento(
          sessionId,
          {
            type: tipoDesdeCaja(original.type) === 'income' ? 'out' : 'in',
            concept: `ANULACIÓN: ${original.concept}`,
            amount: Math.abs(Number(original.amount)),
            notes: notas,
          },
          { uuid: await uuidDeterminista(`anulacion:${original.uuid}`) },
        ),
      );
      if (error) return fallo(error);
      const fila = (data ?? {}) as { id?: number; uuid?: string };
      return { success: true, id: Number(fila.id), uuid: fila.uuid };
    } catch (error) {
      return fallo(error);
    }
  }

  /**
   * Duplicar un movimiento conservando su SENTIDO (un ingreso da un ingreso)
   * y su fuente. Devuelve el uuid del nuevo para navegar a su detalle.
   */
  async duplicateMovement(ref: MovementRef, userId: string): Promise<ResultadoMovimiento> {
    try {
      if (ref.source === 'bank') {
        const original = await this.getBankTransactionById(ref.id);
        if (!original) {
          return { success: false, codigo: 'movimiento_no_encontrado', error: 'movimiento_no_encontrado' };
        }
        return this.createBankTransaction({
          type: tipoDesdeImporteBancario(original.amount),
          concept: `Copia de: ${original.description ?? ''}`.trim(),
          amount: Math.abs(Number(original.amount)),
          notes: original.reference,
          source: 'bank',
          bank_account_id: original.bank_account_id,
          branch_id: original.branch_id,
        });
      }

      const original = await this.getMovementById(ref.id);
      if (!original) {
        return { success: false, codigo: 'movimiento_no_encontrado', error: 'movimiento_no_encontrado' };
      }
      return this.createCashMovement(
        {
          type: tipoDesdeCaja(original.type),
          concept: `Copia de: ${original.concept}`,
          amount: Math.abs(Number(original.amount)),
          notes: original.notes,
          source: 'cash',
          branch_id: original.cash_session?.branch_id ?? original.branch_id ?? null,
        },
        userId,
      );
    } catch (error) {
      return fallo(error);
    }
  }

  /**
   * Obtener estadísticas (incluye cash_movements y bank_transactions)
   */
  async getStats(type: MovementType, branchId?: number | null): Promise<{
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

    let cashQuery = supabase
      .from('cash_movements')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('type', tipoCaja(type));
    if (branchId != null) cashQuery = cashQuery.eq('branch_id', branchId);
    const { data: cashData, error: cashError } = await cashQuery;
    if (cashError) throw cashError;

    let bankQuery = supabase
      .from('bank_transactions')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('transaction_type', tipoBanco(type));
    if (branchId != null) bankQuery = bankQuery.eq('branch_id', branchId);
    const { data: bankData, error: bankError } = await bankQuery;
    if (bankError) throw bankError;

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

    const { data, error } = await supabase
      .from('bank_transactions')
      .select(`
        *,
        bank_account:bank_accounts(id, name, bank_name)
      `)
      .eq('organization_id', organizationId)
      .eq('transaction_type', tipoBanco(type))
      .order('trans_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener todos los movimientos unificados (caja + banco). Un fallo de
   * cualquiera de las dos consultas se propaga: una lista a medias o vacía
   * parecería «no hay movimientos».
   */
  async getAllMovements(type: MovementType, branchId?: number | null): Promise<UnifiedMovement[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    let cashQuery = supabase
      .from('cash_movements')
      .select('id, uuid, concept, amount, notes, created_at')
      .eq('organization_id', organizationId)
      .eq('type', tipoCaja(type));
    if (branchId != null) cashQuery = cashQuery.eq('branch_id', branchId);
    const { data: cashData, error: cashError } = await cashQuery
      .order('created_at', { ascending: false });
    if (cashError) throw cashError;

    let bankQuery = supabase
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
      .eq('transaction_type', tipoBanco(type));
    if (branchId != null) bankQuery = bankQuery.eq('branch_id', branchId);
    const { data: bankData, error: bankError } = await bankQuery
      .order('created_at', { ascending: false });
    if (bankError) throw bankError;

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

    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return unified;
  }
}

export const movimientosService = new MovimientosService();
