import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  errorDeRegla,
  type CuentaInvalida,
  type ErrorRegla,
} from '@/lib/finanzas/reglasContables';

export interface AccountingRule {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  source_type: string;
  event_type: string;
  debit_account_code: string;
  credit_account_code: string;
  tax_account_code: string | null;
  discount_account_code: string | null;
  use_tax_from_document: boolean;
  is_active: boolean;
  priority: number;
  conditions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ChartAccount {
  account_code: string;
  organization_id: number;
  name: string;
  type: string;
  parent_code: string | null;
  is_active: boolean;
  description: string | null;
  es_movimiento?: boolean | null;
}

export type DatosRegla = Partial<Omit<AccountingRule, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;

export { ORIGENES_REGLA as SOURCE_TYPES, EVENTOS_REGLA as EVENT_TYPES } from '@/lib/finanzas/configuracionContable';

/** Lo que devuelve el servidor al rechazar una escritura. */
export class ErrorReglaContable extends Error {
  readonly fallo: ErrorRegla;

  constructor(fallo: ErrorRegla) {
    super(fallo.codigo);
    this.name = 'ErrorReglaContable';
    this.fallo = fallo;
  }
}

/**
 * Las lecturas van con el cliente del navegador y RLS. Las escrituras van por
 * `/api/finanzas/reglas-contables`: ahí la organización sale de la sesión, el
 * permiso se resuelve en el servidor y siempre se filtra por empresa.
 */
async function escribir<T>(ruta: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: DatosRegla): Promise<T> {
  const org = getOrganizationId();
  const respuesta = await fetch(`/api/finanzas/reglas-contables${ruta}`, {
    method: metodo,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = (await respuesta.json().catch(() => null)) as (T & Partial<ErrorRegla>) | null;
  if (!respuesta.ok) {
    throw new ErrorReglaContable({
      codigo: datos?.codigo ?? 'desconocido',
      lado: datos?.lado ?? null,
      cuenta: datos?.cuenta ?? null,
    });
  }
  return datos as T;
}

export class ReglasContablesService {
  static async obtenerReglas(): Promise<AccountingRule[]> {
    const { data, error } = await supabase
      .from('accounting_rules')
      .select('*')
      .eq('organization_id', getOrganizationId())
      .order('source_type')
      .order('priority', { ascending: true });

    if (error) throw new ErrorReglaContable(errorDeRegla(error));
    return data || [];
  }

  static async obtenerDiagnostico(): Promise<CuentaInvalida[]> {
    const { data, error } = await supabase.rpc('fn_reglas_contables_diagnostico', {
      p_organization_id: getOrganizationId(),
    });
    if (error) throw new ErrorReglaContable(errorDeRegla(error));
    return (data ?? []) as CuentaInvalida[];
  }

  static crearRegla(regla: DatosRegla): Promise<AccountingRule> {
    return escribir<AccountingRule>('', 'POST', regla);
  }

  static actualizarRegla(id: string, regla: DatosRegla): Promise<AccountingRule> {
    return escribir<AccountingRule>(`/${id}`, 'PATCH', regla);
  }

  static async eliminarRegla(id: string): Promise<void> {
    await escribir<{ ok: true }>(`/${id}`, 'DELETE');
  }

  static async toggleActivo(id: string, isActive: boolean): Promise<void> {
    await escribir<AccountingRule>(`/${id}`, 'PATCH', { is_active: isActive });
  }

  static duplicarRegla(regla: AccountingRule, sufijo: string): Promise<AccountingRule> {
    return this.crearRegla({
      name: `${regla.name} ${sufijo}`,
      description: regla.description,
      source_type: regla.source_type,
      event_type: regla.event_type,
      debit_account_code: regla.debit_account_code,
      credit_account_code: regla.credit_account_code,
      tax_account_code: regla.tax_account_code,
      discount_account_code: regla.discount_account_code,
      use_tax_from_document: regla.use_tax_from_document,
      priority: regla.priority,
      conditions: regla.conditions,
    });
  }

  static async obtenerCuentasContables(): Promise<ChartAccount[]> {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('organization_id', getOrganizationId())
      .eq('is_active', true)
      .order('account_code');

    if (error) throw new ErrorReglaContable(errorDeRegla(error));
    return data || [];
  }
}
