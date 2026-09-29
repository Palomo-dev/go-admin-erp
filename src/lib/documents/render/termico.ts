/**
 * Rollo de 80 mm del motor de documentos.
 *
 * - Factura de venta: es el ticket de venta de siempre. Se arma el payload de
 *   `@printing` (`buildSaleTicketHTML`, la fuente única que comparte el ERP con
 *   el agente de escritorio) y NO se duplica la plantilla. Como esa plantilla
 *   interpola sin escapar (salvo la nota de línea), los textos se escapan aquí
 *   antes de entregárselos.
 * - Recibo de caja, comprobante de egreso, cierre y arqueo de caja: no tienen
 *   plantilla en `@printing`; se pintan con la misma especificación de papel
 *   (`getPaperSpec('80mm')`: 72,06 mm imprimibles) y las mismas reglas
 *   térmicas (negro puro, nada por debajo de 10 px).
 */

import { buildSaleTicketHTML, getPaperSpec, type SaleTicketPrintPayload } from '@printing';
import { escaparHtml as e, dataUriImagenSeguro } from '../escape';
import { crearFormateador } from '../formato';
import type { Traductor } from '../textos';
import type { DocumentoPayload } from '../tipos';
import { htmlDeValor, nitEmisor, nombresResponsabilidades, numeroDocumentoLegible, siglaDocumento, textoDeCelda, textoDeTotal, titulo } from './comun';

const PAPEL = getPaperSpec('80mm');

/** Ticket de venta de `@printing` a partir del payload del motor (textos escapados). */
export function payloadTicketVenta(doc: DocumentoPayload, t: Traductor): SaleTicketPrintPayload {
  const em = doc.emisor;
  const total = doc.totales.find((f) => f.clave === 'total')?.valor ?? 0;
  const subtotal = doc.totales.find((f) => f.clave === 'subtotal')?.valor ?? undefined;
  const impuestos = doc.totales.find((f) => f.clave === 'impuestos' || f.clave === 'impuestoNombrado');
  const descuentos = doc.totales.find((f) => f.clave === 'descuentos')?.valor ?? undefined;
  const saldo = doc.totales.find((f) => f.clave === 'saldoPendiente')?.valor ?? undefined;
  const pagos = doc.secciones.find((s) => s.titulo === 'pagos');
  const fecha = doc.metadatos.find((c) => c.clave === 'fechaEmision')?.valor;
  const creado = fecha && (fecha.tipo === 'instante' || fecha.tipo === 'instanteHora') && fecha.v ? fecha.v : doc.generadoEn;
  const c = doc.contraparte;
  return {
    saleId: e(doc.numero ?? ''),
    saleNumber: doc.numero ? e(doc.numero) : undefined,
    title: e(`${titulo(doc, t)}`.toUpperCase()),
    createdAt: creado,
    timezone: doc.zonaHoraria,
    currency: doc.moneda.code,
    locale: doc.moneda.locale,
    currencyDecimals: doc.moneda.decimals,
    customerName: c ? e(c.nombre) : undefined,
    // Sin número no hay tipo: nada de un «CC» suelto en el ticket.
    customerDocType: c?.numeroDocumento && c.tipoDocumento ? e(siglaDocumento(c.tipoDocumento, t)) : undefined,
    customerDocNumber: c?.numeroDocumento ? e(numeroDocumentoLegible(c.tipoDocumento, c.numeroDocumento, c.dv) ?? '') : undefined,
    customerPhone: c?.telefono ? e(c.telefono) : undefined,
    customerAddress: c?.direccion ? e(c.direccion) : undefined,
    customerFiscalResponsibilities: c ? nombresResponsabilidades(c.responsabilidades, t).map((r) => e(r)) : null,
    items: (doc.lineas ?? []).map((l) => ({
      productName: e(l.descripcion),
      quantity: l.cantidad,
      unit: l.unidad ?? null,
      qtyDecimals: l.decimalesCantidad ?? null,
      unitPrice: l.precioUnitario,
      total: l.total,
      discountAmount: l.descuento > 0 ? l.descuento : undefined,
      // `@printing` escapa la nota por su cuenta: va cruda para no escaparla dos veces.
      note: l.nota,
    })),
    subtotal: subtotal ?? undefined,
    taxTotal: impuestos?.valor ?? undefined,
    taxLines: impuestos && impuestos.clave === 'impuestoNombrado' && impuestos.valor
      ? [{ name: e(String(impuestos.vars?.nombre ?? '')), amount: impuestos.valor }]
      : null,
    discountTotal: descuentos ?? undefined,
    total,
    payments: pagos
      ? pagos.filas.map((fila) => ({ method: e(String(fila[1] ?? '')), methodName: e(String(fila[1] ?? '')), amount: Number(fila[3]) || 0 }))
      : undefined,
    balance: saldo ?? undefined,
    businessName: e(em.nombre),
    businessNit: em.nit ? e(nitEmisor(em.nit, em.dv) ?? '') : undefined,
    businessPhone: em.telefono ? e(em.telefono) : undefined,
    businessAddress: em.direccion ? e(em.direccion) : undefined,
    businessEmail: em.email ? e(em.email) : undefined,
    businessCity: em.ciudad ? e(em.ciudad) : undefined,
    businessFiscalResponsibilities: nombresResponsabilidades(em.responsabilidades, t).map((r) => e(r)),
    businessLogoUrl: dataUriImagenSeguro(em.logoDataUri) ?? undefined,
    branchName: doc.sucursal ? e(doc.sucursal.nombre) : undefined,
    branchAddress: doc.sucursal?.direccion ? e(doc.sucursal.direccion) : undefined,
    branchPhone: doc.sucursal?.telefono ? e(doc.sucursal.telefono) : undefined,
  };
}

function estilosTermicos(): string {
  return `
@page { size: ${PAPEL.printableMm}mm auto; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ${PAPEL.cssPx}px; font-family: 'Courier New', Consolas, monospace; font-size: 12px; line-height: 1.35; color: #000; background: #fff; padding: 4px 2px; }
.centro { text-align: center; }
.logo { max-height: 90px; max-width: 100%; filter: grayscale(100%) contrast(140%); display: block; margin: 0 auto 4px; }
.nombre { font-size: 15px; font-weight: 700; }
.dato { font-size: 11px; }
.banner { margin: 6px 0; padding: 3px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; text-align: center; font-weight: 700; font-size: 13px; }
.fila { display: flex; justify-content: space-between; gap: 6px; }
.fila span:last-child { text-align: right; }
.separador { border-top: 1px dashed #000; margin: 5px 0; }
.titulo-seccion { font-weight: 700; margin-top: 6px; text-transform: uppercase; font-size: 11px; }
.total { font-weight: 700; font-size: 14px; }
.nota { font-size: 11px; white-space: pre-wrap; }
.firma { margin-top: 28px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 2px; }
.pie { margin-top: 8px; font-size: 10px; text-align: center; }
`;
}

/** HTML de 80 mm para los comprobantes de caja (recibo, egreso, cierre, arqueo). */
export function renderizarTermico(doc: DocumentoPayload, t: Traductor, opciones: { imprimir?: boolean; nonce?: string } = {}): string {
  const script = opciones.imprimir && opciones.nonce
    ? `<script nonce="${e(opciones.nonce)}">window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>`
    : '';
  if (doc.tipo === 'factura-venta') {
    return buildSaleTicketHTML(payloadTicketVenta(doc, t), PAPEL).replace('</head>', `${script}</head>`);
  }

  const f = crearFormateador({ moneda: doc.moneda, zonaHoraria: doc.zonaHoraria, idioma: doc.idioma });
  const em = doc.emisor;
  const logo = dataUriImagenSeguro(em.logoDataUri);
  const nit = nitEmisor(em.nit, em.dv);
  const fila = (rotulo: string, valor: string) => `<div class="fila"><span>${e(rotulo)}</span><span>${valor}</span></div>`;

  const partesHtml: string[] = [];
  partesHtml.push(`<div class="centro">
    ${logo ? `<img class="logo" src="${e(logo)}" alt="" />` : ''}
    <div class="nombre">${e(em.nombre)}</div>
    ${nit ? `<div class="dato">${e(t('emisor.nit', { nit }))}</div>` : ''}
    ${em.direccion ? `<div class="dato">${e(em.direccion)}</div>` : ''}
    ${em.telefono ? `<div class="dato">${e(em.telefono)}</div>` : ''}
    ${doc.sucursal ? `<div class="dato">${e(t('partes.sucursal'))}: ${e(doc.sucursal.nombre)}</div>` : ''}
  </div>`);
  partesHtml.push(`<div class="banner">${e(titulo(doc, t).toUpperCase())}${doc.numero ? `<br/>${e(doc.numero)}` : ''}</div>`);
  if (doc.estado) partesHtml.push(fila(t('campos.estado'), e(t(`estados.${doc.estado.codigo}`))));
  for (const b of doc.bandas) partesHtml.push(`<div class="nota">${e(t(`bandas.${b.clave}`, b.vars))}</div>`);
  for (const c of [...doc.metadatos, ...doc.referencia]) partesHtml.push(fila(t(`campos.${c.clave}`), htmlDeValor(c.valor, f, t)));
  if (doc.contraparte) {
    const c = doc.contraparte;
    partesHtml.push(`<div class="separador"></div>`);
    partesHtml.push(fila(t(`partes.${c.rol}`), e(c.nombre)));
    if (c.numeroDocumento) {
      partesHtml.push(fila(c.tipoDocumento ? siglaDocumento(c.tipoDocumento, t) : t('partes.documento'), e(numeroDocumentoLegible(c.tipoDocumento, c.numeroDocumento, c.dv) ?? '')));
    }
  }
  if (doc.resumen.length > 0) {
    partesHtml.push(`<div class="separador"></div>`);
    for (const c of doc.resumen) partesHtml.push(fila(t(`campos.${c.clave}`), htmlDeValor(c.valor, f, t)));
  }
  for (const s of doc.secciones) {
    if (s.filas.length === 0) continue;
    partesHtml.push(`<div class="titulo-seccion">${e(t(`secciones.${s.titulo}`))}</div>`);
    for (const filaTabla of s.filas) {
      const textos = s.columnas.map((col, i) => textoDeCelda(col, filaTabla[i] ?? null, f, t)).filter(Boolean);
      const ultimo = textos.pop() ?? '';
      partesHtml.push(fila(textos.join(' · '), e(ultimo)));
    }
  }
  if (doc.totales.length > 0) {
    partesHtml.push(`<div class="separador"></div>`);
    for (const total of doc.totales) {
      const html = `<div class="fila${total.estilo === 'total' ? ' total' : ''}"><span>${e(t(`totales.${total.clave}`, total.vars))}</span><span>${e(textoDeTotal(total, f))}</span></div>`;
      partesHtml.push(html);
    }
  }
  if (doc.notas) partesHtml.push(`<div class="separador"></div><div class="nota">${e(doc.notas)}</div>`);
  if (doc.firma === 'cajeroSupervisor') {
    partesHtml.push(`<div class="firma">${e(t('firmas.cajero'))}</div><div class="firma">${e(t('firmas.supervisor'))}</div>`);
  } else if (doc.firma) {
    partesHtml.push(`<div class="firma">${e(t(doc.firma === 'entregaRecibe' ? 'firmas.recibe' : 'firmas.recibido'))}</div>`);
  }
  const pie = [...doc.pieLegal.textos.map((x) => e(x)), e(t('legal.generado', { fecha: f.instanteHora(doc.generadoEn) }))];
  partesHtml.push(`<div class="pie">${pie.map((p) => `<div>${p}</div>`).join('')}</div>`);

  return `<!DOCTYPE html>
<html lang="${e(doc.idioma)}">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<title>${e([titulo(doc, t), doc.numero].filter(Boolean).join(' '))}</title>
<style>${estilosTermicos()}</style>
${script}
</head>
<body>
${partesHtml.join('\n')}
</body>
</html>`;
}
