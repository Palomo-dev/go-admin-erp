/**
 * Etiquetas de producto en la impresora de la estación (job_type
 * 'product_label'). Bloque de etiqueta del motor de impresión
 * (DOCUMENTOS-PDF.md §5): no es un motor nuevo, usa el mismo PaperSpec y el
 * mismo `device` ESC/POS que los tickets.
 *
 * El POS/ERP manda las etiquetas ya resueltas: textos, precios formateados
 * con la moneda de la organización y, para el camino HTML, el SVG de las
 * barras ya dibujado (JsBarcode en el navegador). Aquí no se formatea dinero
 * ni se calcula nada: solo se maqueta.
 *
 * - ESC/POS (red, USB, Bluetooth, spooler RAW): el código de barras sale con
 *   el comando nativo de la impresora (GS k), EAN-13/EAN-8 o Code128.
 * - HTML (impresora del sistema): una etiqueta por página, SVG incluido.
 * - Texto plano: último recurso, el número en claro.
 *
 * TypeScript puro (se compila con el agente y con Next.js).
 */
import type { PaperSpec } from './paper';

export type ProductLabelBarcodeFormat = 'EAN13' | 'EAN8' | 'CODE128';

export interface ProductLabelItem {
  name: string;
  variant?: string | null;
  price?: string | null;
  comparePrice?: string | null;
  sku?: string | null;
  barcode?: string | null;
  barcodeFormat?: ProductLabelBarcodeFormat | null;
  /** SVG de las barras (solo lo usa el camino HTML). */
  barcodeSvg?: string | null;
  /** Copias de esta etiqueta. */
  copies: number;
}

export interface ProductLabelFields {
  name: boolean;
  variant: boolean;
  price: boolean;
  comparePrice: boolean;
  sku: boolean;
  barcode: boolean;
}

export interface ProductLabelsPrintPayload {
  labels: ProductLabelItem[];
  fields: ProductLabelFields;
  /** Rótulo del precio de comparación en ESC/POS, sin tachado («Antes»), ya traducido. */
  compareLabel?: string;
}

/** Tope de copias por trabajo: una estación no es una imprenta. */
export const MAX_PRODUCT_LABEL_COPIES = 2000;

function* expand(payload: ProductLabelsPrintPayload): Generator<ProductLabelItem> {
  let total = 0;
  for (const item of payload.labels ?? []) {
    const n = Math.max(0, Math.floor(Number(item.copies) || 0));
    for (let i = 0; i < n; i++) {
      if (total++ >= MAX_PRODUCT_LABEL_COPIES) return;
      yield item;
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Solo se acepta un <svg> simple (lo genera el ERP); cualquier otra cosa se descarta. */
function safeSvg(svg: string | null | undefined): string {
  if (!svg) return '';
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || /<script|on\w+=|javascript:|<foreignObject/i.test(s)) return '';
  return s;
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

/** ESC/POS: una etiqueta tras otra, separadas por una línea de corte. */
export function printProductLabels(device: any, payload: ProductLabelsPrintPayload, paper: PaperSpec): void {
  const f = payload.fields;
  const chars = paper.charsPerLine;
  let first = true;
  for (const item of expand(payload)) {
    if (!first) device.align('ct').text('- '.repeat(Math.floor(chars / 2)).trimEnd());
    first = false;
    device.font('a').align('ct');
    if (f.name && item.name) device.style('b').text(cut(item.name, chars * 2)).style('normal');
    if (f.variant && item.variant) device.text(cut(item.variant, chars));
    if (f.barcode && item.barcode) {
      const code = item.barcode;
      const format = item.barcodeFormat ?? 'CODE128';
      try {
        if (format === 'EAN13' && /^\d{13}$/.test(code)) {
          device.barcode(code.slice(0, 12), 'EAN13', { width: 2, height: 60, position: 'BLW', font: 'A' });
        } else if (format === 'EAN8' && /^\d{8}$/.test(code)) {
          device.barcode(code.slice(0, 7), 'EAN8', { width: 2, height: 60, position: 'BLW', font: 'A' });
        } else {
          // Code128 juego B: el prefijo «{B» selecciona el juego en GS k 73.
          device.barcode(`{B${code}`, 'CODE128', { width: 2, height: 60, position: 'BLW', font: 'A', includeParity: false });
        }
      } catch {
        device.text(code);
      }
    }
    const left = f.sku && item.sku ? item.sku : '';
    const price = f.price && item.price ? item.price : '';
    const compare = f.comparePrice && item.comparePrice ? item.comparePrice : '';
    if (compare) device.text(`${payload.compareLabel ?? ''} ${compare}`.trim());
    if (price) device.style('b').size(1, 1).text(price).size(0, 0).style('normal');
    if (left) device.text(cut(left, chars));
  }
  device.feed(3).cut();
}

/** Texto plano (spooler sin ESC/POS). */
export function buildPlainTextProductLabels(payload: ProductLabelsPrintPayload, paper: PaperSpec): string {
  const f = payload.fields;
  const chars = paper.charsPerLine;
  const lines: string[] = [];
  for (const item of expand(payload)) {
    if (lines.length) lines.push('-'.repeat(chars));
    if (f.name) lines.push(cut(item.name, chars));
    if (f.variant && item.variant) lines.push(cut(item.variant, chars));
    if (f.barcode && item.barcode) lines.push(item.barcode);
    if (f.price && item.price) lines.push(item.price);
    if (f.sku && item.sku) lines.push(cut(item.sku, chars));
  }
  return `${lines.join('\n')}\n\n\n`;
}

/** HTML (impresora del sistema): una etiqueta por página del ancho imprimible. */
export function buildProductLabelsHTML(payload: ProductLabelsPrintPayload, paper: PaperSpec): string {
  const f = payload.fields;
  const blocks: string[] = [];
  for (const item of expand(payload)) {
    const svg = f.barcode ? safeSvg(item.barcodeSvg) : '';
    blocks.push(
      [
        '<section class="label">',
        f.name ? `<div class="name">${escapeHtml(item.name)}</div>` : '',
        f.variant && item.variant ? `<div class="variant">${escapeHtml(item.variant)}</div>` : '',
        svg ? `<div class="bars">${svg}</div>` : '',
        f.barcode && item.barcode ? `<div class="code">${escapeHtml(item.barcode)}</div>` : '',
        '<div class="foot">',
        `<span class="sku">${f.sku && item.sku ? escapeHtml(item.sku) : ''}</span>`,
        '<span class="price">',
        f.comparePrice && item.comparePrice ? `<s>${escapeHtml(item.comparePrice)}</s> ` : '',
        f.price && item.price ? `<b>${escapeHtml(item.price)}</b>` : '',
        '</span></div></section>',
      ].join(''),
    );
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
@page { size: ${paper.printableMm}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: ${paper.printableMm}mm; }
.label { padding: 2mm 2.5mm; page-break-after: always; break-after: page; }
.label:last-child { page-break-after: auto; break-after: auto; }
.name { font-weight: 700; font-size: 11pt; line-height: 1.15; }
.variant { font-size: 8.5pt; color: #333; margin-top: 0.5mm; }
.bars { margin-top: 1.5mm; height: 14mm; }
.bars svg { width: 100%; height: 100%; display: block; }
.code { font-family: monospace; font-size: 8pt; text-align: center; letter-spacing: 0.08em; }
.foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1mm; }
.sku { font-family: monospace; font-size: 7.5pt; color: #333; }
.price b { font-size: 13pt; }
.price s { font-size: 8pt; color: #555; }
</style></head><body>${blocks.join('')}</body></html>`;
}
