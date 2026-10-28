import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { rangoDelMes } from '@/lib/services/fiscalCalendar';

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
    // El estado solo cambia por las RPC de cierre y reapertura. Un update
    // directo lo rechaza el disparador, y aquí ni siquiera se envía.
    const resto = { ...periodo };
    delete resto.status;
    delete resto.closed_by;
    delete resto.closed_at;
    const { data, error } = await supabase
      .from('fiscal_periods')
      .update({
        ...resto,
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

  static async cerrarPeriodo(id: string): Promise<FiscalPeriod> {
    const organizationId = this.getOrganizationId();
    if (!organizationId) throw new Error('No hay organización activa');
    const { error } = await supabase.rpc('fn_cierre_periodo', {
      p_organization_id: organizationId,
      p_period_id: id,
      p_notas: null,
    });
    if (error) {
      console.error('Error cerrando periodo:', error);
      throw error;
    }
    const periodo = await this.obtenerPeriodo(id);
    if (!periodo) throw new Error('No se encontró el período');
    return periodo;
  }

  static async reabrirPeriodo(id: string, motivo: string): Promise<FiscalPeriod> {
    const organizationId = this.getOrganizationId();
    if (!organizationId) throw new Error('No hay organización activa');
    const limpio = (motivo ?? '').trim();
    if (limpio.length < 5) throw new Error('motivo_obligatorio');
    const { error } = await supabase.rpc('fn_reabrir_periodo', {
      p_organization_id: organizationId,
      p_period_id: id,
      p_motivo: limpio,
    });
    if (error) {
      console.error('Error reabriendo periodo:', error);
      throw error;
    }
    const periodo = await this.obtenerPeriodo(id);
    if (!periodo) throw new Error('No se encontró el período');
    return periodo;
  }

  static async generarPeriodosAnuales(year: number): Promise<FiscalPeriod[]> {
    const organizationId = this.getOrganizationId();
    const periodos = [];

    // `date` puro: los limites del mes no dependen de la zona. Ver
    // `rangoDelMes` y la cabecera de `fiscalCalendar.ts` para por que no se
    // puede pasar por un `Date` local.
    for (let month = 1; month <= 12; month++) {
      const { start, end } = rangoDelMes(year, month);

      periodos.push({
        organization_id: organizationId,
        year,
        month,
        period_type: 'monthly',
        start_date: start,
        end_date: end,
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
