/**
 * Logística › Envíos (Figma «21 Logística», secciones 11 y 12): pestañas, cobro del PEDIDO, KPI,
 * búsqueda y filtros, acciones por estado (tabla canónica 2799:7510), edición según el estado y
 * validación del formulario.
 */
import {
  ESTADOS_CAMBIO_ESTADO,
  accionesFilaEnvio,
  camposEditables,
  cobroDeEnvio,
  contarPestanas,
  estadosCambioDisponibles,
  etapaDeEnvio,
  faltanteFormulario,
  filtrarEnvios,
  kpisEnvios,
  modoEntregaDe,
  ordenarEnvios,
  particionPorTransicion,
  pesoDeLineas,
  pestanaDeEnvio,
  valorDeLineas,
  type DatosFormularioEnvio,
  type FilaEnvio,
} from '../envios';
import { ESTADOS_ENVIO, transicionValida } from '../estadosEnvio';

function fila(p: Partial<FilaEnvio> = {}): FilaEnvio {
  return {
    id: 'e1', numero: 'ENV-1', status: 'pending', modo: 'own', branchId: 1, canal: 'web', pedido: 'WO-1', pedidoWebId: 'w1',
    creado: '2026-11-24T15:00:00Z', cliente: 'Ana Gómez', telefono: '300 555 12 34', direccion: 'Cra 45 #12-30', ciudad: 'Bogotá', barrio: 'Chapinero',
    instrucciones: null, promesa: null, fechaEsperada: null, valor: 128900, moneda: null, contraentrega: 0, codStatus: null, pagado: false,
    domiciliarioId: null, domiciliario: null, vehiculoId: null, asignado: null, intentosFallidos: 0, motivoNovedad: null, codigoRequerido: false,
    sourceType: 'web_order', sourceId: 'w1', guia: null, transportadora: null, transportadoraId: null, vehiculoTipo: null, sede: 'Sede Centro',
    zonaId: null, zona: null, viajeId: null, salio: null, entregado: null, actualizado: null, pesoKg: null, costoEnvio: 0, pagoPedido: 'pending',
    pedidoAnulado: false, recibio: null, recibioConFoto: false,
    ...p,
  };
}

describe('pestañas', () => {
  test('cada estado cae en su pestaña; lo que no ha salido y no tiene domiciliario, en «Por asignar»', () => {
    expect(pestanaDeEnvio(fila({ status: 'pending' }))).toBe('por_asignar');
    expect(pestanaDeEnvio(fila({ status: 'ready_for_pickup', domiciliarioId: 'd1' }))).toBeNull();
    expect(pestanaDeEnvio(fila({ status: 'pending', modo: 'national_carrier' }))).toBeNull();
    expect(pestanaDeEnvio(fila({ status: 'out_for_delivery' }))).toBe('en_camino');
    expect(pestanaDeEnvio(fila({ status: 'in_transit' }))).toBe('en_camino');
    expect(pestanaDeEnvio(fila({ status: 'failed_attempt' }))).toBe('con_novedad');
    expect(pestanaDeEnvio(fila({ status: 'failed' }))).toBe('con_novedad');
    expect(pestanaDeEnvio(fila({ status: 'delivered' }))).toBe('entregados');
    expect(pestanaDeEnvio(fila({ status: 'returned' }))).toBe('devueltos');
    expect(pestanaDeEnvio(fila({ status: 'cancelled' }))).toBe('cancelados');
  });

  test('el conteo de «Todos» incluye todo; cada pestaña, lo suyo', () => {
    const c = contarPestanas([fila(), fila({ status: 'delivered' }), fila({ status: 'delivered' }), fila({ status: 'assigned', domiciliarioId: 'd1' })]);
    expect(c).toMatchObject({ todos: 4, por_asignar: 1, entregados: 2, en_camino: 0, cancelados: 0 });
  });
});

describe('cobro: sale del PEDIDO, no de campos vacíos del envío', () => {
  test('un pedido de la tienda pagado se ve «Pagado» aunque el envío diga pending', () => {
    expect(cobroDeEnvio(fila({ pagoPedido: 'paid' }))).toBe('pagado');
    expect(cobroDeEnvio(fila({ pagoPedido: 'pending' }))).toBe('pendiente');
  });
  test('contraentrega: por cobrar hasta que se cobra; cancelada, sin cobro', () => {
    expect(cobroDeEnvio(fila({ contraentrega: 45900, codStatus: 'pending' }))).toBe('contraentrega');
    expect(cobroDeEnvio(fila({ contraentrega: 45900, codStatus: 'collected' }))).toBe('pagado');
    expect(cobroDeEnvio(fila({ contraentrega: 45900, codStatus: 'pending', status: 'cancelled' }))).toBe('sin_cobro');
  });
  test('manual sin pedido: pendiente solo si lleva costo de envío', () => {
    expect(cobroDeEnvio(fila({ sourceId: null, pagoPedido: 'pending', costoEnvio: 0 }))).toBe('sin_cobro');
    expect(cobroDeEnvio(fila({ sourceId: null, pagoPedido: 'pending', costoEnvio: 8000 }))).toBe('pendiente');
    expect(cobroDeEnvio(fila({ sourceId: null, pagoPedido: 'paid', costoEnvio: 8000 }))).toBe('pagado');
    expect(cobroDeEnvio(fila({ status: 'cancelled', pagoPedido: 'pending' }))).toBe('sin_cobro');
  });
});

describe('KPI', () => {
  test('entregados con % y % al primer intento, en camino con su novedad principal y contraentrega en la calle', () => {
    const filas = [
      fila({ id: 'a', status: 'delivered', intentosFallidos: 0 }),
      fila({ id: 'b', status: 'delivered', intentosFallidos: 1 }),
      fila({ id: 'c', status: 'cancelled' }),
      fila({ id: 'd', status: 'out_for_delivery', contraentrega: 50000, codStatus: 'pending', domiciliarioId: 'd1' }),
      fila({ id: 'e', status: 'failed_attempt', motivoNovedad: 'not_home', contraentrega: 20000.5, codStatus: 'pending', domiciliarioId: 'd1' }),
      fila({ id: 'f', status: 'failed_attempt', motivoNovedad: 'not_home' }),
      fila({ id: 'g', status: 'delivered', contraentrega: 99999, codStatus: 'collected', creado: '2026-11-20T15:00:00Z' }),
    ];
    const k = kpisEnvios(filas, '2026-11-24', 'America/Bogota');
    expect(k.total).toBe(7);
    expect(k.creadosHoy).toBe(6);
    expect(k.entregados).toBe(3);
    expect(k.pctEntregados).toBe(50); // 3 de 6 no cancelados
    expect(k.pctPrimerIntento).toBe(66.7);
    expect(k.enCamino).toBe(1);
    expect(k.conNovedad).toBe(2);
    expect(k.motivoNovedad).toBe('not_home');
    expect(k.contraentregaPorCobrar).toBe(70000.5);
    expect(k.enviosContraentrega).toBe(2);
    expect(k.domiciliariosContraentrega).toBe(1);
  });
  test('sin envíos no hay porcentajes inventados', () => {
    const k = kpisEnvios([], '2026-11-24', 'America/Bogota');
    expect(k.pctEntregados).toBeNull();
    expect(k.pctPrimerIntento).toBeNull();
  });
});

describe('búsqueda y filtros', () => {
  const filas = [
    fila({ id: 'a', numero: 'ENV-0712', pedido: 'WO-000412', cliente: 'Ana Gómez', domiciliarioId: 'd1' }),
    fila({ id: 'b', numero: 'ENV-0711', cliente: 'Carlos Ruiz', guia: '2045 8812 30', modo: 'national_carrier', transportadoraId: 'c1', canal: 'web' }),
    fila({ id: 'c', numero: 'ENV-0710', cliente: 'Laura Peña', canal: 'pos', sourceType: 'sale', telefono: '315 664 09 12', zonaId: 'z1' }),
    fila({ id: 'd', numero: 'ENV-0709', cliente: 'Jorge Medina', canal: 'qr', viajeId: 't1', status: 'delivered', pagoPedido: 'paid' }),
  ];
  test('por envío, pedido, guía (sin espacios), cliente y teléfono', () => {
    expect(filtrarEnvios(filas, { busqueda: 'wo-000412' }).map((f) => f.id)).toEqual(['a']);
    expect(filtrarEnvios(filas, { busqueda: '20458812' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarEnvios(filas, { busqueda: 'gomez' }).map((f) => f.id)).toEqual(['a']);
    expect(filtrarEnvios(filas, { busqueda: '3156640912' }).map((f) => f.id)).toEqual(['c']);
  });
  test('canal, pago, quién lo lleva, transportadora, viaje, zona y pestaña', () => {
    expect(filtrarEnvios(filas, { canal: 'pos' }).map((f) => f.id)).toEqual(['c']);
    expect(filtrarEnvios(filas, { cobro: 'pagado' }).map((f) => f.id)).toEqual(['d']);
    expect(filtrarEnvios(filas, { quien: 'd1' }).map((f) => f.id)).toEqual(['a']);
    expect(filtrarEnvios(filas, { quien: 'sin_asignar' }).map((f) => f.id)).toEqual(['c', 'd']);
    expect(filtrarEnvios(filas, { transportadora: 'c1' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarEnvios(filas, { viaje: 't1' }).map((f) => f.id)).toEqual(['d']);
    expect(filtrarEnvios(filas, { zona: 'z1' }).map((f) => f.id)).toEqual(['c']);
    expect(filtrarEnvios(filas, { pestana: 'entregados' }).map((f) => f.id)).toEqual(['d']);
    expect(filtrarEnvios(filas, { pestana: 'todos' })).toHaveLength(4);
  });
  test('el historial va del más nuevo al más viejo', () => {
    const r = ordenarEnvios([fila({ id: 'v', creado: '2026-11-01T00:00:00Z' }), fila({ id: 'n', creado: '2026-11-20T00:00:00Z' })]);
    expect(r.map((f) => f.id)).toEqual(['n', 'v']);
  });
});

describe('acciones por estado (tabla canónica 2799:7510)', () => {
  test('el menú y la barra solo ofrecen lo que la base acepta', () => {
    for (const status of ESTADOS_ENVIO) {
      const a = accionesFilaEnvio(fila({ status }));
      expect(a.devolver).toBe(transicionValida(status, 'returned'));
      expect(a.cancelar).toBe(transicionValida(status, 'cancelled'));
      expect(a.cambiarEstado).toBe(ESTADOS_CAMBIO_ESTADO.some((e) => transicionValida(status, e)));
    }
  });
  test('creado: asignar, imprimir y cancelar; nunca devolver', () => {
    const a = accionesFilaEnvio(fila({ status: 'pending' }));
    expect(a).toMatchObject({ asignar: true, imprimir: true, cancelar: true, devolver: false, editar: true, duplicar: true });
  });
  test('en reparto: devolver sí, cancelar no; entregado: ni cambiar estado, ni devolver, ni cancelar', () => {
    expect(accionesFilaEnvio(fila({ status: 'out_for_delivery' }))).toMatchObject({ devolver: true, cancelar: false, asignar: false });
    expect(accionesFilaEnvio(fila({ status: 'delivered' }))).toMatchObject({ cambiarEstado: false, devolver: false, cancelar: false });
  });
  test('asignar solo al domicilio propio', () => {
    expect(accionesFilaEnvio(fila({ status: 'pending', modo: 'national_carrier' })).asignar).toBe(false);
  });
  test('«Marcar pagado» solo en envíos manuales por cobrar: el pago de un pedido va en el pedido', () => {
    expect(accionesFilaEnvio(fila({ sourceId: null, costoEnvio: 8000 })).marcarPagado).toBe(true);
    expect(accionesFilaEnvio(fila({ sourceId: 'w1', pagoPedido: 'pending' })).marcarPagado).toBe(false);
  });
  test('cambiar estado de varios: solo pasan los que pueden', () => {
    const p = particionPorTransicion([fila({ id: 'a', status: 'assigned' }), fila({ id: 'b', status: 'delivered' }), fila({ id: 'c', status: 'cancelled' })], 'out_for_delivery');
    expect(p.pueden.map((f) => f.id)).toEqual(['a']);
    expect(p.noPueden.map((f) => f.id)).toEqual(['b', 'c']);
    expect(estadosCambioDisponibles('picked')).toEqual(['in_transit', 'out_for_delivery']);
    expect(estadosCambioDisponibles('delivered')).toEqual([]);
  });
});

describe('editar según el estado (2965:9202)', () => {
  test('nuevo: todo; con pedido vinculado, lo del pedido no', () => {
    expect(camposEditables({ status: null, vinculado: false, nuevo: true }).has('lineas')).toBe(true);
    const v = camposEditables({ status: null, vinculado: true, nuevo: true });
    expect(v.has('lineas') || v.has('costo') || v.has('contraentrega')).toBe(false);
    expect(v.has('sede')).toBe(true);
  });
  test('en preparación: todo menos el pedido; el domiciliario por la RPC', () => {
    const e = camposEditables({ status: 'pending', vinculado: false, nuevo: false });
    expect(e.has('pedido')).toBe(false);
    expect(e.has('direccion') && e.has('lineas') && e.has('costo') && e.has('domiciliario')).toBe(true);
  });
  test('en camino: promesa, notas, teléfono y contraentrega (manual); destinatario y paquete bloqueados', () => {
    const e = camposEditables({ status: 'out_for_delivery', vinculado: false, nuevo: false });
    expect([...e].sort()).toEqual(['contraentrega', 'guia', 'indicaciones', 'notas', 'promesa', 'telefono']);
    expect(camposEditables({ status: 'out_for_delivery', vinculado: true, nuevo: false }).has('contraentrega')).toBe(false);
    // Tras un intento fallido se puede reasignar (la RPC lo admite).
    expect(camposEditables({ status: 'failed_attempt', vinculado: false, nuevo: false }).has('domiciliario')).toBe(true);
  });
  test('cerrado: solo las notas', () => {
    for (const s of ['delivered', 'returned', 'cancelled']) expect([...camposEditables({ status: s, vinculado: false, nuevo: false })]).toEqual(['notas']);
  });
  test('etapas', () => {
    expect(etapaDeEnvio('assigned')).toBe('preparacion');
    expect(etapaDeEnvio('picked')).toBe('en_camino');
    expect(etapaDeEnvio('failed_attempt')).toBe('en_camino');
    expect(etapaDeEnvio('delivered')).toBe('cerrado');
  });
});

describe('formulario', () => {
  const base: DatosFormularioEnvio = {
    pedidoWebId: null, sedeId: 1, remitente: 'Org 1', telefonoRemitente: '', clienteId: null, destinatario: 'Ana', telefono: '+57 3005551234',
    direccion: 'Cra 45 #12-30', barrio: 'Chapinero', ciudad: 'Bogotá', indicaciones: '', lineas: [], tipoPaquete: 'small_box', pesoKg: null,
    valorDeclarado: null, fragil: false, firma: false, modo: 'own', domiciliarioId: null, transportadoraId: null, guia: '', viajeId: null,
    paradaOrigenId: null, paradaDestinoId: null, promesa: null, costoEnvio: null, seguro: null, cobrarContraentrega: false, contraentrega: null, notas: '',
  };
  test('lo mínimo para guardar', () => {
    expect(faltanteFormulario(base)).toBeNull();
    expect(faltanteFormulario({ ...base, sedeId: null })).toBe('sede');
    expect(faltanteFormulario({ ...base, telefono: '300' })).toBe('telefono');
    expect(faltanteFormulario({ ...base, modo: 'national_carrier' })).toBe('transportadora');
    expect(faltanteFormulario({ ...base, modo: 'viaje' })).toBe('viaje');
    expect(faltanteFormulario({ ...base, cobrarContraentrega: true, contraentrega: 0 })).toBe('contraentrega');
  });
  test('con pedido vinculado el destino sale del pedido', () => {
    expect(faltanteFormulario({ ...base, pedidoWebId: 'w1', destinatario: '', telefono: '', direccion: '', ciudad: '' })).toBeNull();
  });
  test('peso y valor sugeridos por las líneas', () => {
    const lineas = [
      { clave: 'a', descripcion: 'Audífonos', cantidad: 1, pesoKg: 0.4, valor: 89000 },
      { clave: 'b', descripcion: 'Cargador', cantidad: 2, pesoKg: 0.2, valor: 39900 },
      { clave: 'c', descripcion: 'Bolsa', cantidad: 1, pesoKg: null, valor: null },
    ];
    expect(pesoDeLineas(lineas)).toBe(0.8);
    expect(valorDeLineas(lineas)).toBe(128900);
    expect(pesoDeLineas([])).toBeNull();
  });
  test('modo de entrega: un viaje se reconoce por metadata.trip_id', () => {
    expect(modoEntregaDe('own', 't1')).toBe('viaje');
    expect(modoEntregaDe('national_carrier', null)).toBe('national_carrier');
    expect(modoEntregaDe('own', null)).toBe('own');
  });
});
