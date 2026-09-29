/**
 * Traslados y distribución (inventario B3): lógica pura de la interfaz y
 * contrato de errores. La RPC vuelve a validar todo; esto solo cuida que la
 * pantalla no ofrezca lo que el servidor va a rechazar ni pierda decisiones.
 */
import {
  codigoErrorTraslado,
  detalleErrorTraslado,
  estadoHttpErrorTraslado,
  filtrosTrasladosSchema,
  guardarTrasladoSchema,
  recibirSchema,
  type ProductoTrasladable,
  type RenglonTraslado,
} from '@/lib/inventario/transferencias/contrato';
import {
  accionesDe,
  claveRenglon,
  disponibleRenglon,
  estadoVisible,
  evaluarReparto,
  filasCsvTraslados,
  leerPrefill,
  lineasIniciales,
  lineasParaEnviar,
  redondear,
  resumirRecepcion,
  rutaKardex,
  rutaNuevoTraslado,
  tonoEstado,
  totalesRenglones,
  unidadesEnTransito,
  validarRenglones,
  type RenglonFormulario,
} from '@/lib/inventario/transferencias/logica';

const renglon = (p: Partial<RenglonTraslado> & { id: number }): RenglonTraslado => ({
  product_id: 1,
  nombre: 'Producto',
  sku: null,
  unidad: 'UN',
  variante: null,
  track_serial: false,
  track_lots: false,
  lote: null,
  cantidad: 10,
  recibido: 0,
  faltante: 0,
  devuelto: 0,
  pendiente: 10,
  costo: 1000,
  motivo: null,
  estado: 'in_transit',
  seriales: [],
  disponible: null,
  seriales_disponibles: null,
  ...p,
});

const producto = (p: Partial<ProductoTrasladable> = {}): ProductoTrasladable => ({
  product_id: 7,
  nombre: 'Crema',
  sku: 'CRE-1',
  barcode: null,
  unidad: 'UN',
  variante: null,
  track_lots: false,
  track_serial: false,
  disponible: 24,
  costo_promedio: 18500,
  lotes: [],
  ...p,
});

describe('estados', () => {
  it('el recibido con faltante se ve como «Recibido con diferencia»', () => {
    expect(estadoVisible({ estado: 'received', con_diferencia: true })).toBe('con_diferencia');
    expect(estadoVisible({ estado: 'received', faltantes: 2 })).toBe('con_diferencia');
    expect(estadoVisible({ estado: 'received', con_diferencia: false })).toBe('received');
    expect(estadoVisible({ estado: 'in_transit', con_diferencia: true })).toBe('in_transit');
  });

  it('tonos de Figma: pendiente ámbar, en tránsito azul, recibido verde, cancelado rojo', () => {
    expect(tonoEstado('pending').tono).toBe('advertencia');
    expect(tonoEstado('in_transit').tono).toBe('informacion');
    expect(tonoEstado('received').tono).toBe('exito');
    expect(tonoEstado('con_diferencia')).toEqual({ tono: 'advertencia', contorno: true });
    expect(tonoEstado('cancelled').tono).toBe('peligro');
  });
});

describe('acciones por estado y permiso (P7)', () => {
  const todo = { trasladar: true, recibir: true };
  it('pendiente: despachar, editar, cancelar; nunca recibir ni devolver', () => {
    expect(accionesDe('pending', todo)).toEqual({ despachar: true, editar: true, cancelar: true, recibir: false, devolver: false, imprimir: true });
  });
  it('en tránsito: recibir y devolver; ya no se edita ni se cancela', () => {
    expect(accionesDe('in_transit', todo)).toMatchObject({ recibir: true, devolver: true, despachar: false, editar: false, cancelar: false });
  });
  it('quien solo tiene «recibir» (inventory.create) recibe pero no despacha ni devuelve', () => {
    expect(accionesDe('in_transit', { trasladar: false, recibir: true })).toMatchObject({ recibir: true, devolver: false });
    expect(accionesDe('pending', { trasladar: false, recibir: true })).toMatchObject({ despachar: false, cancelar: false });
  });
  it('sin permisos resueltos no se ofrece nada que escriba', () => {
    const a = accionesDe('pending', { trasladar: false, recibir: false });
    expect([a.despachar, a.editar, a.cancelar, a.recibir, a.devolver]).toEqual([false, false, false, false, false]);
  });
  it('un cancelado no tiene guía', () => {
    expect(accionesDe('cancelled', todo).imprimir).toBe(false);
  });
});

describe('recepción: quien recibe decide la diferencia', () => {
  const items = [renglon({ id: 1, nombre: 'Tornillo', cantidad: 100, pendiente: 100, costo: 320 }), renglon({ id: 2, nombre: 'Crema', cantidad: 24, pendiente: 24, costo: 18500, lote: { id: 9, codigo: 'L-14', vence: '2027-03-12' } })];

  it('por defecto llegó todo y es válido', () => {
    const lineas = lineasIniciales(items);
    const r = resumirRecepcion(items, lineas);
    expect(r.valida).toBe(true);
    expect(r.unidades).toBe(124);
    expect(r.conDiferencia).toEqual([]);
  });

  it('una diferencia exige decisión; «faltante» exige motivo y valora la merma al costo de salida', () => {
    const lineas = lineasIniciales(items).map((l) => (l.item_id === 2 ? { ...l, recibido: 22 } : l));
    expect(resumirRecepcion(items, lineas).errores[2]).toBe('decision_requerida');
    const conFaltante = lineas.map((l) => (l.item_id === 2 ? { ...l, decision: 'faltante' as const } : l));
    expect(resumirRecepcion(items, conFaltante).errores[2]).toBe('motivo_requerido');
    const conMotivo = conFaltante.map((l) => (l.item_id === 2 ? { ...l, motivo: 'caja rota' } : l));
    const r = resumirRecepcion(items, conMotivo);
    expect(r.valida).toBe(true);
    expect(r.faltantes).toBe(2);
    expect(r.valorFaltante).toBe(37000);
    expect(r.conDiferencia[0]).toMatchObject({ nombre: 'Crema', lote: 'L-14', diferencia: 2 });
  });

  it('«siguen en camino» no da de baja nada', () => {
    const lineas = lineasIniciales(items).map((l) => (l.item_id === 1 ? { ...l, recibido: 60, decision: 'en_camino' as const } : l));
    const r = resumirRecepcion(items, lineas);
    expect(r.valida).toBe(true);
    expect(r.enCamino).toBe(40);
    expect(r.faltantes).toBe(0);
    const cuerpo = lineasParaEnviar(items, lineas);
    expect(cuerpo.find((l) => l.item_id === 1)).toEqual({ item_id: 1, recibido: 60, decision: 'en_camino', motivo: null });
  });

  it('no puede llegar más de lo pendiente', () => {
    const lineas = lineasIniciales(items).map((l) => (l.item_id === 1 ? { ...l, recibido: 101 } : l));
    expect(resumirRecepcion(items, lineas).errores[1]).toBe('recibido_de_mas');
  });

  it('con seriales, una recepción parcial exige marcar cuáles llegaron', () => {
    const conSeriales = [
      renglon({
        id: 5,
        cantidad: 3,
        pendiente: 3,
        track_serial: true,
        seriales: [
          { id: 11, serial: 'A1', estado: 'in_transit' },
          { id: 12, serial: 'A2', estado: 'in_transit' },
          { id: 13, serial: 'A3', estado: 'in_transit' },
        ],
      }),
    ];
    const lineas = lineasIniciales(conSeriales);
    expect(lineas[0].seriales).toEqual([11, 12, 13]);
    const parcial = [{ ...lineas[0], recibido: 2, decision: 'faltante' as const, motivo: 'no llegó', seriales: [11] }];
    expect(resumirRecepcion(conSeriales, parcial).errores[5]).toBe('seriales_no_cuadran');
    const bien = [{ ...parcial[0], seriales: [11, 13] }];
    expect(resumirRecepcion(conSeriales, bien).valida).toBe(true);
    expect(lineasParaEnviar(conSeriales, bien)[0]).toMatchObject({ recibido: 2, seriales: [11, 13], decision: 'faltante', motivo: 'no llegó' });
  });

  it('una línea en cero con «siguen en camino» no viaja al servidor', () => {
    const lineas = lineasIniciales(items).map((l) => (l.item_id === 1 ? { ...l, recibido: 0, decision: 'en_camino' as const } : l));
    expect(lineasParaEnviar(items, lineas).map((l) => l.item_id)).toEqual([2]);
  });
});

describe('nuevo traslado (P5: nunca más de lo disponible)', () => {
  const base = (p: Partial<RenglonFormulario> = {}): RenglonFormulario => ({ clave: 'a', producto: producto(), lot_id: null, cantidad: 10, ...p });

  it('bloquea cantidades mayores que lo disponible del lote elegido', () => {
    const p = producto({ track_lots: true, lotes: [{ lot_id: 9, codigo: 'L-14', vence: null, disponible: 5, vencido: false }] });
    expect(disponibleRenglon({ producto: p, lot_id: 9 })).toBe(5);
    expect(validarRenglones([base({ producto: p, lot_id: 9, cantidad: 6 })])).toEqual({ a: 'supera_disponible' });
    expect(validarRenglones([base({ producto: p, lot_id: null, cantidad: 24 })])).toEqual({});
  });

  it('cantidad requerida, unidades enteras con seriales y renglón repetido', () => {
    expect(validarRenglones([base({ cantidad: null })])).toEqual({ a: 'cantidad_requerida' });
    expect(validarRenglones([base({ producto: producto({ track_serial: true }), cantidad: 1.5 })])).toEqual({ a: 'unidades_enteras' });
    expect(validarRenglones([base({ clave: 'a' }), base({ clave: 'b' })])).toEqual({ b: 'repetido' });
  });

  it('totales y clave', () => {
    expect(totalesRenglones([base({ cantidad: 0.1 }), base({ clave: 'b', cantidad: 0.2 })])).toEqual({ productos: 1, unidades: 0.3 });
    expect(claveRenglon(7, null)).toBe('7:0');
    expect(redondear(0.1 + 0.2)).toBe(0.3);
  });
});

describe('distribución: reparto por sucursal', () => {
  const productos = [{ product_id: 1, nombre: 'Pan de bono', maximo: 10 }, { product_id: 2, nombre: 'Almojábana', maximo: 12 }];

  it('marca el exceso y lo que queda en origen (Figma paso 2)', () => {
    const r = evaluarReparto(productos, [3, 4], { 1: { 3: 6, 4: 6 }, 2: { 3: 6, 4: 4 } });
    expect(r.queda).toEqual({ 1: -2, 2: 2 });
    expect(r.excedidos).toEqual([{ product_id: 1, nombre: 'Pan de bono', repartido: 12, maximo: 10 }]);
    expect(r.valido).toBe(false);
  });

  it('un traslado por sucursal con lo que lleva; sin cantidades no hay envío', () => {
    const r = evaluarReparto(productos, [3, 4, 5], { 1: { 3: 6, 4: 4 }, 2: { 3: 6 } });
    expect(r.valido).toBe(true);
    expect(r.envios).toEqual([
      { destino: 3, items: [{ product_id: 1, quantity: 6 }, { product_id: 2, quantity: 6 }] },
      { destino: 4, items: [{ product_id: 1, quantity: 4 }] },
    ]);
    expect(r.unidades).toBe(16);
  });
});

describe('rutas y enlaces', () => {
  it('conserva ?producto_id&origen (Stock, Seriales, detalle del producto)', () => {
    expect(rutaNuevoTraslado({ productoId: 9, origen: 108 })).toBe('/app/inventario/transferencias/nuevo?producto_id=9&origen=108');
    expect(rutaNuevoTraslado()).toBe('/app/inventario/transferencias/nuevo');
    expect(leerPrefill(new URLSearchParams('producto_id=9&origen=108'))).toEqual({ productoId: 9, origen: 108 });
    expect(leerPrefill(new URLSearchParams('producto_id=x&origen=-1'))).toEqual({ productoId: null, origen: null });
    expect(rutaKardex(9, 2)).toBe('/app/inventario/kardex?producto=9&sucursal=2');
  });

  it('en tránsito = enviado − recibido − faltante − devuelto', () => {
    expect(unidadesEnTransito({ enviadas: 140, recibidas: 100, faltantes: 2, devueltas: 8 })).toBe(30);
  });

  it('CSV con el estado visible', () => {
    const filas = filasCsvTraslados(
      [
        {
          id: 1,
          code: 'TR-0042',
          estado: 'received',
          con_diferencia: true,
          origen: { id: 1, nombre: 'Norte' },
          destino: { id: 2, nombre: 'Principal' },
          creado_en: '2026-09-19T16:00:00Z',
          autor: null,
          despachado_en: null,
          recibido_en: null,
          cancelado_en: null,
          motivo_cancelacion: null,
          notas: null,
          productos: 2,
          renglones: 2,
          enviadas: 12,
          recibidas: 10,
          faltantes: 2,
          devueltas: 0,
          valor: null,
          primer_producto: null,
          orden_produccion: null,
          atascado: false,
        },
      ],
      { estado: (e) => e, fecha: (v) => v ?? '' },
    );
    expect(filas[0].slice(0, 2)).toEqual(['TR-0042', 'con_diferencia']);
  });
});

describe('contrato de la API', () => {
  it('los errores de la base se traducen a códigos estables con su estado HTTP', () => {
    expect(codigoErrorTraslado({ message: 'stock_insuficiente', code: '23514' })).toBe('stock_insuficiente');
    expect(codigoErrorTraslado({ message: 'SUCURSAL_NO_ES_DE_LA_ORG', code: '42501' })).toBe('sucursal_ajena');
    expect(codigoErrorTraslado({ message: 'Acceso denegado a la organización', code: '42501' })).toBe('sin_permiso');
    expect(codigoErrorTraslado({ message: 'algo raro', code: 'P0002' })).toBe('traslado_no_encontrado');
    expect(codigoErrorTraslado({ message: 'x', code: 'XX000' })).toBe('error_desconocido');
    expect(estadoHttpErrorTraslado('stock_insuficiente')).toBe(409);
    expect(estadoHttpErrorTraslado('sin_permiso')).toBe(403);
    expect(estadoHttpErrorTraslado('traslado_no_encontrado')).toBe(404);
    expect(estadoHttpErrorTraslado('decision_requerida')).toBe(422);
    expect(detalleErrorTraslado('{"disponible":5,"solicitado":6}')).toEqual({ disponible: 5, solicitado: 6 });
    expect(detalleErrorTraslado('no es json')).toBeNull();
  });

  it('la query acepta booleanos literales y listas de estados; rechaza estados inventados', () => {
    expect(filtrosTrasladosSchema.parse({ excluir_cancelados: 'false', solo_produccion: 'true' })).toEqual({ excluir_cancelados: false, solo_produccion: true });
    expect(filtrosTrasladosSchema.safeParse({ estados: ['pending', 'partial'] }).success).toBe(false);
  });

  it('crear exige origen, destino y al menos un renglón positivo; recibir exige clave', () => {
    expect(guardarTrasladoSchema.safeParse({ origen: 2, destino: 3, items: [] }).success).toBe(false);
    expect(guardarTrasladoSchema.safeParse({ origen: 2, destino: 3, items: [{ product_id: 1, quantity: 0 }] }).success).toBe(false);
    expect(guardarTrasladoSchema.safeParse({ origen: 2, destino: 3, items: [{ product_id: 1, quantity: 2, lot_id: null }] }).success).toBe(true);
    expect(recibirSchema.safeParse({ lineas: [{ item_id: 1, recibido: 1 }] }).success).toBe(false);
  });
});
