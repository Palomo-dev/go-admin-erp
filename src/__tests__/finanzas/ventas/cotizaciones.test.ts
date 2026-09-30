/**
 * Cotizaciones en el servidor (20260928172526 y rutas `/api/cotizaciones/**`).
 *
 * Antes `cotizacionesService.ts` escribía desde el navegador sin permiso: la
 * conversión numeraba FACT- en el navegador e insertaba la factura YA emitida
 * sin venta, impuestos, comisión ni transacción; guardar/editar/estado/borrar
 * eran llamadas sueltas, algunas sin filtro de organización; 'expired' nunca
 * se asignaba.
 *
 * - Rutas: organización de la sesión (ajena en el cuerpo → 403), permisos en
 *   el servidor (leer finance.view|sales_management, escribir
 *   finance.create|sales_management, convertir finance.create), cotización de
 *   otra organización → 404, lo que recibe cada RPC.
 * - Conversión: número propuesto con la regla de facturas, tasa de comisión
 *   del vendedor, reintento ante numero_duplicado, idempotente.
 * - SQL: transacciones, permisos, revoke a anon, estado vivo, numeración única.
 * - Cliente y CRM: nada escribe `quotations` desde el navegador; el CRM usa
 *   las mismas RPC y la misma numeración.
 * - Dry-run de la migración anotado en su cabecera (org 125, transacción deshecha).
 */
import * as fs from 'fs';
import * as path from 'path';

const COT = '11111111-2222-4333-8444-555555555555';
const CLIENTE = '22222222-3333-4444-8555-666666666666';

const guion = {
  permisos: new Set<string>(),
  errores: {} as Record<string, { message: string }[]>,
  listado: [] as Record<string, unknown>[],
  vendedor: 'u-vend' as string | null,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
const numeros: string[] = [];
const correos: unknown[] = [];

jest.mock('@/lib/services/taxResolverCore', () => ({
  // Sin tarifa propia toma la del documento (como el resolver real, paso 2).
  resolveLineTaxWith: jest.fn(async (_c: unknown, i: { itemTaxRate?: number; itemTaxCode?: string | null; appliedTaxTotals?: Record<string, { rate: number }>; taxIncluded: boolean }) => {
    const doc = Object.entries(i.appliedTaxTotals ?? {})[0];
    const rate = Number(i.itemTaxRate) > 0 ? Number(i.itemTaxRate) : doc ? doc[1].rate : 0;
    const code = Number(i.itemTaxRate) > 0 ? i.itemTaxCode ?? null : doc ? doc[0] : null;
    return { tax_rate: rate, tax_code: code, tax_included: i.taxIncluded, total_line: 999999, has_no_tax: rate <= 0 };
  }),
}));
jest.mock('@/lib/utils/invoiceUtils', () => ({
  generateInvoiceNumberWithClient: jest.fn(async () => {
    const n = `FACT-00${10 + numeros.length}`;
    numeros.push(n);
    return n;
  }),
}));
jest.mock('@/lib/services/comisiones/tasaComision', () => ({
  resolverTasaComision: jest.fn(async (_c: unknown, org: number, vendedor: string | null) => (org === 120 && vendedor === 'u-vend' ? 7 : 0)),
}));
jest.mock('@/lib/services/finanzas/enviarDocumento.server', () => {
  class ErrorEnvioServidor extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }
  return {
    ErrorEnvioServidor,
    escaparHtml: (t: string) => t,
    enviarDocumentoPorCorreo: jest.fn(async (_c: unknown, envio: unknown) => {
      correos.push(envio);
      return { emailMessageId: 'm-1', adjunto: true };
    }),
  };
});

function consulta(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      filtros[col] = v;
      return q;
    },
    order: () => q,
    maybeSingle: async () => {
      if (tabla === 'profiles') return { data: { preferred_language: 'es' }, error: null };
      if (tabla === 'quotations') {
        const ok = filtros.id === COT && filtros.organization_id === 120;
        return { data: ok ? { id: COT, salesperson_id: guion.vendedor, notes: null, terms_conditions: null } : null, error: null };
      }
      if (tabla === 'customers') return { data: { id: CLIENTE, full_name: 'Cliente', email: 'c@example.com' }, error: null };
      return { data: null, error: null };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
  };
  return q;
}

const supabaseFalso = {
  from: (tabla: string) => consulta(tabla),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    const cola = guion.errores[nombre];
    if (cola && cola.length) return { data: null, error: cola.shift()! };
    switch (nombre) {
      case 'fn_cotizaciones_listado':
        return { data: guion.listado.filter((f) => !(args.p_filtros as { id?: string }).id || f.id === (args.p_filtros as { id?: string }).id), error: null };
      case 'fn_cotizacion_guardar':
        return { data: { id: COT, numero: 'COT-0007', total: 3451 }, error: null };
      case 'fn_cotizacion_convertir':
        return { data: { invoice_id: 'inv-1', numero: args.p_numero, faltantes: [], ya_convertida: false }, error: null };
      case 'fn_cotizacion_cambiar_estado':
        return { data: { id: COT, status: args.p_estado, sin_cambio: false }, error: null };
      default:
        return { data: {}, error: null };
    }
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false, organizationName: 'Org', userEmail: 'u@example.com' };
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

import * as rutaLista from '@/app/api/cotizaciones/route';
import * as rutaId from '@/app/api/cotizaciones/[id]/route';
import * as rutaEstado from '@/app/api/cotizaciones/[id]/estado/route';
import * as rutaConvertir from '@/app/api/cotizaciones/[id]/convertir/route';
import * as rutaEnviar from '@/app/api/cotizaciones/[id]/enviar/route';
import * as rutaDuplicar from '@/app/api/cotizaciones/[id]/duplicar/route';
import { codigoErrorCotizacion, ERRORES_COTIZACION, estadoHttpErrorCotizacion } from '@/lib/finanzas/ventas/contratoCotizaciones';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

type Handler = (req: Request, rp: unknown) => Promise<Response>;
async function llamar(h: unknown, metodo: string, url: string, body?: unknown, id = COT) {
  const req = new Request(`http://x${url}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res = await (h as Handler)(req, { params: Promise.resolve({ id }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const rpcDe = (nombre: string) => rpcs.filter((r) => r.nombre === nombre);

const cuerpo = {
  customer_id: CLIENTE,
  branch_id: 99,
  valid_until: '2026-10-28',
  number: 'HACK-1',
  total: 1,
  subtotal: 1,
  tax_included: false,
  applied_taxes: [{ tax_code: 'IVA_19', tax_rate: 19 }],
  items: [
    { product_id: 5, description: 'Producto', qty: 2, unit_price: 1000, discount_amount: 100, tax_rate: 0, total_line: 1 },
    { description: 'Servicio', qty: 1, unit_price: 500, tax_rate: 5, tax_code: 'IVA_5', total_line: 1 },
  ],
};

const fila = (over: Record<string, unknown> = {}) => ({
  id: COT, number: 'COT-0001', status: 'sent', estado: 'expired', customer_id: CLIENTE, customer_name: 'Cliente',
  branch_id: 99, issue_date: '2026-08-12', valid_until: '2026-09-11', currency: 'COP', subtotal: 2900, tax_total: 551,
  discount_total: 100, total: 3451, converted_invoice_id: null, ...over,
});

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create']);
  guion.errores = {};
  guion.listado = [fila()];
  guion.vendedor = 'u-vend';
  rpcs.length = 0;
  numeros.length = 0;
  correos.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('crear y editar', () => {
  test('sin finance.create ni sales_management → 403 y no toca la base', async () => {
    guion.permisos = new Set(['finance.view']);
    const r = await llamar(rutaLista.POST, 'POST', '/api/cotizaciones', cuerpo);
    expect(r.status).toBe(403);
    expect(r.json.codigo).toBe('sin_permiso');
    expect(rpcs).toEqual([]);
  });

  test('sales_management basta para escribir (vendedores del CRM)', async () => {
    guion.permisos = new Set(['sales_management']);
    expect((await llamar(rutaLista.POST, 'POST', '/api/cotizaciones', cuerpo)).status).toBe(201);
  });

  test('organización ajena en el cuerpo → 403', async () => {
    expect((await llamar(rutaLista.POST, 'POST', '/api/cotizaciones', { ...cuerpo, organization_id: 7 })).status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  test('la base recibe la organización de la sesión, las líneas con su impuesto resuelto y NI número NI totales del cliente', async () => {
    const r = await llamar(rutaLista.POST, 'POST', '/api/cotizaciones', cuerpo);
    expect(r.status).toBe(201);
    expect(r.json.resultado).toEqual({ id: COT, numero: 'COT-0007', total: 3451 });
    const [llamada] = rpcDe('fn_cotizacion_guardar');
    expect(llamada.args.p_org).toBe(120);
    expect(llamada.args.p_id).toBeNull();
    const datos = llamada.args.p_datos as Record<string, unknown>;
    expect(datos).not.toHaveProperty('number');
    expect(datos).not.toHaveProperty('total');
    expect(datos).not.toHaveProperty('subtotal');
    expect(datos).not.toHaveProperty('applied_taxes');
    expect(datos.tax_included).toBe(false);
    expect(datos.items).toEqual([
      { product_id: 5, description: 'Producto', qty: 2, unit_price: 1000, discount_amount: 100, tax_code: 'IVA_19', tax_rate: 19, tax_included: false },
      { product_id: null, description: 'Servicio', qty: 1, unit_price: 500, discount_amount: 0, tax_code: 'IVA_5', tax_rate: 5, tax_included: false },
    ]);
  });

  test('editar manda cliente, sucursal y oportunidad (antes el update los omitía)', async () => {
    const opp = '33333333-4444-4555-8666-777777777777';
    const r = await llamar(rutaId.PUT, 'PUT', `/api/cotizaciones/${COT}`, { ...cuerpo, opportunity_id: opp });
    expect(r.status).toBe(200);
    const [llamada] = rpcDe('fn_cotizacion_guardar');
    expect(llamada.args.p_id).toBe(COT);
    expect(llamada.args.p_datos).toMatchObject({ customer_id: CLIENTE, branch_id: 99, opportunity_id: opp });
  });

  test('editar una convertida → 409 cotizacion_no_editable con el texto en español', async () => {
    guion.errores.fn_cotizacion_guardar = [{ message: 'cotizacion_no_editable' }];
    const r = await llamar(rutaId.PUT, 'PUT', `/api/cotizaciones/${COT}`, cuerpo);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ codigo: 'cotizacion_no_editable', error: 'Solo se editan cotizaciones en borrador o enviadas.' });
  });
});

describe('leer', () => {
  test('detalle de otra organización o inexistente → 404 (antes .single() lanzaba)', async () => {
    guion.listado = [];
    const r = await llamar(rutaId.GET, 'GET', `/api/cotizaciones/${COT}`);
    expect(r.status).toBe(404);
    expect(r.json.codigo).toBe('cotizacion_no_encontrada');
  });

  test('el detalle trae el estado vivo: una enviada vencida sale como expired', async () => {
    const r = await llamar(rutaId.GET, 'GET', `/api/cotizaciones/${COT}`);
    expect(r.status).toBe(200);
    expect(r.json.cotizacion).toMatchObject({ status: 'expired', stored_status: 'sent', number: 'COT-0001' });
  });

  test('el listado pide el filtro de estado vivo a la base con la organización de la sesión', async () => {
    await llamar(rutaLista.GET, 'GET', '/api/cotizaciones?estado=expired&busqueda=COT');
    expect(rpcDe('fn_cotizaciones_listado')[0].args).toEqual({ p_org: 120, p_filtros: { estado: 'expired', busqueda: 'COT' } });
  });

  test('sin finance.view ni sales_management → 403', async () => {
    guion.permisos = new Set(['finance.create']);
    expect((await llamar(rutaLista.GET, 'GET', '/api/cotizaciones')).status).toBe(403);
  });
});

describe('estados', () => {
  test("'expired' y 'converted' no se piden a mano → transición inválida sin tocar la base", async () => {
    for (const estado of ['expired', 'converted', 'draft']) {
      const r = await llamar(rutaEstado.POST, 'POST', `/api/cotizaciones/${COT}/estado`, { estado });
      expect(r.json.codigo).toBe('transicion_invalida');
    }
    expect(rpcs).toEqual([]);
  });

  test('aceptar una vencida → 409 cotizacion_vencida (la base lo decide)', async () => {
    guion.errores.fn_cotizacion_cambiar_estado = [{ message: 'cotizacion_vencida' }];
    const r = await llamar(rutaEstado.POST, 'POST', `/api/cotizaciones/${COT}/estado`, { estado: 'accepted' });
    expect(r.status).toBe(409);
    expect(rpcDe('fn_cotizacion_cambiar_estado')[0].args).toEqual({ p_org: 120, p_id: COT, p_estado: 'accepted' });
  });

  test('duplicar pasa la vigencia pedida', async () => {
    await llamar(rutaDuplicar.POST, 'POST', `/api/cotizaciones/${COT}/duplicar`, { valid_until: '2026-11-30' });
    expect(rpcDe('fn_cotizacion_duplicar')[0].args).toEqual({ p_org: 120, p_id: COT, p_valid_until: '2026-11-30' });
  });
});

describe('convertir a factura', () => {
  test('con sales_management pero sin finance.create → 403 (convertir crea una factura)', async () => {
    guion.permisos = new Set(['sales_management', 'finance.view']);
    const r = await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${COT}/convertir`, {});
    expect(r.status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  test('cotización de otra organización → 404 sin llamar a la RPC', async () => {
    const otra = '99999999-2222-4333-8444-555555555555';
    const r = await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${otra}/convertir`, {}, otra);
    expect(r.status).toBe(404);
    expect(rpcDe('fn_cotizacion_convertir')).toEqual([]);
  });

  test('número con la regla del formulario de facturas y tasa del vendedor; 201 con la factura borrador', async () => {
    const r = await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${COT}/convertir`, { branch_id: 7 });
    expect(r.status).toBe(201);
    expect(rpcDe('fn_cotizacion_convertir')[0].args).toEqual({
      p_org: 120, p_id: COT, p_numero: 'FACT-0010', p_branch: 7, p_opportunity: null, p_commission_rate: 7,
    });
    expect(r.json.resultado).toEqual({ invoiceId: 'inv-1', numero: 'FACT-0010', yaConvertida: false, faltantes: [] });
  });

  test('si otro tomó el número a la vez (numero_duplicado), propone otro; otro error no se reintenta', async () => {
    guion.errores.fn_cotizacion_convertir = [{ message: 'numero_duplicado' }];
    const r = await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${COT}/convertir`, {});
    expect(r.status).toBe(201);
    expect(rpcDe('fn_cotizacion_convertir').map((c) => c.args.p_numero)).toEqual(['FACT-0010', 'FACT-0011']);
    rpcs.length = 0;
    guion.errores.fn_cotizacion_convertir = [{ message: 'cotizacion_rechazada' }];
    const r2 = await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${COT}/convertir`, {});
    expect(r2.status).toBe(409);
    expect(rpcDe('fn_cotizacion_convertir')).toHaveLength(1);
  });

  test('sin vendedor la tasa es 0', async () => {
    guion.vendedor = null;
    await llamar(rutaConvertir.POST, 'POST', `/api/cotizaciones/${COT}/convertir`, {});
    expect(rpcDe('fn_cotizacion_convertir')[0].args.p_commission_rate).toBe(0);
  });
});

describe('enviar por correo', () => {
  test('envía con el PDF del motor (tipo cotizacion) y marca enviada una en borrador', async () => {
    guion.listado = [fila({ status: 'draft', estado: 'draft', valid_until: '2026-12-31' })];
    const r = await llamar(rutaEnviar.POST, 'POST', `/api/cotizaciones/${COT}/enviar`, {});
    expect(r.status).toBe(200);
    expect(correos).toHaveLength(1);
    expect(correos[0]).toMatchObject({ tipo: 'cotizacion', id: COT, para: 'c@example.com', relatedType: 'quotations', relatedId: COT });
    expect(rpcDe('fn_cotizacion_cambiar_estado')[0].args).toMatchObject({ p_estado: 'sent' });
    expect(r.json.resultado).toMatchObject({ enviado: true, destino: 'c@example.com', status: 'sent' });
  });

  test('una ya enviada no cambia de estado', async () => {
    guion.listado = [fila({ status: 'sent', estado: 'sent', valid_until: '2026-12-31' })];
    await llamar(rutaEnviar.POST, 'POST', `/api/cotizaciones/${COT}/enviar`, {});
    expect(rpcDe('fn_cotizacion_cambiar_estado')).toEqual([]);
  });
});

describe('contrato y textos', () => {
  test('códigos de la base y organización ajena', () => {
    expect(codigoErrorCotizacion('Acceso denegado a la organización')).toBe('cotizacion_no_encontrada');
    expect(codigoErrorCotizacion('cotizacion_vencida')).toBe('cotizacion_vencida');
    expect(codigoErrorCotizacion('otra cosa')).toBe('error_desconocido');
    expect(estadoHttpErrorCotizacion('sin_permiso')).toBe(403);
    expect(estadoHttpErrorCotizacion('transicion_invalida')).toBe(409);
  });

  test('cada código y cada texto nuevo existe en es, en, fr y pt con las mismas claves', () => {
    const claves = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
    const porIdioma = ['es', 'en', 'fr', 'pt'].map((l) => {
      const m = JSON.parse(leer(`messages/${l}.json`)) as { documentosVenta: { cotizaciones: Record<string, unknown> } };
      return claves(m.documentosVenta.cotizaciones).sort();
    });
    for (const c of [...ERRORES_COTIZACION, 'error_desconocido']) expect(porIdioma[0]).toContain(`errores.${c}`);
    for (const lista of porIdioma.slice(1)) expect(lista).toEqual(porIdioma[0]);
  });
});

describe('SQL de 20260928172526', () => {
  const sql = leer('supabase/migrations/20260928172526_cotizaciones_servidor.sql');
  const funcion = (nombre: string) => sql.slice(sql.indexOf(`create or replace function public.${nombre}(`), sql.indexOf('$function$;', sql.indexOf(`create or replace function public.${nombre}(`)));

  test('convertir: finance.create, FOR UPDATE, idempotente, borrador por fn_factura_venta_guardar y quotation_id', () => {
    const f = funcion('fn_cotizacion_convertir');
    expect(f).toMatch(/fn_finanzas_exigir_permiso\(p_org, array\['finance\.create'\]\)/);
    expect(f).toMatch(/for update/);
    expect(f).toMatch(/'ya_convertida', true/);
    expect(f).toMatch(/fn_factura_venta_guardar\(p_org, null, v_datos\)/);
    expect(f).toMatch(/set quotation_id = v_q\.id/);
    expect(f).toMatch(/'cotizacion_rechazada'/);
    expect(f).toMatch(/'cotizacion_vencida'/);
    expect(f).not.toMatch(/'issued'/);
    expect(f).not.toMatch(/insert into public\.invoice_sales/);
  });

  test('toda función de escritura exige permiso y está revocada a anon; las internas, también a authenticated', () => {
    for (const nombre of ['fn_cotizacion_guardar', 'fn_cotizacion_cambiar_estado', 'fn_cotizacion_eliminar', 'fn_cotizacion_duplicar']) {
      expect(funcion(nombre)).toMatch(/fn_finanzas_exigir_permiso\(p_org, array\['finance\.create', 'sales_management'\]\)/);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nombre}\\([^)]*\\) from public, anon;`));
    }
    expect(sql).toMatch(/revoke all on function public\.fn_cotizacion_numero\(integer, integer\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.fn_cotizacion_recalcular\(uuid\) from public, anon, authenticated;/);
  });

  test('número y totales en la base; número único por organización; estado vivo con el día de la organización', () => {
    expect(sql).toMatch(/create unique index if not exists uq_quotations_org_number on public\.quotations \(organization_id, number\)/);
    expect(funcion('fn_cotizacion_numero')).toMatch(/fn_get_next_sale_number\(p_org, p_branch, 'quote'\)/);
    expect(funcion('fn_cotizacion_numero')).toMatch(/pg_advisory_xact_lock/);
    expect(funcion('fn_cotizacion_guardar')).toMatch(/fn_cotizacion_numero\(p_org, v_branch\)/);
    expect(funcion('fn_cotizacion_guardar')).toMatch(/perform public\.fn_cotizacion_recalcular\(v_id\)/);
    expect(funcion('fn_cotizaciones_listado')).toMatch(/fn_today_for_org\(p_org\)/);
    expect(funcion('fn_cotizacion_cambiar_estado')).toMatch(/fn_cotizacion_estado_vivo/);
  });

  test('columna aditiva y rollback que advierte', () => {
    expect(sql).toMatch(/add column if not exists quotation_id uuid null references public\.quotations\(id\) on delete set null/);
    expect(leer('supabase/rollbacks/20260928172526_cotizaciones_servidor_rollback.sql')).toMatch(/no revierte datos/);
  });
});

describe('nadie escribe cotizaciones desde el navegador ni numera por su cuenta', () => {
  test('cotizacionesService solo llama a las rutas', () => {
    const src = leer('src/lib/services/cotizacionesService.ts');
    expect(src).not.toMatch(/@\/lib\/supabase\/config/);
    expect(src).not.toMatch(/\.from\('/);
    expect(src).not.toMatch(/generateQuotationNumber|FACT-/);
  });

  test('el CRM usa las mismas RPC y la misma numeración; el enlace del correo va a Finanzas', () => {
    const crm = leer('src/lib/services/crm/proposalServerService.ts');
    expect(crm).not.toMatch(/nextQuotationNumber|COT-%/);
    expect(crm).toMatch(/rpc\('fn_cotizacion_guardar'/);
    expect(crm).toMatch(/rpc\('fn_cotizacion_cambiar_estado'/);
    expect(crm).not.toMatch(/from\('quotations'\)\s*\.(insert|update)\(\{[^}]*total/);
    expect(leer('src/lib/services/crm/email/variablesContext.ts')).not.toMatch(/\/app\/crm\/cotizaciones/);
  });

  test('el cierre «al ganar» del CRM convierte por la ruta del servidor', () => {
    // CRM ola 3B: el cableado vive en `crearDepsGanar` (lo comparten el
    // `WonCloseModal` y el `WinDialog`); el modal lo usa, no lo duplica.
    expect(leer('src/components/crm/oportunidad/pasosGanar.ts')).toMatch(/CotizacionesService\.convertToInvoice\(quotationId, \{ branchId, opportunityId: oppId \}\)/);
    expect(leer('src/components/crm/pipeline/WonCloseModal.tsx')).toMatch(/crearDepsGanar\(/);
    expect(leer('src/lib/services/crm/wonCloseSteps.ts')).not.toMatch(/accounts_receivable/);
  });
});
