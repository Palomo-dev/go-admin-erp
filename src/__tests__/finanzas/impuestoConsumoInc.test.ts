/**
 * Impuesto nacional al consumo (INC 8 %, tributo DIAN 04) — rótulos y alta.
 *
 * Una organización cuyas ventas llevan INC (org 204, un restaurante) no puede
 * ver «IVA» en documentos, pantalla del cliente ni en el asistente: el INC no
 * es IVA, no es descontable y se declara en otro formulario. Estos tests fijan
 * los rótulos neutros («Impuesto», «Impuestos») y que el alta de organización
 * ofrezca INC 8 % como tarifa por defecto elegida por el usuario.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFService, type InvoiceDataForPDF } from '@/lib/services/pdfService';
import {
  OPCIONES_TARIFA_POR_DEFECTO,
  parseCodigoTarifaPorDefecto,
} from '@/lib/services/defaultTaxService';
import { mapTaxCode } from '@/lib/services/factusService';

const raiz = path.resolve(__dirname, '../../..');
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const mensajes = (idioma: string) => JSON.parse(leer(`messages/${idioma}.json`));

const facturaInc: InvoiceDataForPDF = {
  id: 'f-inc',
  number: 'FV-INC-1',
  issue_date: '2026-10-05',
  due_date: '2026-10-05',
  status: 'issued',
  currency: 'COP',
  subtotal: 100000,
  tax_total: 8000,
  total: 108000,
  balance: 108000,
  items: [{ description: 'Bandeja del día', qty: 1, unit_price: 100000, tax_rate: 8, total_line: 100000 }],
};

describe('documentos PDF: el impuesto se rotula sin decir «IVA»', () => {
  it('factura de venta: columna «Impuesto» y total «Impuestos»', () => {
    const html = PDFService.generateInvoiceHTML(facturaInc);
    expect(html).not.toMatch(/>\s*IVA\s*</);
    expect(html).toContain('>Impuesto</th>');
    expect(html).toContain('<span>Impuestos</span>');
  });

  it('factura de compra: columna «Impuesto» y total «Impuestos»', () => {
    const html = PDFService.generatePurchaseInvoiceHTML(facturaInc);
    expect(html).not.toMatch(/>\s*IVA\s*</);
    expect(html).toContain('>Impuesto</th>');
    expect(html).toContain('<span>Impuestos</span>');
  });
});

describe('factura electrónica: INC va como tributo 04, nunca como IVA (01)', () => {
  it.each([
    ['INC_8', '04'],
    ['inc_8', '04'],
    ['IVA_19', '01'],
    ['IVA_5', '01'],
  ])('%s → %s', (codigo, esperado) => {
    expect(mapTaxCode(codigo)).toBe(esperado);
  });
});

describe('alta de organización: INC 8 % como tarifa por defecto', () => {
  it('se ofrece y se acepta INC_8', () => {
    expect(OPCIONES_TARIFA_POR_DEFECTO.map((o) => o.value)).toContain('INC_8');
    expect(parseCodigoTarifaPorDefecto('INC_8')).toBe('INC_8');
  });

  it.each(['es', 'en', 'pt', 'fr'])('cada opción tiene rótulo en «%s»', (idioma) => {
    const m = mensajes(idioma);
    for (const o of OPCIONES_TARIFA_POR_DEFECTO) {
      expect(typeof m.acceso.alta.tarifas[o.value]).toBe('string');
      expect(m.acceso.alta.tarifas[o.value].length).toBeGreaterThan(0);
    }
  });
});

describe('pantalla del cliente y asistente: rótulos neutros', () => {
  it('es: «Impuestos incluidos» y «sin impuesto», nunca «IVA»', () => {
    const es = mensajes('es');
    expect(es.posDisplay.taxIncluded).not.toMatch(/IVA/);
    expect(es.posDisplay.taxExcludedLine).not.toMatch(/IVA/);
    expect(es.posCustomerDisplay.presentation.taxBreakdownHint).not.toMatch(/IVA/);
  });

  it('fr: «Taxes incluses» en vez de «TVA incluse»', () => {
    expect(mensajes('fr').posDisplay.taxIncluded).not.toMatch(/TVA/);
  });

  it('el asistente no rotula «IVA» los totales ni las líneas de las facturas', () => {
    const fuente = leer('src/lib/ai/agent/tools/facturas.ts');
    expect(fuente).not.toMatch(/\bIVA:\s*formatMoney/);
    expect(fuente).not.toMatch(/\+IVA \$\{/);
    expect(fuente).not.toMatch(/Ninguna línea lleva IVA/);
  });

  it('el detalle de la cotización rotula la columna «Impuesto»', () => {
    const fuente = leer('src/components/finanzas/cotizaciones/id/DetalleCotizacion.tsx');
    expect(fuente).not.toMatch(/<TableHead[^>]*>IVA<\/TableHead>/);
  });
});
