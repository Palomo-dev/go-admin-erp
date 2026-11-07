/**
 * Caracterización del libro diario de trabajo (ronda 3): las validaciones del
 * alta son las mismas que tenía `AsientosPage` antes (cuenta de título, dos
 * líneas, cuadre, centro obligatorio, tercero solo para publicar) y las
 * acciones por tipo de asiento. Datos inventados; sin base.
 */
import {
  accionesAsiento,
  bloqueoReversa,
  cambiarCentro,
  cambiarCuenta,
  cambiarImporte,
  conteoFiltros,
  fechaContraAsiento,
  FILTROS_VACIOS,
  fuentesDeGrupos,
  lineaVacia,
  lineasParaGuardar,
  numeroBuscado,
  textoBusquedaSeguro,
  tipoAsiento,
  validarAlta,
  type EntradaValidacion,
  type LineaFormulario,
} from '../asientosLogica';

const linea = (cambio: Partial<LineaFormulario>): LineaFormulario => ({ ...lineaVacia(), ...cambio });

const base = (cambio: Partial<EntradaValidacion> = {}): EntradaValidacion => ({
  fecha: '2026-09-28',
  sucursalId: 3,
  descripcion: 'Gastos bancarios',
  lineas: [linea({ account_code: '53050501', debit: 250000 }), linea({ account_code: '11100501', credit: 250000 })],
  cuentas: [
    { account_code: '53050501', centro_costo_modo: 'obligatorio' },
    { account_code: '11100501' },
  ],
  hayCentros: false,
  esTitulo: (c) => c.length < 4,
  sinTercero: () => [],
  periodoAbierto: true,
  ...cambio,
});

describe('validarAlta', () => {
  it('un asiento que cuadra pasa', () => {
    const r = validarAlta(base());
    expect(r.error).toBeNull();
    expect(r.cuadre).toMatchObject({ debitos: 250000, creditos: 250000, cuadra: true });
  });

  it('exige fecha, sucursal y descripción, en ese orden', () => {
    expect(validarAlta(base({ fecha: '' })).error).toEqual({ codigo: 'fechaRequerida' });
    // Con «Todas las sucursales» el alta fallaba en la base: ahora se pide antes.
    expect(validarAlta(base({ sucursalId: null })).error).toEqual({ codigo: 'sucursalRequerida' });
    expect(validarAlta(base({ descripcion: '  ' })).error).toEqual({ codigo: 'descripcionRequerida' });
  });

  it('pide al menos dos líneas con cuenta e importe', () => {
    const r = validarAlta(base({ lineas: [linea({ account_code: '53050501', debit: 10 }), linea({ credit: 10 })] }));
    expect(r.error).toEqual({ codigo: 'minimoLineas' });
  });

  it('rechaza una cuenta de título', () => {
    const r = validarAlta(base({ lineas: [linea({ account_code: '530', debit: 5 }), linea({ account_code: '11100501', credit: 5 })] }));
    expect(r.error).toEqual({ codigo: 'cuentaTitulo', cuenta: '530' });
  });

  it('no cuadra con la diferencia del Figma', () => {
    const r = validarAlta(
      base({
        lineas: [
          linea({ account_code: '53050501', debit: 250000 }),
          linea({ account_code: '11100501', credit: 181000 }),
          linea({ account_code: '11050501', credit: 50000 }),
        ],
      }),
    );
    expect(r.error).toEqual({ codigo: 'noCuadra' });
    expect(r.cuadre.diferencia).toBe(19000);
  });

  it('exige centro solo si la organización tiene centros', () => {
    expect(validarAlta(base({ hayCentros: false })).error).toBeNull();
    expect(validarAlta(base({ hayCentros: true })).error).toEqual({ codigo: 'centroObligatorio', cuenta: '53050501' });
    const conCentro = base({ hayCentros: true });
    conCentro.lineas = [linea({ account_code: '53050501', debit: 1, cost_center_id: 'c1' }), linea({ account_code: '11100501', credit: 1 })];
    expect(validarAlta(conCentro).error).toBeNull();
  });

  it('bloquea un periodo cerrado y no bloquea mientras no se sabe', () => {
    expect(validarAlta(base({ periodoAbierto: false })).error).toEqual({ codigo: 'periodoCerrado' });
    expect(validarAlta(base({ periodoAbierto: null })).error).toBeNull();
  });

  it('el tercero faltante no es error: se informa aparte', () => {
    const r = validarAlta(base({ sinTercero: () => ['23651501', '23651501'] }));
    expect(r.error).toBeNull();
    expect(r.faltaTercero).toEqual(['23651501']);
  });
});

describe('edición de líneas', () => {
  it('escribir en Débito limpia Crédito y al revés', () => {
    const l = linea({ credit: 100 });
    expect(cambiarImporte(l, 'debit', 50)).toMatchObject({ debit: 50, credit: null });
    expect(cambiarImporte(l, 'debit', null)).toMatchObject({ debit: null, credit: 100 });
  });

  it('al elegir cuenta sin centro se limpian centro y distribución; con centro se pone el de la sucursal', () => {
    const l = linea({ cost_center_id: 'x', distribucion_id: 'd' });
    expect(cambiarCuenta(l, { account_code: '11100501' }, 'c9')).toMatchObject({ cost_center_id: '', distribucion_id: '' });
    expect(cambiarCuenta(linea({}), { account_code: '53050501', centro_costo_modo: 'opcional' }, 'c9').cost_center_id).toBe('c9');
  });

  it('centro y distribución se excluyen', () => {
    expect(cambiarCentro(linea({ cost_center_id: 'c1' }), 'distribucion_id', 'd1')).toMatchObject({ cost_center_id: '', distribucion_id: 'd1' });
  });

  it('lineasParaGuardar manda la distribución sin centro', () => {
    const [g] = lineasParaGuardar([linea({ account_code: '5', debit: 2, cost_center_id: 'c', distribucion_id: 'd' })]);
    expect(g).toMatchObject({ debit: 2, credit: 0, cost_center_id: null, distribucion_id: 'd' });
  });
});

describe('acciones por tipo de asiento', () => {
  it('borrador: publicar, descartar y duplicar (manual); no revertir', () => {
    expect(tipoAsiento({ posted: false, source: 'manual' })).toBe('borrador');
    expect(accionesAsiento({ posted: false, source: 'manual' })).toMatchObject({ publicar: true, descartar: true, duplicar: true, revertir: false });
  });
  it('manual publicado: revertir y duplicar', () => {
    expect(accionesAsiento({ posted: true, source: 'manual' })).toMatchObject({ publicar: false, descartar: false, duplicar: true, revertir: true });
  });
  it('automático: ni revertir ni duplicar (duplicar repetía el hecho)', () => {
    expect(tipoAsiento({ posted: true, source: 'invoice_sales' })).toBe('automatico');
    expect(accionesAsiento({ posted: true, source: 'invoice_sales' })).toMatchObject({ duplicar: false, revertir: false });
  });
  it('contra-asiento: sin acciones de edición', () => {
    expect(tipoAsiento({ posted: true, source: 'reversal' })).toBe('contraAsiento');
    expect(accionesAsiento({ posted: true, source: 'reversal' })).toMatchObject({ duplicar: false, revertir: false, publicar: false });
  });
});

describe('reversa', () => {
  it('bloqueos en orden: ya revertido, sin permiso, periodo cerrado', () => {
    expect(bloqueoReversa({ puedeRevertir: false, revertidoPor: 7, periodoAsiento: true, periodoHoy: true })).toBe('yaRevertido');
    expect(bloqueoReversa({ puedeRevertir: false, revertidoPor: null, periodoAsiento: true, periodoHoy: true })).toBe('sinPermiso');
    expect(bloqueoReversa({ puedeRevertir: true, revertidoPor: null, periodoAsiento: false, periodoHoy: false })).toBe('periodoCerrado');
    expect(bloqueoReversa({ puedeRevertir: true, revertidoPor: null, periodoAsiento: false, periodoHoy: true })).toBeNull();
  });
  it('fecha del contra-asiento: la del original si su periodo está abierto; si no, hoy', () => {
    expect(fechaContraAsiento(true)).toBe('original');
    expect(fechaContraAsiento(false)).toBe('hoy');
    expect(fechaContraAsiento(null)).toBe('desconocida');
  });
});

describe('filtros de la lista', () => {
  it('el texto de búsqueda no rompe el or() de PostgREST', () => {
    expect(textoBusquedaSeguro('venta,id.eq.1)(%*')).toBe('venta id.eq.1');
  });
  it('reconoce un número de asiento con puntos o #', () => {
    expect(numeroBuscado('#9.580')).toBe(9580);
    expect(numeroBuscado('gastos')).toBeNull();
  });
  it('cuenta filtros y junta fuentes de varios grupos', () => {
    expect(conteoFiltros(FILTROS_VACIOS)).toBe(0);
    expect(conteoFiltros({ ...FILTROS_VACIOS, estado: 'borradores', grupos: ['venta'], ocultarPares: true })).toBe(3);
    expect(fuentesDeGrupos(['venta', 'cobro'])).toEqual(expect.arrayContaining(['sales', 'sale', 'payments']));
  });
});
