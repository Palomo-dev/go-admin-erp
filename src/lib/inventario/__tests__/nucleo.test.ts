/**
 * Núcleo de existencias (B0): lógica pura y contratos TS de las RPC.
 * El comportamiento en la base se probó con begin … rollback al aplicar las
 * migraciones; src/__tests__/db/inventarioNucleo.test.ts fija su texto.
 */
import { costoPromedioTrasEntrada, redondearCantidad, redondearCosto } from '../nucleo/costo';
import { claveErrorInventario, detalleStockInsuficiente } from '../nucleo/errores';
import { diasEntre, estadoVencimiento, ordenarFefo, repartirFefo, totalAsignado } from '../nucleo/lotes';
import { ACCIONES_INVENTARIO } from '../nucleo/tipos';
import { aConfigInventario, aPermisosInventario, leerPermisosInventario, puede, SIN_PERMISOS_INVENTARIO } from '../permisos';
import { claveDocumento, documentoProvisional, refsUnicas, resolverDocumentos, MAX_REFS_POR_LLAMADA } from '../documentoMovimiento';
import { META_ORIGEN, ORIGENES_MOVIMIENTO_STOCK, metaOrigen, ORIGENES_VENTA } from '../origenesMovimientoStock';
import { promedioPonderado } from '@/lib/services/compras/logica';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

describe('costo promedio: una sola regla', () => {
  test('10 a 500 + 10 a 1.000 = 750 (aceptación B0)', () => {
    expect(costoPromedioTrasEntrada(10, 500, 10, 1000)).toBe(750);
  });
  test('existencia previa ≤ 0: el costo de la entrada', () => {
    expect(costoPromedioTrasEntrada(0, 900, 5, 1200)).toBe(1200);
    expect(costoPromedioTrasEntrada(-3, 900, 5, 1200)).toBe(1200);
  });
  test('coincide con el espejo de compras en cualquier caso', () => {
    for (const [q, p, n, c] of [[6, 2000, 4, 2500], [1, 0, 1, 10], [25, 750, 5, 1250], [-1, 5, 2, 7]]) {
      expect(costoPromedioTrasEntrada(q, p, n, c)).toBeCloseTo(promedioPonderado(q, p, n, c), 9);
    }
  });
  test('redondeos de la base: costo a 2 decimales, cantidad a 3', () => {
    expect(redondearCosto(833.3333)).toBe(833.33);
    expect(redondearCosto(769.265)).toBe(769.27);
    expect(redondearCantidad(0.33349)).toBe(0.333);
    expect(redondearCantidad(0.0005)).toBe(0.001);
  });
});

describe('lotes y vencimiento (FEFO)', () => {
  const hoy = '2026-09-28';
  const lotes = [
    { lot_id: 3, lot_code: 'L-TARDE', expiry_date: '2027-03-18', qty_on_hand: 240 },
    { lot_id: 1, lot_code: 'L-VENCIDO', expiry_date: '2026-09-11', qty_on_hand: 14 },
    { lot_id: 2, lot_code: 'L-PRONTO', expiry_date: '2026-10-24', qty_on_hand: 36 },
    { lot_id: 4, lot_code: 'L-SIN', expiry_date: null, qty_on_hand: 5 },
  ];

  test('días entre días calendario, sin zona horaria', () => {
    expect(diasEntre('2026-09-28', '2026-10-24')).toBe(26);
    expect(diasEntre('2026-09-28', '2026-09-11')).toBe(-17);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
    expect(diasEntre('no-es-fecha', '2026-03-01')).toBeNull();
  });

  test('estados como en Figma 530:65092', () => {
    expect(estadoVencimiento('2026-10-24', hoy)).toEqual({ estado: 'por_vencer', dias: 26 });
    expect(estadoVencimiento('2027-03-18', hoy).estado).toBe('vigente');
    expect(estadoVencimiento('2026-09-11', hoy)).toEqual({ estado: 'vencido', dias: -17 });
    expect(estadoVencimiento(null, hoy).estado).toBe('sin_vencimiento');
    expect(estadoVencimiento('2026-09-28', hoy).estado).toBe('por_vencer');
  });

  test('orden FEFO: vence antes primero, sin vencimiento al final', () => {
    expect(ordenarFefo(lotes).map((l) => l.lot_id)).toEqual([1, 2, 3, 4]);
  });

  test('reparto FEFO salta los vencidos y deja el faltante', () => {
    expect(repartirFefo(lotes, 40, hoy)).toEqual({ asignaciones: [{ lot_id: 2, qty: 36 }, { lot_id: 3, qty: 4 }], faltante: 0 });
    expect(repartirFefo(lotes, 20, hoy, { incluirVencidos: true }).asignaciones).toEqual([{ lot_id: 1, qty: 14 }, { lot_id: 2, qty: 6 }]);
    expect(repartirFefo(lotes, 300, hoy).faltante).toBe(19); // 300 − (36 + 240 + 5)
    expect(totalAsignado([{ lot_id: 1, qty: 0.1 }, { lot_id: 2, qty: 0.2 }])).toBe(0.3);
  });
});

describe('errores del núcleo', () => {
  test('código de negocio en el mensaje y SQLSTATE de respaldo', () => {
    expect(claveErrorInventario({ message: 'stock_insuficiente', code: '23514' })).toBe('stock_insuficiente');
    expect(claveErrorInventario({ message: 'lote_invalido', code: '22023' })).toBe('lote_invalido');
    expect(claveErrorInventario({ message: 'permission denied', code: '42501' })).toBe('sin_permiso');
    expect(claveErrorInventario({ message: 'algo raro', code: 'XX000' })).toBe('desconocido');
    expect(claveErrorInventario(null)).toBe('desconocido');
  });
  test('detalle JSON de stock_insuficiente', () => {
    const d = detalleStockInsuficiente({
      message: 'stock_insuficiente',
      details: '{"product_id": 9, "branch_id": 2, "lot_id": null, "disponible": 3, "solicitado": 5}',
    });
    expect(d).toEqual({ product_id: 9, branch_id: 2, lot_id: null, disponible: 3, solicitado: 5 });
    expect(detalleStockInsuficiente({ details: 'texto' })).toBeNull();
  });
});

describe('permisos resueltos en el servidor', () => {
  test('solo `true` literal concede; mientras cargan todo es false', () => {
    expect(SIN_PERMISOS_INVENTARIO.resueltos).toBe(false);
    const p = aPermisosInventario({ ver: true, ajustar: 'true', trasladar: 1, costos: true });
    expect(p).toMatchObject({ ver: true, ajustar: false, trasladar: false, costos: true, resueltos: true });
    expect(Object.keys(p).sort()).toEqual([...ACCIONES_INVENTARIO, 'resueltos'].sort());
    expect(puede(p, 'ajustar', 'ver')).toBe(true);
    expect(puede(p, 'ajustar')).toBe(false);
  });
  test('un error de la RPC es «sin permisos», nunca «todo permitido»', async () => {
    const cliente = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) };
    const p = await leerPermisosInventario(142, cliente as never);
    expect(cliente.rpc).toHaveBeenCalledWith('fn_inventario_permisos', { p_org: 142 });
    expect(p.resueltos).toBe(true);
    expect(ACCIONES_INVENTARIO.every((a) => p[a] === false)).toBe(true);
  });
  test('configuración: vender sin stock se permite por defecto (P5)', () => {
    expect(aConfigInventario(null)).toEqual({ bloquear_venta_sin_stock: false });
    expect(aConfigInventario({ bloquear_venta_sin_stock: true })).toEqual({ bloquear_venta_sin_stock: true });
  });
});

describe('documento de cada movimiento', () => {
  test('referencias únicas y documento provisional por origen', () => {
    const refs = [
      { source: 'sale', source_id: 'a', product_id: 1 },
      { source: 'sale', source_id: 'a', product_id: 1 },
      { source: 'adjustment', source_id: '147', product_id: 2 },
    ];
    expect(refsUnicas(refs)).toHaveLength(2);
    expect(documentoProvisional(refs[2])).toEqual({ source: 'adjustment', source_id: '147', product_id: 2, tipo: 'ajuste', numero: null, ruta: null });
    expect(documentoProvisional({ source: 'waste', source_id: null }).tipo).toBe('otro');
  });
  test('resuelve en bloques de 500 y mapea por clave', async () => {
    const refs = Array.from({ length: MAX_REFS_POR_LLAMADA + 3 }, (_, i) => ({ source: 'sale', source_id: `v${i}`, product_id: i }));
    const cliente = {
      rpc: jest.fn(async (_fn: string, args: { p_refs: { source_id: string }[] }) => ({
        data: args.p_refs.map((r) => ({ ...r, tipo: 'venta', numero: r.source_id.toUpperCase(), ruta: `/app/pos/ventas/${r.source_id}` })),
        error: null,
      })),
    };
    const mapa = await resolverDocumentos(120, refs, cliente as never);
    expect(cliente.rpc).toHaveBeenCalledTimes(2);
    expect(cliente.rpc.mock.calls[0][0]).toBe('fn_inv_documentos');
    expect(mapa.get(claveDocumento(refs[501]))?.numero).toBe('V501');
  });
});

describe('un solo mapa de orígenes', () => {
  test('cada origen del CHECK tiene tono, dirección y documento', () => {
    expect(Object.keys(META_ORIGEN).sort()).toEqual([...ORIGENES_MOVIMIENTO_STOCK].sort());
    expect(metaOrigen('waste')).toBeNull();
    expect(metaOrigen('purchase_void')).toMatchObject({ direccion: 'out', documento: 'factura_compra' });
  });
  test('los orígenes de venta son los que la primitiva deja en negativo salvo bloqueo (P5)', () => {
    expect([...ORIGENES_VENTA].sort()).toEqual(['folio_item', 'invoice_sale', 'mesa_sale', 'room_consumption', 'sale', 'web_order', 'web_sale']);
  });
});
