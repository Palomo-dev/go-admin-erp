import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarFuenteInformes, cargarAsientosSeleccionablesInformes } from '../informesFuente.server';
import { configuracionPredeterminada } from '@/lib/finanzas/informes/configuracion';
import { cargarConfiguracionInformes } from '../configuracionInformes.server';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

jest.mock('../configuracionInformes.server', () => ({ cargarConfiguracionInformes: jest.fn() }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn() }));
type Fila = Record<string, unknown>;
type Llamada = { tabla: string; metodo: string; argumentos: unknown[] };
const leer = (fila: Fila, campo: string): unknown => campo.split('.').reduce<unknown>((objeto, clave) => objeto && typeof objeto === 'object' ? (objeto as Fila)[clave] : undefined, fila);

function clientePrueba(tablas: Record<string, Fila[]>, anulaciones: Fila[] = [], errorRpc = false, ignorarFiltros = false) {
  const llamadas: Llamada[] = [];
  const from = (tabla: string) => {
    let filas = [...(tablas[tabla] ?? [])];
    const builder = {
      select(...args: unknown[]) { llamadas.push({ tabla, metodo: 'select', argumentos: args }); return builder; },
      eq(campo: string, valor: unknown) { llamadas.push({ tabla, metodo: 'eq', argumentos: [campo, valor] }); if (!ignorarFiltros) filas = filas.filter((f) => leer(f, campo) === valor); return builder; },
      gte(campo: string, valor: unknown) { llamadas.push({ tabla, metodo: 'gte', argumentos: [campo, valor] }); return builder; },
      lte(campo: string, valor: unknown) { llamadas.push({ tabla, metodo: 'lte', argumentos: [campo, valor] }); return builder; },
      in(campo: string, valores: unknown[]) { llamadas.push({ tabla, metodo: 'in', argumentos: [campo, valores] }); if (!ignorarFiltros) filas = filas.filter((f) => valores.includes(leer(f, campo))); return builder; },
      or(...args: unknown[]) { llamadas.push({ tabla, metodo: 'or', argumentos: args }); return builder; },
      order(...args: unknown[]) { llamadas.push({ tabla, metodo: 'order', argumentos: args }); return builder; },
      range(desde: number, hasta: number) { llamadas.push({ tabla, metodo: 'range', argumentos: [desde, hasta] }); filas = filas.slice(desde, hasta + 1); return builder; },
      single() { return Promise.resolve({ data: filas[0] ?? null, error: null }); },
      maybeSingle() { return Promise.resolve({ data: filas[0] ?? null, error: null }); },
      then<T>(resolver: (resultado: { data: Fila[]; error: null }) => T) { return Promise.resolve(resolver({ data: filas, error: null })); },
    };
    return builder;
  };
  const rpc = jest.fn().mockImplementation((nombre: string) => Promise.resolve(nombre === 'app_branch_access' ? { data: true, error: null } : { data: anulaciones, error: errorRpc ? { code: '42501' } : null }));
  return { cliente: { from, rpc } as unknown as SupabaseClient, llamadas, rpc };
}
const linea = (id = 1): Fila => ({ id, organization_id: 7, journal_entry_id: 2, account_code: '1105', description: null,
  debit: '900', credit: '0', debit_base: '100', credit_base: '0', currency_code: 'USD', cost_center_id: 'centro',
  tercero_nit: '900000000', tercero_nombre: 'Tercero de prueba', journal_entries: {
    id: 2, organization_id: 7, branch_id: 8, entry_date: '2026-01-01T02:00:00Z', memo: 'Asiento de prueba',
    posted: true, source: 'manual', source_id: null, currency_code: 'USD', base_currency_code: 'COP',
  } });
const tablas = (lineas: Fila[]) => ({
  organizations: [{ id: 7, name: 'Entidad de prueba', legal_name: 'Entidad de prueba', nit: '900000000', timezone: 'America/Bogota' }],
  journal_lines: lineas,
  branches: [{ id: 8, organization_id: 7 }],
  chart_of_accounts: [{ account_code: '1305-01', organization_id: 7, description: 'Auxiliar de prueba', concepto_exogena: '5015', type: 'asset' }],
  cost_centers: [{ id: 'centro', organization_id: 7, code: 'C1', name: 'Centro de prueba', branch_id: 8 }],
  products: [{ id: 1, organization_id: 7, name: 'Producto de prueba', category_id: 2 }],
  categories: [{ id: 2, organization_id: 7, name: 'Línea de prueba' }],
});
const filtros = { desde: '2026-01-01', hasta: '2026-12-31' };

beforeEach(() => {
  jest.mocked(resolveOrgCurrency).mockResolvedValue({ code: 'COP', decimals: 0, symbol: '$', source: 'base' });
  jest.mocked(cargarConfiguracionInformes).mockResolvedValue({ ...configuracionPredeterminada(), cuentas: [
    { account_code: '13', name: 'Cartera', clasificacion_corriente: 'no_corriente', costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null },
    { account_code: '1305-01', name: 'Auxiliar de cartera', clasificacion_corriente: null, costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null },
    { account_code: '2205', name: 'Proveedores', clasificacion_corriente: null, costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null },
    { account_code: '2105', name: 'Obligaciones', clasificacion_corriente: null, costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null },
  ], anotaciones_asientos: { '2': { concepto_patrimonio: 'correccion_errores', provision_sin_caja: true, cash_flow_activity: 'inversion' } } });
});

test('pagina más de1000 líneas, conserva historia, moneda base y día local de la organización', async () => {
  const mock = clientePrueba(tablas(Array.from({ length: 1001 }, (_, i) => linea(i + 1))));
  const fuente = await cargarFuenteInformes(mock.cliente, 7, filtros);
  expect(fuente.movimientos).toHaveLength(1001);
  expect(fuente.movimientos[0]).toMatchObject({ debit: 100, credit: 0, entry_date: '2025-12-31', tercero_nit: '900000000', cash_flow_activity: 'inversion', concepto_patrimonio: 'correccion_errores', provision_sin_caja: true });
  expect(mock.llamadas.filter((l) => l.tabla === 'journal_lines' && l.metodo === 'range').map((l) => l.argumentos)).toEqual([[0, 999], [1000, 1999]]);
  expect(mock.llamadas.find((l) => l.tabla === 'journal_lines' && l.metodo === 'lte')?.argumentos).toEqual(['journal_entries.entry_date', '2026-12-31T23:59:59.999-05:00']);
  expect(fuente.productos).toEqual([{ id: 1, name: 'Producto de prueba', linea: 'Línea de prueba' }]);
});

test('filtra ambas caras por organización y sucursal/centro, nunca por nombres de roles', async () => {
  const mock = clientePrueba(tablas([linea()]));
  await cargarFuenteInformes(mock.cliente, 7, { ...filtros, branchId: 8, costCenterId: 'centro' });
  const condiciones = mock.llamadas.filter((l) => l.tabla === 'journal_lines' && l.metodo === 'eq').map((l) => l.argumentos);
  expect(condiciones).toEqual(expect.arrayContaining([['organization_id', 7], ['journal_entries.organization_id', 7], ['journal_entries.posted', true], ['journal_entries.branch_id', 8], ['cost_center_id', 'centro']]));
  expect(mock.rpc).toHaveBeenCalledWith('fn_informes_anulaciones', { p_organization_id: 7, p_hasta: '2026-12-31T23:59:59.999-05:00' });
});

test('normaliza guiones para informes y hereda la presentación canónica PR450 sin reescribir configuración', async () => {
  const raw = linea(); raw.account_code = '1305-01';
  const fuente = await cargarFuenteInformes(clientePrueba(tablas([raw])).cliente, 7, filtros);
  expect(fuente.movimientos[0]).toMatchObject({ account_code: '130501', account_code_original: '1305-01', concepto_exogena: '5015' });
  expect(fuente.cuentas.find((c) => c.account_code === '130501')).toMatchObject({ account_code_original: '1305-01', clasificacion_corriente: 'no_corriente', description: 'Auxiliar de prueba', concepto_exogena: '5015' });
  expect(fuente.cuentas.find((c) => c.account_code === '2205')?.clasificacion_corriente).toBe('corriente');
  expect(fuente.cuentas.find((c) => c.account_code === '2105')).toMatchObject({ clasificacion_corriente: null, presentacion_niif: 'segun_plazo' });
  expect(fuente.configuracion.cuentas.find((c) => c.account_code === '1305-01')).toBeDefined();
});

test('anulaciones llevan fecha local efectiva sin eliminar el historial para comparativos', async () => {
  const mock = clientePrueba(tablas([linea()]), [{ original_entry_id: 2, reversal_entry_id: 3, anulado_en: '2026-06-01T02:00:00Z' }]);
  const fuente = await cargarFuenteInformes(mock.cliente, 7, filtros);
  expect(fuente.movimientos).toHaveLength(1);
  expect(fuente.movimientos[0]).toMatchObject({ anulado_desde: '2026-05-31', posted: true });
});

test('falla expresamente si no puede verificar anulaciones y no genera un informe incompleto', async () => {
  const mock = clientePrueba(tablas([linea()]), [], true);
  await expect(cargarFuenteInformes(mock.cliente, 7, filtros)).rejects.toThrow('verificar la anulación');
});

test('sin base preserva importes originales con aviso, pero no mezcla moneda extranjera sin conversión', async () => {
  const raw = { ...linea(), debit_base: null, credit_base: null, currency_code: 'COP', journal_entries: { ...(linea().journal_entries as Fila), currency_code: 'COP' } };
  const fuente = await cargarFuenteInformes(clientePrueba(tablas([raw])).cliente, 7, filtros);
  expect(fuente.movimientos[0].debit).toBe(900);
  expect(fuente.advertencias.join()).toContain('débitos y créditos originales');
  await expect(cargarFuenteInformes(clientePrueba(tablas([{ ...raw, currency_code: 'USD' }])).cliente, 7, filtros)).rejects.toThrow('otra moneda');
});

test('el fallback de moneda no se entrega como base verificada para actividad o tributos', async () => {
  jest.mocked(resolveOrgCurrency).mockResolvedValue({ code: 'USD', decimals: 2, symbol: '$', source: 'fallback' });
  const raw = { ...linea(), journal_entries: { ...(linea().journal_entries as Fila), base_currency_code: 'USD' } };
  const fuente = await cargarFuenteInformes(clientePrueba(tablas([raw])).cliente, 7, filtros);
  expect(fuente.monedaBase).toBeNull();
  expect(fuente.advertencias.join(' ')).toContain('moneda base no tiene configuración verificable');
});

test('rechaza una relación de otro tenant aunque una respuesta defectuosa ignorara el filtro', async () => {
  const raw = { ...linea(), journal_entries: { ...(linea().journal_entries as Fila), organization_id: 99 } };
  await expect(cargarFuenteInformes(clientePrueba(tablas([raw]), [], false, true).cliente, 7, filtros)).rejects.toThrow('ajena a la organización');
});

test('carga actividad solo por facturas verificadas con tenant en las líneas y costo histórico', async () => {
  const invoiceId = '10000000-0000-4000-8000-000000000001';
  const saleId = '20000000-0000-4000-8000-000000000001';
  const raw = linea();
  raw.journal_entries = { ...(raw.journal_entries as Fila), source: 'invoice_sales', source_id: invoiceId, entry_date: '2026-03-01T12:00:00Z' };
  const datos = { ...tablas([raw]),
    invoice_sales: [{ id: invoiceId, organization_id: 7, branch_id: 8, status: 'paid', subtotal: 100, currency: 'COP', payment_method: 'credit', payment_terms: 60, sale_id: saleId }],
    invoice_items: [{ id: 'item', invoice_sales_id: invoiceId, product_id: 1, qty: 2, total_line: 119, tax_rate: 19, cost_center_id: 'centro', invoice_sales: { organization_id: 7, branch_id: 8 } }],
    stock_movements: [{ id: 1, organization_id: 7, branch_id: 8, product_id: 1, source: 'sale', source_id: saleId, direction: 'out', qty: 2, unit_cost: 40, created_at: '2026-03-01T12:00:00Z', avg_cost_after: 40 }],
  };
  const mock = clientePrueba(datos);
  const fuente = await cargarFuenteInformes(mock.cliente, 7, { ...filtros, branchId: 8 });
  expect(fuente.actividad.ventas[0]).toMatchObject({ id: invoiceId, payment_method: 'credit', payment_terms: 60 });
  expect(fuente.actividad.lineasVenta[0]).toMatchObject({ invoice_sales_id: invoiceId, product_id: 1, qty: 2 });
  expect(fuente.stock[0]).toMatchObject({ unit_cost: 40, source_id: saleId });
  expect(mock.llamadas).toContainEqual({ tabla: 'invoice_items', metodo: 'eq', argumentos: ['invoice_sales.organization_id', 7] });
  expect(mock.llamadas).toContainEqual({ tabla: 'invoice_sales', metodo: 'eq', argumentos: ['branch_id', 8] });
  expect(mock.llamadas).toContainEqual({ tabla: 'invoice_items', metodo: 'eq', argumentos: ['invoice_sales.branch_id', 8] });
});

test('fuente de factura histórica no UUID no rompe los estados ni inventa actividad', async () => {
  const raw = linea();
  raw.journal_entries = { ...(raw.journal_entries as Fila), source: 'invoice_sales', source_id: 'legado-sin-vinculo' };
  const fuente = await cargarFuenteInformes(clientePrueba(tablas([raw])).cliente, 7, filtros);
  expect(fuente.movimientos).toHaveLength(1);
  expect(fuente.actividad.ventas).toEqual([]);
  expect(fuente.advertencias.join()).toContain('identificador de factura no verificable');
});

test('sucursal o centro ajeno devuelve404 antes de recorrer el historial', async () => {
  for (const filtro of [{ branchId: 99 }, { costCenterId: 'ajeno' }]) {
    const mock = clientePrueba(tablas([linea()]));
    await expect(cargarFuenteInformes(mock.cliente, 7, { ...filtros, ...filtro })).rejects.toMatchObject({ statusCode: 404 });
    expect(mock.llamadas.some((l) => l.tabla === 'journal_lines')).toBe(false);
  }
});

test('sucursal visible sin permiso y centro de otra sucursal devuelven403 sin historial', async () => {
  const restringido = clientePrueba(tablas([linea()]));
  restringido.rpc.mockImplementation((nombre: string) => Promise.resolve({ data: nombre === 'app_branch_access' ? false : [], error: null }));
  await expect(cargarFuenteInformes(restringido.cliente, 7, { ...filtros, branchId: 8 })).rejects.toMatchObject({ statusCode: 403 });
  expect(restringido.llamadas.some((l) => l.tabla === 'journal_lines')).toBe(false);
  const datos = tablas([linea()]); datos.cost_centers[0].branch_id = 9;
  const mixto = clientePrueba(datos);
  await expect(cargarFuenteInformes(mixto.cliente, 7, { ...filtros, branchId: 8, costCenterId: 'centro' })).rejects.toMatchObject({ statusCode: 403 });
  expect(mixto.llamadas.some((l) => l.tabla === 'journal_lines')).toBe(false);
});

test('no consulta stock sin asignación fiable a centro de costo y revela la limitación', async () => {
  const mock = clientePrueba(tablas([linea()]));
  const fuente = await cargarFuenteInformes(mock.cliente, 7, { ...filtros, costCenterId: 'centro' });
  expect(mock.llamadas.some((l) => l.tabla === 'stock_movements')).toBe(false);
  expect(fuente.stockCompleto).toBe(false);
  expect(fuente.motivoStockIncompleto).toBe('centro_costo');
  expect(fuente.advertenciasStock.join()).toContain('centro de costo');
  expect(fuente.advertencias.join()).toContain('centro de costo');
});

test('un costo de stock faltante conserva el libro válido y omite solamente cálculos dependientes del inventario', async () => {
  const mock = clientePrueba({ ...tablas([linea()]), stock_movements: [{ id: 1, organization_id: 7, branch_id: 8, product_id: 1,
    source: 'purchase', source_id: 'origen', direction: 'in', qty: 2, unit_cost: null, created_at: '2026-03-01T12:00:00Z', avg_cost_after: null }] });
  const fuente = await cargarFuenteInformes(mock.cliente, 7, filtros);
  expect(fuente.movimientos).toHaveLength(1);
  expect(fuente.movimientos[0]).toMatchObject({ debit: 100, credit: 0 });
  expect(fuente.stock).toEqual([]);
  expect(fuente.stockCompleto).toBe(false);
  expect(fuente.motivoStockIncompleto).toBe('datos_no_verificables');
  expect(fuente.advertenciasStock.join(' ')).toContain('sin cantidad, costo o secuencia verificables');
  expect(fuente.advertenciasStock.join(' ')).not.toContain('centro de costo');
});

test('selector pagina metadatos sin cifras y aplica fecha local y consecutivo compartido', async () => {
  const mock = clientePrueba({ journal_entries: Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, organization_id: 7, posted: true,
    entry_date: '2026-01-02T02:00:00Z', memo: 'Prueba', comprobante_prefijo: 'NC', comprobante_numero: i + 1 })) });
  const asientos = await cargarAsientosSeleccionablesInformes(mock.cliente, 7, { desde: '2026-01-01', hasta: '2026-01-02' }, 'America/Bogota');
  expect(asientos).toHaveLength(1001);
  expect(asientos[0]).toEqual({ id: 1, fecha: '2026-01-01', comprobante: 'NC-000001', memo: 'Prueba' });
  expect(Object.keys(asientos[0])).toEqual(['id', 'fecha', 'comprobante', 'memo']);
  expect(mock.llamadas.filter((l) => l.tabla === 'journal_entries' && l.metodo === 'range').map((l) => l.argumentos)).toEqual([[0, 999], [1000, 1999]]);
});

test('selector excluye anulados al corte y conserva original antes de anulación posterior', async () => {
  const filas = [{ id: 2, organization_id: 7, posted: true, entry_date: '2026-01-02T12:00:00Z', memo: null, comprobante_prefijo: null, comprobante_numero: null }];
  const mock = clientePrueba({ journal_entries: filas }, [{ original_entry_id: 2, reversal_entry_id: 3, anulado_en: '2026-02-01T12:00:00Z' }]);
  expect(await cargarAsientosSeleccionablesInformes(mock.cliente, 7, { desde: '2026-01-01', hasta: '2026-12-31' }, 'America/Bogota')).toEqual([]);
  expect(await cargarAsientosSeleccionablesInformes(mock.cliente, 7, { desde: '2026-01-01', hasta: '2026-01-31' }, 'America/Bogota')).toEqual([{ id: 2, fecha: '2026-01-02', comprobante: 'Asiento 2', memo: '' }]);
});
