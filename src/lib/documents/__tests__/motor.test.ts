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

it('contextoMoneda del doble es el real', () => {
  expect(contextoMoneda('USD').code).toBe('USD');
});
