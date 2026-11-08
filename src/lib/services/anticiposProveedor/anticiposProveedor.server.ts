/**
 * Anticipos a proveedores — servicio de servidor. Solo llama a las RPC y lee lo
 * que la pantalla necesita con el cliente de la SESIÓN (RLS por pertenencia);
 * nunca escribe tablas ni saldos.
 *
 * Mientras la migración 20261108170000 (correcciones del Contador, rondas 1 y 2:
 * naturaleza, retenciones por composición y calidades verificadas, cuenta 133005xx,
 * anular por error, vínculo con la factura, devolución identificada, pendientes)
 * no esté aplicada, las lecturas devuelven `pendiente: true` y las escrituras
 * `pendiente_de_activar` (501): la pantalla lo dice, nunca muestra cero.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  aConciliacion,
  aEstadoCuentaAnticipo,
  aEvaluacionRetenciones,
  aPendienteAnticipo,
  codigoErrorAnticipo,
  esPendienteDeActivar,
  estadoAnticipo,
  estadoHttpErrorAnticipo,
  type ErrorAnticipoProveedor,
  type EvaluacionRetenciones,
  type FilaAnticipoProveedor,
  type PendienteAnticipo,
  type RespuestaConciliacion,
  type RetencionDelAnticipo,
  type ResultadoAplicarAnticipo,
  type ResultadoDevolverAnticipo,
  type SolicitudEquivalenciaCuenta,
  type SolicitudExcesoRetencion,
  type SolicitudResolverPendiente,
  type SolicitudVincularFactura,
  type SolicitudAnularAnticipo,
  type SolicitudEvaluarRetenciones,
  type RespuestaListadoAnticipos,
  type ResultadoCrearAnticipo,
  type SolicitudAplicarAnticipo,
  type SolicitudCrearAnticipo,
  type SolicitudDevolverAnticipo,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import type { ContextoSaldoFavor, FacturaAbiertaSaldo } from '@/lib/finanzas/saldosAFavor/contrato';
import { contextoSaldo, ErrorSaldoFavorServidor } from '@/lib/services/saldosAFavor/saldosAFavor.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export class ErrorAnticipoServidor extends Error {
  constructor(
    public readonly codigo: ErrorAnticipoProveedor,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

export function respuestaErrorAnticipo(codigo: ErrorAnticipoProveedor, detalle: unknown = null): NextResponse {
  return NextResponse.json({ error: codigo, codigo, detalle }, { status: estadoHttpErrorAnticipo(codigo), headers: SIN_CACHE });
}

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function errorDeRpc(rpc: string, ctx: Ctx, error: { message: string; code?: string; details?: unknown }): ErrorAnticipoServidor {
  if (esPendienteDeActivar(error)) return new ErrorAnticipoServidor('pendiente_de_activar');
  const codigo = codigoErrorAnticipo(error.message);
  if (codigo === 'error_desconocido') {
    console.error(`[anticipos-proveedor] ${rpc}`, { organizationId: ctx.organizationId, message: error.message });
  }
  return new ErrorAnticipoServidor(codigo, detalleJson(error.details));
}

const num = (v: unknown) => Number(v ?? 0) || 0;

type FilaBase = {
  id: string;
  supplier_id: number;
  amount: number | string;
  balance: number | string;
  status: string;
  created_at: string;
  branch_id: number | null;
  notes: string | null;
  account_code: string;
  naturaleza: string | null;
  retencion_total: number | string | null;
  retencion_pendiente: boolean | null;
  suppliers: { name: string | null; nit: string | null } | null;
  payment_groups: { receipt_number: string | null } | null;
};

/**
 * Listado de la organización de la sesión, con lo aplicado de cada anticipo.
 * La lista es corta (una fila por anticipo); el filtro y la búsqueda van en el
 * navegador. Sin la migración: `pendiente`.
 */
export async function listarAnticipos(ctx: Ctx): Promise<RespuestaListadoAnticipos> {
  const { data, error } = await ctx.supabase
    .from('supplier_advances')
    .select('id, supplier_id, amount, balance, status, created_at, branch_id, notes, account_code, naturaleza, retencion_total, retencion_pendiente, suppliers:supplier_id (name, nit), payment_groups:payment_group_id (receipt_number)')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    if (esPendienteDeActivar(error)) return { pendiente: true, filas: [], cuenta: null, estadoCuenta: null };
    throw errorDeRpc('supplier_advances', ctx, error);
  }
  const filasBase = (data ?? []) as unknown as FilaBase[];

  const aplicadoPorAnticipo = new Map<string, number>();
  const retencionesPorAnticipo = new Map<string, RetencionDelAnticipo[]>();
  if (filasBase.length > 0) {
    const { data: rets, error: errRets } = await ctx.supabase
      .from('supplier_advance_withholdings')
      .select('advance_id, clase, concepto, base, tarifa, valor, revertido')
      .eq('organization_id', ctx.organizationId)
      .in('advance_id', filasBase.map((f) => f.id));
    if (errRets) {
      if (esPendienteDeActivar(errRets)) return { pendiente: true, filas: [], cuenta: null, estadoCuenta: null };
      throw errorDeRpc('supplier_advance_withholdings', ctx, errRets);
    }
    type FilaRet = {
      advance_id: string;
      clase: RetencionDelAnticipo['clase'];
      concepto: string;
      base: number | string;
      tarifa: number | string;
      valor: number | string;
      revertido: number | string;
    };
    for (const r of (rets ?? []) as FilaRet[]) {
      const lista = retencionesPorAnticipo.get(r.advance_id) ?? [];
      lista.push({
        clase: r.clase,
        concepto: r.concepto,
        base: num(r.base),
        tarifa: num(r.tarifa),
        valor: num(r.valor),
        vigente: Math.max(0, num(r.valor) - num(r.revertido)),
      });
      retencionesPorAnticipo.set(r.advance_id, lista);
    }

    const { data: apps, error: errApps } = await ctx.supabase
      .from('supplier_advance_applications')
      .select('advance_id, amount, consumo_anticipo')
      .eq('organization_id', ctx.organizationId)
      .in('advance_id', filasBase.map((f) => f.id));
    if (errApps) throw errorDeRpc('supplier_advance_applications', ctx, errApps);
    // Lo que bajó el anticipo (consumo); en filas anteriores a 20261108170000, el importe aplicado.
    for (const a of (apps ?? []) as { advance_id: string; amount: number | string; consumo_anticipo: number | string | null }[]) {
      aplicadoPorAnticipo.set(a.advance_id, (aplicadoPorAnticipo.get(a.advance_id) ?? 0) + num(a.consumo_anticipo ?? a.amount));
    }
  }

  // Cruces con la obligación de un mandato de consignación (20261108121000): también consumen el anticipo.
  // Si esa migración no está aplicada, la tabla no existe y no hay cruces.
  const cruzadoPorAnticipo = new Map<string, number>();
  if (filasBase.length > 0) {
    const { data: cruces, error: errCruces } = await ctx.supabase
      .from('consignment_advance_crossings')
      .select('advance_id, amount')
      .eq('organization_id', ctx.organizationId)
      .in('advance_id', filasBase.map((f) => f.id));
    if (errCruces && !esPendienteDeActivar(errCruces)) throw errorDeRpc('consignment_advance_crossings', ctx, errCruces);
    for (const c of (errCruces ? [] : (cruces ?? [])) as { advance_id: string; amount: number | string }[]) {
      cruzadoPorAnticipo.set(c.advance_id, (cruzadoPorAnticipo.get(c.advance_id) ?? 0) + num(c.amount));
    }
  }

  const filas: FilaAnticipoProveedor[] = filasBase.map((f) => {
    const valor = num(f.amount);
    const saldo = f.status === 'cancelled' ? 0 : num(f.balance);
    const aplicado = aplicadoPorAnticipo.get(f.id) ?? 0;
    const cruzado = cruzadoPorAnticipo.get(f.id) ?? 0;
    return {
      id: f.id,
      proveedorId: String(f.supplier_id),
      proveedor: f.suppliers?.name ?? '',
      proveedorNit: f.suppliers?.nit ?? null,
      fecha: f.created_at,
      valor,
      aplicado,
      devuelto: f.status === 'cancelled' ? 0 : Math.max(0, Math.round((valor - saldo - aplicado - cruzado) * 100) / 100),
      cruzado,
      saldo,
      estado: estadoAnticipo(f.status, saldo),
      recibo: f.payment_groups?.receipt_number ?? null,
      sucursalId: f.branch_id,
      notas: f.notes,
      naturaleza: f.naturaleza === 'financiacion' || f.naturaleza === 'pago_anticipado_precio' ? f.naturaleza : null,
      retencion: num(f.retencion_total),
      retencionPendiente: f.retencion_pendiente === true,
      retenciones: retencionesPorAnticipo.get(f.id) ?? [],
    };
  });

  // P6: la cuenta de detalle configurada o el pendiente contable (nunca 1330 de respaldo).
  const { data: estado, error: errEstado } = await ctx.supabase.rpc('fn_cuenta_anticipo_proveedor_estado', { p_org: ctx.organizationId, p_branch: null });
  if (errEstado) {
    if (esPendienteDeActivar(errEstado)) return { pendiente: true, filas: [], cuenta: null, estadoCuenta: null };
    throw errorDeRpc('fn_cuenta_anticipo_proveedor_estado', ctx, errEstado);
  }
  const estadoCuenta = aEstadoCuentaAnticipo(estado);

  // Ronda 2, ítem 9: pendientes contables visibles hasta resolverse.
  const pendientes = await listarPendientes(ctx);
  const abiertos = new Map<string, number>();
  for (const p of pendientes) if (p.estado === 'abierto') abiertos.set(p.anticipoId, (abiertos.get(p.anticipoId) ?? 0) + 1);
  for (const f of filas) f.pendientesAbiertos = abiertos.get(f.id) ?? 0;
  return { pendiente: false, filas, cuenta: estadoCuenta.cuenta, estadoCuenta, pendientes };
}

/** Pendientes contables de los anticipos: abiertos primero, luego los resueltos recientes. */
export async function listarPendientes(ctx: Ctx): Promise<PendienteAnticipo[]> {
  const { data, error } = await ctx.supabase
    .from('anticipo_pendientes')
    .select('id, advance_id, tipo, detalle, estado, creado_en, resuelto_en, resolucion, soporte, supplier_advances:advance_id (suppliers:supplier_id (name), payment_groups:payment_group_id (receipt_number))')
    .eq('organization_id', ctx.organizationId)
    .order('estado', { ascending: true })
    .order('creado_en', { ascending: false })
    .limit(500);
  if (error) throw errorDeRpc('anticipo_pendientes', ctx, error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(aPendienteAnticipo);
}

/** Cierra un pendiente con resolución y soporte (finance.approve en la base). */
export async function resolverPendiente(ctx: Ctx, pendienteId: string, s: SolicitudResolverPendiente): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_pendiente_resolver', {
    p_id: pendienteId,
    p_resolucion: s.resolucion,
    p_soporte: s.soporte,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_anticipo_pendiente_resolver', ctx, error);
  return data;
}

/** Ronda 2, ítem 10: aprueba una cuenta de detalle fuera de 133005xx como equivalente, con nota. */
export async function aprobarEquivalenciaCuenta(ctx: Ctx, s: SolicitudEquivalenciaCuenta): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_cuenta_equivalencia_aprobar', {
    p_organization_id: ctx.organizationId,
    p_cuenta: s.cuenta,
    p_nota: s.nota,
  });
  if (error) throw errorDeRpc('fn_anticipo_cuenta_equivalencia_aprobar', ctx, error);
  return data;
}

export interface FacturaBorradorAnticipo {
  id: string;
  numero: string;
  fecha: string | null;
  total: number;
  vinculado: number | null;
}

/** Facturas de compra en BORRADOR del proveedor del anticipo (las únicas que se pueden vincular). */
export async function facturasParaVincular(ctx: Ctx, anticipoId: string): Promise<FacturaBorradorAnticipo[]> {
  const { data: ant, error: errAnt } = await ctx.supabase
    .from('supplier_advances')
    .select('supplier_id')
    .eq('organization_id', ctx.organizationId)
    .eq('id', anticipoId)
    .maybeSingle();
  if (errAnt) throw errorDeRpc('supplier_advances', ctx, errAnt);
  if (!ant) throw new ErrorAnticipoServidor('anticipo_no_encontrado');
  const { data, error } = await ctx.supabase
    .from('invoice_purchase')
    .select('id, number_ext, issue_date, total')
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', (ant as { supplier_id: number }).supplier_id)
    .eq('status', 'draft')
    .order('issue_date', { ascending: false })
    .limit(100);
  if (error) throw errorDeRpc('invoice_purchase', ctx, error);
  const filas = (data ?? []) as { id: string; number_ext: string | null; issue_date: string | null; total: number | string | null }[];
  const vinculos = new Map<string, number>();
  if (filas.length > 0) {
    const { data: links, error: errLinks } = await ctx.supabase
      .from('supplier_advance_invoice_links')
      .select('invoice_id, monto')
      .eq('organization_id', ctx.organizationId)
      .eq('advance_id', anticipoId)
      .in('invoice_id', filas.map((f) => f.id));
    if (errLinks) throw errorDeRpc('supplier_advance_invoice_links', ctx, errLinks);
    for (const l of (links ?? []) as { invoice_id: string; monto: number | string }[]) vinculos.set(l.invoice_id, num(l.monto));
  }
  return filas.map((f) => ({ id: f.id, numero: f.number_ext ?? '', fecha: f.issue_date, total: num(f.total), vinculado: vinculos.get(f.id) ?? null }));
}

/** Ronda 2, ítem 5: vincula el anticipo a la factura en borrador (la causación no retendrá otra vez). */
export async function vincularFactura(ctx: Ctx, anticipoId: string, s: SolicitudVincularFactura): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_vincular_factura', {
    p_anticipo: anticipoId,
    p_factura: s.factura_id,
    p_monto: s.monto,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_vincular_factura', ctx, error);
  return data;
}

/**
 * Métodos de la organización, cuentas bancarias y caja abierta de la sucursal
 * (la misma lectura del saldo a favor y del diálogo único de pago) y, con
 * proveedor, sus cuentas por pagar abiertas (confirmadas, con saldo).
 */
export async function contextoAnticipo(ctx: Ctx, entrada: { branchId: number | null; supplierId?: number | null }): Promise<ContextoSaldoFavor> {
  let base: ContextoSaldoFavor;
  try {
    base = await contextoSaldo(ctx, { branchId: entrada.branchId });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) throw new ErrorAnticipoServidor('error_desconocido');
    throw err;
  }
  if (!entrada.supplierId) return { ...base, facturas: [] };

  const { data, error } = await ctx.supabase
    .from('accounts_payable')
    .select('id, amount, balance, status, created_at, invoice_id, invoice_purchase:invoice_id (number_ext, status, issue_date, total)')
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', entrada.supplierId)
    .gt('balance', 0)
    .not('status', 'in', '(paid,cancelled,void)')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw errorDeRpc('accounts_payable', ctx, error);
  type Fila = {
    id: string;
    amount: number | string | null;
    balance: number | string | null;
    created_at: string | null;
    invoice_id: string | null;
    invoice_purchase: { number_ext: string | null; status: string | null; issue_date: string | null; total: number | string | null } | null;
  };
  const facturas: FacturaAbiertaSaldo[] = ((data ?? []) as unknown as Fila[])
    // Un borrador no es una deuda (D2 de compras); una anulada tampoco.
    .filter((f) => !f.invoice_purchase || !['draft', 'void', 'voided', 'cancelled'].includes(f.invoice_purchase.status ?? ''))
    .map((f) => ({
      id: f.id,
      number: f.invoice_purchase?.number_ext ?? '',
      total: num(f.invoice_purchase?.total ?? f.amount),
      balance: num(f.balance),
      issue_date: f.invoice_purchase?.issue_date ?? f.created_at,
    }));
  return { ...base, facturas };
}

/**
 * Registra con naturaleza y retenciones (P1) y la cuenta de detalle (P6). La
 * base vuelve a evaluar las retenciones: de la vista previa solo viajan los
 * conceptos elegidos, nunca valores.
 */
export async function crearAnticipo(ctx: Ctx, s: SolicitudCrearAnticipo): Promise<ResultadoCrearAnticipo> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_registrar', {
    p_supplier: s.proveedor_id,
    p_branch: s.sucursal_id,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_naturaleza: s.naturaleza,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_tarifa_iva: s.tarifa_iva ?? null,
    p_retefuente: s.retefuente_id ?? null,
    p_reteica: s.reteica_id ?? null,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
    p_notas: s.notas ?? null,
    p_componentes: s.componentes ?? null,
    p_ica_territorial: s.ica_territorial ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_registrar', ctx, error);
  return data as ResultadoCrearAnticipo;
}

/** Vista previa de renta, reteIVA y reteICA del anticipo (no escribe). */
export async function evaluarRetenciones(ctx: Ctx, s: SolicitudEvaluarRetenciones): Promise<EvaluacionRetenciones> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_evaluar_retenciones', {
    p_org: ctx.organizationId,
    p_supplier: s.proveedor_id,
    p_naturaleza: s.naturaleza,
    p_monto: s.monto,
    p_tarifa_iva: s.tarifa_iva ?? null,
    p_retefuente: s.retefuente_id ?? null,
    p_reteica: s.reteica_id ?? null,
    p_componentes: s.componentes ?? null,
    p_ica_territorial: s.ica_territorial ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_evaluar_retenciones', ctx, error);
  return aEvaluacionRetenciones(data);
}

/** Saldo por anticipo y por proveedor: tabla, libros y auxiliar por NIT (P6). */
export async function conciliacionAnticipos(ctx: Ctx): Promise<RespuestaConciliacion> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipos_proveedor_conciliacion', { p_org: ctx.organizationId, p_supplier: null });
  if (error) throw errorDeRpc('fn_anticipos_proveedor_conciliacion', ctx, error);
  return aConciliacion(data);
}

/**
 * Aplica a la cuenta por pagar reconocida. Con `correccion` (motivo y soporte) corrige una
 * retención que la factura repitió sobre la base del anticipo, con traza y pendiente para
 * revisar los periodos afectados; sin ella la base rechaza `retencion_duplicada`.
 */
export async function aplicarAnticipo(ctx: Ctx, anticipoId: string, s: SolicitudAplicarAnticipo): Promise<ResultadoAplicarAnticipo> {
  const base = {
    p_anticipo: anticipoId,
    p_cuenta_por_pagar: s.cuenta_id,
    p_monto: s.monto,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  };
  const rpc = s.correccion ? 'fn_anticipo_proveedor_aplicar_corrigiendo' : 'fn_anticipo_proveedor_aplicar';
  const { data, error } = s.correccion
    ? await ctx.supabase.rpc(rpc, { ...base, p_motivo: s.correccion.motivo, p_soporte: s.correccion.soporte })
    : await ctx.supabase.rpc(rpc, base);
  if (error) throw errorDeRpc(rpc, ctx, error);
  return data as ResultadoAplicarAnticipo;
}

/**
 * El dinero que regresa y el procedimiento por causa (ronda 3): las retenciones afectadas las calcula la
 * base a partir del procedimiento. Sin procedimiento (null) la base deja un pendiente contable.
 */
export async function devolverAnticipo(ctx: Ctx, anticipoId: string, s: SolicitudDevolverAnticipo): Promise<ResultadoDevolverAnticipo> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_devolver', {
    p_anticipo: anticipoId,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_motivo: s.motivo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
    p_procedimiento: s.procedimiento ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_devolver', ctx, error);
  return data as ResultadoDevolverAnticipo;
}

/** Ronda 3, causa (b): reintegra al proveedor el exceso de una retención (el cálculo correcto lo da). */
export async function reintegrarExcesoRetencion(ctx: Ctx, anticipoId: string, s: SolicitudExcesoRetencion): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_retencion_exceso_reintegrar', {
    p_anticipo: anticipoId,
    p_clase: s.clase,
    p_base_correcta: s.base_correcta,
    p_tarifa_correcta: s.tarifa_correcta,
    p_metodo: s.metodo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_soportes: s.soportes,
    p_periodo_descuento: s.periodo_descuento,
    p_requiere_correccion: s.requiere_correccion,
    p_motivo: s.motivo,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_retencion_exceso_reintegrar', ctx, error);
  return data;
}

/**
 * P7: anula solo como corrección de un desembolso que no ocurrió, con motivo,
 * soporte y la fecha del ajuste documentado (contra-asiento en esa fecha).
 */
export async function anularAnticipo(ctx: Ctx, anticipoId: string, s: SolicitudAnularAnticipo): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_anular_por_error', {
    p_anticipo: anticipoId,
    p_motivo: s.motivo,
    p_soporte: s.soporte,
    p_fecha_ajuste: s.fecha_ajuste ?? null,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_anular_por_error', ctx, error);
  return data;
}
