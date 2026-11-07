/**
 * Lecturas de «Salud contable». Todo es lectura de funciones que ya existen,
 * salvo `fn_salud_contable` (propuesta sin aplicar: `supabase/migrations/
 * 20261108070000_salud_contable.sql`). Mientras no exista, `cruce()` devuelve
 * `null` y la pantalla dice que esa revisión está pendiente de activar.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  balanceCuadra,
  cuentasAgrupadorasConMovimiento,
  esFuncionInexistente,
  leerCruceSalud,
  type CruceSalud,
  type CuentaAgrupadoraConMovimiento,
} from '@/lib/finanzas/contabilidad/saludLogica';
import type { CuentaInvalida } from '@/lib/finanzas/reglasContables';
import { ContabilidadService } from '../ContabilidadService';
import { ReglasContablesService } from '@/components/finanzas/reglas-contables/ReglasContablesService';
import { PendientesContablesService } from '../pendientes/PendientesContablesService';

export interface EstructuraSalud {
  agrupadoras: CuentaAgrupadoraConMovimiento[];
  reglas: CuentaInvalida[];
}

export class SaludContableService {
  /** Descuadres y huérfanos; `null` si la función aún no está en la base. */
  static async cruce(): Promise<CruceSalud | null> {
    const { data, error } = await supabase.rpc('fn_salud_contable', { p_organization_id: getOrganizationId() });
    if (error) {
      if (esFuncionInexistente(error)) return null;
      throw error;
    }
    return leerCruceSalud(data);
  }

  static async estructura(): Promise<EstructuraSalud> {
    const [plan, saldos, reglas] = await Promise.all([
      ContabilidadService.obtenerCuentasLigero(),
      ContabilidadService.obtenerSaldosPlan(),
      ReglasContablesService.obtenerDiagnostico(),
    ]);
    return { agrupadoras: cuentasAgrupadorasConMovimiento(plan, saldos), reglas };
  }

  /** Σ débitos = Σ créditos de todo lo publicado (`fn_saldos_cuentas` sin rango). */
  static async balance(): Promise<{ cuadra: boolean; diferencia: number }> {
    const { data, error } = await supabase.rpc('fn_saldos_cuentas', {
      p_organization_id: getOrganizationId(),
      p_desde: null,
      p_hasta: null,
    });
    if (error) throw error;
    return balanceCuadra((data ?? []) as { debito: number; credito: number }[]);
  }

  /** Número de pendientes de contabilizar (la bandeja ya existente). */
  static async pendientes(): Promise<number> {
    const r = await PendientesContablesService.listar({ limite: 1, desplazamiento: 0 });
    return r.pendientes;
  }
}
