/**
 * Mi asistencia (Figma 20.31.4–20.31.8): estado del día con reclamo, método
 * de cada día y marca que propone el reclamo. Identificadores ficticios.
 */
import {
  claveErrorReclamo,
  estadoDe,
  marcaPorDefecto,
  metodoDelDia,
  metodosDeSede,
  normalizarMetodo,
  puedeReclamar,
  type DiaAsistencia,
  type MarcaMia,
} from '../miAsistenciaLogica';

const HOY = '2026-11-16';
const dia = (d: Partial<DiaAsistencia>): DiaAsistencia => ({
  fecha: '2026-11-14',
  festivo: false,
  sede: 'Sede Centro',
  turno: { plantilla: 'Apertura', inicio: '2026-11-14T11:00:00Z', fin: '2026-11-14T18:00:00Z', dia_descanso: false },
  entrada: '2026-11-14T11:21:00Z',
  salida: '2026-11-14T18:00:00Z',
  descanso_inicio: null,
  descanso_fin: null,
  metodo: 'app',
  modo: 'presencial',
  minutos: 369,
  tarde_min: 21,
  revisar: false,
  ...d,
});
const marca = (m: Partial<MarcaMia>): MarcaMia => ({ id: 'm1', tipo: 'check_in', hora: '2026-11-14T11:21:00Z', metodo: 'huella', punto: null, reclamo: null, ...m });

describe('estadoDe', () => {
  test('un reclamo abierto manda (20.31.8)', () => {
    expect(estadoDe(dia({ reclamo_abierto: true }), HOY)).toBe('enReclamo');
    expect(estadoDe(dia({ reclamo_abierto: true, revisar: true }), HOY)).toBe('enReclamo');
  });
  test('sin reclamo, los estados de siempre', () => {
    expect(estadoDe(dia({}), HOY)).toBe('tarde');
    expect(estadoDe(dia({ tarde_min: 0 }), HOY)).toBe('aTiempo');
    expect(estadoDe(dia({ salida: null }), HOY)).toBe('sinSalida');
    expect(estadoDe(dia({ fecha: HOY, salida: null }), HOY)).toBe('enTurno');
    expect(estadoDe(dia({ entrada: null, salida: null }), HOY)).toBe('sinMarcar');
    expect(estadoDe(dia({ revisar: true }), HOY)).toBe('porRevisar');
    expect(estadoDe(dia({ entrada: null, salida: null, turno: { plantilla: null, inicio: null, fin: null, dia_descanso: true } }), HOY)).toBe('libre');
    expect(estadoDe(dia({ reclamo_abierto: false }), HOY)).toBe('tarde');
  });
});

describe('metodo del día', () => {
  test('normalizarMetodo: origen viejo y desconocidos', () => {
    expect(normalizarMetodo('nfc')).toBe('nfc_etiqueta');
    expect(normalizarMetodo('app')).toBe('celular_ubicacion');
    expect(normalizarMetodo('huella')).toBe('huella');
    expect(normalizarMetodo('otro')).toBeNull();
    expect(normalizarMetodo(null)).toBeNull();
  });
  test('metodo_exacto manda; luego la entrada de marcas; luego el método viejo', () => {
    expect(metodoDelDia(dia({ metodo_exacto: 'nfc_etiqueta' }))).toBe('nfc_etiqueta');
    expect(metodoDelDia(dia({ metodo_exacto: null, marcas: [marca({ tipo: 'check_out', metodo: 'qr' }), marca({ id: 'm2', metodo: 'carne_nfc', hora: '2026-11-14T11:00:00Z' })] }))).toBe('carne_nfc');
    expect(metodoDelDia(dia({ metodo_exacto: null, metodo: 'qr' }))).toBe('qr');
    expect(metodoDelDia(dia({ metodo: 'app', modo: 'remoto' }))).toBe('remoto');
    expect(metodoDelDia(dia({ metodo: 'app' }))).toBe('celular_ubicacion');
    expect(metodoDelDia(dia({ metodo: 'manual' }))).toBe('manual');
    expect(metodoDelDia(dia({ metodo: null }))).toBeNull();
  });
});

describe('reclamo', () => {
  test('solo días con marcas', () => {
    expect(puedeReclamar(dia({ marcas: [marca({})] }))).toBe(true);
    expect(puedeReclamar(dia({ marcas: [] }))).toBe(false);
    expect(puedeReclamar(dia({}))).toBe(false);
  });
  test('por defecto la entrada', () => {
    const marcas = [
      marca({ id: 'salida', tipo: 'check_out', hora: '2026-11-14T18:00:00Z' }),
      marca({ id: 'entrada', tipo: 'check_in', hora: '2026-11-14T11:21:00Z' }),
    ];
    expect(marcaPorDefecto(marcas)?.id).toBe('entrada');
  });
  test('si la entrada ya tiene reclamo en revisión, la primera libre', () => {
    const marcas = [
      marca({ id: 'entrada', reclamo: 'pending' }),
      marca({ id: 'descanso', tipo: 'break_start', hora: '2026-11-14T14:35:00Z' }),
      marca({ id: 'salida', tipo: 'check_out', hora: '2026-11-14T18:00:00Z' }),
    ];
    expect(marcaPorDefecto(marcas)?.id).toBe('descanso');
  });
  test('todas en revisión: la entrada; sin marcas: null', () => {
    expect(marcaPorDefecto([marca({ id: 's', tipo: 'check_out', reclamo: 'pending', hora: '2026-11-14T18:00:00Z' }), marca({ id: 'e', reclamo: 'pending' })])?.id).toBe('e');
    expect(marcaPorDefecto([])).toBeNull();
    expect(marcaPorDefecto(undefined)).toBeNull();
  });
  test('errores del servidor → claves de la pantalla', () => {
    expect(claveErrorReclamo('duplicado')).toBe('ajuste_ya_pendiente');
    expect(claveErrorReclamo('ajuste_ya_pendiente')).toBe('ajuste_ya_pendiente');
    expect(claveErrorReclamo('marca_antigua')).toBe('marca_antigua');
    expect(claveErrorReclamo('jornada_cerrada')).toBe('jornada_cerrada');
    expect(claveErrorReclamo('hora_invalida')).toBe('reclamo_hora');
    expect(claveErrorReclamo('motivo_requerido')).toBe('reclamo_motivo');
    expect(claveErrorReclamo('no_existe')).toBe('error_hrm');
  });
});

describe('metodosDeSede (aviso «En <sede> marcas con …»)', () => {
  test('con los métodos de la persona manda la base', () => {
    expect(metodosDeSede({ ubicacion: false, qr: true, nfc: true }, [])).toEqual(['qr', 'nfc_etiqueta']);
    expect(metodosDeSede({ ubicacion: true, qr: false, nfc: false }, [{ metodo_exacto: 'qr' }])).toEqual(['celular_ubicacion']);
  });
  test('sin ellos, los métodos exactos de la semana (solo M0)', () => {
    expect(metodosDeSede(null, [{ metodo_exacto: 'qr' }, { metodo_exacto: 'huella' }, { metodo_exacto: 'nfc' }, { metodo_exacto: null }])).toEqual(['qr', 'nfc_etiqueta']);
    expect(metodosDeSede(undefined, [])).toEqual([]);
  });
});
