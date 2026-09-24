/**
 * Estado de cuenta de un cliente (reemplaza el `.txt` de CxC).
 *
 * Diseño: docs/design/CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR.md §B.3.
 * - Movimientos con saldo corrido: facturas (cargo), notas crédito y pagos
 *   (abono). Pagos por `amount - change_amount`. Saldo inicial = lo mismo
 *   antes de `desde`.
 * - Facturas abiertas y antigüedad (corriente, 1-30, 31-60, 61-90, > 90) a la
 *   fecha de corte, con los días calendario de la zona de la organización
 *   (no la columna `days_overdue`, que se desactualiza).
 * - Saldo a favor disponible (`credit_notes` activas).
 * - Texto legal configurable por organización (decisión del dueño 6,
 *   2026-09-23) con uno por defecto en `messages/`.
 * `desde`/`hasta` son días calendario de la organización; se convierten a
 * instantes con `startOfDayInstant` (nunca `toISOString().split`).
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { nextPlainDay, startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';
import type { Traductor } from '../../textos';
import type { CeldaTabla, DocumentoPayload } from '../../tipos';
import {
  SELECT_CLIENTE,
  cargarBase,
  contraparteCliente,
  esUuid,
  exigirUuid,
  fallaLectura,
  nombreArchivoBase,
  noEncontrado,
  num,
  textoLegal,
  texto,
  valorAplicado,
  type FilaCliente,
  type FilaPago,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOTE = 150;

interface FilaFactura {
  id: string;
  number: string;
  issue_date: string | null;
  due_date: string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string;
  document_type: string | null;
  sale_id: string | null;
  created_at: string | null;
}

interface Movimiento {
  fecha: string;
  concepto: string;
  documento: string | null;
  cargo: number;
  abono: number;
}

/** Días calendario entre dos `YYYY-MM-DD` (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export type Tramo = 'corriente' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90';

export function tramoDeMora(diasVencidos: number): Tramo {
  if (diasVencidos <= 0) return 'corriente';
  if (diasVencidos <= 30) return 'd1_30';
  if (diasVencidos <= 60) return 'd31_60';
  if (diasVencidos <= 90) return 'd61_90';
  return 'd90';
}

async function pagosPorOrigen(sesion: SesionDocumento, origen: string, ids: string[]): Promise<FilaPago[]> {
  const resultado: FilaPago[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const { data, error } = await sesion.supabase
      .from('payments')
      .select('id, method, amount, change_amount, reference, payment_date, created_at')
      .eq('organization_id', sesion.organizationId)
      .eq('status', 'completed')
      .eq('source', origen)
      .in('source_id', lote);
    if (error) fallaLectura('payments', error);
    resultado.push(...((data ?? []) as FilaPago[]));
  }
  return resultado;
}

export async function cargarEstadoCuenta(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const db = sesion.supabase;
  const { data: cliente, error: errorCliente } = await db
    .from('customers')
    .select(`id, organization_id, branch_id, ${SELECT_CLIENTE}`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (errorCliente) fallaLectura('customers', errorCliente);
  const c = cliente as (FilaCliente & { id: string; organization_id: number; branch_id: number | null }) | null;
  if (!c || c.organization_id !== sesion.organizationId) throw noEncontrado();

  const [base, moneda] = await Promise.all([
    cargarBase(sesion, null),
    resolverContextoMoneda(db, sesion.organizationId),
  ]);
  const zona = base.zonaHoraria;
  const ahora = opciones.ahora ?? new Date();
  const hoy = toPlainDate(ahora, zona);
  const hasta = opciones.hasta && FECHA_RE.test(opciones.hasta) && opciones.hasta <= hoy ? opciones.hasta : hoy;
  const desde = opciones.desde && FECHA_RE.test(opciones.desde) && opciones.desde <= hasta ? opciones.desde : null;
  const limiteSuperiorFecha = startOfDayInstant(nextPlainDay(hasta), zona);
  const limiteSuperior = limiteSuperiorFecha.getTime();
  const limiteInferior = desde ? startOfDayInstant(desde, zona).getTime() : null;

  const { data: facturasData, error: errorFacturas } = await db
    .from('invoice_sales')
    .select('id, number, issue_date, due_date, total, balance, status, document_type, sale_id, created_at')
    .eq('organization_id', sesion.organizationId)
    .eq('customer_id', c.id)
    .not('status', 'in', '(draft,void)')
    .lt('issue_date', limiteSuperiorFecha.toISOString())
    .order('issue_date', { ascending: true })
    .limit(5000);
  if (errorFacturas) fallaLectura('invoice_sales', errorFacturas);
  const facturas = (facturasData ?? []) as FilaFactura[];
  const ventas = facturas.filter((f) => f.document_type !== 'credit_note');
  const notas = facturas.filter((f) => f.document_type === 'credit_note');

  const idsFacturas = ventas.map((f) => f.id).filter(esUuid);
  const idsVentas = ventas.map((f) => f.sale_id).filter(esUuid);
  const { data: cuentasData } = idsFacturas.length > 0
    ? await db.from('accounts_receivable').select('id, invoice_id').eq('organization_id', sesion.organizationId).eq('customer_id', c.id)
    : { data: [] };
  const idsCuentas = ((cuentasData ?? []) as Array<{ id: string }>).map((x) => x.id).filter(esUuid);

  const [pagosFactura, pagosVenta, pagosCuenta, creditos] = await Promise.all([
    pagosPorOrigen(sesion, 'invoice_sales', idsFacturas),
    pagosPorOrigen(sesion, 'sale', idsVentas),
    pagosPorOrigen(sesion, 'account_receivable', idsCuentas),
    db.from('credit_notes').select('balance').eq('organization_id', sesion.organizationId).eq('customer_id', c.id).eq('status', 'active'),
  ]);
  const vistos = new Set<string>();
  const pagos = [...pagosFactura, ...pagosVenta, ...pagosCuenta].filter((p) => {
    const clave = String(p.id ?? '');
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    const fecha = Date.parse(p.payment_date ?? p.created_at ?? '');
    return Number.isFinite(fecha) && fecha < limiteSuperior;
  });

  const movimientos: Movimiento[] = [
    ...ventas.map((f) => ({ fecha: f.issue_date ?? f.created_at ?? '', concepto: 'movimientos.factura', documento: f.number, cargo: num(f.total), abono: 0 })),
    ...notas.map((f) => ({ fecha: f.issue_date ?? f.created_at ?? '', concepto: 'movimientos.notaCredito', documento: f.number, cargo: 0, abono: Math.abs(num(f.total)) })),
    ...pagos.map((p) => ({ fecha: p.payment_date ?? p.created_at ?? '', concepto: 'movimientos.pago', documento: texto(p.reference), cargo: 0, abono: valorAplicado(p) })),
  ].sort((a, b) => (Date.parse(a.fecha) || 0) - (Date.parse(b.fecha) || 0));

  let saldoInicial = 0;
  const filas: CeldaTabla[][] = [];
  let saldo = 0;
  let cargos = 0;
  let abonos = 0;
  for (const m of movimientos) {
    saldo += m.cargo - m.abono;
    if (limiteInferior !== null && Date.parse(m.fecha) < limiteInferior) {
      saldoInicial = saldo;
      continue;
    }
    cargos += m.cargo;
    abonos += m.abono;
    filas.push([m.fecha, m.concepto, m.documento, m.cargo || null, m.abono || null, saldo]);
  }

  // Facturas abiertas y antigüedad a la fecha de corte.
  const tramos: Record<Tramo, number> = { corriente: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  const abiertas = ventas
    .filter((f) => num(f.balance) > 0)
    .map((f) => {
      const vence = f.due_date ? toPlainDate(new Date(f.due_date), zona) : null;
      const dias = vence ? Math.max(0, diasEntre(vence, hasta)) : 0;
      tramos[tramoDeMora(dias)] += num(f.balance);
      return [f.number, f.issue_date, f.due_date, dias, num(f.total), num(f.balance)] as CeldaTabla[];
    });
  const saldoAFavor = ((creditos.data ?? []) as Array<{ balance: number | null }>).reduce((s, x) => s + num(x.balance), 0);

  const numero = `${t('estadoCuenta.prefijo')}-${hasta.replace(/-/g, '')}`;
  return {
    tipo: 'estado-cuenta',
    tituloClave: 'estado-cuenta',
    idioma: opciones.idioma,
    numero,
    estado: null,
    marcaAgua: null,
    bandas: [],
    emisor: base.emisor,
    sucursal: null,
    contraparte: contraparteCliente(c),
    referencia: [],
    metadatos: [
      { clave: 'desde', valor: desde ? { tipo: 'fecha', v: desde } : { tipo: 'clave', v: 'estadoCuenta.desdeInicio' } },
      { clave: 'fechaCorte', valor: { tipo: 'fecha', v: hasta } },
      { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    ],
    resumen: [
      { clave: 'saldoInicial', valor: { tipo: 'dinero', v: saldoInicial } },
      { clave: 'cargos', valor: { tipo: 'dinero', v: cargos } },
      { clave: 'abonos', valor: { tipo: 'dinero', v: abonos } },
      { clave: 'saldoFinal', valor: { tipo: 'dinero', v: saldo } },
      { clave: 'saldoAFavor', valor: { tipo: 'dinero', v: saldoAFavor } },
      { clave: 'facturasAbiertas', valor: { tipo: 'numero', v: abiertas.length, decimales: 0 } },
    ],
    lineas: null,
    secciones: [
      {
        titulo: 'movimientos',
        columnas: [
          { clave: 'fecha', tipo: 'instante' },
          { clave: 'concepto', tipo: 'clave' },
          { clave: 'documento', tipo: 'texto' },
          { clave: 'cargo', tipo: 'dinero' },
          { clave: 'abono', tipo: 'dinero' },
          { clave: 'saldo', tipo: 'dinero' },
        ],
        filas,
        pie: [null, 'movimientos.totales', null, cargos, abonos, saldo],
        vacio: 'movimientos',
      },
      {
        titulo: 'antiguedad',
        columnas: [
          { clave: 'corriente', tipo: 'dinero' },
          { clave: 'd1_30', tipo: 'dinero' },
          { clave: 'd31_60', tipo: 'dinero' },
          { clave: 'd61_90', tipo: 'dinero' },
          { clave: 'd90', tipo: 'dinero' },
        ],
        filas: [[tramos.corriente, tramos.d1_30, tramos.d31_60, tramos.d61_90, tramos.d90]],
      },
      {
        titulo: 'facturasAbiertas',
        columnas: [
          { clave: 'documento', tipo: 'texto' },
          { clave: 'emision', tipo: 'instante' },
          { clave: 'vencimiento', tipo: 'instante' },
          { clave: 'diasVencidos', tipo: 'numero' },
          { clave: 'total', tipo: 'dinero' },
          { clave: 'saldo', tipo: 'dinero' },
        ],
        filas: abiertas,
        vacio: 'facturasAbiertas',
      },
    ],
    totales: [],
    notas: null,
    terminos: null,
    firma: null,
    pieLegal: { textos: textoLegal(base, 'estado-cuenta', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: zona,
    generadoEn: ahora.toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'estado-cuenta', hasta),
  };
}
