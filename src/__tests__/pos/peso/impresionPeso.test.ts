/**
 * Tiquete y factura con líneas por peso (PRODUCTOS-POR-PESO-BASCULA.md fase 1):
 * «735 g x $ 18.900/kg» con el importe a la derecha; las líneas por unidad
 * siguen saliendo «3x Producto» y «c/u».
 */
import {
  buildSaleTicketHTML,
  buildPlainTextSaleTicket,
  buildPlainTextElectronicInvoice,
  buildPlainTextTicket,
  getPaperSpec,
  itemsSummary,
  linePriceDetail,
  moneyFormatter,
  type SaleTicketPrintPayload,
} from '@printing';

const venta: SaleTicketPrintPayload = {
  createdAt: '2026-09-29T15:00:00Z',
  timezone: 'America/Bogota',
  currency: 'COP',
  locale: 'es-CO',
  currencyDecimals: 0,
  items: [
    { productName: 'Queso campesino', quantity: 0.735, unit: 'kg', qtyDecimals: 3, unitPrice: 18900, total: 13891.5 },
    { productName: 'Gaseosa', quantity: 3, unitPrice: 2500, total: 7500 },
  ],
  subtotal: 21391.5,
  total: 21391.5,
  payments: [{ method: 'cash', amount: 21392 }],
} as unknown as SaleTicketPrintPayload;

describe('formateador de cantidad impreso', () => {
  const money = moneyFormatter({ currency: 'COP', locale: 'es-CO', currencyDecimals: 0 }, { symbol: true });

  test('detalle por peso y por unidad', () => {
    expect(linePriceDetail({ quantity: 0.735, unit: 'kg', qtyDecimals: 3, unitPrice: 18900 }, money)).toBe('735 g x $ 18.900/kg');
    expect(linePriceDetail({ quantity: 3, unitPrice: 2500 }, money)).toBe('$ 2.500 c/u');
  });

  test('resumen de ítems: sin peso como siempre; con peso por unidad de medida', () => {
    expect(itemsSummary([{ quantity: 2 }, { quantity: 3 }])).toBe('2 (5 unidades)');
    expect(itemsSummary(venta.items)).toBe('2 líneas · 3 unidades · 735 g');
    expect(itemsSummary([{ quantity: 0.5, unit: 'kg', qtyDecimals: 3 }, { quantity: 0.735, unit: 'kg', qtyDecimals: 3 }])).toBe('2 líneas · 1,235 kg');
  });
});

describe('tiquete 80 mm', () => {
  const papel = getPaperSpec('80mm');

  test('HTML: la línea por peso lleva «735 g x $ 18.900/kg» y el importe redondeado', () => {
    const html = buildSaleTicketHTML(venta, papel);
    expect(html).toContain('Queso campesino');
    expect(html).not.toContain('0.735x');
    expect(html).toContain('735 g x $ 18.900/kg');
    expect(html).toContain('$ 13.892');
    expect(html).toContain('3x Gaseosa');
    expect(html).toContain('$ 2.500 c/u');
    expect(html).not.toContain('unidades)');
  });

  test('texto plano (ESC/POS): mismo detalle, sin «0.735x»', () => {
    const txt = buildPlainTextSaleTicket(venta, papel);
    expect(txt).toContain('735 g x 18.900/kg');
    expect(txt).not.toContain('0.735x');
    expect(txt).toContain('3x  Gaseosa');
  });

  test('factura electrónica en texto: la cantidad decimal no se pierde', () => {
    const txt = buildPlainTextElectronicInvoice({ ...venta, cufe: 'x', environment: 'test' } as never, papel);
    expect(txt).toContain('735 g x 18.900/kg');
  });

  test('comanda: «500 g Carne»', () => {
    const txt = buildPlainTextTicket(
      { ticketId: 1, station: 'cocina', createdAt: '2026-09-29T15:00:00Z', items: [{ productName: 'Carne', quantity: 0.5, unit: 'kg', qtyDecimals: 3 }] },
      papel,
    );
    expect(txt).toContain('500 g Carne');
  });
});
