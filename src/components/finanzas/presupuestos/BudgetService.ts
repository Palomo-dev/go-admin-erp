import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import type { FilaGrilla } from '@/lib/finanzas/presupuestos/presupuestoLogica';

/**
 * Presupuestos. La lectura va con la sesión del navegador (RLS por
 * pertenencia); toda escritura pasa por `/api/finanzas/presupuestos`, que toma
 * la organización de la sesión y exige el permiso en el servidor.
 *
 * `upsertLine` y `deleteLine` (escritura directa desde el navegador, sin
 * permiso y con filas repetidas porque `budget_lines` no tiene clave única) se
 * sustituyeron por `guardarLineas`, que guarda la grilla completa en el servidor.
 */
export interface Budget {
  id: string;
  organization_id: number;
  name: string;
  fiscal_year: number;
  status: string;
  total_amount: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  budget_id: string;
  organization_id: number;
  account_code: string;
  period: number;
  planned_amount: number;
  actual_amount: number;
  variance: number;
  cost_center_id: string | null;
}

export interface NuevoPresupuesto {
  name: string;
  fiscal_year: number;
  origen: 'vacio' | 'copia';
  copiar_de?: string | null;
}

/** Error de una ruta de presupuestos con su `codigo` (`sin_permiso`, `nombre_repetido`, `no_editable`…). */
export class ErrorPresupuesto extends Error {
  constructor(
    public codigo: string,
    public estado: number,
    /** Con `cuenta_invalida`: las cuentas que no son de movimiento. */
    public cuentas?: string[],
  ) {
    super(codigo);
  }
}

function organizacionId(): number {
  return obtenerOrganizacionActiva()?.id || 0;
}

async function pedir<T>(ruta: string, init: RequestInit): Promise<T> {
  const org = organizacionId();
  const r = await fetch(ruta, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
  });
  const cuerpo = (await r.json().catch(() => ({}))) as { codigo?: string; cuentas?: unknown };
  if (!r.ok) {
    const cuentas = Array.isArray(cuerpo.cuentas) ? cuerpo.cuentas.filter((c): c is string => typeof c === 'string') : undefined;
    throw new ErrorPresupuesto(cuerpo.codigo ?? 'error', r.status, cuentas);
  }
  return cuerpo as T;
}

export class BudgetService {
  static async getAll(): Promise<Budget[]> {
    const orgId = organizacionId();
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('organization_id', orgId)
      .order('fiscal_year', { ascending: false })
      .order('name');
    if (error) throw error;
    return data || [];
  }

  static async getById(id: string): Promise<Budget | null> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('organization_id', organizacionId())
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async getLines(budgetId: string): Promise<BudgetLine[]> {
    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('organization_id', organizacionId())
      .eq('budget_id', budgetId)
      .order('account_code')
      .order('period');
    if (error) throw error;
    return data || [];
  }

  /** Vacío o copia de otro presupuesto de la organización. Permiso `finance.create`. */
  static create(input: NuevoPresupuesto): Promise<Budget> {
    return pedir<Budget>('/api/finanzas/presupuestos', { method: 'POST', body: JSON.stringify(input) });
  }

  /** Borrador: `finance.create`; aprobado o cerrado: `finance.approve`. */
  static delete(id: string): Promise<{ id: string }> {
    return pedir(`/api/finanzas/presupuestos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  static approve(id: string): Promise<{ id: string; status: string }> {
    return pedir(`/api/finanzas/presupuestos/${encodeURIComponent(id)}/aprobar`, { method: 'POST' });
  }

  /** Guarda la grilla completa de un borrador. Permiso `finance.create`. */
  static guardarLineas(id: string, filas: readonly FilaGrilla[]): Promise<{ id: string; total: number }> {
    return pedir(`/api/finanzas/presupuestos/${encodeURIComponent(id)}/lineas`, {
      method: 'PUT',
      body: JSON.stringify({ filas }),
    });
  }
}
