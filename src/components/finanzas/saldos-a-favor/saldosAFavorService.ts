import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  ContextoSaldoFavor,
  ErrorSaldoFavor,
  ResultadoAplicarSaldo,
  ResultadoCrearSaldo,
} from '@/lib/finanzas/saldosAFavor/contrato';

export type { ContextoSaldoFavor };

/**
 * Error de una petición a `/api/saldos-a-favor/**` con su `codigo` estable
 * (`saldosAFavor.errores.<codigo>`), para que la pantalla lo muestre.
 */
export class ErrorPeticionSaldoFavor extends Error {
  constructor(
    public readonly codigo: ErrorSaldoFavor | string,
    public readonly estado: number,
  ) {
    super(codigo);
  }
}

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function leer<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string };
    const codigo = c.codigo ?? (c.code === 'FOREIGN_ORGANIZATION' ? 'organizacion_no_permitida' : 'error_desconocido');
    throw new ErrorPeticionSaldoFavor(codigo, r.status);
  }
  return cuerpo as T;
}

async function enviar<T>(url: string, cuerpo: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(cuerpo),
  });
  return (await leer<{ resultado: T }>(r)).resultado;
}

/** Clave de idempotencia de un intento (una por apertura del diálogo). */
export function nuevaClaveIdempotencia(prefijo: string): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefijo}:${aleatorio}`;
}

export interface SaldoAFavor {
  id: string;
  customer_id: string;
  customer_name: string | null;
  amount: number;
  balance: number;
  used: number;
  status: string;
  notes: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface ClienteSimple {
  id: string;
  full_name: string;
}

export interface FacturaPendiente {
  id: string;
  number: string;
  total: number;
  balance: number;
  issue_date: string;
}

export interface CrearSaldoInput {
  customerId: string;
  amount: number;
  /** `payment_methods.code` de la organización (nunca una cuenta PUC). */
  metodo: string;
  cuentaBancaria?: number | null;
  referencia?: string;
  notes?: string;
  /** Día calendario `YYYY-MM-DD` (vence al final de ese día en la zona de la sucursal). */
  expiry?: string | null;
  branchId?: number | null;
  /** Una por apertura del diálogo (`nuevaClaveIdempotencia('anticipo')`). */
  claveIdempotencia: string;
}

export interface AplicarSaldoInput {
  creditId: string;
  invoiceId: string;
  amount: number;
  /** Una por apertura del diálogo (`nuevaClaveIdempotencia('aplicar')`). */
  claveIdempotencia: string;
}

export const saldosAFavorService = {
  /** Lista los saldos a favor de la organización. */
  async listar(organizationId: number, branchId?: number | null): Promise<SaldoAFavor[]> {
    if (branchId != null) {
      // Filtrar por sucursal con query directa (el RPC no soporta branch_id)
      const { data, error } = await supabase
        .from('credit_notes')
        .select(`
          id,
          customer_id,
          amount,
          balance,
          status,
          notes,
          expiry_date,
          created_at,
          customers (full_name)
        `)
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((cn: any) => ({
        id: cn.id,
        customer_id: cn.customer_id,
        customer_name: cn.customers?.full_name ?? null,
        amount: Number(cn.amount),
        balance: Number(cn.balance),
        used: Number(cn.amount) - Number(cn.balance),
        status: cn.status,
        notes: cn.notes,
        expiry_date: cn.expiry_date,
        created_at: cn.created_at,
      })) as SaldoAFavor[];
    }
    const { data, error } = await supabase.rpc('fn_list_customer_credits', {
      p_org: organizationId,
    });
    if (error) throw error;
    return (data || []) as SaldoAFavor[];
  },

  /** Lista los clientes de la organización para el selector. */
  async listarClientes(organizationId: number): Promise<ClienteSimple[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return (data || []) as ClienteSimple[];
  },

  /** Facturas de venta con saldo pendiente para un cliente. */
  async listarFacturasPendientes(
    organizationId: number,
    customerId: string
  ): Promise<FacturaPendiente[]> {
    const { data, error } = await supabase
      .from('invoice_sales')
      .select('id, number, total, balance, issue_date')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .is('document_type', null)
      .gt('balance', 0)
      .in('status', ['issued', 'partial', 'overdue'])
      .order('issue_date', { ascending: true });
    if (error) throw error;
    return (data || []) as FacturaPendiente[];
  },

  /**
   * Métodos de pago de la organización, cuentas bancarias y caja abierta de la
   * sucursal (`GET /api/saldos-a-favor/contexto`).
   */
  async contexto(branchId: number | null): Promise<ContextoSaldoFavor> {
    const q = branchId != null ? `?sucursal=${encodeURIComponent(String(branchId))}` : '';
    const r = await fetch(`/api/saldos-a-favor/contexto${q}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
    return leer<ContextoSaldoFavor>(r);
  },

  /**
   * Registra un anticipo: el dinero entra como un pago real (recibo, payments y
   * caja) y queda como saldo a favor (`POST /api/saldos-a-favor` → `fn_saldo_favor_crear`).
   */
  async crear(input: CrearSaldoInput): Promise<ResultadoCrearSaldo> {
    const branchId = input.branchId ?? getCurrentBranchId();
    if (!branchId) throw new ErrorPeticionSaldoFavor('sucursal_invalida', 422);
    return enviar<ResultadoCrearSaldo>('/api/saldos-a-favor', {
      cliente_id: input.customerId,
      sucursal_id: branchId,
      monto: input.amount,
      metodo: input.metodo,
      cuenta_bancaria: input.cuentaBancaria ?? null,
      referencia: input.referencia?.trim() || null,
      vence: input.expiry || null,
      notas: input.notes?.trim() || null,
      clave_idempotencia: input.claveIdempotencia,
    });
  },

  /**
   * Aplica un saldo a favor a una factura en el servidor
   * (`POST /api/saldos-a-favor/[id]/aplicar` → `fn_apply_customer_credit`).
   */
  async aplicar(input: AplicarSaldoInput): Promise<ResultadoAplicarSaldo> {
    return enviar<ResultadoAplicarSaldo>(`/api/saldos-a-favor/${encodeURIComponent(input.creditId)}/aplicar`, {
      factura_id: input.invoiceId,
      monto: input.amount,
      clave_idempotencia: input.claveIdempotencia,
    });
  },
};
