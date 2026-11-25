/**
 * Cuadre del domiciliario contra la caja de la sede (logística Fase 1).
 *
 * Todo lo que mueve dinero pasa por RPC transaccionales (migración 20261123150416):
 * - abrir:   logistica_cuadre_abrir — liga el cuadre a la caja abierta de la sede y trae los envíos
 *            contraentrega cobrados por el domiciliario;
 * - recibir: logistica_cuadre_recibir_linea — cobra la línea con la RPC que ya existe para su
 *            origen (fn_cobrar_pedido_web_en_caja o fn_registrar_pago); efectivo a la caja,
 *            datáfono a 13802001 por las reglas vigentes;
 * - cerrar:  logistica_cuadre_cerrar — exige motivo y responsable si no cuadra; el faltante NO
 *            genera asiento (pendiente del Contador: accounting_status = 'pending_accountant');
 * - recibir y cerrar: logistica_cuadre_recibir_y_cerrar (migración 20261123165634) — varias líneas
 *            y el cierre en UNA transacción: si algo falla no queda nada a medias; si el cuadre ya
 *            se cerró (reintento), devuelve su resumen sin cobrar de nuevo. Es lo que usa la hoja
 *            «Recibir dinero»;
 * - anular:  logistica_cuadre_anular — solo si no se ha recibido dinero.
 *
 * Para una línea de pedido web, la factura (si la venta aún no tiene) la arma el mismo código del
 * botón «Cobrar» (`webOrderConfirmationService.facturaParaCobroEnCaja`). Ese servicio usa el
 * cliente del navegador: recibir una línea de pedido web se hace desde la pantalla de Cuadres.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cuadre, LineaCuadre, ResponsableDiferencia } from '@/lib/logistica/cuadre';
import { lineaRequiereMotivo, montoLineaValido } from '@/lib/logistica/cuadre';

export class CuadreError extends Error {
  constructor(public readonly codigo: string, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'CuadreError';
  }
}

/** Códigos que lanzan las RPC (y las que llaman) y que la pantalla traduce. */
export const ERRORES_CUADRE = [
  // Cobro en caja con el total de la base (migración 20261125195945).
  'TOTAL_PEDIDO_INCONSISTENTE',
  'FACTURA_NO_COINCIDE',
  'MONTO_NO_COINCIDE',
  'NO_OPEN_CASH_SESSION',
  'SEDE_INVALIDA',
  'DOMICILIARIO_INVALIDO',
  'SIN_PERMISO',
  'SIN_ACCESO_SEDE',
  'CUADRE_CERRADO',
  'CUADRE_NO_ENCONTRADO',
  'CUADRE_CON_RECIBOS',
  'LINEA_NO_ENCONTRADA',
  'LINEA_YA_RECIBIDA',
  'LINEAS_PENDIENTES',
  'MONTO_INVALIDO',
  'MONTO_MAYOR_AL_ESPERADO',
  'MOTIVO_REQUERIDO',
  'MOTIVO_Y_RESPONSABLE_REQUERIDOS',
  'METODO_INVALIDO',
  'FACTURA_REQUERIDA',
  'FACTURA_DE_VENTA_NO_ENCONTRADA',
  'PEDIDO_DE_PASARELA',
  'PEDIDO_SIN_CONFIRMAR',
  'ORIGEN_NO_SOPORTADO',
  'RECIBOS_INVALIDOS',
] as const;
export type ErrorCuadre = (typeof ERRORES_CUADRE)[number] | 'ERROR';

export function codigoErrorCuadre(mensaje: string | null | undefined): ErrorCuadre {
  const m = mensaje ?? '';
  return ERRORES_CUADRE.find((c) => m.includes(c)) ?? 'ERROR';
}

function aNumero(v: unknown): number {
  return Number(v) || 0;
}

/** Convierte la respuesta jsonb de las RPC (numeric puede llegar como string). */
export function leerCuadre(crudo: unknown): Cuadre {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const lineas = Array.isArray(r.lineas) ? (r.lineas as Record<string, unknown>[]) : [];
  return {
    ...(r as unknown as Cuadre),
    esperado: aNumero(r.esperado),
    recibido: aNumero(r.recibido),
    diferencia: aNumero(r.diferencia),
    lineas: lineas.map((l) => ({
      ...(l as unknown as LineaCuadre),
      esperado: aNumero(l.esperado),
      reportado: l.reportado == null ? null : aNumero(l.reportado),
      recibido: l.recibido == null ? null : aNumero(l.recibido),
      diferencia: aNumero(l.diferencia),
    })),
  };
}

async function llamar(client: SupabaseClient, rpc: string, args: Record<string, unknown>): Promise<Cuadre> {
  const { data, error } = await client.rpc(rpc, args);
  if (error) throw new CuadreError(codigoErrorCuadre(error.message), error.message);
  return leerCuadre(data);
}

export function abrirCuadre(
  client: SupabaseClient,
  p: { organizationId: number; branchId: number; driverId: string; notas?: string | null },
): Promise<Cuadre> {
  return llamar(client, 'logistica_cuadre_abrir', {
    p_organization_id: p.organizationId,
    p_branch_id: p.branchId,
    p_driver_id: p.driverId,
    p_notas: p.notas ?? null,
  });
}

export interface RecibirLinea {
  linea: Pick<LineaCuadre, 'id' | 'esperado' | 'source_type' | 'source_id'>;
  /** Código de payment_methods: cash, card (datáfono), transfer, breb_qr… */
  metodo: string;
  monto: number;
  referencia?: string | null;
  motivoDiferencia?: string | null;
}

/** Pedido web: la misma factura que arma «Cobrar» (solo si hay dinero y la venta aún no tiene una). */
async function facturaDeLinea(client: SupabaseClient, r: RecibirLinea): Promise<Record<string, unknown> | null> {
  if (!(r.monto > 0) || r.linea.source_type !== 'web_order' || !r.linea.source_id) return null;
  const [{ webOrderConfirmationService }, { data: pedido, error }] = await Promise.all([
    import('@/lib/services/webOrderConfirmationService'),
    client.from('web_orders').select('*, items:web_order_items(*)').eq('id', r.linea.source_id).maybeSingle(),
  ]);
  if (error) throw error;
  if (!pedido) return null;
  return (await webOrderConfirmationService.facturaParaCobroEnCaja(
    pedido as Parameters<typeof webOrderConfirmationService.facturaParaCobroEnCaja>[0],
  )) as Record<string, unknown> | null;
}

function validarRecibo(r: RecibirLinea): void {
  if (!montoLineaValido(r.linea.esperado, r.monto)) throw new CuadreError('MONTO_INVALIDO');
  if (lineaRequiereMotivo(r.linea.esperado, r.monto) && !(r.motivoDiferencia ?? '').trim()) {
    throw new CuadreError('MOTIVO_REQUERIDO');
  }
}

export async function recibirLinea(client: SupabaseClient, r: RecibirLinea): Promise<Cuadre> {
  validarRecibo(r);
  const factura = await facturaDeLinea(client, r);
  return llamar(client, 'logistica_cuadre_recibir_linea', {
    p_line_id: r.linea.id,
    p_metodo: r.metodo,
    p_monto: r.monto,
    p_referencia: r.referencia ?? null,
    p_factura: factura,
    p_motivo_diferencia: r.motivoDiferencia ?? null,
  });
}

export interface RecibirYCerrar {
  settlementId: string;
  recibos: RecibirLinea[];
  motivo?: string | null;
  responsable?: ResponsableDiferencia | null;
  detalleResponsable?: string | null;
  notas?: string | null;
}

/** Resultado de recibir y cerrar: el cuadre cerrado y si fue un reintento de uno ya cerrado. */
export type CuadreCerrado = Cuadre & { ya_cerrado?: boolean; recibidas?: number; omitidas?: number };

/**
 * «Recibir y cerrar» en un solo paso (RPC transaccional e idempotente). Valida cada recibo y arma
 * las facturas de los pedidos web ANTES de llamar: la base recibe todo junto o nada.
 */
export async function recibirYCerrarCuadre(client: SupabaseClient, p: RecibirYCerrar): Promise<CuadreCerrado> {
  p.recibos.forEach(validarRecibo);
  const facturas = await Promise.all(p.recibos.map((r) => facturaDeLinea(client, r)));
  const { data, error } = await client.rpc('logistica_cuadre_recibir_y_cerrar', {
    p_settlement_id: p.settlementId,
    p_recibos: p.recibos.map((r, i) => ({
      linea_id: r.linea.id,
      metodo: r.metodo,
      monto: r.monto,
      referencia: r.referencia ?? null,
      factura: facturas[i],
      motivo_diferencia: r.motivoDiferencia ?? null,
    })),
    p_motivo: p.motivo ?? null,
    p_responsable: p.responsable ?? null,
    p_detalle_responsable: p.detalleResponsable ?? null,
    p_notas: p.notas ?? null,
  });
  if (error) throw new CuadreError(codigoErrorCuadre(error.message), error.message);
  const crudo = (data ?? {}) as Record<string, unknown>;
  return {
    ...leerCuadre(crudo),
    ya_cerrado: crudo.ya_cerrado === true,
    recibidas: Number(crudo.recibidas) || 0,
    omitidas: Number(crudo.omitidas) || 0,
  };
}

export function cerrarCuadre(
  client: SupabaseClient,
  p: {
    settlementId: string;
    motivo?: string | null;
    responsable?: ResponsableDiferencia | null;
    detalleResponsable?: string | null;
    notas?: string | null;
  },
): Promise<Cuadre> {
  return llamar(client, 'logistica_cuadre_cerrar', {
    p_settlement_id: p.settlementId,
    p_motivo: p.motivo ?? null,
    p_responsable: p.responsable ?? null,
    p_detalle_responsable: p.detalleResponsable ?? null,
    p_notas: p.notas ?? null,
  });
}

export function anularCuadre(client: SupabaseClient, settlementId: string, motivo: string): Promise<Cuadre> {
  return llamar(client, 'logistica_cuadre_anular', { p_settlement_id: settlementId, p_motivo: motivo });
}

export interface FiltrosCuadres {
  branchId?: number | null;
  driverId?: string | null;
  estado?: 'open' | 'closed' | 'cancelled' | null;
  /** Solo los que esperan decisión del Contador. */
  pendientesContador?: boolean;
  limite?: number;
}

/** Listado para la pantalla «Cuadres» (lectura directa: RLS = miembros activos). */
export async function listarCuadres(client: SupabaseClient, organizationId: number, f: FiltrosCuadres = {}) {
  let q = client
    .from('courier_settlements')
    .select(
      'id, branch_id, driver_id, cash_session_id, status, expected_total, received_total, difference, ' +
        'expected_by_method, received_by_method, difference_reason, difference_responsible, accounting_status, ' +
        'opened_at, closed_at, driver:driver_credentials(id, full_name, phone, is_external)',
    )
    .eq('organization_id', organizationId)
    .order('opened_at', { ascending: false })
    .limit(f.limite ?? 100);
  if (f.branchId != null) q = q.eq('branch_id', f.branchId);
  if (f.driverId) q = q.eq('driver_id', f.driverId);
  if (f.estado) q = q.eq('status', f.estado);
  if (f.pendientesContador) q = q.eq('accounting_status', 'pending_accountant');
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Detalle con líneas (lectura directa). */
export async function obtenerCuadre(client: SupabaseClient, organizationId: number, settlementId: string) {
  const { data, error } = await client
    .from('courier_settlements')
    .select('*, lineas:courier_settlement_lines(*), driver:driver_credentials(id, full_name, phone, is_external)')
    .eq('organization_id', organizationId)
    .eq('id', settlementId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Envíos contraentrega cobrados y aún sin cuadre, por domiciliario (tablero «Por cuadrar»). */
export async function pendientesPorCuadrar(client: SupabaseClient, organizationId: number, branchId?: number | null) {
  let q = client
    .from('shipments')
    .select('id, shipment_number, driver_id, branch_id, cod_amount, cod_collected_amount, cod_collected_method, cod_collected_at')
    .eq('organization_id', organizationId)
    .eq('cod_status', 'collected')
    .not('driver_id', 'is', null)
    .order('cod_collected_at', { ascending: true });
  if (branchId != null) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
