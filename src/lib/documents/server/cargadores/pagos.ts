/**
 * Comprobantes de un pago (`payments`):
 * - `recibo-caja`: dinero que ENTRA (factura de venta, venta del POS, abono a
 *   cartera, folio, pedido web…).
 * - `comprobante-egreso`: dinero que SALE hacia un proveedor (factura de
 *   compra o cuenta por pagar).
 * El valor es `amount - change_amount` (en el POS `amount` guarda lo recibido
 * y el cambio va aparte). El documento que el pago abona y su contraparte se
 * resuelven en el servidor, siempre dentro de la organización de la sesión.
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import type { Traductor } from '../../textos';
import type { Campo, Contraparte, DocumentoPayload, FilaTotal } from '../../tipos';
import {
  SELECT_CLIENTE,
  SELECT_PROVEEDOR,
  cargarBase,
  contraparteCliente,
  contraparteProveedor,
  esUuid,
  exigirUuid,
  fallaLectura,
  nombreArchivoBase,
  noEncontrado,
  num,
  rotuloMetodo,
  textoLegal,
  texto,
  uno,
  valorAplicado,
  type FilaCliente,
  type FilaProveedor,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

/** Orígenes de pago que son egresos a proveedores. */
export const ORIGENES_EGRESO = new Set(['invoice_purchase', 'account_payable']);

interface FilaPagoCompleta {
  id: string;
  organization_id: number;
  branch_id: number | null;
  source: string | null;
  source_id: string | null;
  method: string | null;
  amount: number | string | null;
  change_amount: number | string | null;
  discount_amount: number | string | null;
  currency: string | null;
  reference: string | null;
  status: string | null;
  payment_date: string | null;
  created_at: string | null;
}

interface DocumentoAbonado {
  clave: string;
  numero: string | null;
  contraparte: Contraparte | null;
  saldo: number | null;
}

async function documentoAbonado(sesion: SesionDocumento, pago: FilaPagoCompleta): Promise<DocumentoAbonado | null> {
  const db = sesion.supabase;
  const org = sesion.organizationId;
  const origen = pago.source ?? '';
  const idOrigen = pago.source_id;
  if (!esUuid(idOrigen)) return null;

  const facturaVenta = async (id: string): Promise<DocumentoAbonado | null> => {
    const { data } = await db.from('invoice_sales').select(`number, balance, customer:customers(${SELECT_CLIENTE})`).eq('id', id).eq('organization_id', org).maybeSingle();
    const f = data as { number: string; balance: number | null; customer: FilaCliente | FilaCliente[] | null } | null;
    return f ? { clave: 'facturaVenta', numero: f.number, contraparte: contraparteCliente(uno(f.customer)), saldo: num(f.balance) } : null;
  };
  const facturaCompra = async (id: string): Promise<DocumentoAbonado | null> => {
    const { data } = await db.from('invoice_purchase').select(`number_ext, balance, supplier:suppliers(${SELECT_PROVEEDOR})`).eq('id', id).eq('organization_id', org).maybeSingle();
    const f = data as { number_ext: string; balance: number | null; supplier: FilaProveedor | FilaProveedor[] | null } | null;
    return f ? { clave: 'facturaCompra', numero: f.number_ext, contraparte: contraparteProveedor(uno(f.supplier)), saldo: num(f.balance) } : null;
  };

  switch (origen) {
    case 'invoice_sales':
      return facturaVenta(idOrigen);
    case 'account_receivable': {
      const { data } = await db.from('accounts_receivable').select(`invoice_id, balance, customer:customers(${SELECT_CLIENTE})`).eq('id', idOrigen).eq('organization_id', org).maybeSingle();
      const c = data as { invoice_id: string | null; balance: number | null; customer: FilaCliente | FilaCliente[] | null } | null;
      if (!c) return null;
      const factura = esUuid(c.invoice_id) ? await facturaVenta(c.invoice_id) : null;
      return factura ?? { clave: 'cuentaPorCobrar', numero: null, contraparte: contraparteCliente(uno(c.customer)), saldo: num(c.balance) };
    }
    case 'sale': {
      const { data } = await db.from('sales').select(`id, customer:customers(${SELECT_CLIENTE})`).eq('id', idOrigen).eq('organization_id', org).maybeSingle();
      const v = data as { id: string; customer: FilaCliente | FilaCliente[] | null } | null;
      return v ? { clave: 'venta', numero: null, contraparte: contraparteCliente(uno(v.customer)), saldo: null } : null;
    }
    case 'invoice_purchase':
      return facturaCompra(idOrigen);
    case 'account_payable': {
      const { data } = await db.from('accounts_payable').select(`invoice_id, balance, supplier:suppliers(${SELECT_PROVEEDOR})`).eq('id', idOrigen).eq('organization_id', org).maybeSingle();
      const c = data as { invoice_id: string | null; balance: number | null; supplier: FilaProveedor | FilaProveedor[] | null } | null;
      if (!c) return null;
      const factura = esUuid(c.invoice_id) ? await facturaCompra(c.invoice_id) : null;
      return factura ?? { clave: 'cuentaPorPagar', numero: null, contraparte: contraparteProveedor(uno(c.supplier)), saldo: num(c.balance) };
    }
    default:
      return null;
  }
}

export async function cargarComprobantePago(
  sesion: SesionDocumento,
  tipo: 'recibo-caja' | 'comprobante-egreso',
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('payments')
    .select('id, organization_id, branch_id, source, source_id, method, amount, change_amount, discount_amount, currency, reference, status, payment_date, created_at')
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('payments', error);
  const pago = data as FilaPagoCompleta | null;
  if (!pago || pago.organization_id !== sesion.organizationId) throw noEncontrado();
  const esEgreso = ORIGENES_EGRESO.has(pago.source ?? '');
  if ((tipo === 'comprobante-egreso') !== esEgreso) throw noEncontrado();

  const [base, moneda, abonado] = await Promise.all([
    cargarBase(sesion, pago.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId, pago.currency),
    documentoAbonado(sesion, pago),
  ]);

  const aplicado = valorAplicado(pago);
  const cambio = num(pago.change_amount);
  const numero = `${esEgreso ? 'CE' : 'RC'}-${pago.id.slice(0, 8).toUpperCase()}`;

  const metadatos: Campo[] = [
    { clave: 'fechaPago', valor: { tipo: 'instanteHora', v: pago.payment_date ?? pago.created_at } },
    { clave: 'medioPago', valor: { tipo: 'texto', v: rotuloMetodo(pago.method, t) } },
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
  ];
  if (texto(pago.reference)) metadatos.push({ clave: 'referencia', valor: { tipo: 'texto', v: texto(pago.reference) } });
  if (base.sucursal) metadatos.push({ clave: 'sucursal', valor: { tipo: 'texto', v: base.sucursal.nombre } });

  const referencia: Campo[] = [];
  if (abonado) {
    referencia.push({ clave: 'documentoAbonado', valor: { tipo: 'clave', v: `documentosAbonados.${abonado.clave}`, vars: { numero: abonado.numero ?? '' } } });
    if (abonado.saldo !== null) referencia.push({ clave: 'saldoDespues', valor: { tipo: 'dinero', v: abonado.saldo } });
  } else if (pago.source) {
    referencia.push({ clave: 'origen', valor: { tipo: 'texto', v: pago.source } });
  }

  const totales: FilaTotal[] = [];
  if (cambio > 0) {
    totales.push({ clave: 'recibido', valor: num(pago.amount) });
    totales.push({ clave: 'cambio', valor: cambio, resta: true });
  }
  if (num(pago.discount_amount) > 0) totales.push({ clave: 'descuentoPago', valor: num(pago.discount_amount), estilo: 'informativo' });
  totales.push({ clave: esEgreso ? 'valorPagado' : 'valorRecibido', valor: aplicado, estilo: 'total' });

  const anulado = pago.status !== 'completed';
  const contraparte = abonado?.contraparte ?? null;

  return {
    tipo,
    tituloClave: tipo,
    idioma: opciones.idioma,
    numero,
    estado: { codigo: `pago.${pago.status ?? 'pending'}`, tono: anulado ? 'aviso' : 'exito' },
    marcaAgua: pago.status === 'cancelled' || pago.status === 'voided' || pago.status === 'refunded' ? 'anulada' : null,
    bandas: [],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: contraparte ? { ...contraparte, rol: esEgreso ? 'proveedor' : 'cliente' } : null,
    referencia,
    metadatos,
    resumen: [],
    lineas: null,
    secciones: [],
    totales,
    notas: null,
    terminos: null,
    firma: 'entregaRecibe',
    pieLegal: { textos: textoLegal(base, tipo, t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, tipo, numero),
  };
}
