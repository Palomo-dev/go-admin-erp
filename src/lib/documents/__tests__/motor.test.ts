/**
 * Armado de cada documento en el servidor (`armarDocumento`), con un doble de
 * Supabase en memoria:
 * - organización ajena, inexistente o id mal formado → 404 (sin distinguir);
 * - permiso resuelto en el servidor → 403 antes de leer nada;
 * - moneda del documento (o la base), fechas en la zona de la organización,
 *   escape de HTML, pagos por `amount - change_amount`;
 * - cajas: quien abrió, administración o finanzas; cierre ciego enmascarado;
 * - estado de cuenta: saldo corrido, saldo inicial, antigüedad y texto legal
 *   configurable por organización.
 */
import { contextoMoneda } from '@/lib/utils/moneda';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { fakeSupabase } from './fakeSupabase';

const permisos = new Set<string>();
jest.mock('@/lib/utils/orgContext', () => ({
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, codigo?: string) => (codigo ? permisos.has(codigo) : permisos.has('admin'))),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolverContextoMoneda: jest.fn(async (_db: unknown, _org: number, doc?: string | null) => {
    const { contextoMoneda: ctx } = jest.requireActual('@/lib/utils/moneda');
    const codigo = (doc ?? '').trim().toUpperCase() || 'COP';
    return ctx(codigo, { locale: 'es-CO' });
  }),
}));

import { armarDocumento } from '../server/motor';

const ORG = 7;
const AJENA = 99;
const F1 = '11111111-1111-4111-8111-111111111111';
const F_AJENA = '22222222-2222-4222-8222-222222222222';
const NC1 = '33333333-3333-4333-8333-333333333333';
const FE1 = '44444444-4444-4444-8444-444444444444';
const Q1 = '55555555-5555-4555-8555-555555555555';
const FC1 = '66666666-6666-4666-8666-666666666666';
const P1 = '77777777-7777-4777-8777-777777777777';
const P2 = '88888888-8888-4888-8888-888888888888';
const C1 = '99999999-9999-4999-8999-999999999999';
const AP1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const XSS = '<script>alert(1)</script>';
const llamadasProveedor: Array<Record<string, unknown>> = [];

const cliente = { full_name: `Cliente ${XSS}`, doc_type: 'CC', doc_number: '1234', dv: null, fiscal_responsibilities: [] };
const item = { description: 'Servicio', qty: 1, unit_price: 100, discount_amount: 0, tax_code: 'IVA_19', tax_rate: 19, tax_included: false, total_line: 100, impuesto: { name: 'IVA 19 %' } };

function datos() {
  return {
    organizations: [{ id: ORG, name: 'Mi empresa', legal_name: 'Mi empresa S.A.S.', nit: '900123456', dv: 7, timezone: 'America/Bogota', logo_url: null, primary_color: '#1d4ed8', fiscal_responsibilities: ['O-13'] }],
    branches: [{ id: 1, organization_id: ORG, name: 'Sucursal Norte', timezone: null }],
    customers: [{ id: C1, organization_id: ORG, branch_id: 1, ...cliente }],
    invoice_sales: [
      { id: F1, organization_id: ORG, branch_id: 1, sale_id: null, number: 'FV-10', issue_date: '2026-09-24T03:00:00Z', due_date: '2026-08-01T15:00:00Z', currency: 'USD', subtotal: 100, tax_total: 19, total: 119, balance: 50, status: 'partial', xml_uuid: null, notes: 'Gracias', document_type: 'invoice', customer_id: C1, customer: cliente, items: [item] },
      { id: F_AJENA, organization_id: AJENA, branch_id: 5, number: 'FV-OTRA', status: 'issued', total: 1, customer: cliente, items: [] },
      { id: NC1, organization_id: ORG, branch_id: 1, number: 'NC-1', issue_date: '2026-09-26T15:00:00Z', currency: 'COP', subtotal: 10, tax_total: 0, total: 10, balance: 0, status: 'issued', document_type: 'credit_note', related_invoice_id: F1, description: 'Devolución parcial', customer_id: C1, customer: cliente, items: [] },
      { id: FE1, organization_id: ORG, branch_id: 1, number: 'FE-1', issue_date: '2026-09-20T15:00:00Z', currency: 'COP', subtotal: 100, tax_total: 0, total: 100, balance: 0, status: 'paid', xml_uuid: 'cufe0123456789abcdef', document_type: 'invoice', customer: cliente, items: [] },
    ],
    payments: [
      { id: P1, organization_id: ORG, branch_id: 1, source: 'invoice_sales', source_id: F1, status: 'completed', method: 'cash', amount: 100, change_amount: 31, discount_amount: 0, currency: 'USD', reference: 'R-1', payment_date: '2026-09-25T15:00:00Z' },
      { id: P2, organization_id: ORG, branch_id: 1, source: 'account_payable', source_id: AP1, status: 'completed', method: 'transfer', amount: 500, change_amount: 0, discount_amount: 0, currency: 'COP', reference: null, payment_date: '2026-09-25T15:00:00Z' },
    ],
    accounts_receivable: [],
    accounts_payable: [{ id: AP1, organization_id: ORG, invoice_id: FC1, balance: 0, supplier: { name: 'Proveedor Uno' } }],
    credit_note_applications: [],
    credit_notes: [{ organization_id: ORG, customer_id: C1, status: 'active', balance: 5 }],
    invoice_sequences: [{ organization_id: ORG, branch_id: null, document_type: 'invoice', resolution_number: '18760000001', resolution_date: '2026-01-15', prefix: 'FV', range_start: 1, range_end: 1000, valid_from: '2026-01-15', valid_until: '2027-01-15' }],
    quotations: [{ id: Q1, organization_id: ORG, branch_id: 1, number: 'COT-3', issue_date: '2026-09-24', valid_until: '2026-09-30', currency: 'COP', subtotal: 100, tax_total: 5, discount_total: 0, total: 105, status: 'sent', payment_terms: 30, payment_method: 'transfer', terms_conditions: 'Pago anticipado', payment_link_url: 'javascript:alert(1)', customer: cliente, items: [{ ...item, tax_code: 'IVA_5', tax_rate: 5 }] }],
    tax_templates: [{ code: 'IVA_5', name: 'IVA 5 %' }],
    invoice_purchase: [{ id: FC1, organization_id: ORG, branch_id: 1, number_ext: 'PROV-77', issue_date: '2026-09-10T15:00:00Z', due_date: '2026-10-10T15:00:00Z', currency: 'COP', subtotal: 500, tax_total: 0, total: 500, balance: 0, status: 'paid', supplier: { name: 'Proveedor Uno', nit: '800', bank_name: 'Banco', bank_account: '1234567890', account_type: 'Ahorros', credit_days: 30 }, items: [{ ...item, discount_amount: 20 }] }],
    invoice_purchase_withholdings: [{ organization_id: ORG, invoice_id: FC1, concept: 'Retención en la fuente', base: 480, rate: 2.5, amount: 12, created_at: '2026-09-10T15:00:00Z' }],
    suppliers: [{ id: 5, organization_id: ORG, name: 'Proveedor Uno', nit: '800', dv: '1' }, { id: 6, organization_id: AJENA, name: 'Proveedor Ajeno' }],
    cash_sessions: [
      { id: 10, organization_id: ORG, branch_id: 1, opened_by: 'cajero-1', opened_at: '2026-09-24T13:00:00Z', closed_at: '2026-09-24T23:00:00Z', closed_by: 'cajero-1', initial_amount: 100, final_amount: 480, difference: -20, status: 'closed', notes: null },
    ],
    cash_movements: [{ organization_id: ORG, cash_session_id: 10, type: 'out', concept: 'Hielo', amount: 20, notes: null, created_at: '2026-09-24T15:00:00Z' }],
    cash_counts: [{ id: 3, organization_id: ORG, cash_session_id: 10, count_type: 'partial', counted_amount: 300, expected_amount: 320, difference: -20, denominations: { bills: { '50000': 2 } }, counted_by: 'cajero-1', notes: null, created_at: '2026-09-24T18:00:00Z', method_breakdown: { card: { esperado: 200, contado: 200, diferencia: 0 } } }],
    profiles: [{ id: 'cajero-1', first_name: 'Ana', last_name: 'Caja' }],
    organization_settings: [] as Array<Record<string, unknown>>,
    electronic_invoicing_config: [],
  };
}

function sesion(tablas = datos(), userId = 'usuario-1') {
  const supabase = fakeSupabase(tablas, {
    fn_estado_cuenta_proveedor: (args) => {
      llamadasProveedor.push(args);
      return { moneda: 'COP', saldo_inicial: 0, total_cargos: 488, total_abonos: 500, saldo_final: -12, vencido: 0, por_vencer: 0, movimientos: [
        { fecha: '2026-09-10T15:00:00Z', dia: '2026-09-10', tipo: 'factura', documento: 'PROV-77', vence: '2026-10-10T15:00:00Z', cargo: 488, abono: 0, saldo: 488 },
        { fecha: '2026-09-25T15:00:00Z', dia: '2026-09-25', tipo: 'pago', documento: null, vence: null, cargo: 0, abono: 500, saldo: -12 },
      ] };
    },
    pos_caja_esperado: () => ({ efectivo_esperado: 500, por_metodo: { cash: 500, card: 200 }, detalle: { inicial: 100, ventas_efectivo: 420, salidas: 20 } }),
  });
  return { ctx: { userId, organizationId: ORG, roleId: 5, isSuperAdmin: false, supabase: supabase as never }, supabase };
}

const pedir = (s: ReturnType<typeof sesion>, tipo: Parameters<typeof armarDocumento>[1]['tipo'], id: string, extra: Partial<Parameters<typeof armarDocumento>[1]> = {}) =>
  armarDocumento(s.ctx, { tipo, id, papel: 'carta', idioma: 'es', ahora: new Date('2026-09-27T15:00:00Z'), ...extra });

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'OK';
  } catch (err) {
    if (err instanceof OrgContextError) return `${err.statusCode} ${err.code}`;
    throw err;
  }
}

beforeEach(() => {
  permisos.clear();
});

describe('factura de venta', () => {
  it('se arma desde la base con la moneda del documento, la zona de la organización y el HTML escapado', async () => {
    permisos.add('finance.view');
    const s = sesion();
    const { payload, html } = await pedir(s, 'factura-venta', F1);
    expect(payload.numero).toBe('FV-10');
    expect(payload.moneda.code).toBe('USD');
    expect(payload.bandas.map((b) => b.clave)).toContain('monedaExtranjera');
    expect(html).toContain('US$');
    // 03:00 UTC del 24 = 23 de septiembre en Bogotá.
    expect(html).toContain('23/09/2026');
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;script&gt;');
    // Pago aplicado = recibido − cambio.
    expect(payload.totales.find((t) => t.clave === 'pagosAplicados')?.valor).toBe(69);
    expect(payload.totales.find((t) => t.clave === 'saldoPendiente')?.valor).toBe(50);
    // Resolución DIAN de la numeración y nombre real del impuesto.
    expect(payload.pieLegal.resolucion?.numero).toBe('18760000001');
    expect(payload.totales.find((t) => t.clave === 'impuestoNombrado')?.vars).toEqual({ nombre: 'IVA 19 %' });
  });

  it('toda consulta de datos va con la organización de la sesión', async () => {
    permisos.add('finance.view');
    const s = sesion();
    await pedir(s, 'factura-venta', F1);
    const sinOrganizacion = s.supabase.consultas
      .filter((c) => !['organizations', 'tax_templates', 'profiles'].includes(c.tabla))
      .filter((c) => !c.filtros.some(([col, , v]) => col === 'organization_id' && v === ORG));
    expect(sinOrganizacion).toEqual([]);
  });

  it('una factura de otra organización es 404, igual que un id inexistente o mal formado', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(), 'factura-venta', F_AJENA))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(sesion(), 'factura-venta', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(sesion(), 'factura-venta', "1' or '1'='1"))).toBe('404 NOT_FOUND');
  });

  it('sin finance.view ni pos.view → 403 y no se lee el documento', async () => {
    const s = sesion();
    expect(await codigoDe(pedir(s, 'factura-venta', F1))).toBe('403 PERMISSION_REQUIRED');
    expect(s.supabase.consultas.some((c) => c.tabla === 'invoice_sales')).toBe(false);
  });

  it('pos.view basta para la factura, pero una nota crédito pedida como factura exige su propio permiso', async () => {
    permisos.add('pos.view');
    expect(await codigoDe(pedir(sesion(), 'factura-venta', F1))).toBe('OK');
    expect(await codigoDe(pedir(sesion(), 'factura-venta', NC1))).toBe('403 PERMISSION_REQUIRED');
    permisos.add('finance.view');
    const { payload } = await pedir(sesion(), 'factura-venta', NC1);
    expect(payload.tipo).toBe('nota-credito');
  });

  it('con CUFE: factura electrónica y QR a la verificación DIAN, nunca a un archivo', async () => {
    permisos.add('finance.view');
    const { payload, html } = await pedir(sesion(), 'factura-venta', FE1);
    expect(payload.tituloClave).toBe('factura-venta-electronica');
    expect(payload.pieLegal.qr?.contenido).toBe('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cufe0123456789abcdef');
    expect(html).not.toMatch(/storage\/v1\/object/);
    expect(payload.marcaAgua).toBe('pagada');
  });

  it('el rollo de 80 mm no aplica a la cotización', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(), 'cotizacion', Q1, { papel: '80mm' }))).toBe('400 PAPEL_NO_DISPONIBLE');
  });
});

describe('nota crédito', () => {
  it('muestra la factura afectada y el motivo; una factura pedida como nota es 404', async () => {
    permisos.add('finance.view');
    const { payload } = await pedir(sesion(), 'nota-credito', NC1);
    expect(payload.referencia.find((c) => c.clave === 'facturaAfectada')?.valor).toEqual({ tipo: 'texto', v: 'FV-10' });
    expect(payload.referencia.find((c) => c.clave === 'motivo')?.valor).toEqual({ tipo: 'texto', v: 'Devolución parcial' });
    expect(payload.firma).toBeNull();
    expect(await codigoDe(pedir(sesion(), 'nota-credito', F1))).toBe('404 NOT_FOUND');
  });
});

describe('cotización', () => {
  it('fechas `date` sin correr, estado real, sin QR a un enlace que no es https', async () => {
    permisos.add('sales_management');
    const { payload, html } = await pedir(sesion(), 'cotizacion', Q1);
    expect(payload.estado).toEqual({ codigo: 'cotizacion.sent', tono: 'aviso' });
    expect(html).toContain('24/09/2026');
    expect(html).toContain('30/09/2026');
    expect(payload.pieLegal.qr).toBeNull();
    expect(payload.terminos).toBe('Pago anticipado');
    expect(payload.firma).toBe('aceptacion');
    expect(html).toContain('IVA 5 %');
  });
});

describe('factura de compra', () => {
  it('paleta sobria, descuento por línea desde la base y cuenta bancaria enmascarada', async () => {
    permisos.add('finance.view');
    const { payload, html } = await pedir(sesion(), 'factura-compra', FC1);
    expect(payload.sobrio).toBe(true);
    expect(payload.lineas?.[0].descuento).toBe(20);
    expect(JSON.stringify(payload.referencia)).toContain('•••• 7890');
    expect(JSON.stringify(payload.referencia)).not.toContain('1234567890');
    expect(html).toContain('Documento recibido de un tercero');
  });

  it('retenciones: se listan y se restan; el total es el neto a pagar y el pagado cuenta el descuento', async () => {
    permisos.add('finance.view');
    const tablas = datos();
    tablas.payments.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', organization_id: ORG, branch_id: 1, source: 'invoice_purchase', source_id: FC1, status: 'completed', method: 'transfer', amount: 400, change_amount: 0, discount_amount: 8, currency: 'COP', reference: null, payment_date: '2026-09-12T15:00:00Z' });
    const { payload, html } = await pedir(sesion(tablas), 'factura-compra', FC1);
    const claves = payload.totales.map((t) => [t.clave, t.valor]);
    expect(claves).toContainEqual(['totalFactura', 500]);
    expect(claves).toContainEqual(['retencion', 12]);
    expect(claves).toContainEqual(['netoPagar', 488]);
    // 400 + 8 de descuento (este pago) + 500 del pago a su cuenta por pagar.
    expect(claves).toContainEqual(['pagosAplicados', 908]);
    expect(claves).toContainEqual(['pagado', 488]);
    expect(payload.totales.find((t) => t.clave === 'netoPagar')?.estilo).toBe('total');
    const retenciones = payload.secciones.find((s) => s.titulo === 'retenciones');
    expect(retenciones?.filas).toEqual([['Retención en la fuente', 480, 2.5, 12]]);
    expect(html).toContain('Neto a pagar al proveedor');
    expect(html).toContain('Retención en la fuente (2.5 %)');
  });

  it('sin retenciones el total sigue siendo «total a pagar al proveedor»', async () => {
    permisos.add('finance.view');
    const tablas = datos();
    tablas.invoice_purchase_withholdings = [];
    const { payload } = await pedir(sesion(tablas), 'factura-compra', FC1);
    expect(payload.totales.find((t) => t.estilo === 'total')?.clave).toBe('totalProveedor');
    expect(payload.secciones.some((s) => s.titulo === 'retenciones')).toBe(false);
  });
});

describe('estado de cuenta de proveedor', () => {
  it('sale de fn_estado_cuenta_proveedor con la organización de la sesión y el corte en su día', async () => {
    permisos.add('finance.view');
    llamadasProveedor.length = 0;
    const { payload, html } = await pedir(sesion(), 'estado-cuenta-proveedor', '5', { desde: '2026-09-01' });
    expect(llamadasProveedor).toEqual([{ p_org: ORG, p_supplier: 5, p_desde: '2026-09-01', p_hasta: '2026-09-27' }]);
    expect(payload.contraparte).toMatchObject({ rol: 'proveedor', nombre: 'Proveedor Uno' });
    expect(payload.secciones[0].filas.map((f) => f[6])).toEqual([488, -12]);
    expect(payload.resumen.find((c) => c.clave === 'saldoFinal')?.valor).toEqual({ tipo: 'dinero', v: -12 });
    expect(html).toContain('Estado de cuenta de proveedor');
    expect(html).toContain('10/09/2026');
    expect(payload.pieLegal.textos[0]).toMatch(/según nuestros registros/);
  });

  it('un proveedor de otra organización o un id no numérico es 404 y no se llama a la RPC', async () => {
    permisos.add('finance.view');
    llamadasProveedor.length = 0;
    expect(await codigoDe(pedir(sesion(), 'estado-cuenta-proveedor', '6'))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(sesion(), 'estado-cuenta-proveedor', 'abc'))).toBe('404 NOT_FOUND');
    expect(llamadasProveedor).toEqual([]);
  });

  it('sin finance.view → 403', async () => {
    permisos.add('pos.view');
    expect(await codigoDe(pedir(sesion(), 'estado-cuenta-proveedor', '5'))).toBe('403 PERMISSION_REQUIRED');
  });
});

describe('recibo de caja y comprobante de egreso', () => {
  it('el tipo debe coincidir con el origen del pago', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(), 'recibo-caja', P2))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(sesion(), 'comprobante-egreso', P1))).toBe('404 NOT_FOUND');
  });

  it('recibo: valor aplicado, recibido y cambio; y el documento abonado con su cliente', async () => {
    permisos.add('pos.view');
    const { payload } = await pedir(sesion(), 'recibo-caja', P1);
    expect(payload.totales.map((t) => [t.clave, t.valor])).toEqual([
      ['recibido', 100],
      ['cambio', 31],
      ['valorRecibido', 69],
    ]);
    expect(payload.contraparte?.nombre).toContain('Cliente');
    expect(payload.referencia[0].valor).toEqual({ tipo: 'clave', v: 'documentosAbonados.facturaVenta', vars: { numero: 'FV-10' } });
  });

  it('egreso: la contraparte es el proveedor de la factura de compra', async () => {
    permisos.add('finance.view');
    const { payload } = await pedir(sesion(), 'comprobante-egreso', P2);
    expect(payload.contraparte).toMatchObject({ rol: 'proveedor', nombre: 'Proveedor Uno' });
  });
});

describe('cierre y arqueo de caja', () => {
  it('otra persona sin administración ni finanzas → 403', async () => {
    expect(await codigoDe(pedir(sesion(datos(), 'otro'), 'cierre-caja', '10'))).toBe('403 PERMISSION_REQUIRED');
    expect(await codigoDe(pedir(sesion(datos(), 'otro'), 'arqueo-caja', '3'))).toBe('403 PERMISSION_REQUIRED');
  });

  it('quien abrió la caja la ve; el esperado sale de pos_caja_esperado', async () => {
    const { payload } = await pedir(sesion(datos(), 'cajero-1'), 'cierre-caja', '10');
    expect(payload.totales.find((t) => t.clave === 'caja.esperado')).toMatchObject({ valor: 500, oculto: false });
    expect(payload.metadatos.find((c) => c.clave === 'cajero')?.valor).toEqual({ tipo: 'texto', v: 'Ana Caja' });
  });

  it('cierre ciego: sin administración, esperado y diferencia salen ocultos', async () => {
    const tablas = datos();
    tablas.organization_settings.push({ organization_id: ORG, key: 'pos_blind_cash_count', settings: { blind_cash_count: true } });
    const { payload, html } = await pedir(sesion(tablas, 'cajero-1'), 'cierre-caja', '10');
    expect(payload.totales.find((t) => t.clave === 'caja.esperado')?.oculto).toBe(true);
    expect(payload.totales.find((t) => t.clave === 'caja.diferencia')?.oculto).toBe(true);
    expect(html).toContain('***');
    permisos.add('admin');
    const admin = await pedir(sesion(tablas, 'cajero-1'), 'cierre-caja', '10');
    expect(admin.payload.totales.find((t) => t.clave === 'caja.esperado')?.oculto).toBe(false);
  });

  it('cierre ciego: pos.cajas.ver_esperado (sin administración) ve el esperado y la diferencia, también en el arqueo', async () => {
    const tablas = datos();
    tablas.organization_settings.push({ organization_id: ORG, key: 'pos_blind_cash_count', settings: { blind_cash_count: true } });
    permisos.add('pos.cajas.ver_esperado');
    const cierre = await pedir(sesion(tablas, 'supervisora'), 'cierre-caja', '10');
    expect(cierre.payload.totales.find((t) => t.clave === 'caja.esperado')).toMatchObject({ valor: 500, oculto: false });
    expect(cierre.payload.totales.find((t) => t.clave === 'caja.diferencia')?.oculto).toBe(false);
    expect(cierre.payload.bandas).toEqual([]);
    const arqueo = await pedir(sesion(tablas, 'supervisora'), 'arqueo-caja', '3');
    expect(arqueo.payload.totales.find((t) => t.clave === 'caja.esperado')).toMatchObject({ valor: 320, oculto: false });
  });

  it('cierre ciego: con finance.view pero sin pos.cajas.ver_esperado ve el reporte con el esperado oculto', async () => {
    const tablas = datos();
    tablas.organization_settings.push({ organization_id: ORG, key: 'pos_blind_cash_count', settings: { blind_cash_count: true } });
    permisos.add('finance.view');
    const { payload, html } = await pedir(sesion(tablas, 'contadora'), 'arqueo-caja', '3');
    expect(payload.totales.find((t) => t.clave === 'caja.esperado')?.oculto).toBe(true);
    expect(payload.totales.find((t) => t.clave === 'caja.diferencia')?.oculto).toBe(true);
    expect(payload.secciones[1].filas[0][1]).toEqual({ oculto: true });
    expect(html).not.toContain('$ 320');
  });

  it('sin cierre ciego todos los que pueden ver el reporte ven el esperado', async () => {
    const { payload } = await pedir(sesion(datos(), 'cajero-1'), 'cierre-caja', '10');
    expect(payload.totales.find((t) => t.clave === 'caja.esperado')?.oculto).toBe(false);
  });

  it('arqueo: denominaciones y por método; finanzas puede verlo', async () => {
    permisos.add('finance.view');
    const { payload } = await pedir(sesion(datos(), 'otro'), 'arqueo-caja', '3');
    expect(payload.secciones[0].filas).toEqual([['caja.billete', 50000, 2, 100000]]);
    expect(payload.secciones[1].filas[0][0]).toBe('Tarjeta');
    expect(await codigoDe(pedir(sesion(), 'arqueo-caja', 'abc'))).toBe('404 NOT_FOUND');
  });
});

describe('estado de cuenta', () => {
  it('saldo corrido, saldo inicial, antigüedad, saldo a favor y texto legal por defecto', async () => {
    permisos.add('finance.view');
    const { payload } = await pedir(sesion(), 'estado-cuenta', C1);
    const movimientos = payload.secciones.find((s) => s.titulo === 'movimientos');
    // FV-10 119 (cargo) → pago 69 → NC-1 10 → saldo 40 (FE-1 no es de este cliente).
    expect(movimientos?.filas.map((f) => f[5])).toEqual([119, 50, 40]);
    const tramos = payload.secciones.find((s) => s.titulo === 'antiguedad')?.filas[0];
    // FV-10 vence el 1 de agosto; corte el 27 de septiembre → 57 días → tramo 31-60.
    expect(tramos).toEqual([0, 0, 50, 0, 0]);
    expect(payload.resumen.find((c) => c.clave === 'saldoAFavor')?.valor).toEqual({ tipo: 'dinero', v: 5 });
    expect(payload.pieLegal.textos[0]).toMatch(/no es una factura/);
  });

  it('con `desde` el saldo anterior pasa a saldo inicial; el texto legal configurado reemplaza al de fábrica', async () => {
    permisos.add('finance.view');
    const tablas = datos();
    tablas.organization_settings.push({ organization_id: ORG, key: 'documentos_textos_legales', settings: { 'estado-cuenta': 'Texto propio de la organización' } });
    const { payload } = await pedir(sesion(tablas), 'estado-cuenta', C1, { desde: '2026-09-25', hasta: '2026-09-27' });
    expect(payload.resumen.find((c) => c.clave === 'saldoInicial')?.valor).toEqual({ tipo: 'dinero', v: 119 });
    expect(payload.pieLegal.textos).toEqual(['Texto propio de la organización']);
  });

  it('un cliente de otra organización es 404', async () => {
    permisos.add('finance.view');
    const tablas = datos();
    tablas.customers[0].organization_id = AJENA;
    expect(await codigoDe(pedir(sesion(tablas), 'estado-cuenta', C1))).toBe('404 NOT_FOUND');
  });
});

/**
 * Tipos conectados el 2026-09-28 (cotización, nota crédito y documento
 * soporte): payload desde la base, permiso resuelto en el servidor,
 * organización ajena → 404 y HTML escapado.
 */
describe('cotización, nota crédito y documento soporte: aislamiento, permisos y escape', () => {
  const NC_E = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const NC_AJENA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const Q_AJENA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const DS1 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const DS_AJENO = '12121212-1212-4121-8121-121212121212';

  type Tablas = ReturnType<typeof datos> & { support_documents: Array<Record<string, unknown>> };

  function tablasExtendidas(): Tablas {
    const t = datos() as Tablas;
    const ventas = t.invoice_sales as Array<Record<string, unknown>>;
    ventas.push(
      { id: NC_E, organization_id: ORG, branch_id: 1, number: 'NC-2', issue_date: '2026-09-26T15:00:00Z', currency: 'COP', subtotal: 10, tax_total: 0, total: 10, balance: 0, status: 'issued', xml_uuid: 'cude0123456789abcdef', document_type: 'credit_note', related_invoice_id: FE1, description: `Motivo ${XSS}`, customer_id: C1, customer: cliente, items: [] },
      { id: NC_AJENA, organization_id: AJENA, branch_id: 5, number: 'NC-OTRA', status: 'issued', total: 1, document_type: 'credit_note', customer: cliente, items: [] },
    );
    t.quotations.push({ ...t.quotations[0], id: Q_AJENA, organization_id: AJENA, number: 'COT-OTRA' });
    t.support_documents = [
      {
        id: DS1, organization_id: ORG, branch_id: 1, supplier_id: 5, invoice_purchase_id: FC1, number: 'DS-9', reference_code: 'REF-DS-9',
        issue_date: '2026-09-24T03:00:00Z', observation: `Observación ${XSS}`, subtotal: 100, tax_total: 19, total: 119, currency: 'COP',
        status: 'accepted', cufe: 'cuds0123456789abcdef', created_at: '2026-09-24T03:00:00Z',
        provider: { names: `Proveedor informal ${XSS}`, identification: '1020304050', identification_document_code: '13', address: 'Vereda 1', email: 'prov@example.com' },
        items: [item],
      },
      { id: DS_AJENO, organization_id: AJENA, branch_id: 5, supplier_id: 6, number: 'DS-OTRO', reference_code: 'REF-X', status: 'draft', created_at: '2026-09-24T03:00:00Z', provider: { names: 'Ajeno' }, items: [] },
    ];
    return t;
  }

  it('nota crédito electrónica: CUDE, QR a la verificación DIAN, factura afectada y motivo escapado', async () => {
    permisos.add('finance.view');
    const { payload, html } = await pedir(sesion(tablasExtendidas()), 'nota-credito', NC_E);
    expect(payload.tipo).toBe('nota-credito');
    expect(payload.tituloClave).toBe('nota-credito-electronica');
    expect(payload.pieLegal.codigoUnico).toEqual({ clave: 'cude', valor: 'cude0123456789abcdef' });
    expect(payload.pieLegal.qr?.contenido).toBe('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cude0123456789abcdef');
    expect(payload.referencia.find((c) => c.clave === 'cufeAfectado')?.valor).toEqual({ tipo: 'texto', v: 'cufe0123456789abcdef' });
    expect(html).toContain('Nota crédito electrónica');
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;script&gt;');
  });

  it('nota crédito: otra organización → 404; sin finance.view (aunque tenga pos.view) → 403 sin leer la nota', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(tablasExtendidas()), 'nota-credito', NC_AJENA))).toBe('404 NOT_FOUND');
    permisos.clear();
    permisos.add('pos.view');
    const s = sesion(tablasExtendidas());
    expect(await codigoDe(pedir(s, 'nota-credito', NC_E))).toBe('403 PERMISSION_REQUIRED');
    expect(s.supabase.consultas.some((c) => c.tabla === 'invoice_sales')).toBe(false);
  });

  it('cotización: otra organización → 404; sin finance.view ni sales_management → 403; cliente escapado', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(tablasExtendidas()), 'cotizacion', Q_AJENA))).toBe('404 NOT_FOUND');
    const { payload, html } = await pedir(sesion(tablasExtendidas()), 'cotizacion', Q1);
    expect(payload.tipo).toBe('cotizacion');
    expect(payload.bandas.map((b) => b.clave)).toContain('noEsFactura');
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;script&gt;');
    permisos.clear();
    const s = sesion(tablasExtendidas());
    expect(await codigoDe(pedir(s, 'cotizacion', Q1))).toBe('403 PERMISSION_REQUIRED');
    expect(s.supabase.consultas.some((c) => c.tabla === 'quotations')).toBe(false);
  });

  it('documento soporte: contraparte del jsonb `provider`, CUDS con QR DIAN, factura de compra asociada y HTML escapado', async () => {
    permisos.add('finance.view');
    const s = sesion(tablasExtendidas());
    const { payload, html } = await pedir(s, 'documento-soporte', DS1);
    expect(payload.tipo).toBe('documento-soporte');
    expect(payload.numero).toBe('DS-9');
    expect(payload.estado).toEqual({ codigo: 'soporte.accepted', tono: 'exito' });
    expect(payload.contraparte).toMatchObject({ rol: 'proveedor', tipoDocumento: 'CC', numeroDocumento: '1020304050', direccion: 'Vereda 1' });
    expect(payload.pieLegal.codigoUnico).toEqual({ clave: 'cuds', valor: 'cuds0123456789abcdef' });
    expect(payload.pieLegal.qr?.contenido).toBe('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cuds0123456789abcdef');
    expect(payload.referencia.find((c) => c.clave === 'facturaCompraAsociada')?.valor).toEqual({ tipo: 'texto', v: 'PROV-77' });
    expect(payload.lineas).toHaveLength(1);
    // 03:00 UTC del 24 = 23 de septiembre en Bogotá.
    expect(html).toContain('23/09/2026');
    expect(html).toContain('Aceptado DIAN');
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;script&gt;');
    // `support_documents` no tiene FK a `suppliers`: no se embebe (PostgREST fallaría); se lee aparte.
    const principal = s.supabase.consultas.find((c) => c.tabla === 'support_documents');
    expect(principal?.columnas).not.toMatch(/suppliers\s*\(/);
    expect(principal?.columnas).toMatch(/invoice_items\s*\(/);
    const sinOrganizacion = s.supabase.consultas
      .filter((c) => !['organizations', 'tax_templates', 'profiles'].includes(c.tabla))
      .filter((c) => !c.filtros.some(([col, , v]) => col === 'organization_id' && v === ORG));
    expect(sinOrganizacion).toEqual([]);
  });

  it('documento soporte: sin datos en `provider` usa el proveedor de la organización; estado desconocido sale como borrador', async () => {
    permisos.add('finance.view');
    const t = tablasExtendidas();
    const ds = t.support_documents[0];
    ds.provider = {};
    ds.status = 'raro';
    ds.cufe = null;
    const { payload } = await pedir(sesion(t), 'documento-soporte', DS1);
    expect(payload.contraparte).toMatchObject({ nombre: 'Proveedor Uno', numeroDocumento: '800' });
    expect(payload.estado?.codigo).toBe('soporte.draft');
    expect(payload.pieLegal.qr).toBeNull();
  });

  it('documento soporte: otra organización → 404; sin finance.view → 403 sin leer el documento', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(tablasExtendidas()), 'documento-soporte', DS_AJENO))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(sesion(tablasExtendidas()), 'documento-soporte', 'no-es-uuid'))).toBe('404 NOT_FOUND');
    permisos.clear();
    permisos.add('pos.view');
    const s = sesion(tablasExtendidas());
    expect(await codigoDe(pedir(s, 'documento-soporte', DS1))).toBe('403 PERMISSION_REQUIRED');
    expect(s.supabase.consultas.some((c) => c.tabla === 'support_documents')).toBe(false);
  });
});

it('contextoMoneda del doble es el real', () => {
  expect(contextoMoneda('USD').code).toBe('USD');
});
