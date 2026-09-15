/// <reference types="jest" />
/**
 * F13 — modelo puro de la página de comisiones: query del filtro, enlace al
 * origen, qué acciones admite una selección y etiquetas de estado.
 */
import {
  actionsForSelection,
  buildCommissionsQuery,
  describeSelection,
  emptyFilters,
  sourceHref,
  statusPresentation,
} from '../comisionesModel';

const row = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  source_type: 'invoice_sale',
  source_id: 'inv-1',
  payee_name: 'Ana',
  commission_amount: 100,
  currency: 'COP',
  metadata: null,
  ...extra,
});

describe('buildCommissionsQuery', () => {
  it('omite `all` y vacíos; conserva from/to como días calendario', () => {
    expect(buildCommissionsQuery({ ...emptyFilters(), status: 'paid', payee_id: 'u-1', from: '2026-09-01', to: '2026-09-30', search: ' ana ' })).toBe(
      'status=paid&payee_id=u-1&from=2026-09-01&to=2026-09-30&search=ana'
    );
    expect(buildCommissionsQuery(emptyFilters())).toBe('');
  });
});

describe('sourceHref', () => {
  it('factura de venta, factura de compra, oportunidad y venta POS enlazan a su pantalla; sin id → null', () => {
    expect(sourceHref({ source_type: 'invoice_sale', source_id: 'inv-1' })).toBe('/app/finanzas/facturas-venta/inv-1');
    expect(sourceHref({ source_type: 'invoice_purchase', source_id: 'pc-1' })).toBe('/app/finanzas/facturas-compra/pc-1');
    expect(sourceHref({ source_type: 'opportunity', source_id: 'op-1' })).toBe('/app/crm/oportunidades/op-1');
    expect(sourceHref({ source_type: 'sale', source_id: 's-1' })).toBe('/app/pos/ventas/s-1');
    expect(sourceHref({ source_type: 'invoice_sale', source_id: '' })).toBeNull();
  });
});

describe('actionsForSelection', () => {
  it('todas accrued → pagar y rechazar; todas paid → clawback; mezcla → nada', () => {
    expect(actionsForSelection([row('a', 'accrued'), row('b', 'accrued')])).toEqual({ pay: true, reject: true, clawback: false });
    expect(actionsForSelection([row('a', 'paid')])).toEqual({ pay: false, reject: false, clawback: true });
    expect(actionsForSelection([row('a', 'paid'), row('b', 'accrued')])).toEqual({ pay: false, reject: false, clawback: false });
    expect(actionsForSelection([row('a', 'cancelled')])).toEqual({ pay: false, reject: false, clawback: false });
    expect(actionsForSelection([])).toEqual({ pay: false, reject: false, clawback: false });
  });
});

describe('describeSelection', () => {
  it('nombra importe total y vendedor (o «N vendedores») para el diálogo destructivo', () => {
    expect(describeSelection([row('a', 'paid', { commission_amount: 250, payee_name: 'Beto' })], 'COP')).toMatchObject({ count: 1, total: 250, payee: 'Beto' });
    const d = describeSelection([row('a', 'accrued', { payee_name: 'Ana' }), row('b', 'accrued', { payee_name: 'Beto', commission_amount: 50 })], 'COP');
    expect(d).toMatchObject({ count: 2, total: 150, payee: '2 vendedores' });
    expect(d.totalLabel).toMatch(/150/);
  });
});

describe('statusPresentation', () => {
  it('cancelada distingue rechazada y clawback; todo estado lleva texto', () => {
    expect(statusPresentation({ status: 'cancelled', metadata: { reason: 'clawback' } }).label).toBe('Clawback');
    expect(statusPresentation({ status: 'cancelled', metadata: { reason: 'rejected' } }).label).toBe('Rechazada');
    expect(statusPresentation({ status: 'cancelled', metadata: null }).label).toBe('Cancelada');
    expect(statusPresentation({ status: 'accrued', metadata: null }).label).toBe('Pendiente');
    expect(statusPresentation({ status: 'paid', metadata: null }).label).toBe('Pagada');
  });
});
