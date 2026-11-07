import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { rangoDelMes } from '@/lib/services/fiscalCalendar';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { getDateRange } from '@/lib/utils/timezone';
import { planCierreEjercicio } from '@/lib/finanzas/contabilidad/cierreEjercicio';

export interface FiscalPeriod {
  id: string;
  organization_id: number;
  year: number;
  month: number | null;
  // Valores del CHECK de la base (fiscal_periods_period_type_check).
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  // Valores del CHECK de la base: cerrar un periodo es bloquearlo.
  status: 'open' | 'closing' | 'closed';
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  /** Reapertura (20261027212000): quién, cuándo y por qué. */
  reopened_by?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsecutivoComprobante {
  comprobante_tipo: string;
  comprobante_prefijo: string;
  cantidad: number;
  desde: number;
  hasta: number;
  saltos: number[];
}

/** El motivo de reapertura es obligatorio (mínimo 5 caracteres). Devuelve el texto limpio o null. */
export function motivoReaperturaValido(motivo: string | null | undefined): string | null {
  const limpio = (motivo ?? '').trim();
  return limpio.length >= 5 ? limpio : null;
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
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');
    const { error } = await supabase.rpc('fn_cierre_periodo', {
      p_organization_id: orgId,
      p_period_id: id,
      p_notas: notes ?? null,
    });
    if (error) throw error;
  }

  /** Reabrir exige motivo; la base guarda quién, cuándo y el motivo. */
  static async reabrirPeriodo(id: string, motivo: string): Promise<void> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');
    const limpio = motivoReaperturaValido(motivo);
    if (!limpio) throw new Error('motivo_obligatorio');
    const { error } = await supabase.rpc('fn_reabrir_periodo', {
      p_organization_id: orgId,
      p_period_id: id,
      p_motivo: limpio,
    });
    if (error) throw error;
  }

  /** Borradores y asientos pendientes con fecha en el periodo (bloquean el cierre). */
  static async pendientesDelPeriodo(id: string): Promise<{ borradores: number; pendientes: number } | null> {
    const orgId = this.getOrganizationId();
    if (!orgId) return null;
    const { data, error } = await supabase.rpc('fn_periodo_pendientes', { p_organization_id: orgId, p_period_id: id });
    if (error || !data) return null;
    const fila = data as { borradores?: number; pendientes?: number };
    return { borradores: Number(fila.borradores) || 0, pendientes: Number(fila.pendientes) || 0 };
  }

  /** Consecutivo por tipo de comprobante del periodo, con los números que faltan. */
  static async consecutivosDelPeriodo(id: string): Promise<ConsecutivoComprobante[]> {
    const orgId = this.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase.rpc('fn_consecutivos_periodo', { p_organization_id: orgId, p_period_id: id });
    if (error || !Array.isArray(data)) return [];
    return (data as ConsecutivoComprobante[]).map((fila) => ({
      ...fila,
      saltos: Array.isArray(fila.saltos) ? fila.saltos : [],
    }));
  }

  /**
   * Cancela las cuentas de resultado del año contra 3605 y, si hay pérdida,
   * pasa ese saldo a 3610. Después cierra los periodos de ese año.
   */
  static async cerrarEjercicio(anio: number): Promise<{ asientos: number; resultado: number; cuenta_resultado: string }> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');
    const { data, error } = await supabase.rpc('fn_cierre_ejercicio', {
      p_organization_id: orgId,
      p_anio: anio,
    });
    if (error) throw error;
    const fila = (data ?? {}) as { asientos?: number; resultado?: number; cuenta_resultado?: string };
    return {
      asientos: Number(fila.asientos) || 0,
      resultado: Number(fila.resultado) || 0,
      cuenta_resultado: fila.cuenta_resultado || '3605',
    };
  }

  static async generarPeriodosMensuales(year: number): Promise<void> {
    const orgId = this.getOrganizationId();
    if (!orgId) throw new Error('No hay organización activa');

    // `fiscal_periods.start_date`/`.end_date` son `date` (verificado en
    // `information_schema.columns`). Los limites de un mes son los mismos en
    // cualquier zona: se construyen con aritmetica de dia calendario. Antes
    // salian de `new Date(year, i, 1).toISOString()`, medianoche LOCAL leida
    // en UTC, y en cualquier zona con offset positivo (Madrid) enero empezaba
    // el 31 de diciembre.
    const meses = Array.from({ length: 12 }, (_, i) => {
      const { start, end } = rangoDelMes(year, i + 1);
      return {
        organization_id: orgId,
        year,
        month: i + 1,
        period_type: 'monthly' as const,
        start_date: start,
        end_date: end,
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
        period_type: 'yearly',
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
        status: 'open',
      });

    if (error) throw error;
  }

  /**
   * Asientos de cada mes del año (sin contar contra-asientos), para la
   * rejilla. `entry_date` es timestamptz: cada mes se convierte a instantes con
   * la zona de la organización. Doce conteos sin traer filas.
   */
  static async asientosPorMes(year: number): Promise<Map<number, number>> {
    const orgId = this.getOrganizationId();
    const conteos = new Map<number, number>();
    if (!orgId) return conteos;
    const timezone = await resolveTimezone(orgId);
    const resultados = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const { start: desde, end: hasta } = rangoDelMes(year, i + 1);
        const { start, end } = getDateRange(desde, hasta, timezone);
        const { count, error } = await supabase
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('entry_date', start)
          .lte('entry_date', end)
          .or('source.is.null,source.neq.reversal');
        if (error) throw error;
        return [i + 1, count ?? 0] as const;
      }),
    );
    for (const [mes, n] of resultados) conteos.set(mes, n);
    return conteos;
  }

  /** Σ débitos y Σ créditos publicados del periodo (`fn_saldos_cuentas`). */
  static async cuadreDelPeriodo(periodo: Pick<FiscalPeriod, 'start_date' | 'end_date'>): Promise<{ debitos: number; creditos: number } | null> {
    const orgId = this.getOrganizationId();
    if (!orgId) return null;
    const timezone = await resolveTimezone(orgId);
    const { start, end } = getDateRange(periodo.start_date, periodo.end_date, timezone);
    const { data, error } = await supabase.rpc('fn_saldos_cuentas', { p_organization_id: orgId, p_desde: start, p_hasta: end });
    if (error || !Array.isArray(data)) return null;
    let debitos = 0;
    let creditos = 0;
    for (const fila of data as { debito: number | string | null; credito: number | string | null }[]) {
      debitos += Number(fila.debito) || 0;
      creditos += Number(fila.credito) || 0;
    }
    return { debitos: Math.round(debitos * 100) / 100, creditos: Math.round(creditos * 100) / 100 };
  }

  /** Nombre visible de quien cerró o reabrió (la RLS de `profiles` limita a miembros). */
  static async nombresUsuarios(ids: string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter(Boolean))];
    const nombres = new Map<string, string>();
    if (unicos.length === 0) return nombres;
    const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', unicos);
    if (error || !data) return nombres;
    for (const p of data as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
      const nombre = [p.first_name, p.last_name].filter((v) => v && v.trim()).join(' ').trim();
      nombres.set(p.id, nombre || p.email || '');
    }
    return nombres;
  }

  /** Crea el periodo mensual de un mes que falta (lo que hacía «Nuevo periodo» en la pantalla duplicada). */
  static async crearMes(year: number, month: number): Promise<FiscalPeriod> {
    const { start, end } = rangoDelMes(year, month);
    return this.crearPeriodo({ year, month, period_type: 'monthly', start_date: start, end_date: end });
  }

  /**
   * Vista previa del cierre de ejercicio: el mismo plan que aplica
   * `fn_cierre_ejercicio` (`planCierreEjercicio`) sobre los saldos del año. Solo
   * lee; la cifra definitiva la calcula la base al cerrar.
   */
  static async resultadoDelAnio(anio: number): Promise<{ resultado: number; cuentaResultado: string } | null> {
    const orgId = this.getOrganizationId();
    if (!orgId) return null;
    const timezone = await resolveTimezone(orgId);
    const { start, end } = getDateRange(`${anio}-01-01`, `${anio}-12-31`, timezone);
    const { data, error } = await supabase.rpc('fn_saldos_cuentas', { p_organization_id: orgId, p_desde: start, p_hasta: end });
    if (error || !Array.isArray(data)) return null;
    const saldos = (data as { account_code: string; debito: number | string | null; credito: number | string | null }[]).map((f) => ({
      codigo: f.account_code,
      debito: Number(f.debito) || 0,
      credito: Number(f.credito) || 0,
    }));
    const plan = planCierreEjercicio(saldos, anio);
    return { resultado: plan.resultado, cuentaResultado: plan.cuentaResultado };
  }
}
