import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface JournalEntry {
  id: number;
  organization_id: number;
  branch_id: number;
  entry_date: string;
  memo: string | null;
  posted: boolean;
  source: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: number;
  journal_entry_id: number;
  account_code: string;
  description: string | null;
  debit: number;
  credit: number;
  created_at: string;
  updated_at: string;
  account?: ChartAccount;
}

export interface ChartAccount {
  account_code: string;
  organization_id: number;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parent_code: string | null;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContabilidadResumen {
  totalAsientos: number;
  asientosPosted: number;
  asientosPendientes: number;
  totalCuentas: number;
  periodosAbiertos: number;
}

export class ContabilidadService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  private static getBranchId(): number {
    return getCurrentBranchId() || 0;
  }

  static async obtenerResumen(): Promise<ContabilidadResumen> {
    const organizationId = this.getOrganizationId();

    const [asientosRes, cuentasRes, periodosRes] = await Promise.all([
      supabase
        .from('journal_entries')
        .select('id, posted', { count: 'exact' })
        .eq('organization_id', organizationId),
      supabase
        .from('chart_of_accounts')
        .select('account_code', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase
        .from('fiscal_periods')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('status', 'open')
    ]);

    const asientos = asientosRes.data || [];
    return {
      totalAsientos: asientosRes.count || 0,
      asientosPosted: asientos.filter(a => a.posted).length,
      asientosPendientes: asientos.filter(a => !a.posted).length,
      totalCuentas: cuentasRes.count || 0,
      periodosAbiertos: periodosRes.count || 0
    };
  }

  // Plan de Cuentas
  static async obtenerPlanCuentas(): Promise<ChartAccount[]> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('account_code');

    if (error) {
      console.error('Error obteniendo plan de cuentas:', error);
      throw error;
    }

    return data || [];
  }

  static async crearCuenta(cuenta: Partial<ChartAccount>): Promise<ChartAccount> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        ...cuenta,
        organization_id: organizationId,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando cuenta:', error);
      throw error;
    }

    return data;
  }

  static async actualizarCuenta(accountCode: string, cuenta: Partial<ChartAccount>): Promise<ChartAccount> {
    const organizationId = this.getOrganizationId();

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .update({
        ...cuenta,
        updated_at: new Date().toISOString()
      })
      .eq('account_code', accountCode)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando cuenta:', error);
      throw error;
    }

    return data;
  }

  static async eliminarCuenta(accountCode: string): Promise<void> {
    const organizationId = this.getOrganizationId();

    const { error } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('account_code', accountCode)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error eliminando cuenta:', error);
      throw error;
    }
  }

  // Asientos Contables
  static async obtenerAsientos(filtros?: {
    fechaInicio?: string;
    fechaFin?: string;
    posted?: boolean;
    source?: string;
  }): Promise<JournalEntry[]> {
    const organizationId = this.getOrganizationId();

    let query = supabase
      .from('journal_entries')
      .select('*')
      .eq('organization_id', organizationId)
      .order('entry_date', { ascending: false });

    if (filtros?.fechaInicio) {
      query = query.gte('entry_date', filtros.fechaInicio);
    }
    if (filtros?.fechaFin) {
      query = query.lte('entry_date', filtros.fechaFin);
    }
    if (filtros?.posted !== undefined) {
      query = query.eq('posted', filtros.posted);
    }
    if (filtros?.source) {
      query = query.eq('source', filtros.source);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo asientos:', error);
      throw error;
    }

    return data || [];
  }

  static async obtenerAsiento(id: number): Promise<JournalEntry | null> {
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (entryError) {
      console.error('Error obteniendo asiento:', entryError);
      return null;
    }

    const { data: lines, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        *,
        account:chart_of_accounts (
          account_code,
          name,
          type
        )
      `)
      .eq('journal_entry_id', id)
      .order('id');

    if (linesError) {
      console.error('Error obteniendo líneas:', linesError);
    }

    return {
      ...entry,
      lines: lines || []
    };
  }

  static async crearAsiento(asiento: {
    entry_date: string;
    memo?: string;
    source?: string;
    source_id?: string;
    lines: { account_code: string; description?: string; debit: number; credit: number }[];
  }): Promise<JournalEntry> {
    const organizationId = this.getOrganizationId();
    const branchId = this.getBranchId();

    // Crear entrada
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        entry_date: asiento.entry_date,
        memo: asiento.memo,
        source: asiento.source,
        source_id: asiento.source_id,
        posted: false
      })
      .select()
      .single();

    if (entryError) {
      console.error('Error creando asiento:', entryError);
      throw entryError;
    }

    // Crear líneas
    const lines = asiento.lines.map(line => ({
      journal_entry_id: entry.id,
      account_code: line.account_code,
      description: line.description,
      debit: line.debit || 0,
      credit: line.credit || 0
    }));

    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(lines);

    if (linesError) {
      console.error('Error creando líneas:', linesError);
      throw linesError;
    }

    return entry;
  }

  static async publicarAsiento(id: number): Promise<void> {
    const { error } = await supabase
      .from('journal_entries')
      .update({ posted: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error publicando asiento:', error);
      throw error;
    }
  }

  static async eliminarAsiento(id: number): Promise<void> {
    // Primero eliminar líneas
    await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
    
    // Luego eliminar entrada
    const { error } = await supabase.from('journal_entries').delete().eq('id', id);

    if (error) {
      console.error('Error eliminando asiento:', error);
      throw error;
    }
  }

  static async duplicarAsiento(id: number): Promise<JournalEntry> {
    const original = await this.obtenerAsiento(id);
    if (!original || !original.lines) throw new Error('Asiento no encontrado');

    return this.crearAsiento({
      entry_date: new Date().toISOString(),
      memo: `${original.memo || ''} (copia)`,
      lines: original.lines.map(l => ({
        account_code: l.account_code,
        description: l.description || undefined,
        debit: l.debit,
        credit: l.credit
      }))
    });
  }
}
