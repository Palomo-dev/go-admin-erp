import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface FiscalPeriod {
  id: string;
  organization_id: number;
  year: number;
  month: number | null;
  period_type: 'monthly' | 'quarterly' | 'annual';
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class PeriodosFiscalesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async obtenerPeriodos(): Promise<FiscalPeriod[]> {
    const orgId = this.getOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('organization_id', orgId)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async crearPeriodo(periodo: Partial<FiscalPeriod>): Promise<FiscalPeriod> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');

    const { data, error } = await supabase
      .from('fiscal_periods')
      .insert({
        organization_id: orgId,
        year: periodo.year,
        month: periodo.month || null,
        period_type: periodo.period_type || 'monthly',
        start_date: periodo.start_date,
        end_date: periodo.end_date,
        status: 'open',
        notes: periodo.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async cerrarPeriodo(id: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('fiscal_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  static async reabrirPeriodo(id: string): Promise<void> {
    const { error } = await supabase
      .from('fiscal_periods')
      .update({
        status: 'open',
        closed_at: null,
        closed_by: null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  static async bloquearPeriodo(id: string): Promise<void> {
    const { error } = await supabase
      .from('fiscal_periods')
      .update({ status: 'locked' })
      .eq('id', id);

    if (error) throw error;
  }

  static async generarPeriodosMensuales(year: number): Promise<void> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');

    const meses = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0);
      return {
        organization_id: orgId,
        year,
        month: i + 1,
        period_type: 'monthly' as const,
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
        status: 'open' as const,
      };
    });

    const { error } = await supabase
      .from('fiscal_periods')
      .insert(meses);

    if (error) throw error;
  }

  static async generarPeriodoAnual(year: number): Promise<void> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');

    const { error } = await supabase
      .from('fiscal_periods')
      .insert({
        organization_id: orgId,
        year,
        month: null,
        period_type: 'annual',
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
        status: 'open',
      });

    if (error) throw error;
  }
}
