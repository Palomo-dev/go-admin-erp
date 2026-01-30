import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface FiscalPeriod {
  id: string;
  organization_id: number;
  year: number;
  month: number | null;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status: 'open' | 'closing' | 'closed';
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class PeriodosContablesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async obtenerPeriodos(): Promise<FiscalPeriod[]> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('organization_id', organizationId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      console.error('Error obteniendo periodos:', error);
      throw error;
    }

    return data || [];
  }

  static async obtenerPeriodo(id: string): Promise<FiscalPeriod | null> {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error obteniendo periodo:', error);
      return null;
    }

    return data;
  }

  static async crearPeriodo(periodo: Partial<FiscalPeriod>): Promise<FiscalPeriod> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('fiscal_periods')
      .insert({
        ...periodo,
        organization_id: organizationId,
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando periodo:', error);
      throw error;
    }

    return data;
  }

  static async actualizarPeriodo(id: string, periodo: Partial<FiscalPeriod>): Promise<FiscalPeriod> {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({
        ...periodo,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando periodo:', error);
      throw error;
    }

    return data;
  }

  static async cerrarPeriodo(id: string, userId: string): Promise<FiscalPeriod> {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({
        status: 'closed',
        closed_by: userId,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error cerrando periodo:', error);
      throw error;
    }

    return data;
  }

  static async reabrirPeriodo(id: string): Promise<FiscalPeriod> {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({
        status: 'open',
        closed_by: null,
        closed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error reabriendo periodo:', error);
      throw error;
    }

    return data;
  }

  static async generarPeriodosAnuales(year: number): Promise<FiscalPeriod[]> {
    const organizationId = this.getOrganizationId();
    const periodos = [];

    for (let month = 1; month <= 12; month++) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      periodos.push({
        organization_id: organizationId,
        year,
        month,
        period_type: 'monthly',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'open'
      });
    }

    const { data, error } = await supabase
      .from('fiscal_periods')
      .insert(periodos)
      .select();

    if (error) {
      console.error('Error generando periodos:', error);
      throw error;
    }

    return data || [];
  }

  static async eliminarPeriodo(id: string): Promise<void> {
    const { error } = await supabase
      .from('fiscal_periods')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando periodo:', error);
      throw error;
    }
  }
}
