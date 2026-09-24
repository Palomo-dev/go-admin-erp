/**
 * Factura de compra (`invoice_purchase`) y documento soporte en adquisiciones
 * a no obligados a facturar (`support_documents`). El documento de compra lo
 * emite un tercero: paleta sobria en gris y la etiqueta «documento recibido de
 * un tercero» (DOCUMENTOS-PDF.md §8.5). El descuento por línea y el «impuesto
 * incluido» salen de la base (antes el constructor no los pasaba).
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import type { Traductor } from '../../textos';
import type { Campo, DocumentoPayload, FilaTotal, SeccionTabla } from '../../tipos';
import {
  SELECT_ITEM,
  SELECT_PROVEEDOR,
  cargarBase,
  contraparteProveedor,
  cuentaEnmascarada,
  entornoFacturacion,
  esUuid,
  exigirUuid,
  fallaLectura,
  lineaDeItem,
  nombreArchivoBase,
  nombreImpuestoUnico,
  noEncontrado,
  num,
  numONull,
  rotuloMetodo,
  seccionPagos,
  textoLegal,
  texto,
  tonoEstado,
  uno,
  urlVerificacionDian,
  valorAplicado,
  type FilaItem,
  type FilaPago,
  type FilaProveedor,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

function ordenarItems(items: Array<FilaItem & { created_at?: string | null }> | null) {
  return [...(items ?? [])].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))).map(lineaDeItem);
}

function totalesCompra(subtotal: unknown, impuestos: unknown, total: unknown, lineas: ReturnType<typeof ordenarItems>): FilaTotal[] {
  const descuentos = lineas.reduce((s, l) => s + l.descuento, 0);
  const nombreImpuesto = nombreImpuestoUnico(lineas);
  const filas: FilaTotal[] = [{ clave: 'subtotal', valor: num(subtotal) }];
  if (descuentos > 0) filas.push({ clave: 'descuentos', valor: descuentos, estilo: 'descuento', resta: true });
  filas.push(
    nombreImpuesto
      ? { clave: 'impuestoNombrado', vars: { nombre: nombreImpuesto }, valor: num(impuestos) }
      : { clave: 'impuestos', valor: num(impuestos) },
  );
  filas.push({ clave: 'totalProveedor', valor: num(total), estilo: 'total' });
  return filas;
}

function datosBancarios(p: FilaProveedor | null): Campo[] {
  if (!p) return [];
  const campos: Campo[] = [];
  if (texto(p.bank_name)) campos.push({ clave: 'banco', valor: { tipo: 'texto', v: texto(p.bank_name) } });
  const cuenta = cuentaEnmascarada(p.bank_account);
  if (cuenta) campos.push({ clave: 'cuentaBancaria', valor: { tipo: 'texto', v: [texto(p.account_type), cuenta].filter(Boolean).join(' ') } });
  const dias = numONull(p.credit_days);
  if (dias !== null && dias > 0) campos.push({ clave: 'plazoCredito', valor: { tipo: 'clave', v: 'condiciones.dias', vars: { dias } } });
  return campos;
}

interface FilaFacturaCompra {
  id: string;
  organization_id: number;
  branch_id: number | null;
  po_id: number | null;
  number_ext: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string;
  notes: string | null;
  payment_method: string | null;
  created_at: string | null;
  supplier: FilaProveedor | FilaProveedor[] | null;
  items: Array<FilaItem & { created_at?: string | null }> | null;
}

async function pagosDeCompra(sesion: SesionDocumento, facturaId: string): Promise<FilaPago[]> {
  const db = sesion.supabase;
  const { data: cuentas } = await db
    .from('accounts_payable')
    .select('id')
    .eq('organization_id', sesion.organizationId)
    .eq('invoice_id', facturaId);
  const ids = ((cuentas ?? []) as Array<{ id: string }>).map((c) => c.id).filter(esUuid);
  const filtros = [`and(source.eq.invoice_purchase,source_id.eq.${facturaId})`];
  if (ids.length > 0) filtros.push(`and(source.eq.account_payable,source_id.in.(${ids.join(',')}))`);
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

export async function cargarFacturaCompra(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('invoice_purchase')
    .select(`id, organization_id, branch_id, po_id, number_ext, issue_date, due_date, currency, subtotal, tax_total, total,
      balance, status, notes, payment_method, created_at,
      supplier:suppliers(${SELECT_PROVEEDOR}),
      items:invoice_items(${SELECT_ITEM})`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('invoice_purchase', error);
  const f = data as FilaFacturaCompra | null;
  if (!f || f.organization_id !== sesion.organizationId) throw noEncontrado();

  const [base, moneda, pagos] = await Promise.all([
    cargarBase(sesion, f.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId, f.currency),
    pagosDeCompra(sesion, f.id),
  ]);
  const proveedor = uno(f.supplier);
  const lineas = ordenarItems(f.items);
  const totales = totalesCompra(f.subtotal, f.tax_total, f.total, lineas);
  const pagado = pagos.reduce((s, p) => s + valorAplicado(p), 0);
  if (pagado > 0) totales.push({ clave: 'pagosAplicados', valor: pagado, resta: true });
  if (f.status !== 'draft' && f.status !== 'void') {
    const saldo = num(f.balance);
    totales.push(saldo > 0 ? { clave: 'saldoPorPagar', valor: saldo, estilo: 'saldo' } : { clave: 'pagado', valor: num(f.total), estilo: 'pagado' });
  }

  const metadatos: Campo[] = [
    { clave: 'fechaEmision', valor: { tipo: 'instante', v: f.issue_date ?? f.created_at } },
    { clave: 'fechaVencimiento', valor: { tipo: 'instante', v: f.due_date } },
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
  ];
  if (texto(f.payment_method)) metadatos.push({ clave: 'medioPago', valor: { tipo: 'texto', v: rotuloMetodo(f.payment_method, t) } });
  if (f.po_id) metadatos.push({ clave: 'ordenCompra', valor: { tipo: 'texto', v: `#${f.po_id}` } });
  if (base.sucursal) metadatos.push({ clave: 'sucursalRecibe', valor: { tipo: 'texto', v: base.sucursal.nombre } });

  const secciones: SeccionTabla[] = pagos.length > 0 ? [seccionPagos(pagos, t)] : [];

  return {
    tipo: 'factura-compra',
    tituloClave: 'factura-compra',
    idioma: opciones.idioma,
    numero: f.number_ext,
    estado: { codigo: `compra.${f.status}`, tono: tonoEstado(f.status) },
    marcaAgua: f.status === 'draft' ? 'borrador' : f.status === 'void' ? 'anulada' : null,
    bandas: f.status === 'void' ? [{ clave: 'anulada', tono: 'peligro' }] : [],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: contraparteProveedor(proveedor),
    referencia: datosBancarios(proveedor),
    metadatos,
    resumen: [],
    lineas,
    secciones,
    totales,
    notas: texto(f.notes),
    terminos: null,
    firma: 'recibido',
    pieLegal: { textos: textoLegal(base, 'factura-compra', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: true,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'factura-compra', f.number_ext),
  };
}

interface FilaDocumentoSoporte {
  id: string;
  organization_id: number;
  branch_id: number | null;
  number: string | null;
  reference_code: string;
  issue_date: string | null;
  observation: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  currency: string | null;
  status: string;
  cufe: string | null;
  created_at: string;
  supplier: FilaProveedor | FilaProveedor[] | null;
  items: Array<FilaItem & { created_at?: string | null }> | null;
}

export async function cargarDocumentoSoporte(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('support_documents')
    .select(`id, organization_id, branch_id, number, reference_code, issue_date, observation, subtotal, tax_total, total,
      currency, status, cufe, created_at,
      supplier:suppliers(${SELECT_PROVEEDOR}),
      items:invoice_items(${SELECT_ITEM})`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('support_documents', error);
  const d = data as FilaDocumentoSoporte | null;
  if (!d || d.organization_id !== sesion.organizationId) throw noEncontrado();

  const cuds = texto(d.cufe);
  const [base, moneda, entorno] = await Promise.all([
    cargarBase(sesion, d.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId, d.currency),
    cuds ? entornoFacturacion(sesion) : Promise.resolve('produccion' as const),
  ]);
  const lineas = ordenarItems(d.items);
  const numero = texto(d.number) ?? d.reference_code;

  return {
    tipo: 'documento-soporte',
    tituloClave: 'documento-soporte',
    idioma: opciones.idioma,
    numero,
    estado: { codigo: `soporte.${d.status}`, tono: tonoEstado(d.status) },
    marcaAgua: d.status === 'draft' ? 'borrador' : null,
    bandas: [],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: contraparteProveedor(uno(d.supplier)),
    referencia: [],
    metadatos: [
      { clave: 'fechaEmision', valor: { tipo: 'instanteHora', v: d.issue_date ?? d.created_at } },
      { clave: 'referencia', valor: { tipo: 'texto', v: d.reference_code } },
      { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    ],
    resumen: [],
    lineas,
    secciones: [],
    totales: totalesCompra(d.subtotal, d.tax_total, d.total, lineas),
    notas: texto(d.observation),
    terminos: null,
    firma: null,
    pieLegal: {
      textos: textoLegal(base, 'documento-soporte', t),
      resolucion: null,
      codigoUnico: cuds ? { clave: 'cuds', valor: cuds } : null,
      qr: cuds ? { contenido: urlVerificacionDian(cuds, entorno), leyenda: 'verificacionDian' } : null,
    },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'documento-soporte', numero),
  };
}
