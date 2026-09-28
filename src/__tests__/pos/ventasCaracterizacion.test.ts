/**
 * Caracterización de Ventas antes del rediseño (docs/implementacion/CAJAS-VENTAS-PLAN.md §2.2).
 *
 * Reglas extraídas a `src/lib/pos/ventas/`: estado visible (V-c), número
 * (V-d), pagos de la venta (V-e), filtros con lista blanca (V-b) y líneas
 * para duplicar (V-g). El rango de fechas en la zona de la organización (V-a)
 * se prueba en `src/__tests__/timezone/ventasRangoOrganizacion.test.ts`, que
 * corre con las seis zonas de `npm run test:tz-all`.
 *
 * Valores reales de la base (2026-09-24, solo lectura): combinaciones de
 * `status`/`payment_status` en `sales`: paid/paid 2.614, pending/pending 944,
 * pending/partial 3, paid/pending 4, void/refunded 3, void/paid 1.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BADGE_ESTADO_VENTA, ESTADOS_VENTA, estadoVenta, origenVenta } from '@/lib/pos/ventas/estadoVenta';
import { facturaDeVenta, notasCreditoDeVenta, numeroVenta, pagosDeVenta, totalPagado } from '@/lib/pos/ventas/documentosVenta';
import { filtrosVentas, limpiarBusqueda, parametrosListado } from '@/lib/pos/ventas/filtrosVentas';
import { lineasDuplicadas } from '@/lib/pos/ventas/lineasDuplicadas';
import { resolverEstado } from '@/components/kit/estadoTono';
import { accionesDeVenta, destinoCobro, SIN_PERMISOS_VENTAS, type PermisosVentas, type VentaParaAcciones } from '@/lib/pos/ventas/accionesVenta';
import { filaVentaLocal } from '@/lib/pos/ventas/ventaLocal';

describe('V-c · un solo estado visible por venta', () => {
  test.each([
    [{ status: 'paid', payment_status: 'paid' }, 'pagada'],
    [{ status: 'pending', payment_status: 'pending' }, 'pendiente_pago'],
    [{ status: 'pending', payment_status: 'partial' }, 'pago_parcial'],
    // El estado dice pagada y el cobro no: manda el cobro.
    [{ status: 'paid', payment_status: 'pending' }, 'pendiente_pago'],
    [{ status: 'void', payment_status: 'refunded' }, 'anulada'],
    [{ status: 'void', payment_status: 'paid' }, 'anulada'],
    [{ status: 'draft', payment_status: 'pending' }, 'borrador'],
    [{ status: 'paid', payment_status: 'refunded' }, 'devuelta'],
    [{ status: 'paid', payment_status: 'paid', total: 1000, devuelto: 1000 }, 'devuelta'],
    [{ status: 'paid', payment_status: 'paid', total: 1000, devuelto: 200 }, 'devuelta_parcial'],
    [{ status: 'paid', payment_status: 'paid', pendiente_sync: true }, 'pendiente_sincronizar'],
    [{ status: 'partial', payment_status: null }, 'pago_parcial'],
  ])('%j → %s', (venta, esperado) => {
    expect(estadoVenta(venta)).toBe(esperado);
  });

  test('«Completada» no existe; cada estado tiene tono conocido en StatusBadge', () => {
    expect(ESTADOS_VENTA).not.toContain('completada');
    for (const e of ESTADOS_VENTA) {
      expect(resolverEstado(BADGE_ESTADO_VENTA[e]).conocido).toBe(true);
    }
    expect(resolverEstado(BADGE_ESTADO_VENTA.anulada).tono).toBe('peligro');
    expect(resolverEstado(BADGE_ESTADO_VENTA.pagada).tono).toBe('exito');
  });

  test('origen: web, mesa, factura o POS', () => {
    expect(origenVenta({ source: 'pos' })).toBe('pos');
    expect(origenVenta({ source: 'pos', table_session_id: 'x' })).toBe('mesa');
    expect(origenVenta({ source: 'web' })).toBe('web');
    expect(origenVenta({ source: 'pos', web_order_id: 'x' })).toBe('web');
    expect(origenVenta({ source: 'invoice' })).toBe('factura');
  });
});

describe('V-d · número visible', () => {
  const factura = { id: 'f1', number: 'FV-0042', document_type: 'invoice', status: 'paid', created_at: '2026-09-01T10:00:00Z' };
  const nc = { id: 'n1', number: 'NC-0003', document_type: 'credit_note', status: 'issued', related_invoice_id: 'f1', created_at: '2026-09-02T10:00:00Z' };

  test('con factura y nota crédito, el número es el de la factura (antes .maybeSingle() fallaba)', () => {
    expect(numeroVenta([nc, factura])).toEqual({ tipo: 'factura', numero: 'FV-0042' });
    expect(facturaDeVenta([nc, factura])?.id).toBe('f1');
    expect(notasCreditoDeVenta([nc, factura]).map((d) => d.id)).toEqual(['n1']);
  });

  test('document_type NULL cuenta como factura; la vigente gana a la anulada', () => {
    const vieja = { id: 'f0', number: 'FV-0001', document_type: null, status: 'void', created_at: '2026-09-03T00:00:00Z' };
    const vigente = { id: 'f2', number: 'FV-0002', document_type: null, status: 'issued', created_at: '2026-09-01T00:00:00Z' };
    expect(facturaDeVenta([vieja, vigente])?.id).toBe('f2');
  });

  test('sin factura: el número del pedido web o «Sin número»', () => {
    expect(numeroVenta([], 'P-0002144')).toEqual({ tipo: 'pedido', numero: 'P-0002144' });
    expect(numeroVenta(null)).toEqual({ tipo: 'sin_numero' });
    expect(numeroVenta([nc])).toEqual({ tipo: 'sin_numero' });
  });
});

describe('V-e · pagos de la venta', () => {
  const pagos = [
    { id: 1, source: 'invoice_sales', source_id: 'f1', amount: 800, status: 'completed', payment_date: '2026-09-01' },
    { id: 2, source: 'account_receivable', source_id: 'cxc1', amount: '150', status: 'completed', payment_date: '2026-09-05' },
    { id: 3, source: 'sale', source_id: 'v1', amount: 50, status: 'completed', payment_date: '2026-08-30' },
    { id: 4, source: 'invoice_sales', source_id: 'otra', amount: 999, status: 'completed' },
    { id: 5, source: 'credit_note', source_id: 'n1', amount: -100, status: 'completed' },
    { id: 6, source: 'invoice_sales', source_id: 'f1', amount: 40, status: 'cancelled', payment_date: '2026-09-02' },
  ];

  test('cobro del POS (invoice_sales), abono de cartera y pago heredado (sale); no los de otra factura ni la NC', () => {
    const r = pagosDeVenta(pagos, { venta: 'v1', facturas: ['f1'], cuentasPorCobrar: ['cxc1'] });
    expect(r.map((p) => p.id)).toEqual([3, 1, 6, 2]);
    expect(totalPagado(r)).toBe(1000);
  });
});

describe('V-b · filtros con lista blanca', () => {
  test('descarta lo que no está en la lista y normaliza', () => {
    const f = filtrosVentas({
      q: '  FV-0042\u0000 ',
      origen: 'pos,web,hackeo',
      estado: ['pagada', 'completada'],
      metodo: 'cash,card,DROP TABLE',
      cliente: 'no-es-uuid',
      cajero: 'A1B2C3D4-0000-4000-8000-000000000001',
      desde: '2026-09-30',
      hasta: '2026-09-01',
      min: '500',
      max: '100',
      orden: 'id; drop',
      dir: 'asc',
      tamano: '37',
      pagina: '-3',
    });
    expect(f.busqueda).toBe('FV-0042');
    expect(f.origenes).toEqual(['pos', 'web']);
    expect(f.estados).toEqual(['pagada']);
    expect(f.metodos).toEqual(['cash', 'card']);
    expect(f.clienteId).toBeNull();
    expect(f.cajeroId).toBe('a1b2c3d4-0000-4000-8000-000000000001');
    expect([f.desde, f.hasta]).toEqual(['2026-09-01', '2026-09-30']);
    expect([f.importeMin, f.importeMax]).toEqual([100, 500]);
    expect(f.orden).toEqual({ campo: 'fecha', direccion: 'asc' });
    expect(f.tamano).toBe(20);
    expect(f.pagina).toBe(1);
  });

  test('fechas imposibles se descartan; la búsqueda nunca pasa de 80', () => {
    expect(filtrosVentas({ desde: '2026-02-30' }).desde).toBeNull();
    expect(limpiarBusqueda('x'.repeat(200))?.length).toBe(80);
    expect(limpiarBusqueda('   ')).toBeNull();
  });

  test('los parámetros de la RPC paginan en el servidor', () => {
    const p = parametrosListado(filtrosVentas({ pagina: '3', tamano: '50' }), { organizacionId: 7, sucursalId: null, desde: null, hasta: null });
    expect(p).toMatchObject({ p_organization_id: 7, p_limite: 50, p_desplazamiento: 100, p_origenes: null, p_estados: null });
  });
});

describe('V-g · duplicar conserva cantidades', () => {
  test('agrupa por producto, conserva la cantidad y omite ítems sin producto', () => {
    const r = lineasDuplicadas([
      { product_id: 10, quantity: 3, products: { name: 'Café' } },
      { product_id: '10', quantity: '1.5' },
      { product_id: 11, quantity: 2 },
      { product_id: null, quantity: 1 },
      { product_id: 12, quantity: 0 },
    ]);
    expect(r.lineas).toEqual([
      { product_id: 10, quantity: 4.5, nombre: 'Café' },
      { product_id: 11, quantity: 2, nombre: null },
    ]);
    expect(r.omitidas).toBe(2);
  });
});

describe('Paso 14 · la regla del estado es la misma en SQL y en TypeScript', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20260926140000_pos_ventas_listado_y_cobrado_rango.sql'), 'utf8');
  const bloque = sql.slice(sql.indexOf("when b.status in ('void', 'cancelled') then 'anulada'"), sql.indexOf('end as estado'));

  test('mismo orden de prioridad que estadoVenta (sin «pendiente de sincronizar», que solo existe en el equipo)', () => {
    const orden = ['anulada', 'borrador', 'devuelta', 'devuelta_parcial', 'pagada', 'pago_parcial', 'pendiente_pago'];
    const posiciones = orden.map((e) => bloque.indexOf(`'${e}'`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    // Manda el cobro sobre el estado, como en TS.
    expect(bloque).toMatch(/coalesce\(nullif\(b\.payment_status, ''\), b\.status\) = 'paid'/);
  });

  test('mismo origen que origenVenta', () => {
    const origen = sql.slice(sql.indexOf("when b.web_order_id is not null or b.source = 'web' then 'web'"), sql.indexOf('end as origen'));
    expect(origen.indexOf("'web'")).toBeLessThan(origen.indexOf("'mesa'"));
    expect(origen.indexOf("'mesa'")).toBeLessThan(origen.indexOf("'factura'"));
    expect(origen).toMatch(/else 'pos'/);
  });

  test('D1: el listado solo lee sales (ni web_orders sueltos ni paginación en memoria)', () => {
    const listado = sql.slice(sql.indexOf('create or replace function public.pos_ventas_listado'), sql.indexOf('create or replace function public.fn_inicio_ventas_rango'));
    expect(listado).toMatch(/from public\.sales s/);
    expect(listado).not.toMatch(/from public\.web_orders/);
    expect(listado).toMatch(/offset v_desp\s+limit v_limite/);
  });

  test('D2: los KPI son lo cobrado por fecha de pago (payments), no las ventas por fecha de venta', () => {
    const kpi = sql.slice(sql.indexOf('create or replace function public.fn_inicio_ventas_rango'));
    expect(kpi).toMatch(/p\.payment_date >= p_desde - v_duracion/);
    expect(kpi).toMatch(/p\.status = 'completed'\s+and p\.voided_at is null/);
    expect(kpi).toMatch(/coalesce\(r\.refund_method, 'cash'\) = 'cash'/);
  });
});

describe('Guardarraíles de fuente de ventas', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const archivos = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? archivos(path.join(dir, d.name)) : [path.join(dir, d.name)]));

  test('V-i: ningún componente de ventas inserta en sales, sale_items ni payments', () => {
    for (const f of archivos(path.join(SRC, 'components/pos/ventas')).filter((f) => /\.tsx?$/.test(f))) {
      const src = fs.readFileSync(f, 'utf8');
      expect({ f, hit: /from\('(sales|sale_items|payments)'\)\s*\.(insert|upsert)/.test(src) }).toEqual({ f, hit: false });
    }
  });
});

describe('Paso 15 · acciones de la venta con motivo', () => {
  const TODOS: PermisosVentas = { anular: true, devolver: true, vender: true, exportar: true };
  const base: VentaParaAcciones = { estado: 'pagada', origen: 'pos', saldo: 0, devuelto: 0, factura_id: 'f1', cxc_id: null };

  test('venta POS pagada: todo habilitado salvo cobrar (sin saldo, oculta)', () => {
    const a = accionesDeVenta(base, TODOS);
    expect(a.cobrar.visible).toBe(false);
    expect([a.devolver, a.imprimir, a.duplicar, a.anular].every((x) => x.habilitada)).toBe(true);
  });

  test('con saldo: se cobra (factura o CxC) y la devolución espera con motivo', () => {
    const v = { ...base, estado: 'pago_parcial' as const, saldo: 50 };
    const a = accionesDeVenta(v, TODOS);
    expect(a.cobrar).toEqual({ visible: true, habilitada: true, motivo: null });
    expect(a.devolver).toEqual({ visible: true, habilitada: false, motivo: 'saldo_pendiente' });
    expect(destinoCobro(v)).toEqual({ tipo: 'factura', id: 'f1' });
    expect(destinoCobro({ factura_id: null, cxc_id: 'c9' })).toEqual({ tipo: 'cuenta', id: 'c9' });
    expect(accionesDeVenta({ ...v, factura_id: null }, TODOS).cobrar.motivo).toBe('sin_documento_cobro');
  });

  test('pedido web y venta con devoluciones no se anulan aquí (motivo, no oculto)', () => {
    expect(accionesDeVenta({ ...base, origen: 'web' }, TODOS).anular).toEqual({ visible: true, habilitada: false, motivo: 'pedido_web' });
    expect(accionesDeVenta({ ...base, estado: 'devuelta_parcial', devuelto: 10 }, TODOS).anular.motivo).toBe('con_devoluciones');
  });

  test('anulada: sin anular ni devolver; pendiente de sincronizar: todo con motivo', () => {
    const anulada = accionesDeVenta({ ...base, estado: 'anulada' }, TODOS);
    expect(anulada.anular.visible || anulada.devolver.visible).toBe(false);
    const sinSync = accionesDeVenta({ ...base, estado: 'pendiente_sincronizar', factura_id: null }, TODOS);
    expect([sinSync.devolver, sinSync.imprimir, sinSync.anular].map((x) => x.motivo)).toEqual(['pendiente_sincronizar', 'pendiente_sincronizar', 'pendiente_sincronizar']);
  });

  test('sin permisos del servidor: deshabilitadas con «sin_permiso»', () => {
    const a = accionesDeVenta(base, SIN_PERMISOS_VENTAS);
    expect([a.devolver.motivo, a.duplicar.motivo, a.anular.motivo]).toEqual(['sin_permiso', 'sin_permiso', 'sin_permiso']);
    expect(a.imprimir.habilitada).toBe(true);
  });

  test('sin factura no se imprime (el comprobante sale del motor de documentos)', () => {
    expect(accionesDeVenta({ ...base, factura_id: null }, TODOS).imprimir.motivo).toBe('sin_factura');
  });
});

describe('Paso 15 · listado sin red (Desktop)', () => {
  test('la venta del outbox se ve como pendiente de sincronizar', () => {
    const f = filaVentaLocal(
      {
        id: 'v1', sale_date: '2026-09-20T15:00:00+00:00', created_at: null, total: '120', balance: 0, status: 'pending_sync',
        payment_status: 'paid', source: 'pos', customer_id: 'c1', user_id: 'u1', branch_id: 7, pending_sync: true,
      },
      { nombre: 'Cliente de prueba', documento: '1' },
    );
    expect(f.estado).toBe('pendiente_sincronizar');
    expect(f.total).toBe(120);
    expect(f.cliente).toEqual({ id: 'c1', nombre: 'Cliente de prueba', documento: '1' });
    expect(f.factura_id).toBeNull();
  });

  test('mesa y web conservan su origen', () => {
    const comun = { id: 'x', sale_date: null, created_at: '2026-09-20T15:00:00+00:00', total: 1, balance: 0, status: 'paid', payment_status: 'paid', customer_id: null, user_id: null, branch_id: 1 };
    expect(filaVentaLocal({ ...comun, source: 'pos', table_session_id: 't1' }).origen).toBe('mesa');
    expect(filaVentaLocal({ ...comun, source: 'web' }).origen).toBe('web');
  });
});

describe('Paso 15 · guardarraíles del listado', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const leer = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');

  test('el listado lee del servidor, no de web_orders ni con diálogos del navegador', () => {
    const pagina = leer('components/pos/ventas/VentasPage.tsx');
    expect(pagina).toMatch(/pedirVentas\(/);
    expect(pagina).not.toMatch(/web_orders|VentasService\.getSales|confirm\(|prompt\(|alert\(/);
    expect(leer('components/pos/ventas/VentasService.ts')).not.toMatch(/static async getSales\(/);
  });

  test('anular pasa por la RPC y nunca por un update directo de status', () => {
    expect(leer('components/pos/ventas/AnularVentaDialog.tsx')).toMatch(/anularVentaEnServidor\(/);
    const archivos = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of archivos(path.join(SRC, 'components/pos/ventas')).filter((x) => /\.tsx?$/.test(x))) {
      expect({ f, hit: /\.update\(\s*\{\s*status:\s*'void'/.test(fs.readFileSync(f, 'utf8')) }).toEqual({ f, hit: false });
    }
  });

  test('los permisos del listado se resuelven en el servidor por código, nunca por nombre de rol', () => {
    const permisos = leer('lib/pos/ventas/permisosVentas.ts');
    for (const codigo of ['pos.void', 'pos.refund', 'pos.create', 'reports.sales']) expect(permisos).toContain(`'${codigo}'`);
    expect(leer('components/pos/ventas/VentasPage.tsx')).not.toMatch(/role_name|roleName|'admin'|'owner'/);
  });
});

describe('Paso 16 · detalle de venta en una respuesta', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const leer = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');

  test('la ruta de detalle no cambia y monta el detalle nuevo', () => {
    const ruta = leer('app/app/pos/ventas/[id]/page.tsx');
    expect(ruta).toMatch(/VentaDetallePage ventaId=\{id\}/);
    expect(fs.existsSync(path.join(SRC, 'components/pos/ventas/VentaDetalle.tsx'))).toBe(false);
  });

  test('el detalle lee todo del servidor, sin consultas sueltas desde el navegador', () => {
    for (const f of ['components/pos/ventas/detalle/VentaDetallePage.tsx', 'components/pos/ventas/detalle/tarjetasVenta.tsx']) {
      const src = leer(f);
      expect({ f, hit: /from\('|supabase\.|getSaleById|\.split\('T'\)\[0\]|toLocaleString\(|confirm\(|prompt\(|alert\(/.test(src) }).toEqual({ f, hit: false });
    }
    expect(leer('components/pos/ventas/detalle/VentaDetallePage.tsx')).toMatch(/pedirDetalleVenta\(/);
  });

  test('V4: «Crear devolución» abre el formulario del agente de devoluciones con la venta (no una ruta inexistente)', () => {
    const panel = leer('components/pos/ventas/detalle/DevolucionPanel.tsx');
    expect(panel).toMatch(/DevolucionesService\.obtenerDetalleVenta\(ventaId\)/);
    expect(panel).toMatch(/<ReturnForm/);
    expect(leer('components/pos/ventas/detalle/VentaDetallePage.tsx')).not.toMatch(/devoluciones\/nuevo\?sale_id/);
  });

  test('V12: los vencimientos pasan por la zona de la organización (timestamptz → formatDate del hook)', () => {
    const tarjetas = leer('components/pos/ventas/detalle/tarjetasVenta.tsx');
    expect(tarjetas).toMatch(/formatDate\(f\.vence\)/);
    expect(tarjetas).toMatch(/formatDate\(c\.vence\)/);
    expect(tarjetas).toMatch(/useFormatDate\(\)/);
  });
});

describe('Paso 18 · nueva venta en el POS, limpieza y cajas para Tesorería', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const leer = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');

  test('D3: /app/pos/ventas/nuevo no tiene carrito propio; duplicar usa el carrito del POS', () => {
    expect(fs.existsSync(path.join(SRC, 'components/pos/ventas/nuevo'))).toBe(false);
    expect(leer('app/app/pos/ventas/nuevo/page.tsx')).toMatch(/<NuevaVenta \/>/);
    const duplicar = leer('lib/pos/ventas/duplicarEnPos.ts');
    expect(duplicar).toMatch(/POSService\.createCart\(/);
    expect(duplicar).toMatch(/POSService\.addItemToCart\(/);
    expect(duplicar).toMatch(/lineasDuplicadas\(/);
    expect(duplicar).not.toMatch(/unit_price|from\('/);
  });

  test('VentasService ya no abre ni cierra cajas ni lee el detalle desde el navegador', () => {
    const svc = leer('components/pos/ventas/VentasService.ts');
    expect(svc).not.toMatch(/static async (openCashSession|closeCashSession|getSaleById|duplicateSale|getSales)\(/);
    expect(svc).not.toMatch(/from\('cash_sessions'\)\s*\.(insert|update)|from\('cash_counts'\)/);
    // El resumen del día cuenta estados que existen en sales_status_check.
    expect(svc).not.toMatch(/=== 'completed'|=== 'cancelled'/);
  });

  test('cajas como cuentas de dinero: sesiones abiertas y el esperado enmascarado de resumenesCompactos', () => {
    const src = leer('lib/pos/cajas/cuentasDeDinero.ts');
    expect(src).toMatch(/\.eq\('status', 'open'\)/);
    expect(src).toMatch(/resumenesCompactos\(ctx,/);
    expect(src).toMatch(/modoCajaOrganizacion\(ctx\)/);
    expect(src).not.toMatch(/rpc\('pos_caja_esperado'/);
  });

  test('nadie usa ya la clave vieja de duplicar ni la ruta de devolución inexistente', () => {
    const archivos = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of archivos(path.join(SRC, 'components/pos/ventas')).filter((x) => /\.tsx?$/.test(x))) {
      const src = fs.readFileSync(f, 'utf8');
      // Solo código (los comentarios pueden contar la historia).
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect({ f, hit: /duplicateSaleItems|devoluciones\/nuevo\?sale_id/.test(codigo) }).toEqual({ f, hit: false });
    }
  });
});
