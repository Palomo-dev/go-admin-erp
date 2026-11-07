/**
 * Notas crédito y débito (Frente D3, ronda 3 de Finanzas).
 *
 * - Lógica pura: estado DIAN derivado, concepto y motivo guardados en la
 *   descripción, filtros/orden/KPI del listado, anulabilidad, totales de la nota
 *   débito, acciones del detalle.
 * - Rutas de la nota débito: organización de la sesión, permiso en el servidor,
 *   501 `nota_debito_no_disponible` mientras la migración no esté aplicada (sin
 *   escribir nada), y la RPC con los argumentos esperados cuando exista.
 * - Caracterización: lo que NO cambia (emisión y anulación de la nota crédito,
 *   la cola de la DIAN que aún no despacha notas débito, la ruta 501 de Factus).
 * - SQL de la migración 20261108030000 (sin aplicar): guardas y revoke.
 */
import * as fs from 'fs';
import * as path from 'path';

const FACTURA = '11111111-2222-4333-8444-555555555555';
const NOTA = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const IMPUESTO = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { code?: string; message: string },
  ajena: false,
  tipo: 'debit_note' as string,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

jest.mock('@/lib/services/einvoicing/colaFacturacion.server', () => ({ encolarDocumento: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));

function consultaFalsa(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    order: () => q,
    in: () => q,
    eq: (col: string, v: unknown) => {
      filtros[col] = v;
      return q;
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    maybeSingle: async () => {
      if (guion.ajena || filtros.organization_id !== 120) return { data: null, error: null };
      if (tabla === 'invoice_sales' && filtros.id === FACTURA) {
        return {
          data: {
            id: FACTURA,
            number: 'FV-1042',
            status: 'issued',
            document_type: null,
            balance: 628702,
            total: 1767532,
            currency: 'COP',
            einvoice_status: 'accepted',
            issue_date: '2026-09-22T15:00:00Z',
            due_date: '2026-10-22T15:00:00Z',
            customers: { full_name: 'Cliente de prueba' },
          },
          error: null,
        };
      }
      if (tabla === 'invoice_sales' && filtros.id === NOTA) return { data: { id: NOTA, document_type: guion.tipo }, error: null };
      return { data: null, error: null };
    },
  };
  return q;
}

const supabaseFalso = {
  from: (tabla: string) => consultaFalsa(tabla),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre === 'fn_nota_debito_emitir') return { data: { id: NOTA, numero: 'ND-0003', total: 53550, repetida: false, fe_factura: 'accepted' }, error: null };
    if (nombre === 'fn_nota_debito_anular') return { data: { id: NOTA, status: 'void', ya_anulada: false }, error: null };
    return { data: 'IVA_19', error: null };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false };
  return {
    OrgContextError,
    hasOrgAdminOrPermission: jest.fn(async (_c: unknown, code: string) => guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        try {
          return await handler({ ...ctx, supabase: supabaseFalso }, req, params);
        } catch (err) {
          if (err instanceof OrgContextError) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

import { GET as GET_ND, POST as POST_ND } from '@/app/api/facturas-venta/[id]/nota-debito/route';
import { POST as ANULAR_ND } from '@/app/api/notas-debito/[id]/anular/route';
import {
  anulabilidadNota,
  codigoErrorNotaDebito,
  conceptoDeDescripcion,
  conceptoNotaCreditoDerivado,
  consecuenciasAnular,
  esFuncionInexistente,
  estadoDianNota,
  estadoHttpErrorNotaDebito,
  facturaAdmiteNotaDebito,
  faltantesNotaDebito,
  filtrarNotas,
  kpisNotas,
  leerConsultaNotas,
  lineasParaEnviar,
  motivoDeDescripcion,
  ordenarNotas,
  paginar,
  puedeEnviarDian,
  totalesNotaDebito,
  type FilaNota,
} from '@/lib/finanzas/notas/contratoNotas';
import { accionesDetalleNota, detalleConceptoFila, lineasEnPositivo, pagadoNota } from '@/components/finanzas/notas/notasVistaLogica';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.ajena = false;
  guion.tipo = 'debit_note';
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── Lógica pura ─────────────────────────────────────────────────────────────

describe('estado DIAN derivado', () => {
  test('sin FE en la factura → no aplica; factura en camino → espera; aceptada sin envío → sin enviar', () => {
    expect(estadoDianNota({ notaFe: null, facturaFe: null })).toBe('no_aplica');
    expect(estadoDianNota({ notaFe: null, facturaFe: 'pending' })).toBe('espera_factura');
    expect(estadoDianNota({ notaFe: null, facturaFe: 'cancelled' })).toBe('no_aplica');
    expect(estadoDianNota({ notaFe: null, facturaFe: 'accepted' })).toBe('sin_enviar');
  });
  test('el envío propio de la nota manda; retenido se distingue de en cola', () => {
    expect(estadoDianNota({ notaFe: 'pending', facturaFe: 'accepted', retenida: true })).toBe('retenido');
    expect(estadoDianNota({ notaFe: 'pending', facturaFe: 'accepted' })).toBe('en_cola');
    expect(estadoDianNota({ notaFe: 'sent', facturaFe: 'accepted' })).toBe('en_envio');
    expect(estadoDianNota({ notaFe: 'accepted', facturaFe: 'accepted' })).toBe('aceptada');
    expect(estadoDianNota({ notaFe: 'rejected', facturaFe: 'accepted' })).toBe('rechazada');
    expect(estadoDianNota({ notaFe: 'failed', facturaFe: 'accepted' })).toBe('error');
  });
  test('enviar a la DIAN solo con la factura aceptada, rechazo o error, y nunca anulada', () => {
    expect(puedeEnviarDian('sin_enviar', false)).toBe(true);
    expect(puedeEnviarDian('rechazada', false)).toBe(true);
    expect(puedeEnviarDian('no_aplica', false)).toBe(false);
    expect(puedeEnviarDian('aceptada', false)).toBe(false);
    expect(puedeEnviarDian('sin_enviar', true)).toBe(false);
  });
});

describe('concepto y motivo', () => {
  test('el motivo sale del final de la descripción que escriben las RPC', () => {
    expect(motivoDeDescripcion('Nota crédito de la factura FV-1. Motivo: El cliente devolvió todo')).toBe('El cliente devolvió todo');
    expect(motivoDeDescripcion('Nota débito de la factura FV-1. Concepto DIAN: 2. Motivo: Gastos de cobranza')).toBe('Gastos de cobranza');
    expect(motivoDeDescripcion(null)).toBeNull();
    expect(conceptoDeDescripcion('Nota débito de la factura FV-1. Concepto DIAN: 2. Motivo: x')).toBe('2');
    expect(conceptoDeDescripcion('sin concepto')).toBeNull();
  });
  test('concepto de la nota crédito: el del envío, o la regla de la cola', () => {
    expect(conceptoNotaCreditoDerivado({ concepto: '4', totalNota: 1, totalFactura: 10, conProductos: true })).toBe('4');
    expect(conceptoNotaCreditoDerivado({ totalNota: 100, totalFactura: 100, conProductos: true })).toBe('2');
    expect(conceptoNotaCreditoDerivado({ totalNota: 10, totalFactura: 100, conProductos: true })).toBe('1');
    expect(conceptoNotaCreditoDerivado({ totalNota: 10, totalFactura: 100, conProductos: false })).toBe('3');
  });
});

const fila = (p: Partial<FilaNota>): FilaNota => ({
  id: 'n',
  tipo: 'credito',
  numero: 'NC-1',
  fecha: '2026-09-01T10:00:00Z',
  estado: 'issued',
  anulada: false,
  valor: 100,
  saldo: 0,
  moneda: 'COP',
  branchId: 1,
  cliente: 'Cliente Uno',
  clienteDoc: '900',
  clienteId: 'c',
  factura: { id: 'f', numero: 'FV-1' },
  concepto: '1',
  motivo: 'Devolución',
  dian: 'no_aplica',
  excedente: 0,
  conProductos: true,
  ...p,
});

describe('listado', () => {
  const filas = [
    fila({ id: 'a', numero: 'NC-2', valor: 300, fecha: '2026-09-03T00:00:00Z', excedente: 50, dian: 'sin_enviar' }),
    fila({ id: 'b', numero: 'NC-10', valor: 100, cliente: 'Álvaro Peña', fecha: '2026-09-02T00:00:00Z' }),
    fila({ id: 'c', numero: 'NC-1', valor: 200, anulada: true, estado: 'void', fecha: '2026-09-01T00:00:00Z' }),
  ];
  test('la búsqueda ignora tildes y mayúsculas y mira número, cliente, factura y motivo', () => {
    expect(filtrarNotas(filas, { q: 'alvaro' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarNotas(filas, { q: 'fv-1' })).toHaveLength(3);
    expect(filtrarNotas(filas, { estado: 'anulada' }).map((f) => f.id)).toEqual(['c']);
    expect(filtrarNotas(filas, { estado: 'emitida' }).map((f) => f.id)).toEqual(['a', 'b']);
    expect(filtrarNotas(filas, { dian: 'sin_enviar' }).map((f) => f.id)).toEqual(['a']);
  });
  test('orden por número natural, valor y fecha; paginación', () => {
    expect(ordenarNotas(filas, 'numero', 'asc').map((f) => f.numero)).toEqual(['NC-1', 'NC-2', 'NC-10']);
    expect(ordenarNotas(filas, 'valor', 'desc').map((f) => f.valor)).toEqual([300, 200, 100]);
    expect(ordenarNotas(filas, 'fecha', 'desc').map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });
  test('KPI: solo notas vivas suman; anuladas se cuentan aparte', () => {
    expect(kpisNotas(filas)).toEqual({ valor: 400, notas: 2, excedente: 50, notasConExcedente: 1, anuladas: 1, sinEnviar: 1, porCobrar: 0 });
  });
  test('la consulta de la URL se valida con listas blancas', () => {
    const c = leerConsultaNotas(new URLSearchParams('tipo=debito&dian=retenido&pagina=2&tamano=50&orden=valor&dir=asc&organization_id=999'));
    expect(c).toMatchObject({ tipo: 'debito', dian: 'retenido', pagina: 2, tamano: 50, orden: 'valor', dir: 'asc' });
    expect(c).not.toHaveProperty('organization_id');
    expect(leerConsultaNotas(new URLSearchParams('tipo=otro'))).toBeNull();
    expect(leerConsultaNotas(new URLSearchParams(''))).toMatchObject({ tipo: 'credito', orden: 'fecha', dir: 'desc', pagina: 1, tamano: 25 });
  });
  test('subtítulo del concepto en la fila', () => {
    expect(detalleConceptoFila(fila({ anulada: true, motivo: 'se emitió dos veces' }))).toEqual({ clave: 'anulada', motivo: 'se emitió dos veces' });
    expect(detalleConceptoFila(fila({ excedente: 10 })).clave).toBe('excedente');
    expect(detalleConceptoFila(fila({ conProductos: false })).clave).toBe('sinMercancia');
    expect(detalleConceptoFila(fila({ tipo: 'debito', saldo: 5 })).clave).toBe('porCobrar');
  });
});

describe('anular', () => {
  test('aceptada por la DIAN o en envío: bloqueada; nota débito con pagos: bloqueada', () => {
    const base = { tipo: 'credito' as const, anulada: false, permisoAnular: true };
    expect(anulabilidadNota({ ...base, dian: 'no_aplica' })).toEqual({ ok: true });
    expect(anulabilidadNota({ ...base, dian: 'aceptada' })).toEqual({ ok: false, motivo: 'aceptada_dian' });
    expect(anulabilidadNota({ ...base, dian: 'en_envio' })).toEqual({ ok: false, motivo: 'en_envio_dian' });
    expect(anulabilidadNota({ ...base, dian: 'no_aplica', anulada: true })).toEqual({ ok: false, motivo: 'ya_anulada' });
    expect(anulabilidadNota({ ...base, dian: 'no_aplica', permisoAnular: false })).toEqual({ ok: false, motivo: 'sin_permiso' });
    expect(anulabilidadNota({ ...base, tipo: 'debito', dian: 'no_aplica', pagado: 10 })).toEqual({ ok: false, motivo: 'con_pagos' });
  });
  test('consecuencias según lo que la nota movió', () => {
    expect(consecuenciasAnular({ tipo: 'credito', saldoAFavor: true, devolucion: false, productosReingresados: 2 })).toEqual([
      'factura_vuelve',
      'asiento',
      'inventario',
      'saldo_a_favor',
    ]);
    expect(consecuenciasAnular({ tipo: 'debito', saldoAFavor: false, devolucion: false, productosReingresados: 0 })).toEqual(['cartera_nd', 'asiento']);
  });
});

describe('nota débito: diálogo', () => {
  const impuestos = [{ id: IMPUESTO, nombre: 'IVA 19%', tarifa: 19 }];
  test('totales como fn_nota_debito_emitir: base + impuesto, redondeo por línea', () => {
    const r = totalesNotaDebito(
      [
        { id: '1', descripcion: 'Gastos de cobranza', cantidad: 1, valorUnitario: 45000, impuestoId: IMPUESTO },
        { id: '2', descripcion: 'Intereses', cantidad: 2, valorUnitario: 1000.005, impuestoId: null },
      ],
      impuestos,
    );
    expect(r.subtotal).toBe(47000.01);
    expect(r.impuestos).toEqual([{ nombre: 'IVA 19%', tarifa: 19, base: 45000, importe: 8550 }]);
    expect(r.total).toBe(55550.01);
  });
  test('lo que falta y lo que se envía', () => {
    const lineas = [
      { id: '1', descripcion: ' Gastos ', cantidad: 1, valorUnitario: 10, impuestoId: null },
      { id: '2', descripcion: '', cantidad: 1, valorUnitario: null, impuestoId: null },
    ];
    expect(faltantesNotaDebito({ concepto: null, motivo: 'abc', lineas })).toEqual(['concepto', 'motivo', 'lineaIncompleta']);
    expect(faltantesNotaDebito({ concepto: '2', motivo: 'Gastos de cobranza', lineas: [lineas[0]] })).toEqual([]);
    expect(lineasParaEnviar(lineas)).toEqual([{ descripcion: 'Gastos', cantidad: 1, valorUnitario: 10, impuestoId: null }]);
  });
  test('solo sobre una factura emitida y viva', () => {
    expect(facturaAdmiteNotaDebito({ estado: 'issued', tipoDocumento: null })).toBe(true);
    expect(facturaAdmiteNotaDebito({ estado: 'paid', tipoDocumento: 'invoice' })).toBe(true);
    expect(facturaAdmiteNotaDebito({ estado: 'draft', tipoDocumento: 'invoice' })).toBe(false);
    expect(facturaAdmiteNotaDebito({ estado: 'void', tipoDocumento: 'invoice' })).toBe(false);
    expect(facturaAdmiteNotaDebito({ estado: 'issued', tipoDocumento: 'credit_note' })).toBe(false);
  });
  test('códigos y estados HTTP; función inexistente', () => {
    expect(codigoErrorNotaDebito('sin_numeracion')).toBe('sin_numeracion');
    expect(codigoErrorNotaDebito('Acceso denegado a la organización 5')).toBe('factura_no_encontrada');
    expect(codigoErrorNotaDebito('otra cosa')).toBe('error_desconocido');
    expect(estadoHttpErrorNotaDebito('nota_debito_no_disponible')).toBe(501);
    expect(estadoHttpErrorNotaDebito('nota_con_pagos')).toBe(409);
    expect(estadoHttpErrorNotaDebito('sin_permiso')).toBe(403);
    expect(esFuncionInexistente({ code: 'PGRST202', message: '' })).toBe(true);
    expect(esFuncionInexistente({ code: '42883', message: '' })).toBe(true);
    expect(esFuncionInexistente({ code: 'P0001', message: 'sin_numeracion' })).toBe(false);
  });
});

describe('detalle: presentación', () => {
  test('las líneas de la nota crédito se muestran en positivo', () => {
    const [l] = lineasEnPositivo([
      { id: 'x', productId: 1, descripcion: 'A', sku: null, cantidad: -3, precioUnitario: 10, descuento: -1, tarifa: 19, codigoImpuesto: 'IVA_19', nombreImpuesto: null, incluido: false, total: -35.7, seriales: [], nota: null },
    ]);
    expect([l.cantidad, l.descuento, l.total]).toEqual([3, 1, 35.7]);
    expect(pagadoNota([{ estado: 'completed', monto: 10.1 }, { estado: 'voided', monto: 5 }, { estado: 'completed', monto: 0.2 }])).toBe(10.3);
  });
  test('acciones: conserva PDF, imprimir, enviar/reintentar y anular; la nota débito cobra', () => {
    const permisos = { ver: true, crear: true, anular: true };
    const nc = accionesDetalleNota({ tipo: 'credito', anulada: false, dian: 'sin_enviar', saldo: 0, tieneFactura: true, tieneSaldoAFavor: true, jobId: null, permisos });
    expect([...nc].sort()).toEqual(['anular', 'descargar_pdf', 'enviar_dian', 'imprimir', 'ver_factura', 'ver_saldo_a_favor']);
    const reintento = accionesDetalleNota({ tipo: 'credito', anulada: false, dian: 'rechazada', saldo: 0, tieneFactura: true, tieneSaldoAFavor: false, jobId: 'j', permisos });
    expect(reintento.has('reintentar_dian')).toBe(true);
    const nd = accionesDetalleNota({ tipo: 'debito', anulada: false, dian: 'no_aplica', saldo: 50, tieneFactura: true, tieneSaldoAFavor: false, jobId: null, permisos });
    expect(nd.has('registrar_pago')).toBe(true);
    expect(nd.has('descargar_pdf')).toBe(false);
    expect(accionesDetalleNota({ tipo: 'credito', anulada: true, dian: 'no_aplica', saldo: 0, tieneFactura: false, tieneSaldoAFavor: false, jobId: null, permisos }).has('anular')).toBe(false);
    expect(accionesDetalleNota({ tipo: 'credito', anulada: false, dian: 'no_aplica', saldo: 0, tieneFactura: false, tieneSaldoAFavor: false, jobId: null, permisos: { ver: false, crear: true, anular: true } }).size).toBe(0);
  });
});

// ─── Rutas de la nota débito ─────────────────────────────────────────────────

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const cuerpoValido = {
  concepto: '2',
  motivo: 'Gastos de cobranza de septiembre',
  lineas: [{ descripcion: 'Gastos de cobranza', cantidad: 1, valorUnitario: 45000, impuestoId: IMPUESTO }],
  claveIdempotencia: 'nota_debito-abc-123',
};
const post = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /api/facturas-venta/[id]/nota-debito', () => {
  const llamar = async (body: unknown, id = FACTURA) => {
    const r = await POST_ND(post(`http://x/api/facturas-venta/${id}/nota-debito`, body), params(id) as never);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };

  test('sin finance.create → 403 sin tocar la base; organización ajena en el cuerpo → 403', async () => {
    guion.permisos = new Set(['finance.view', 'finance.void']);
    expect((await llamar(cuerpoValido)).status).toBe(403);
    guion.permisos = new Set(['finance.create']);
    expect((await llamar({ ...cuerpoValido, organization_id: 999 })).status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  test('datos inválidos → 400; factura de otra organización → 404 sin RPC', async () => {
    expect((await llamar({ ...cuerpoValido, concepto: '5' })).status).toBe(400);
    expect((await llamar({ ...cuerpoValido, lineas: [] })).status).toBe(400);
    guion.ajena = true;
    expect((await llamar(cuerpoValido)).status).toBe(404);
    expect(rpcs).toEqual([]);
  });

  test('migración sin aplicar → 501 nota_debito_no_disponible', async () => {
    guion.errorRpc = { code: 'PGRST202', message: 'Could not find the function public.fn_nota_debito_emitir' };
    const r = await llamar(cuerpoValido);
    expect(r.status).toBe(501);
    expect(r.json.codigo).toBe('nota_debito_no_disponible');
  });

  test('emite por la RPC con el impuesto por id (el servidor lo resuelve) y no encola a la DIAN', async () => {
    const r = await llamar(cuerpoValido);
    expect(r.status).toBe(201);
    expect(rpcs).toEqual([
      {
        nombre: 'fn_nota_debito_emitir',
        args: {
          p_invoice_id: FACTURA,
          p_concepto: '2',
          p_lineas: [{ descripcion: 'Gastos de cobranza', cantidad: 1, valor_unitario: 45000, impuesto_id: IMPUESTO }],
          p_motivo: 'Gastos de cobranza de septiembre',
          p_clave_idempotencia: 'nota_debito-abc-123',
        },
      },
    ]);
    expect(r.json.resultado).toEqual({ id: NOTA, numero: 'ND-0003', total: 53550, repetida: false, fe: 'pendiente' });
    const { encolarDocumento } = jest.requireMock('@/lib/services/einvoicing/colaFacturacion.server') as { encolarDocumento: jest.Mock };
    expect(encolarDocumento).not.toHaveBeenCalled();
  });

  test('errores de la RPC con su código', async () => {
    guion.errorRpc = { code: 'P0001', message: 'sin_numeracion' };
    const r = await llamar(cuerpoValido);
    expect(r.status).toBe(409);
    expect(r.json.codigo).toBe('sin_numeracion');
  });

  test('GET: contexto con la factura, disponibilidad y sin credenciales; exige finance.create', async () => {
    const r = await GET_ND(new Request(`http://x/api/facturas-venta/${FACTURA}/nota-debito`), params(FACTURA) as never);
    expect(r.status).toBe(200);
    const { contexto } = (await r.json()) as { contexto: Record<string, unknown> };
    expect(contexto.disponible).toBe(true);
    expect(contexto.factura).toMatchObject({ numero: 'FV-1042', feAceptada: true, saldo: 628702 });
    guion.permisos = new Set(['finance.view']);
    expect((await GET_ND(new Request(`http://x/api/facturas-venta/${FACTURA}/nota-debito`), params(FACTURA) as never)).status).toBe(403);
  });
});

describe('POST /api/notas-debito/[id]/anular', () => {
  const llamar = async (body: unknown) => {
    const r = await ANULAR_ND(post(`http://x/api/notas-debito/${NOTA}/anular`, body), params(NOTA) as never);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  test('sin finance.void → 403; motivo corto → 400; una nota crédito no se anula por aquí → 404', async () => {
    guion.permisos = new Set(['finance.view', 'finance.create']);
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(403);
    guion.permisos = new Set(['finance.void']);
    expect((await llamar({ motivo: 'x' })).status).toBe(400);
    guion.tipo = 'credit_note';
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(404);
    expect(rpcs).toEqual([]);
  });
  test('llama a fn_nota_debito_anular; sin migración → 501', async () => {
    const r = await llamar({ motivo: '  Nota mal emitida ' });
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([{ nombre: 'fn_nota_debito_anular', args: { p_nota_id: NOTA, p_motivo: 'Nota mal emitida' } }]);
    guion.errorRpc = { code: '42883', message: 'function public.fn_nota_debito_anular(uuid, text) does not exist' };
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(501);
  });
});

// ─── Caracterización: lo que no cambia ───────────────────────────────────────

describe('caracterización', () => {
  test('la emisión de la nota crédito sigue por fn_nota_credito_emitir y su cola (sin cambios)', () => {
    const src = leer('src/lib/services/ventas/notaCredito.server.ts');
    expect(src).toMatch(/rpc\('fn_nota_credito_emitir'/);
    expect(src).toMatch(/documentType: 'credit_note'/);
    expect(src).toMatch(/rpc\('fn_nota_credito_anular'/);
  });
  test('la cola de la DIAN aún no despacha notas débito y Factus /debit-note sigue en 501', () => {
    const cola = leer('src/lib/services/einvoicing/colaFacturacion.server.ts');
    expect(cola).toMatch(/case 'invoice':\s*return construirEnvioFactura/);
    expect(cola).toMatch(/case 'credit_note':\s*return construirEnvioNotaCredito/);
    expect(cola).toMatch(/la nota débito todavía no se envía por la cola/);
    expect(leer('src/app/api/factus/debit-note/route.ts')).toMatch(/status: 501/);
  });
  test('el listado y el detalle de notas usan las rutas del servidor, no el navegador', () => {
    const listado = leer('src/components/finanzas/notas/ListadoNotas.tsx');
    const detalle = leer('src/components/finanzas/notas/DetalleNota.tsx');
    for (const src of [listado, detalle]) {
      expect(src).not.toMatch(/@\/lib\/supabase\/config/);
      expect(src).not.toMatch(/notasCreditoService/);
      expect(src).not.toMatch(/dark:/);
    }
    expect(fs.existsSync(path.join(RAIZ, 'src/components/finanzas/notas-credito/NotasCreditoPage.tsx'))).toBe(false);
  });
  test('el cobro admite la nota débito como documento por cobrar; la nota crédito no', () => {
    expect(leer('src/lib/services/pagos/pagos.server.ts')).toMatch(/\['invoice', 'debit_note'\]\.includes/);
  });
});

describe('SQL de 20261108030000 (sin aplicar)', () => {
  const sql = leer('supabase/migrations/20261108030000_nota_debito.sql');
  const rollback = leer('supabase/rollbacks/20261108030000_nota_debito_rollback.sql');
  test('guardas de organización, permiso, sucursal e idempotencia', () => {
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(v_inv\.organization_id, array\['finance\.create'\]\)/);
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(v_nd\.organization_id, array\['finance\.void'\]\)/);
    expect(sql).toMatch(/app_branch_access/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('nota_debito:'/);
    expect(sql).toMatch(/fn_get_next_invoice_number\(v_inv\.organization_id, v_inv\.branch_id, 'debit_note'\)/);
    expect(sql).toMatch(/from public\.organization_taxes t\s+where t\.id = v_tax_id and t\.organization_id = v_inv\.organization_id/);
  });
  test('cerradas a anon; nunca escribe accounts_receivable a mano', () => {
    for (const f of ['fn_nota_debito_emitir(uuid, text, jsonb, text, text)', 'fn_nota_debito_anular(uuid, text)']) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon;`);
    }
    expect(sql).not.toMatch(/insert into public\.accounts_receivable|update public\.accounts_receivable/);
  });
  test('fn_registrar_pago: reemplazo verificado de una sola línea, y su reverso', () => {
    expect(sql).toMatch(/if v_veces <> 1 then/);
    expect(sql).toMatch(/not in \('invoice', 'debit_note'\)/);
    expect(rollback).toMatch(/execute replace\(v_def, v_nuevo, v_viejo\)/);
    expect(rollback).toMatch(/No revierte datos/);
  });
});
