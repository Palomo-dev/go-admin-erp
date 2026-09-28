/**
 * Factura de venta y nota crédito (`invoice_sales`, `document_type`
 * `invoice`/NULL o `credit_note`). Se leen del servidor: importes, estado,
 * saldo, cliente, líneas, pagos, resolución DIAN y CUFE. Nada del cuerpo.
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import type { Traductor } from '../../textos';
import type { Banda, Campo, DocumentoPayload, FilaTotal, MarcaAgua, ResolucionNumeracion, SeccionTabla } from '../../tipos';
import {
  SELECT_CLIENTE,
  SELECT_ITEM,
  cargarBase,
  cargarNombresMetodos,
  contraparteCliente,
  entornoFacturacion,
  esUuid,
  exigirUuid,
  fallaLectura,
  lineaDeItem,
  nombreArchivoBase,
  nombreImpuestoUnico,
  noEncontrado,
  notasPresentables,
  num,
  rotuloMetodo,
  seccionPagos,
  textoLegal,
  texto,
  tonoEstado,
  uno,
  urlVerificacionDian,
  valorAplicado,
  type FilaCliente,
  type FilaItem,
  type FilaPago,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

interface FilaFacturaVenta {
  id: string;
  organization_id: number;
  branch_id: number | null;
  sale_id: string | null;
  number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string;
  xml_uuid: string | null;
  notes: string | null;
  description: string | null;
  payment_method: string | null;
  payment_form: string | null;
  tax_included: boolean | null;
  related_invoice_id: string | null;
  document_type: string | null;
  created_at: string | null;
  customer: FilaCliente | FilaCliente[] | null;
  items: FilaItem[] | null;
}

const SELECT_FACTURA = `id, organization_id, branch_id, sale_id, number, issue_date, due_date, currency, subtotal, tax_total,
  total, balance, status, xml_uuid, notes, description, payment_method, payment_form, tax_included,
  related_invoice_id, document_type, created_at,
  customer:customers(${SELECT_CLIENTE}),
  items:invoice_items(${SELECT_ITEM})`;

/** Pagos completados de la factura: directos, por su venta del POS o por su cuenta por cobrar. */
async function pagosDeFactura(sesion: SesionDocumento, factura: FilaFacturaVenta): Promise<FilaPago[]> {
  const db = sesion.supabase;
  const { data: cuentas } = await db
    .from('accounts_receivable')
    .select('id')
    .eq('organization_id', sesion.organizationId)
    .eq('invoice_id', factura.id);
  const idsCuentas = ((cuentas ?? []) as Array<{ id: string }>).map((c) => c.id).filter(esUuid);

  const filtros = [`and(source.eq.invoice_sales,source_id.eq.${factura.id})`];
  if (esUuid(factura.sale_id)) filtros.push(`and(source.eq.sale,source_id.eq.${factura.sale_id})`);
  if (idsCuentas.length > 0) filtros.push(`and(source.eq.account_receivable,source_id.in.(${idsCuentas.join(',')}))`);

  const { data, error } = await db
    .from('payments')
    .select('id, method, amount, change_amount, reference, payment_date, created_at')
    .eq('organization_id', sesion.organizationId)
    .eq('status', 'completed')
    .or(filtros.join(','))
    .order('payment_date', { ascending: true });
  if (error) fallaLectura('payments', error);
  return (data ?? []) as FilaPago[];
}

async function creditoAplicado(sesion: SesionDocumento, facturaId: string): Promise<number> {
  const { data } = await sesion.supabase
    .from('credit_note_applications')
    .select('amount')
    .eq('organization_id', sesion.organizationId)
    .eq('invoice_id', facturaId);
  return ((data ?? []) as Array<{ amount: number | string | null }>).reduce((s, f) => s + num(f.amount), 0);
}

/** Resolución DIAN vigente cuyo prefijo coincide con el número del documento. */
async function resolucionDe(
  sesion: SesionDocumento,
  tipoSecuencia: 'invoice' | 'credit_note',
  numero: string,
  branchId: number | null,
): Promise<ResolucionNumeracion | null> {
  const { data } = await sesion.supabase
    .from('invoice_sequences')
    .select('branch_id, resolution_number, resolution_date, prefix, range_start, range_end, valid_from, valid_until')
    .eq('organization_id', sesion.organizationId)
    .eq('document_type', tipoSecuencia);
  const filas = ((data ?? []) as Array<{
    branch_id: number | null;
    resolution_number: string | null;
    resolution_date: string | null;
    prefix: string | null;
    range_start: number | null;
    range_end: number | null;
    valid_from: string | null;
    valid_until: string | null;
  }>).filter((f) => texto(f.resolution_number) && (!f.prefix || numero.toUpperCase().startsWith(f.prefix.toUpperCase())));
  const elegida = filas.find((f) => f.branch_id === branchId) ?? filas.find((f) => f.branch_id === null) ?? filas[0];
  if (!elegida) return null;
  return {
    numero: texto(elegida.resolution_number) as string,
    fecha: elegida.resolution_date,
    prefijo: texto(elegida.prefix),
    desde: elegida.range_start,
    hasta: elegida.range_end,
    vigenteDesde: elegida.valid_from,
    vigenteHasta: elegida.valid_until,
  };
}

function marcaDe(estado: string): MarcaAgua | null {
  if (estado === 'draft') return 'borrador';
  if (estado === 'void' || estado === 'voided' || estado === 'cancelled') return 'anulada';
  if (estado === 'paid') return 'pagada';
  return null;
}

function formaPago(valor: string | null): Campo | null {
  if (valor === '1') return { clave: 'formaPago', valor: { tipo: 'clave', v: 'formasPago.contado' } };
  if (valor === '2') return { clave: 'formaPago', valor: { tipo: 'clave', v: 'formasPago.credito' } };
  return null;
}

export async function cargarVenta(
  sesion: SesionDocumento,
  tipoPedido: 'factura-venta' | 'nota-credito',
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('invoice_sales')
    .select(SELECT_FACTURA)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('invoice_sales', error);
  const factura = data as FilaFacturaVenta | null;
  if (!factura || factura.organization_id !== sesion.organizationId) throw noEncontrado();
  const esNota = factura.document_type === 'credit_note';
  // Una factura pedida como nota crédito es 404. Una nota crédito pedida como
  // «factura-venta» (pantallas viejas que no distinguen) sale como nota crédito:
  // el motor vuelve a exigir el permiso de ese tipo antes de devolverla.
  if (tipoPedido === 'nota-credito' && !esNota) throw noEncontrado();
  const tipo = esNota ? 'nota-credito' : 'factura-venta';

  const [base, moneda, monedaBase, pagos, credito, resolucion, entorno] = await Promise.all([
    cargarBase(sesion, factura.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId, factura.currency),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId),
    esNota ? Promise.resolve([] as FilaPago[]) : pagosDeFactura(sesion, factura),
    esNota ? Promise.resolve(0) : creditoAplicado(sesion, factura.id),
    factura.status === 'draft' ? Promise.resolve(null) : resolucionDe(sesion, esNota ? 'credit_note' : 'invoice', factura.number, factura.branch_id),
    texto(factura.xml_uuid) ? entornoFacturacion(sesion) : Promise.resolve('produccion' as const),
  ]);

  // Nombres de los métodos (la factura y sus pagos) de la fuente única: nunca «cash» crudo.
  const nombresMetodos = await cargarNombresMetodos(sesion, [factura.payment_method, ...pagos.map((p) => p.method)]);

  const lineas = [...(factura.items ?? [])]
    .sort((a, b) => String((a as { created_at?: string }).created_at ?? '').localeCompare(String((b as { created_at?: string }).created_at ?? '')))
    .map(lineaDeItem);
  const descuentos = lineas.reduce((s, l) => s + l.descuento, 0);
  const total = num(factura.total);
  const saldo = num(factura.balance);
  const nombreImpuesto = nombreImpuestoUnico(lineas);

  const totales: FilaTotal[] = [{ clave: 'subtotal', valor: num(factura.subtotal) }];
  if (descuentos > 0) totales.push({ clave: 'descuentos', valor: descuentos, estilo: 'descuento', resta: true });
  totales.push(
    nombreImpuesto
      ? { clave: 'impuestoNombrado', vars: { nombre: nombreImpuesto }, valor: num(factura.tax_total) }
      : { clave: 'impuestos', valor: num(factura.tax_total) },
  );
  totales.push({ clave: 'total', valor: total, estilo: 'total' });
  if (!esNota) {
    if (credito > 0) totales.push({ clave: 'creditoAplicado', valor: credito, resta: true });
    const pagado = pagos.reduce((s, p) => s + valorAplicado(p), 0);
    if (pagado > 0) totales.push({ clave: 'pagosAplicados', valor: pagado, resta: true });
    if (factura.status !== 'draft' && factura.status !== 'void') {
      totales.push(saldo > 0 ? { clave: 'saldoPendiente', valor: saldo, estilo: 'saldo' } : { clave: 'pagado', valor: total, estilo: 'pagado' });
    }
  }

  const metadatos: Campo[] = [
    { clave: 'fechaEmision', valor: { tipo: 'instanteHora', v: factura.issue_date ?? factura.created_at } },
  ];
  if (!esNota) metadatos.push({ clave: 'fechaVencimiento', valor: { tipo: 'instante', v: factura.due_date } });
  metadatos.push({ clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } });
  const forma = formaPago(factura.payment_form);
  if (forma) metadatos.push(forma);
  if (texto(factura.payment_method)) metadatos.push({ clave: 'medioPago', valor: { tipo: 'texto', v: rotuloMetodo(factura.payment_method, t, nombresMetodos) } });
  // La sucursal va una sola vez: en su tarjeta (`payload.sucursal`), no repetida en los metadatos.

  const referencia: Campo[] = [];
  if (esNota && esUuid(factura.related_invoice_id)) {
    const { data: afectada } = await sesion.supabase
      .from('invoice_sales')
      .select('number, issue_date, xml_uuid')
      .eq('id', factura.related_invoice_id)
      .eq('organization_id', sesion.organizationId)
      .maybeSingle();
    const a = afectada as { number: string; issue_date: string | null; xml_uuid: string | null } | null;
    if (a) {
      referencia.push({ clave: 'facturaAfectada', valor: { tipo: 'texto', v: a.number } });
      referencia.push({ clave: 'fechaFacturaAfectada', valor: { tipo: 'instante', v: a.issue_date } });
      if (texto(a.xml_uuid)) referencia.push({ clave: 'cufeAfectado', valor: { tipo: 'texto', v: texto(a.xml_uuid) } });
    }
  }
  if (esNota) {
    referencia.push({ clave: 'motivo', valor: { tipo: 'texto', v: texto(factura.description) ?? texto(factura.notes) ?? '—' } });
  }

  const bandas: Banda[] = [];
  if (factura.status === 'draft') bandas.push({ clave: 'borrador', tono: 'neutro' });
  if (factura.status === 'void') bandas.push({ clave: 'anulada', tono: 'peligro' });
  if (moneda.code !== monedaBase.code) {
    bandas.push({ clave: 'monedaExtranjera', vars: { moneda: moneda.code }, tono: 'info' });
  }

  const cufe = texto(factura.xml_uuid);
  const secciones: SeccionTabla[] = [];
  if (pagos.length > 0) secciones.push(seccionPagos(pagos, t, nombresMetodos));

  // Con CUDE (nota aceptada por la DIAN vía Factus, `xml_uuid`) la nota es electrónica.
  const tituloClave = esNota
    ? cufe ? 'nota-credito-electronica' : 'nota-credito'
    : cufe ? 'factura-venta-electronica' : 'factura-venta';
  const qr = factura.status === 'draft'
    ? null
    : cufe
      ? { contenido: urlVerificacionDian(cufe, entorno), leyenda: 'verificacionDian' }
      : {
          contenido: [
            `${t(`tipos.${tituloClave}`)} ${factura.number}`,
            base.emisor.nit ? `NIT ${[base.emisor.nit, base.emisor.dv].filter(Boolean).join('-')}` : null,
            `${t('campos.total')} ${total} ${moneda.code}`,
          ].filter(Boolean).join('\n'),
          leyenda: 'resumen',
        };

  return {
    tipo,
    tituloClave,
    idioma: opciones.idioma,
    numero: factura.status === 'draft' ? null : factura.number,
    estado: { codigo: factura.status, tono: tonoEstado(factura.status) },
    marcaAgua: marcaDe(factura.status),
    bandas,
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: contraparteCliente(uno(factura.customer)),
    referencia,
    metadatos,
    resumen: [],
    lineas,
    secciones,
    totales,
    notas: esNota ? null : notasPresentables(factura.notes, t),
    terminos: null,
    firma: esNota ? null : 'recibido',
    pieLegal: {
      textos: textoLegal(base, tipo, t),
      resolucion,
      codigoUnico: cufe ? { clave: esNota ? 'cude' : 'cufe', valor: cufe } : null,
      qr,
    },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, tituloClave, factura.number),
  };
}

