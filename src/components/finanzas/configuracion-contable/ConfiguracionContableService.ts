import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import {
  CLAVES_CONTABLES,
  esClaveContable,
  type ClaveContable,
  type CuentaContable,
  type FilaConfiguracion,
} from '@/lib/finanzas/configuracionContable';

export interface FilaGuardada extends FilaConfiguracion {
  id: number;
}

export interface FalloContable {
  id: number;
  source: string | null;
  source_id: string | null;
  debit_account: string | null;
  credit_account: string | null;
  amount: number | null;
  reason: string | null;
  detail: string | null;
  created_at: string;
  branch_id: number | null;
}

export class ConfiguracionContableService {
  private static organizacionId(): number {
    const org = obtenerOrganizacionActiva();
    if (!org?.id) throw new Error('No hay una organización activa');
    return org.id;
  }

  static async listar(): Promise<FilaGuardada[]> {
    const organizationId = this.organizacionId();
    const { data, error } = await supabase
      .from('configuracion_contable')
      .select('id, clave, account_code, branch_id')
      .eq('organization_id', organizationId);

    if (error) throw error;

    return (data ?? []).flatMap((fila) => {
      if (!esClaveContable(fila.clave)) return [];
      return [{
        id: fila.id as number,
        clave: fila.clave,
        account_code: fila.account_code as string,
        branch_id: (fila.branch_id as number | null) ?? null,
      }];
    });
  }

  static async guardar(
    branchId: number | null,
    elecciones: Partial<Record<ClaveContable, string | null>>,
  ): Promise<void> {
    const organizationId = this.organizacionId();
    const quitar: ClaveContable[] = [];
    const poner: Array<{
      organization_id: number;
      branch_id: number | null;
      clave: ClaveContable;
      account_code: string;
    }> = [];

    for (const clave of CLAVES_CONTABLES) {
      const cuenta = (elecciones[clave] ?? '').trim();
      if (!cuenta) quitar.push(clave);
      else poner.push({ organization_id: organizationId, branch_id: branchId, clave, account_code: cuenta });
    }

    if (poner.length > 0) {
      const { error } = await supabase
        .from('configuracion_contable')
        .upsert(poner, { onConflict: 'organization_id,branch_id,clave' });
      if (error) throw error;
    }

    if (quitar.length > 0) {
      let consulta = supabase
        .from('configuracion_contable')
        .delete()
        .eq('organization_id', organizationId)
        .in('clave', quitar);
      consulta = branchId == null ? consulta.is('branch_id', null) : consulta.eq('branch_id', branchId);
      const { error } = await consulta;
      if (error) throw error;
    }
  }

  static async tipoNegocio(): Promise<number | null> {
    const organizationId = this.organizacionId();
    const { data, error } = await supabase
      .from('organizations')
      .select('type_id')
      .eq('id', organizationId)
      .maybeSingle();
    if (error) throw error;
    return (data?.type_id as number | null) ?? null;
  }

  static async cuentas(): Promise<CuentaContable[]> {
    const organizationId = this.organizacionId();
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, es_movimiento, is_active')
      .eq('organization_id', organizationId)
      .order('account_code');
    if (error) throw error;
    return (data ?? []) as CuentaContable[];
  }

  static async fallosPendientes(limite = 30): Promise<{ total: number; filas: FalloContable[] }> {
    const organizationId = this.organizacionId();
    const { data, error, count } = await supabase
      .from('journal_entry_failures')
      .select('id, source, source_id, debit_account, credit_account, amount, reason, detail, created_at, branch_id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return { total: count ?? data?.length ?? 0, filas: (data ?? []) as FalloContable[] };
  }

  /**
   * Asiento nuevo que pasa el IVA histórico de 2405 a 2408. No reescribe
   * líneas ya publicadas. La organización sale de la sesión.
   */
  static async reclasificarIvaGenerado(): Promise<{ repetida: boolean; journal_entry_id: number | null; monto: number }> {
    const organizationId = this.organizacionId();
    const { data, error } = await supabase.rpc('fn_reclasificar_iva_generado', { p_org: organizationId });
    if (error) throw error;
    const r = (data ?? {}) as { repetida?: boolean; journal_entry_id?: number | null; monto?: number | string };
    return {
      repetida: r.repetida === true,
      journal_entry_id: r.journal_entry_id ?? null,
      monto: Number(r.monto ?? 0),
    };
  }
}
