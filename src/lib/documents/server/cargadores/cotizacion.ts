/**
 * Cotización (`quotations` + `quotation_items`). Ya no se imprime con la
 * maqueta de factura: tiene su título, su estado real (no el azul «Emitida»
 * forzado), vigencia, condiciones, aceptación del cliente y el pie «no es una
 * factura». `issue_date` y `valid_until` son columnas `date`: se pintan sin
 * conversión de zona (antes corrían un día). El QR abre el enlace de pago, no
 * un PDF.
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { COLUMNAS_CANTIDAD_PRODUCTO } from '@/lib/services/documentos/cantidadLinea';
import type { Traductor } from '../../textos';
import type { Banda, Campo, DocumentoPayload, FilaTotal } from '../../tipos';
import {
  SELECT_CLIENTE,
  cargarBase,
  cargarNombresMetodos,
  contraparteCliente,
  exigirUuid,
  fallaLectura,
  lineaDeItem,
  nombreArchivoBase,
  nombreImpuestoUnico,
  noEncontrado,
  num,
  numONull,
  rotuloMetodo,
  textoLegal,
  texto,
  tonoEstado,
  uno,
  type FilaCliente,
  type FilaItem,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

interface FilaCotizacion {
  id: string;
  organization_id: number;
  branch_id: number | null;
  number: string;
  issue_date: string | null;
  valid_until: string | null;
  currency: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  discount_total: number | string | null;
  total: number | string | null;
  status: string;
  payment_terms: number | null;
  payment_method: string | null;
  terms_conditions: string | null;
  payment_link_url: string | null;
  customer: FilaCliente | FilaCliente[] | null;
  items: Array<FilaItem & { created_at?: string | null }> | null;
}

export async function cargarCotizacion(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirUuid(idCrudo);
  const { data, error } = await sesion.supabase
    .from('quotations')
    .select(`id, organization_id, branch_id, number, issue_date, valid_until, currency, subtotal, tax_total, discount_total,
      total, status, payment_terms, payment_method, terms_conditions, payment_link_url,
      customer:customers(${SELECT_CLIENTE}),
      items:quotation_items(description, qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line, created_at, producto:products(sku, ${COLUMNAS_CANTIDAD_PRODUCTO}))`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('quotations', error);
  const cot = data as FilaCotizacion | null;
  if (!cot || cot.organization_id !== sesion.organizationId) throw noEncontrado();

  // Nombre real de cada impuesto: `quotation_items.tax_code` no tiene FK, se busca en tax_templates.
  const codigos = [...new Set((cot.items ?? []).map((i) => texto(i.tax_code)).filter((c): c is string => !!c))];
  const [base, moneda, plantillas, nombresMetodos] = await Promise.all([
    cargarBase(sesion, cot.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId, cot.currency),
    codigos.length > 0
      ? sesion.supabase.from('tax_templates').select('code, name').in('code', codigos)
      : Promise.resolve({ data: [] as Array<{ code: string; name: string | null }> }),
    cargarNombresMetodos(sesion, [cot.payment_method]),
  ]);
  const nombres = new Map(((plantillas.data ?? []) as Array<{ code: string; name: string | null }>).map((p) => [p.code, p.name]));

  const lineas = [...(cot.items ?? [])]
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .map((i) => lineaDeItem({ ...i, impuesto: { name: nombres.get(String(i.tax_code ?? '')) ?? null } }));
  const nombreImpuesto = nombreImpuestoUnico(lineas);
  const descuentos = num(cot.discount_total);

  // `subtotal` ya viene neto de descuentos (regla de facturas, fn_cotizacion_recalcular):
  // se pinta el bruto para que «subtotal − descuentos + impuestos = total» cuadre
  // (antes el descuento se restaba dos veces).
  const totales: FilaTotal[] = [{ clave: 'subtotal', valor: num(cot.subtotal) + (descuentos > 0 ? descuentos : 0) }];
  if (descuentos > 0) totales.push({ clave: 'descuentos', valor: descuentos, estilo: 'descuento', resta: true });
  totales.push(
    nombreImpuesto
      ? { clave: 'impuestoNombrado', vars: { nombre: nombreImpuesto }, valor: num(cot.tax_total) }
      : { clave: 'impuestos', valor: num(cot.tax_total) },
  );
  totales.push({ clave: 'total', valor: num(cot.total), estilo: 'total' });

  const metadatos: Campo[] = [
    { clave: 'fechaEmision', valor: { tipo: 'fecha', v: cot.issue_date } },
    { clave: 'validaHasta', valor: { tipo: 'fecha', v: cot.valid_until } },
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
  ];
  const plazo = numONull(cot.payment_terms);
  if (plazo !== null) metadatos.push({ clave: 'condicionesPago', valor: { tipo: 'clave', v: plazo > 0 ? 'condiciones.dias' : 'condiciones.contado', vars: { dias: plazo } } });
  if (texto(cot.payment_method)) metadatos.push({ clave: 'medioPago', valor: { tipo: 'texto', v: rotuloMetodo(cot.payment_method, t, nombresMetodos) } });
  // La sucursal va una sola vez: en su tarjeta (`payload.sucursal`).

  const bandas: Banda[] = [{ clave: 'noEsFactura', tono: 'aviso' }];
  const enlace = texto(cot.payment_link_url);
  const enlaceSeguro = enlace && /^https:\/\/[^\s]+$/i.test(enlace) && enlace.length <= 500 ? enlace : null;

  return {
    tipo: 'cotizacion',
    tituloClave: 'cotizacion',
    idioma: opciones.idioma,
    numero: cot.number,
    estado: { codigo: `cotizacion.${cot.status}`, tono: tonoEstado(cot.status) },
    marcaAgua: cot.status === 'draft' ? 'borrador' : null,
    bandas,
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: contraparteCliente(uno(cot.customer)),
    referencia: [],
    metadatos,
    resumen: [],
    lineas,
    secciones: [],
    totales,
    notas: null,
    terminos: texto(cot.terms_conditions),
    firma: 'aceptacion',
    pieLegal: {
      textos: textoLegal(base, 'cotizacion', t),
      resolucion: null,
      codigoUnico: null,
      qr: enlaceSeguro ? { contenido: enlaceSeguro, leyenda: 'enlacePago' } : null,
    },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'cotizacion', cot.number),
  };
}
