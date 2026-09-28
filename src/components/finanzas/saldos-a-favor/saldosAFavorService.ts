import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  ContextoSaldoFavor,
  ErrorSaldoFavor,
  ResultadoAnularSaldo,
  ResultadoAplicarSaldo,
  ResultadoCrearSaldo,
  ResultadoDevolverSaldo,
  SaldoAFavorFila,
  FacturaAbiertaSaldo,
} from '@/lib/finanzas/saldosAFavor/contrato';

export type { ContextoSaldoFavor };
/** Fila del listado con el estado vivo (vencido) que resuelve el servidor. */
export type SaldoAFavor = SaldoAFavorFila;
/** Factura abierta del cliente (servidor: `GET /api/saldos-a-favor/contexto?cliente=`). */
export type FacturaPendiente = FacturaAbiertaSaldo;

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

export interface ClienteSimple {
  id: string;
  full_name: string;
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
  /**
   * Saldos a favor de la organización de la sesión (`GET /api/saldos-a-favor`):
   * permiso, acceso por sucursal y estado vivo (vencido) los resuelve el servidor.
   * Un error se lanza (`ErrorPeticionSaldoFavor`) para que la pantalla lo muestre.
   */
  async listar(branchId?: number | null): Promise<SaldoAFavor[]> {
    const q = branchId != null ? `?sucursal=${encodeURIComponent(String(branchId))}` : '';
    const r = await fetch(`/api/saldos-a-favor${q}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
    return (await leer<{ saldos: SaldoAFavor[] }>(r)).saldos;
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

  /**
   * Facturas de venta abiertas del cliente, leídas en el servidor con la misma
   * regla del pago único (emitidas o parciales, tipo factura, con saldo; sin
   * borradores, anuladas ni notas crédito).
   */
  async listarFacturasPendientes(customerId: string): Promise<FacturaPendiente[]> {
    const r = await fetch(`/api/saldos-a-favor/contexto?cliente=${encodeURIComponent(customerId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cabeceras(),
    });
    return (await leer<ContextoSaldoFavor>(r)).facturas;
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
   * Anula un anticipo que no se ha usado (`POST /api/saldos-a-favor/[id]/anular`).
   * Sin botón todavía: el rediseño de la pantalla decide dónde va.
   */
  async anular(creditId: string, motivo: string): Promise<ResultadoAnularSaldo> {
    return enviar<ResultadoAnularSaldo>(`/api/saldos-a-favor/${encodeURIComponent(creditId)}/anular`, { motivo });
  },

  /**
   * Devuelve en dinero todo o parte del saldo (`POST /api/saldos-a-favor/[id]/devolver`).
   * Sin botón todavía: el rediseño de la pantalla decide dónde va.
   */
  async devolver(
    creditId: string,
    input: { monto: number; metodo: string; motivo: string; cuentaBancaria?: number | null; referencia?: string; claveIdempotencia: string },
  ): Promise<ResultadoDevolverSaldo> {
    return enviar<ResultadoDevolverSaldo>(`/api/saldos-a-favor/${encodeURIComponent(creditId)}/devolver`, {
      monto: input.monto,
      metodo: input.metodo,
      motivo: input.motivo,
      cuenta_bancaria: input.cuentaBancaria ?? null,
      referencia: input.referencia?.trim() || null,
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
