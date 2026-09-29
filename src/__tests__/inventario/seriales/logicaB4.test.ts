/**
 * Lógica de presentación de seriales, garantías y trazabilidad (inventario B4):
 * rutas de documentos, situación de la garantía (días planos, sin zona),
 * «dónde está», eventos del historial, validación de los diálogos y el
 * contrato de errores de las rutas.
 */
import {
  claveEvento,
  documentoReclamo,
  dondeEsta,
  estadosDeUrl,
  filasCsvSeriales,
  mesesYDias,
  numeroDocumento,
  rutaCliente,
  rutaDocumento,
  rutaNuevoTraslado,
  rutaProducto,
  situacionGarantia,
} from '@/components/inventario/seriales/logica';
import {
  accionesReclamo,
  estadoUnidadAlResolver,
  validarReclamo,
  validarResolucion,
  validarRma,
} from '@/components/inventario/garantias/logica';
import { conReciente, estadoVencimientoLote, tipoCodigoProbable } from '@/components/inventario/reportes/trazabilidad/logica';
import {
  cambiarEstadoReclamoSchema,
  codigoErrorSeriales,
  estadoHttpErrorSeriales,
  resolverReclamoSchema,
  type SerialFila,
} from '@/lib/services/seriales/contrato';

const HOY = '2026-09-28';

function fila(extra: Partial<SerialFila> = {}): SerialFila {
  return {
    id: 1,
    serial: 'AX2-00931',
    estado: 'in_stock',
    producto: { id: 9, uuid: '97443cce-4ab7-433e-836a-678d1277a45d', nombre: 'Audífonos', sku: 'AUD-2' },
    sucursal: { id: 108, nombre: 'Principal' },
    recibido: '2026-08-02T16:05:00Z',
    origen: { source: 'purchase_order', source_id: '128', product_id: null, tipo: 'orden_compra', numero: 'OC-128', ruta: '/app/inventario/ordenes-compra/f69a2a1a-7b5e-439e-bd93-c5627e99dcff' },
    proveedor: { id: 3, uuid: null, nombre: 'Proveedor A' },
    costo: 98000,
    venta: null,
    fecha_venta: null,
    vendedor: null,
    cliente: null,
    garantia: { meses: 12, inicio: null, fin: null },
    reclamo: null,
    ultimo_evento: null,
    ...extra,
  };
}

describe('rutas de documentos', () => {
  it('la ruta la resuelve el servidor (núcleo); solo se enlazan rutas internas de la app', () => {
    expect(rutaDocumento({ ruta: '/app/pos/ventas/abc-1' })).toBe('/app/pos/ventas/abc-1');
    expect(rutaDocumento({ ruta: '/app/inventario/produccion?orden=3' })).toBe('/app/inventario/produccion?orden=3');
    expect(rutaDocumento({ ruta: 'https://otro.sitio/x' })).toBeNull();
    expect(rutaDocumento({ ruta: '/app/../../x' })).toBeNull();
    expect(rutaDocumento({ ruta: null })).toBeNull();
    expect(rutaDocumento(null)).toBeNull();
    expect(rutaCliente('a b')).toBeNull();
    expect(rutaProducto(null)).toBeNull();
  });

  it('el reclamo de garantía (que el núcleo no conoce) tiene la misma forma', () => {
    expect(documentoReclamo('g-7', 'GAR-0007')).toEqual({
      source: 'warranty_claim', source_id: 'g-7', product_id: null, tipo: 'garantia', numero: 'GAR-0007', ruta: '/app/inventario/garantias/g-7',
    });
  });

  it('sin número, el documento se muestra con el comienzo de su id', () => {
    expect(numeroDocumento({ numero: null, source_id: '00cab4a8-a932-4445' })).toBe('#00cab4a8');
    expect(numeroDocumento({ numero: 'FACT-0019', source_id: 'x' })).toBe('FACT-0019');
  });

  it('«Trasladar» abre el traslado nuevo con producto y origen', () => {
    expect(rutaNuevoTraslado(9, 108)).toBe('/app/inventario/transferencias/nuevo?producto_id=9&origen=108');
    expect(rutaNuevoTraslado(9, null)).toBe('/app/inventario/transferencias/nuevo?producto_id=9');
  });
});

describe('situación de la garantía (P9: empieza al vender)', () => {
  it('en bodega con plazo y sin fechas → «Empieza al vender»', () => {
    expect(situacionGarantia(fila(), HOY)).toEqual({ tipo: 'empieza_al_vender', meses: 12 });
  });

  it('vendida con fin lejano → vigente; a 30 días o menos → por vencer; pasada → vencida', () => {
    const vendida = (fin: string) => situacionGarantia(fila({ estado: 'sold', garantia: { meses: 12, inicio: '2026-09-21', fin } }), HOY);
    expect(vendida('2027-09-21')).toMatchObject({ tipo: 'vigente', dias: 358 });
    expect(vendida('2026-10-28')).toMatchObject({ tipo: 'por_vencer', dias: 30 });
    expect(vendida('2026-09-27')).toMatchObject({ tipo: 'vencida', dias: 1 });
    expect(vendida('2026-09-28')).toMatchObject({ tipo: 'por_vencer', dias: 0 });
  });

  it('un reclamo abierto manda sobre las fechas', () => {
    const conReclamo = (estado: string) =>
      situacionGarantia(
        fila({ estado: 'warranty_claim', garantia: { meses: 12, inicio: '2026-09-21', fin: '2027-09-21' }, reclamo: { id: 'r', codigo: 'GAR-0007', estado, rma: 'RMA-1' } }),
        HOY,
      );
    expect(conReclamo('pending')).toEqual({ tipo: 'en_reclamo', codigo: 'GAR-0007', id: 'r' });
    expect(conReclamo('in_process')).toEqual({ tipo: 'en_rma', rma: 'RMA-1', id: 'r' });
    expect(conReclamo('resolved').tipo).toBe('vigente');
  });

  it('dañado sin garantía → «No aplica»; sin plazo → «Sin garantía»', () => {
    expect(situacionGarantia(fila({ estado: 'damaged' }), HOY)).toEqual({ tipo: 'no_aplica' });
    expect(situacionGarantia(fila({ garantia: { meses: null, inicio: null, fin: null } }), HOY)).toEqual({ tipo: 'sin_garantia' });
  });

  it('meses y días restantes en calendario, sin zona horaria', () => {
    expect(mesesYDias('2026-09-28', '2027-08-18')).toEqual({ meses: 10, dias: 21 });
    expect(mesesYDias('2026-01-31', '2026-03-01')).toEqual({ meses: 1, dias: 1 });
    expect(mesesYDias('2026-09-28', '2026-09-27')).toEqual({ meses: 0, dias: 0 });
  });
});

describe('dónde está', () => {
  it('vendido: con el cliente, en la sucursal de la VENTA (no la actual)', () => {
    const d = dondeEsta(fila({ estado: 'sold', sucursal: { id: 1, nombre: 'Actual' }, venta: { venta_id: 'v', factura_id: null, numero: 'F-1', fecha: null, documento: null, sucursal: { id: 2, nombre: 'Norte' } } }));
    expect(d).toEqual({ clave: 'conCliente', detalle: 'vendidoEn', sucursal: 'Norte' });
  });

  it('en tránsito: destino y traslado del último evento', () => {
    const doc = { source: 'transfer', source_id: '41', product_id: null, tipo: 'traslado' as const, numero: 'TR-41', ruta: '/app/inventario/transferencias/41' };
    const d = dondeEsta(fila({ estado: 'in_transit', ultimo_evento: { tipo: 'transferred', fecha: 'x', a_sucursal: 'Norte', documento: doc } }));
    expect(d).toEqual({ clave: 'enTransito', destino: 'Norte', documento: doc });
  });

  it('en stock: sucursal, fecha de recepción y documento de origen', () => {
    const d = dondeEsta(fila());
    expect(d).toMatchObject({ clave: 'enSucursal', sucursal: 'Principal', detalle: 'recibido', recibido: '2026-08-02T16:05:00Z' });
  });

  it('en RMA: con el proveedor', () => {
    expect(dondeEsta(fila({ estado: 'rma' }))).toEqual({ clave: 'conProveedor', proveedor: 'Proveedor A' });
  });
});

describe('eventos del historial', () => {
  it('cada tipo tiene su texto y el reemplazo se distingue de una venta', () => {
    expect(claveEvento({ tipo: 'received', cliente: null, metadata: {} }, 'Proveedor A').clave).toBe('recibidoDe');
    expect(claveEvento({ tipo: 'received', cliente: null, metadata: {} }).clave).toBe('recibido');
    expect(claveEvento({ tipo: 'sold', cliente: { id: 'c', nombre: 'Cliente' }, metadata: {} }).clave).toBe('vendidoA');
    expect(claveEvento({ tipo: 'sold', cliente: null, metadata: { reemplazo_de: 'AX2-1' } }).clave).toBe('reemplazoEntregado');
    expect(claveEvento({ tipo: 'warranty_resolved', cliente: null, metadata: { resolucion: 'replacement' } }).clave).toBe('reemplazado');
    expect(claveEvento({ tipo: 'warranty_resolved', cliente: null, metadata: { resolucion: 'rejected' } }).clave).toBe('reclamoRechazado');
    expect(claveEvento({ tipo: 'warranty_reset', cliente: null, metadata: {} }).clave).toBe('garantiaReiniciada');
    expect(claveEvento({ tipo: 'algo_nuevo', cliente: null, metadata: null }).clave).toBe('cambioEstado');
  });
});

describe('filtros y exportación', () => {
  it('el estado de la URL pasa por la lista blanca', () => {
    expect(estadosDeUrl('sold,robado,rma,sold')).toEqual(['sold', 'rma']);
    expect(estadosDeUrl(null)).toEqual([]);
  });

  it('CSV: una fila por serial con las fechas ya formateadas', () => {
    const filas = filasCsvSeriales([fila({ garantia: { meses: 12, inicio: '2026-09-21', fin: '2027-09-21' } })], {
      estado: (e) => `E:${e}`,
      fechaInstante: (v) => (v ? 'I' : ''),
      fechaPlana: (v) => (v ? `P:${v}` : ''),
    });
    expect(filas[0]).toEqual(['AX2-00931', 'Audífonos', 'AUD-2', 'E:in_stock', 'Principal', 'I', 'OC-128', 'Proveedor A', null, '', null, 12, 'P:2026-09-21', 'P:2027-09-21', null]);
  });
});

describe('reclamos de garantía', () => {
  it('acciones según el estado (las de fn_garantia_*)', () => {
    expect(accionesReclamo('pending')).toEqual({ aprobar: true, rma: true, resolver: true, rechazar: true });
    expect(accionesReclamo('approved')).toEqual({ aprobar: false, rma: true, resolver: true, rechazar: true });
    expect(accionesReclamo('in_process')).toEqual({ aprobar: false, rma: false, resolver: true, rechazar: true });
    expect(accionesReclamo('resolved')).toEqual({ aprobar: false, rma: false, resolver: false, rechazar: false });
  });

  it('nuevo reclamo: serial reclamable, motivo y descripción si es «Otro»', () => {
    expect(validarReclamo({ serialId: null, puede: false, motivo: '', descripcion: '' })).toBe('serial');
    expect(validarReclamo({ serialId: 1, puede: false, motivo: 'noEnciende', descripcion: '' })).toBe('noReclamable');
    expect(validarReclamo({ serialId: 1, puede: true, motivo: '', descripcion: '' })).toBe('motivo');
    expect(validarReclamo({ serialId: 1, puede: true, motivo: 'otro', descripcion: 'x' })).toBe('descripcionOtro');
    expect(validarReclamo({ serialId: 1, puede: true, motivo: 'noEnciende', descripcion: '' })).toBeNull();
  });

  it('RMA y resolución', () => {
    expect(validarRma({ rma: '  ' })).toBe('rma');
    expect(validarRma({ rma: 'RMA-1' })).toBeNull();
    expect(validarResolucion({ tipo: '', serialReemplazo: null, monto: null })).toBe('tipo');
    expect(validarResolucion({ tipo: 'replacement', serialReemplazo: null, monto: null })).toBe('reemplazo');
    expect(validarResolucion({ tipo: 'refund', serialReemplazo: null, monto: 0 })).toBe('monto');
    expect(validarResolucion({ tipo: 'repair', serialReemplazo: null, monto: null })).toBeNull();
  });

  it('la unidad reclamada queda como la deja fn_garantia_resolver', () => {
    expect(estadoUnidadAlResolver('repair', 'in_process')).toBe('sold');
    expect(estadoUnidadAlResolver('replacement', 'pending')).toBe('damaged');
    expect(estadoUnidadAlResolver('replacement', 'in_process')).toBe('rma');
    expect(estadoUnidadAlResolver('refund', 'approved')).toBe('damaged');
  });

  it('esquemas: rechazar exige motivo; resolver exige lo de su tipo', () => {
    expect(cambiarEstadoReclamoSchema.safeParse({ accion: 'rechazar', motivo: 'no' }).success).toBe(false);
    expect(cambiarEstadoReclamoSchema.safeParse({ accion: 'rechazar', motivo: 'Golpe del cliente' }).success).toBe(true);
    expect(resolverReclamoSchema.safeParse({ tipo: 'refund', monto: 145000 }).success).toBe(true);
    expect(resolverReclamoSchema.safeParse({ tipo: 'replacement', serial_reemplazo: 15 }).success).toBe(true);
    expect(resolverReclamoSchema.safeParse({ tipo: 'store_credit' }).success).toBe(false);
  });
});

describe('trazabilidad', () => {
  it('recientes: primero el último, sin repetidos y con tope', () => {
    expect(conReciente(['OC-1', 'L-2'], 'l-2')).toEqual(['l-2', 'OC-1']);
    expect(conReciente(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
    expect(conReciente(['a'], '  ')).toEqual(['a']);
  });

  it('vencimiento del lote en días planos', () => {
    expect(estadoVencimientoLote('2026-10-18', HOY)).toBe('por_vencer');
    expect(estadoVencimientoLote('2027-01-01', HOY)).toBe('vigente');
    expect(estadoVencimientoLote('2026-09-27', HOY)).toBe('vencido');
    expect(estadoVencimientoLote(null, HOY)).toBeNull();
  });

  it('qué parece el código', () => {
    expect(tipoCodigoProbable('oc-131')).toBe('documento');
    expect(tipoCodigoProbable('GAR-0007')).toBe('documento');
    expect(tipoCodigoProbable('L-2026-011')).toBe('lote');
    expect(tipoCodigoProbable('AX2-00932')).toBe('codigo');
  });
});

describe('contrato de errores', () => {
  it('el mensaje de la RPC se vuelve un código estable con su estado', () => {
    expect(codigoErrorSeriales({ message: 'reclamo_abierto', code: 'P0001' })).toBe('reclamo_abierto');
    expect(codigoErrorSeriales({ message: 'SUCURSAL_NO_PERMITIDA', code: '42501' })).toBe('sucursal_no_permitida');
    expect(codigoErrorSeriales({ message: 'Acceso denegado a la organización', code: '42501' })).toBe('sin_permiso');
    expect(codigoErrorSeriales({ message: 'boom', code: 'XX000' })).toBe('error_desconocido');
    expect(estadoHttpErrorSeriales('sin_permiso')).toBe(403);
    expect(estadoHttpErrorSeriales('reclamo_no_encontrado')).toBe(404);
    expect(estadoHttpErrorSeriales('garantia_vencida')).toBe(409);
    expect(estadoHttpErrorSeriales('monto_invalido')).toBe(422);
  });
});
