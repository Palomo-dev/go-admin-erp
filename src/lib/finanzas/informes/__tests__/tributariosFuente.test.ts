import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarFuenteTributaria, lineaIvaDesdeSnapshot } from '@/lib/services/finanzas/tributariosFuente.server';
import type { MovimientoTributario } from '../tributarios';

type Fila = Record<string, unknown>;
function dbFalsa(tablas: Record<string, Fila[]>) {
  const consultas: { tabla: string; filtros: Record<string, unknown> }[] = [];
  const db = { from: (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    const condiciones: ((fila: Fila) => boolean)[] = [];
    const q = {
      select: () => q,
      order: () => q,
      in: (columna: string, ids: unknown[]) => { condiciones.push((f) => ids.includes(f[columna])); return q; },
      eq: (columna: string, v: unknown) => { filtros[columna] = v; condiciones.push((f) => f[columna] === v); return q; },
      range: async (desde: number, hasta: number) => {
        consultas.push({ tabla, filtros: { ...filtros } });
        return { data: (tablas[tabla] ?? []).filter((f) => condiciones.every((c) => c(f))).slice(desde, hasta + 1), error: null };
      },
    };
    return q;
  } } as unknown as SupabaseClient;
  return { db, consultas };
}
const mov = (extra: Partial<MovimientoTributario> = {}): MovimientoTributario => ({ id: 'm1', entry_id: 'e1', entry_date: '2026-02-15', account_code: '240805', debit: 0, credit: 190, posted: true, currency_code: 'COP', source: 'invoice_sales', source_id: 'f1', tercero_nit: '900', ...extra });
const item = (extra: Fila = {}): Fila => ({ id: 'i1', invoice_id: 'f1', invoice_sales_id: 'f1', invoice_purchase_id: null, invoice_type: 'sale', qty: 1, unit_price: 1000, discount_amount: 0, tax_rate: 19, tax_code: 'IVA19', tax_included: false, total_line: 1190, is_excluded: false, ...extra });

describe('Snapshots y cargador tributario con alcance de la sesión', () => {
  it.each(['USD', null])('una base %p no genera snapshots tributarios en pesos ni consulta documentos', async (monedaBase) => {
    const { db, consultas } = dbFalsa({ invoice_sales: [{ id: 'f1', organization_id: 1, currency: 'USD' }], invoice_items: [item()] });
    const resultado = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase }, [mov()]);
    expect(resultado).toMatchObject({ lineasIva: [], retenciones: [], nomina: [] });
    expect(resultado.pendientesFuente.join(' ')).toMatch(/moneda.*(tributaria|verificada)/i);
    expect(consultas).toEqual([]);
  });

  it.each(['USD', null])('omite snapshot de factura con moneda %p cuando no hay conversión histórica por línea', async (currency) => {
    const { db } = dbFalsa({ invoice_sales: [{ id: 'f1', organization_id: 1, branch_id: 1, currency, tax_included: false }], invoice_items: [item()] });
    const resultado = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov()]);
    expect(resultado.lineasIva).toEqual([]);
    expect(resultado.pendientesFuente.join(' ')).toContain('sin conversión histórica');
  });

  it('omite POS cuyo snapshot pertenece a moneda distinta de los importes base', async () => {
    const { db } = dbFalsa({ sales: [{ id: 's1', organization_id: 1, branch_id: 1, tax_breakdown: [{ name: 'IVA', rate: 19 }] }], sale_items: [{ id: 'si', sale_id: 's1', quantity: 1, unit_price: 1000, discount_amount: 0, tax_rate: 19, tax_amount: 190, tax_included: false }] });
    const resultado = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov({ source: 'sales', source_id: 's1', currency_code: 'USD' })]);
    expect(resultado.lineasIva).toEqual([]);
    expect(resultado.pendientesFuente.join(' ')).toContain('Venta POS s1: moneda histórica');
  });
  it('reusa el cálculo de factura, conserva IVA incluido y separa INC', () => {
    const r = lineaIvaDesdeSnapshot(item({ unit_price: 1270, tax_included: true, total_line: 1270, impuestos_linea: [{ codigo: 'IVA19', nombre: 'IVA', tarifa: 19 }, { codigo: 'INC8', nombre: 'Consumo', tarifa: 8 }] }), { id: 'f1' }, 'venta', '2026-02-15', '900');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ base: 1000, iva: 190, tarifa: 19 });
  });

  it('rechaza total histórico que no cuadra, en lugar de inventar base', () => {
    const r = lineaIvaDesdeSnapshot(item({ total_line: 9999 }), { id: 'f1' }, 'venta', '2026-02-15', '900');
    expect(r.lineas).toHaveLength(0);
    expect(r.avisos[0]).toContain('difiere del snapshot');
  });

  it('distingue explícitamente exento/excluido y no usa el impuesto actual del producto', () => {
    const a = lineaIvaDesdeSnapshot(item({ tax_rate: 0, tax_code: 'IVA_EXENTO', total_line: 1000 }), { id: 'f1' }, 'venta', '2026-02-15', '900');
    const b = lineaIvaDesdeSnapshot(item({ tax_rate: 0, tax_code: '', is_excluded: true, total_line: 1000 }), { id: 'f1' }, 'venta', '2026-02-15', '900');
    expect(a.lineas[0].tratamiento).toBe('exento');
    expect(b.lineas[0].tratamiento).toBe('excluido');
  });

  it('carga solo facturas de la organización aun si un source_id apunta a otra', async () => {
    const { db, consultas } = dbFalsa({ invoice_sales: [{ id: 'f1', organization_id: 2, branch_id: 1, currency: 'COP' }], invoice_items: [item()] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov()]);
    expect(r.lineasIva).toHaveLength(0);
    expect(consultas.find((c) => c.tabla === 'invoice_sales')?.filtros.organization_id).toBe(1);
    expect(consultas.some((c) => c.tabla === 'invoice_items')).toBe(false);
  });

  it('deduplica hijos leídos por FK nueva y por invoice_id legado', async () => {
    const { db } = dbFalsa({ invoice_sales: [{ id: 'f1', organization_id: 1, branch_id: 1, currency: 'COP', document_type: 'invoice', tax_included: false }], invoice_items: [item()] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov()]);
    expect(r.lineasIva).toHaveLength(1);
    expect(r.lineasIva[0]).toMatchObject({ fecha: '2026-02-15', iva: 190, base: 1000 });
  });

  it('toma el auxiliar histórico de la retención y no convierte un pago de impuesto en retención negativa', async () => {
    const { db } = dbFalsa({ invoice_purchase: [{ id: 'c1', organization_id: 1, branch_id: 1, currency: 'COP' }], invoice_purchase_withholdings: [{ id: 'r1', organization_id: 1, invoice_id: 'c1', concept: 'Servicios', base: 1000, rate: 4, amount: 40 }] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov({ id: 'ret', source: 'invoice_purchase', source_id: 'c1', account_code: '23652577', credit: 40 }), mov({ id: 'pago', source: 'bank_movements', source_id: 'b1', account_code: '23652577', debit: 100, credit: 0 })]);
    expect(r.retenciones).toHaveLength(1);
    expect(r.retenciones[0]).toMatchObject({ cuenta: '23652577', base: 1000, tarifa: 4, valor: 40 });
  });

  it('no presenta base o tarifa de compra si el auxiliar histórico es ambiguo', async () => {
    const { db } = dbFalsa({ invoice_purchase: [{ id: 'c1', organization_id: 1, branch_id: 1, currency: 'COP' }], invoice_purchase_withholdings: [{ id: 'r1', organization_id: 1, invoice_id: 'c1', concept: 'Servicios', base: 1000, rate: 4, amount: 40 }] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov({ id: 'r1', source: 'invoice_purchase', source_id: 'c1', account_code: '236505', credit: 40 }), mov({ id: 'r2', source: 'invoice_purchase', source_id: 'c1', account_code: '236525', credit: 40 })]);
    expect(r.pendientesFuente.join(' ')).toContain('no se identifica un auxiliar histórico único');
    expect(r.retenciones.every((f) => f.base === null && f.tarifa === null)).toBe(true);
  });

  it('reconoce nómina con source_id uuid:created y evita volver a devengar al pagar', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const { db } = dbFalsa({ payroll_slips: [{ id, payroll_run_id: 'run1', employment_id: 'emp1', gross_pay: 2000000, tax_withholding: 10000, currency_code: 'COP' }], payroll_runs: [{ id: 'run1', payroll_period_id: 'per1', superseded_by: null }], payroll_periods: [{ id: 'per1', organization_id: 1 }], employments: [{ id: 'emp1', employment_type: 'employee', contract_type: 'indefinite' }] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov({ id: 'n1', source: 'payroll_slips', source_id: `${id}:created`, account_code: '5105', debit: 2000000, credit: 0 }), mov({ id: 'n2', source: 'payroll_slips', source_id: `${id}:paid`, account_code: '2505', debit: 1990000, credit: 0 })]);
    expect(r.nomina).toHaveLength(1);
    expect(r.nomina[0]).toMatchObject({ empleado: true, devengado: 2000000, retencion: 10000, identificacion: '900' });
  });

  it('no carga nómina ajena aunque un asiento de la organización use su ID', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const { db, consultas } = dbFalsa({ payroll_slips: [{ id, payroll_run_id: 'run1', employment_id: 'emp1' }], payroll_runs: [{ id: 'run1', payroll_period_id: 'per2' }], payroll_periods: [{ id: 'per2', organization_id: 2 }] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP' }, [mov({ source: 'payroll_slips', source_id: `${id}:created` })]);
    expect(r.nomina).toHaveLength(0);
    expect(consultas.some((c) => c.tabla === 'employments')).toBe(false);
  });

  it('respeta centro de costo del snapshot y rechaza mezclar el POS sin centro', async () => {
    const { db } = dbFalsa({ invoice_sales: [{ id: 'f1', organization_id: 1, branch_id: 1, currency: 'COP' }], invoice_items: [item({ cost_center_id: 'otro' })], sales: [{ id: 's1', organization_id: 1, branch_id: 1, tax_breakdown: [{ name: 'IVA', rate: 19 }] }], sale_items: [{ id: 'si', sale_id: 's1', quantity: 1, unit_price: 1000, discount_amount: 0, tax_rate: 19, tax_amount: 190, tax_included: false }] });
    const r = await cargarFuenteTributaria(db, 1, { desde: '2026-01-01', hasta: '2026-12-31', monedaBase: 'COP', costCenterId: 'centro1' }, [mov(), mov({ source: 'sales', source_id: 's1' })]);
    expect(r.lineasIva).toHaveLength(0);
    expect(r.pendientesFuente.join(' ')).toContain('POS no guardan centro de costo');
  });
});
