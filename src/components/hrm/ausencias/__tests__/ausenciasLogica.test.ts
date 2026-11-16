/**
 * Lógica de Ausencias (Figma 20.13 y 20.14): estado visible, cruces del equipo,
 * quién paga, nombres cortos, meses y licencias. Días calendario puros: el mismo
 * resultado con `TZ=UTC` y `TZ=America/Bogota`.
 */
import {
  agruparPorSemana,
  ausentesPorDia,
  crucesDelDia,
  cruceDeFila,
  diasDelTramo,
  diasEntre,
  diasPorPagador,
  estadoVisible,
  filtrarAusencias,
  FILTROS_VACIOS,
  horasEntre,
  licenciaMaternidad,
  lunesDe,
  nombreCorto,
  requiereRrhh,
  sumarMes,
  tramosDeCruce,
  ultimoDia,
  claveError,
  codigoError,
  ERRORES_AUSENCIA,
  PAGADORES,
  partirDiagnostico,
  type AprobacionAusencia,
  type FilaAusencia,
} from '../ausenciasLogica';

function fila(p: Partial<FilaAusencia>): FilaAusencia {
  return {
    id: p.id ?? 'a',
    vinculo_id: p.vinculo_id ?? p.id ?? 'v',
    persona_id: 'p',
    nombre: 'Andrés Felipe Morales Rincón',
    cargo: 'Cocinero',
    area_id: 'cocina',
    area: 'Cocina',
    area_personas: 4,
    sede: null,
    seccion: 'vacaciones',
    nivel: 'completo',
    propio: false,
    sensible: false,
    tipo: 'VAC',
    tipo_nombre: 'Vacaciones',
    clase: 'vacaciones',
    desde: '2026-12-21',
    hasta: '2026-12-24',
    dias_calendario: 4,
    dias_habiles: 4,
    cuenta: 'habiles',
    medio_dia_inicio: false,
    medio_dia_fin: false,
    jornada: null,
    horas: null,
    se_repone: false,
    fecha_parto: null,
    motivo: null,
    remunerado: true,
    estado: 'approved',
    creado: '2026-11-10T14:00:00Z',
    prorroga_de: null,
    soporte: null,
    tramos: null,
    regresa: '2026-12-26',
    aprobacion: null,
    saldo_despues: 10,
    cruces: [],
    ...p,
  };
}

const pendienteJefe: AprobacionAusencia = {
  id: 'i',
  estado: 'pendiente',
  paso_actual: 1,
  puede_decidir: true,
  pasos: [
    { orden: 1, tipo: 'jefe_directo', estado: 'pendiente', respaldo: false, aprobadores: ['Jefa'], soy_yo: true, decidio: null, decidido: null },
    { orden: 2, tipo: 'rrhh', estado: 'pendiente', respaldo: false, aprobadores: ['RH'], soy_yo: false, decidio: null, decidido: null },
  ],
};

describe('estado visible', () => {
  const hoy = '2026-12-22';
  test('por aprobar, y «· RR. HH.» cuando el paso que espera es de RR. HH.', () => {
    expect(estadoVisible(fila({ estado: 'requested', aprobacion: pendienteJefe }), hoy)).toBe('por_aprobar');
    expect(estadoVisible(fila({ estado: 'requested', aprobacion: { ...pendienteJefe, paso_actual: 2 } }), hoy)).toBe('por_aprobar_rrhh');
  });
  test('aprobada, en curso, disfrutada (vacaciones) o terminada (resto)', () => {
    expect(estadoVisible(fila({ desde: '2026-12-28', hasta: '2026-12-31' }), hoy)).toBe('aprobada');
    expect(estadoVisible(fila({}), hoy)).toBe('en_curso');
    expect(estadoVisible(fila({ desde: '2026-11-16', hasta: '2026-11-20' }), hoy)).toBe('disfrutada');
    expect(estadoVisible(fila({ seccion: 'incapacidades', desde: '2026-11-16', hasta: '2026-11-20' }), hoy)).toBe('terminada');
  });
  test('rechazada y anulada', () => {
    expect(estadoVisible(fila({ estado: 'rejected' }), hoy)).toBe('rechazada');
    expect(estadoVisible(fila({ estado: 'cancelled' }), hoy)).toBe('cancelada');
  });
  test('decisión 10: hay un paso de RR. HH. después del jefe', () => {
    expect(requiereRrhh(pendienteJefe)).toBe(true);
    expect(requiereRrhh({ pasos: [pendienteJefe.pasos[0]] })).toBe(false);
  });
});

describe('cruces del equipo (Figma 20.13.1)', () => {
  const a = fila({ id: 'a', vinculo_id: 'va', nombre: 'Andrés Morales', desde: '2026-12-14', hasta: '2026-12-24' });
  const b = fila({ id: 'b', vinculo_id: 'vb', nombre: 'Luis Alberto Mejía', desde: '2026-12-21', hasta: '2026-12-26', estado: 'requested' });
  const c = fila({ id: 'c', vinculo_id: 'vc', nombre: 'Carolina Ruiz Peña', area_id: 'salon', area: 'Salón', desde: '2026-12-28', hasta: '2026-12-31' });
  const anulada = fila({ id: 'd', vinculo_id: 'vd', estado: 'cancelled', desde: '2026-12-21', hasta: '2026-12-22' });
  const mapa = ausentesPorDia([a, b, c, anulada], '2026-12-01', '2026-12-31');

  test('solo cuentan las solicitudes vivas y se recortan al mes', () => {
    expect(mapa.get('2026-12-21')?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(mapa.get('2026-12-13')).toBeUndefined();
    expect(diasEntre('2026-11-28', '2026-12-02', '2026-12-01', '2026-12-31')).toEqual(['2026-12-01', '2026-12-02']);
  });
  test('dos personas de la misma área el mismo día son un cruce; de áreas distintas, no', () => {
    expect(crucesDelDia(mapa.get('2026-12-22') ?? [])).toEqual([{ area_id: 'cocina', area: 'Cocina', ausentes: 2, total: 4 }]);
    expect(crucesDelDia(mapa.get('2026-12-28') ?? [])).toEqual([]);
  });
  test('el aviso agrupa los días seguidos: «Cocina del 21 al 24, queda con 2 de 4»', () => {
    expect(tramosDeCruce(mapa)).toEqual([
      { area_id: 'cocina', area: 'Cocina', desde: '2026-12-21', hasta: '2026-12-24', personas: ['Andrés Morales', 'Luis Alberto Mejía'], quedan: 2, total: 4 },
    ]);
  });
  test('la columna «Cruces» usa lo que devuelve la base', () => {
    expect(cruceDeFila(fila({ cruces: [] }))).toBeNull();
    expect(
      cruceDeFila(fila({ cruces: [{ nombre: 'X', desde: '2026-12-21', hasta: '2026-12-24', estado: 'approved' }, { nombre: 'Y', desde: '2026-12-23', hasta: '2026-12-26', estado: 'requested' }] }))
    ).toEqual({ desde: '2026-12-21', hasta: '2026-12-26', aprobado: true });
  });
  test('la lista móvil se agrupa por semana (lunes)', () => {
    expect(lunesDe('2026-12-27')).toBe('2026-12-21');
    expect(lunesDe('2026-12-21')).toBe('2026-12-21');
    expect(agruparPorSemana([c, a, b], '2026-12-01').map((g) => [g.lunes, g.filas.map((x) => x.id)])).toEqual([
      ['2026-12-14', ['a']],
      ['2026-12-21', ['b']],
      ['2026-12-28', ['c']],
    ]);
  });
});

describe('pagos y tramos (Figma 20.14)', () => {
  test('«Empresa 2 d · EPS 8 d»: días por pagador en el orden de los tramos', () => {
    expect(
      diasPorPagador([
        { desde: '2026-11-10', hasta: '2026-11-11', dias: 2, paga: 'empleador', fraccion: 0.6667 },
        { desde: '2026-11-12', hasta: '2026-11-19', dias: 8, paga: 'eps', fraccion: 0.6667 },
      ])
    ).toEqual([
      { paga: 'empleador', dias: 2 },
      { paga: 'eps', dias: 8 },
    ]);
  });
  test('los días del tramo siguen la cadena de prórrogas', () => {
    expect(diasDelTramo({ desde: '2026-11-20', hasta: '2026-11-25', dias: 6, paga: 'eps', fraccion: 0.6667, dia_de_la_incapacidad: 11 })).toEqual({ desde: 11, hasta: 16 });
    expect(diasDelTramo({ desde: '2026-11-20', hasta: '2026-11-25', dias: 6, paga: 'eps', fraccion: 1 })).toBeNull();
  });
});

describe('textos y cálculos de presentación', () => {
  test('nombre corto del calendario', () => {
    expect(nombreCorto('Andrés Felipe Morales Rincón')).toBe('A. Morales');
    expect(nombreCorto('Carolina Ruiz Peña')).toBe('C. Ruiz');
    expect(nombreCorto('Luis Mejía')).toBe('L. Mejía');
    expect(nombreCorto(null)).toBe('—');
  });
  test('meses sin zona horaria', () => {
    expect(sumarMes('2026-12', 1)).toBe('2027-01');
    expect(sumarMes('2027-01', -1)).toBe('2026-12');
    expect(ultimoDia('2028-02')).toBe('2028-02-29');
  });
  test('maternidad: 18 semanas son 126 días y termina el 7 de marzo si empieza el 2 de noviembre', () => {
    expect(licenciaMaternidad('2026-11-02', 18, '2026-11-09')).toEqual({ termina: '2027-03-07', dias: 126, semanasAntes: 1 });
  });
  test('horas de un permiso', () => {
    expect(horasEntre('08:00', '10:00')).toBe(2);
    expect(horasEntre('14:00', '16:30')).toBe(2.5);
  });
  test('diagnóstico «J11 · Influenza» se parte en código y nombre', () => {
    expect(partirDiagnostico('j11 · Influenza')).toEqual({ diagnostico_codigo: 'J11', diagnostico: 'Influenza' });
    expect(partirDiagnostico('A09.0')).toEqual({ diagnostico_codigo: 'A09.0', diagnostico: undefined });
    expect(partirDiagnostico('Dolor lumbar')).toEqual({ diagnostico: 'Dolor lumbar' });
    expect(partirDiagnostico('  ')).toEqual({});
  });
  test('los errores de la base se traducen por su código', () => {
    expect(codigoError('saldo_insuficiente: tienes 3 días disponibles y pides 5')).toBe('saldo_insuficiente');
    expect(claveError('saldo_insuficiente: tienes 3')).toBe('saldo_insuficiente');
    expect(claveError('algo_raro')).toBe('generico');
    expect(claveError(null)).toBe('generico');
  });
  test('el buscador encuentra por nombre, cargo, área o tipo sin tildes', () => {
    const filas = [fila({ id: '1' }), fila({ id: '2', nombre: 'Paola Gómez', cargo: 'Cajera', area: 'Salón' })];
    expect(filtrarAusencias(filas, { ...FILTROS_VACIOS, texto: 'salon' }, '2026-12-22', () => 'Vacaciones').map((x) => x.id)).toEqual(['2']);
    expect(filtrarAusencias(filas, { ...FILTROS_VACIOS, estados: ['en_curso'] }, '2026-12-22', () => '').length).toBe(2);
  });
});

describe('textos en los 4 idiomas de lo que se arma en tiempo de ejecución', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const idiomas = ['es', 'en', 'fr', 'pt'].map((l) => [l, require(`../../../../../messages/${l}.json`).hrmAusencias] as const);
  test.each(idiomas)('%s: un texto por código de error, estado y pagador', (_l, m) => {
    for (const c of [...ERRORES_AUSENCIA, 'generico']) expect(typeof m.errores[c]).toBe('string');
    for (const e of ['por_aprobar', 'por_aprobar_rrhh', 'aprobada', 'en_curso', 'terminada', 'disfrutada', 'rechazada', 'cancelada']) expect(typeof m.estados[e]).toBe('string');
    for (const p of [...PAGADORES, 'ninguno']) expect(typeof m.pagadores.nombres[p]).toBe('string');
    for (const c of ['incapacidad_comun', 'incapacidad_laboral', 'maternidad', 'paternidad', 'luto']) expect(typeof m.clases[c]).toBe('string');
  });
});
