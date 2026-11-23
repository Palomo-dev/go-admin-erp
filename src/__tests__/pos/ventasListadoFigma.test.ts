/**
 * Caracterización del listado de Ventas tras cerrar el Figma aprobado el
 * 2026-11-20 (capturas docs/design/figma/16-ventas-listado-*.png):
 *
 * - Filtros nuevos con lista blanca: estado de pago, método múltiple y las tres
 *   casillas (con saldo, con devolución, pendientes de sincronizar).
 * - Listado y cifras usan la MISMA lista de filtros (`parametrosFiltro`), así
 *   «N ventas encontradas» y «Transacciones» no pueden diferir.
 * - Periodo anterior de igual duración para la variación de «Ventas del periodo».
 * - Segunda línea del N.º y del cliente, nombre de impuestos, tono del origen.
 * - En SQL: la regla del estado sigue siendo la de `estadoVenta`, las cifras
 *   salen de `pos_ventas_filtradas` y el detalle de impuestos de las líneas de
 *   la factura (no de `sale_items.tax_rate`, que dice 0 con impuesto).
 */
import * as fs from 'fs';
import * as path from 'path';
import { filtrosVentas, parametrosFiltro, parametrosListado, periodoAnterior } from '@/lib/pos/ventas/filtrosVentas';
import { TONO_ORIGEN_VENTA, ORIGENES_VENTA } from '@/lib/pos/ventas/estadoVenta';
import {
  formatearDocumento,
  lineaCliente,
  lineaNumero,
  mesaEsNumero,
  nombreCorto,
  nombreImpuesto,
  partesTransacciones,
  variacion,
} from '@/lib/pos/ventas/presentacionVentas';
import type { CifrasVentas, FilaVenta } from '@/lib/pos/ventas/listadoServidor';

const CTX = { organizacionId: 7, sucursalId: 3, desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-21T04:59:59.999Z' };

describe('Filtros nuevos del panel (Figma 329:111220)', () => {
  test('estado de pago con lista blanca, varios a la vez', () => {
    expect(filtrosVentas({ pago: 'paid,pending,hackeo' }).pagos).toEqual(['paid', 'pending']);
    expect(filtrosVentas({ pago: ['refunded', 'partial'] }).pagos).toEqual(['refunded', 'partial']);
    expect(filtrosVentas({}).pagos).toEqual([]);
  });

  test('casillas: solo «1» o «true» las marcan', () => {
    const f = filtrosVentas({ saldo: '1', devolucion: 'true', sync: 'si' });
    expect([f.conSaldo, f.conDevolucion, f.pendientesSync]).toEqual([true, true, false]);
    const g = filtrosVentas({});
    expect([g.conSaldo, g.conDevolucion, g.pendientesSync]).toEqual([false, false, false]);
  });

  test('método múltiple desde la URL separada por comas', () => {
    expect(filtrosVentas({ metodo: 'cash,card' }).metodos).toEqual(['cash', 'card']);
  });

  test('listado y cifras comparten exactamente los mismos filtros', () => {
    const f = filtrosVentas({ q: 'FV-1', origen: 'pos', estado: 'pagada', pago: 'paid', metodo: 'cash,card', saldo: '1', devolucion: '1', sync: '1', min: '100', pagina: '2', tamano: '50' });
    const filtro = parametrosFiltro(f, CTX);
    const listado = parametrosListado(f, CTX);
    expect(listado).toMatchObject(filtro);
    expect(Object.keys(listado).filter((k) => !(k in filtro)).sort()).toEqual(['p_desplazamiento', 'p_direccion', 'p_limite', 'p_orden']);
    expect(filtro).toEqual({
      p_organization_id: 7,
      p_branch_id: 3,
      p_desde: CTX.desde,
      p_hasta: CTX.hasta,
      p_busqueda: 'FV-1',
      p_origenes: ['pos'],
      // Canal (Figma 24 Ventas, 2026-11-23): `?canal=`; sin él, todos los canales.
      p_canales: null,
      p_estados: ['pagada'],
      p_metodos: ['cash', 'card'],
      p_cliente_id: null,
      p_cajero_id: null,
      p_importe_min: 100,
      p_importe_max: null,
      p_pagos: ['paid'],
      p_con_saldo: true,
      p_con_devolucion: true,
      p_pendientes_sync: true,
    });
  });

  test('sin filtros: listas en null y casillas en false (la RPC no filtra)', () => {
    expect(parametrosFiltro(filtrosVentas({}), { ...CTX, sucursalId: null })).toMatchObject({
      p_branch_id: null,
      p_pagos: null,
      p_metodos: null,
      p_con_saldo: false,
      p_con_devolucion: false,
      p_pendientes_sync: false,
    });
  });
});

describe('Periodo anterior de igual duración', () => {
  test.each([
    ['2026-11-01', '2026-11-20', '2026-10-12', '2026-10-31'],
    ['2026-09-22', '2026-09-22', '2026-09-21', '2026-09-21'],
    ['2026-03-01', '2026-03-31', '2026-01-29', '2026-02-28'],
    ['2024-03-01', '2024-03-07', '2024-02-23', '2024-02-29'],
    ['2026-01-01', '2026-01-10', '2025-12-22', '2025-12-31'],
  ])('%s – %s → %s – %s', (desde, hasta, d2, h2) => {
    expect(periodoAnterior(desde, hasta)).toEqual({ desde: d2, hasta: h2 });
  });

  test('variación con un decimal; sin periodo anterior no hay porcentaje', () => {
    expect(variacion(112, 100)).toBe(12);
    expect(variacion(90, 120)).toBe(-25);
    expect(variacion(1, 3)).toBe(-66.7);
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(100, null)).toBeNull();
  });
});

const FILA: Pick<FilaVenta, 'id' | 'estado' | 'saldo' | 'origen' | 'notas_credito' | 'nota_credito_numero' | 'cliente' | 'cajero' | 'mesa'> = {
  id: 'a3f91c02-7d1e-4f00-9a00-000000000001',
  estado: 'pagada',
  saldo: 0,
  origen: 'pos',
  notas_credito: 0,
  nota_credito_numero: null,
  cliente: { id: 'c1', nombre: 'Cliente', documento: '1020334556', tipo_documento: 'CC', telefono: '3184552011' },
  cajero: { id: 'u1', nombre: 'Laura Restrepo Gómez' },
  mesa: null,
};

describe('Segunda línea bajo el N.º (Figma 329:36071)', () => {
  test('venta pagada sin más: el id corto', () => {
    expect(lineaNumero(FILA)).toEqual({ tipo: 'id', texto: 'a3f91c02' });
  });
  test('con saldo: el saldo (manda sobre web y NC)', () => {
    expect(lineaNumero({ ...FILA, estado: 'pago_parcial', saldo: 640000, origen: 'web', notas_credito: 1 })).toEqual({ tipo: 'saldo', monto: 640000 });
  });
  test('anulada con nota crédito: el número de la NC, aunque quede saldo', () => {
    expect(lineaNumero({ ...FILA, estado: 'anulada', saldo: 72500, notas_credito: 1, nota_credito_numero: 'NC-000031' })).toEqual({
      tipo: 'notaCredito',
      numero: 'NC-000031',
      cantidad: 1,
    });
  });
  test('pedido web: «pedido web»', () => {
    expect(lineaNumero({ ...FILA, origen: 'web' })).toEqual({ tipo: 'pedidoWeb' });
  });
  test('pendiente de sincronizar: el id local', () => {
    expect(lineaNumero({ ...FILA, id: 'local-8821abcd', estado: 'pendiente_sincronizar', saldo: 38900 })).toEqual({ tipo: 'local', texto: 'local-8821' });
  });
});

describe('Segunda línea bajo el cliente', () => {
  test('documento con su tipo', () => {
    expect(lineaCliente({ ...FILA })).toEqual({ tipo: 'documento', tipoDocumento: 'CC', numero: '1020334556' });
  });
  test('mesa: «Mesa 7 · Laura R.»', () => {
    expect(lineaCliente({ ...FILA, origen: 'mesa', mesa: '7', cliente: null })).toEqual({ tipo: 'mesa', mesa: '7', cajero: 'Laura R.' });
  });
  test('sin documento: el teléfono (pedidos web)', () => {
    expect(lineaCliente({ ...FILA, origen: 'web', cliente: { id: 'c2', nombre: 'Julián', documento: null, telefono: '318 455 20 11' } })).toEqual({
      tipo: 'telefono',
      telefono: '318 455 20 11',
    });
  });
  test('consumidor final sin datos: nada', () => {
    expect(lineaCliente({ ...FILA, cliente: null })).toBeNull();
  });
  test('nombres cortos y mesas', () => {
    expect(nombreCorto('Laura Restrepo')).toBe('Laura R.');
    expect(nombreCorto('Camilo')).toBe('Camilo');
    expect(nombreCorto('  ')).toBeNull();
    expect(mesaEsNumero('7')).toBe(true);
    expect(mesaEsNumero('Terraza 2')).toBe(false);
  });
  test('documento con separador de miles y NIT con dígito de verificación', () => {
    const entero = (n: number) => new Intl.NumberFormat('es-CO').format(n);
    expect(formatearDocumento('1020334556', entero)).toBe('1.020.334.556');
    expect(formatearDocumento('901455221-3', entero)).toBe('901.455.221-3');
    expect(formatearDocumento('AB123', entero)).toBe('AB123');
  });
});

describe('KPI «Impuestos» y «Transacciones»', () => {
  test('código de la factura → tipo y tasa', () => {
    expect(nombreImpuesto({ codigo: 'IVA_19', tasa: 19 })).toEqual({ clase: 'tipoTasa', tipo: 'IVA', tasa: 19 });
    expect(nombreImpuesto({ codigo: 'INC_8', tasa: null })).toEqual({ clase: 'tipoTasa', tipo: 'INC', tasa: 8 });
  });
  test('nombre del desglose de la venta se respeta; sin nada, «sin detalle»', () => {
    expect(nombreImpuesto({ codigo: 'IVA 19%', tasa: null })).toEqual({ clase: 'nombre', nombre: 'IVA 19%' });
    expect(nombreImpuesto({ codigo: null, tasa: null })).toEqual({ clase: 'sinDetalle' });
  });
  test('transacciones: pagadas · pendientes · anuladas siempre; devueltas solo si hay', () => {
    const base = { pagadas: 1286, pendientes: 23, anuladas: 3, devueltas: 0 } as CifrasVentas['actual'];
    expect(partesTransacciones(base).map((p) => p.clave)).toEqual(['pagadas', 'pendientes', 'anuladas']);
    expect(partesTransacciones({ ...base, devueltas: 2 }).map((p) => p.clave)).toEqual(['pagadas', 'pendientes', 'anuladas', 'devueltas']);
  });
  test('origen con tono del kit (SISTEMA-BADGES): POS marca, Mesa advertencia, Web información, Factura neutro', () => {
    expect(ORIGENES_VENTA.map((o) => TONO_ORIGEN_VENTA[o])).toEqual(['marca', 'advertencia', 'informacion', 'neutro']);
  });
});

describe('SQL de la migración 20261120180446', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261120180446_pos_ventas_listado_figma_filtros_y_cifras.sql'), 'utf8');
  const tramo = (desde: string, hasta: string) => sql.slice(sql.indexOf(desde), sql.indexOf(hasta, sql.indexOf(desde)));

  test('el estado sigue la prioridad de estadoVenta (manda el cobro)', () => {
    const bloque = tramo("when b.status in ('void', 'cancelled') then 'anulada'", 'end as estado');
    const orden = ['anulada', 'borrador', 'devuelta', 'devuelta_parcial', 'pagada', 'pago_parcial', 'pendiente_pago'];
    const posiciones = orden.map((e) => bloque.indexOf(`'${e}'`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    expect(bloque).toMatch(/coalesce\(nullif\(b\.payment_status, ''\), b\.status\) = 'paid'/);
  });

  test('listado y cifras leen de la misma función de filtros', () => {
    const listado = tramo('create or replace function public.pos_ventas_listado_v2', 'create or replace function public.pos_ventas_cifras');
    const cifras = tramo('create or replace function public.pos_ventas_cifras', 'create or replace function public.pos_ventas_cajeros');
    expect(listado).toMatch(/from public\.pos_ventas_filtradas\(/);
    expect(cifras.match(/from public\.pos_ventas_filtradas\(/g)).toHaveLength(2); // actual y anterior
    expect(listado).toMatch(/offset v_desp\s+limit v_limite/);
  });

  test('ventas y ticket excluyen anuladas y borradores; transacciones cuenta todas', () => {
    const cifras = tramo('create or replace function public.pos_ventas_cifras', 'create or replace function public.pos_ventas_cajeros');
    expect(cifras).toMatch(/ef as \(\s*select \* from f where estado not in \('anulada', 'borrador'\)/);
    expect(cifras).toMatch(/'ventas', round\(coalesce\(\(select sum\(total\) from ef\)/);
    expect(cifras).toMatch(/'transacciones', \(select count\(\*\) from f\)/);
  });

  test('impuestos desde las líneas de la factura (no desde sale_items.tax_rate)', () => {
    const cifras = tramo('create or replace function public.pos_ventas_cifras', 'create or replace function public.pos_ventas_cajeros');
    expect(cifras).toMatch(/join public\.invoice_items it on it\.invoice_sales_id = ef\.factura_id/);
    expect(cifras).not.toMatch(/sale_items/);
  });

  test('nada abierto a anon y la función de filtros sin grant a authenticated', () => {
    expect(sql).toMatch(/revoke all on function public\.pos_ventas_filtradas\([^)]*\) from public, anon, authenticated;/);
    for (const f of ['pos_ventas_listado_v2', 'pos_ventas_cifras', 'pos_ventas_cajeros']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`));
    }
    expect(sql).not.toMatch(/to anon/);
    // Cada función expuesta valida la organización.
    for (const f of ['pos_ventas_listado_v2', 'pos_ventas_cifras', 'pos_ventas_cajeros']) {
      const cuerpo = sql.slice(sql.indexOf(`create or replace function public.${f}`));
      expect(cuerpo.slice(0, 2500)).toMatch(/perform public\.fn_assert_acceso_org\(p_organization_id\);/);
    }
  });
});

describe('Canal (Figma 24 Ventas, 2026-11-23)', () => {
  test('`?canal=` pasa por la lista blanca y llega como p_canales', () => {
    const f = filtrosVentas({ canal: 'pos,menu_qr,hackeo' });
    expect(f.canales).toEqual(['pos', 'menu_qr']);
    expect(parametrosFiltro(f, CTX).p_canales).toEqual(['pos', 'menu_qr']);
    expect(parametrosFiltro(filtrosVentas({}), CTX).p_canales).toBeNull();
  });
});
