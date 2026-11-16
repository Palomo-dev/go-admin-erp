/**
 * Programación de turnos (Figma 20.8), marcación (20.9) y Mi equipo (20.15):
 * reglas puras de la pantalla. Las decisiones de verdad (cruces, topes, hora
 * de la marca) las toma la base; aquí se prueba lo que se pinta.
 */
import {
  calcularPlantilla,
  celdasDe,
  csvSemana,
  diaIso,
  diasDeSemana,
  esTope,
  filtrarPersonas,
  FILTROS_INICIALES,
  indexarSemana,
  lunesDe,
  minutosDePersona,
  rangosDias,
  resumenHallazgos,
  tonoHoras,
  type AsignacionSemana,
  type PersonaSemana,
  type Validacion,
} from '../programacion';
import { descansoRestante, distanciaMetros, leerCola, metodosDisponibles, siguienteConCola, vistaMarcacion } from '../../jornada/marcarLogica';
import { conteoEquipo, crucesPorDia, esAusenciaDeSalud, nombreCorto, tramosDeCruce } from '../../equipo/equipo';
import { calcularTurno } from '@/lib/dashboard/turno';

const persona = (id: string, extra: Partial<PersonaSemana> = {}): PersonaSemana => ({
  id,
  nombre: `Persona ${id}`,
  cargo: 'Mesera',
  area: 'Salón',
  area_id: 'a1',
  sede_id: 1,
  jornada_semana: 42,
  jefe_id: null,
  ...extra,
});
const turno = (id: string, emp: string, fecha: string, extra: Partial<AsignacionSemana> = {}): AsignacionSemana => ({
  id,
  employment_id: emp,
  fecha,
  inicio: `${fecha}T11:00:00Z`,
  fin: `${fecha}T18:00:00Z`,
  minutos: 420,
  descanso_min: 0,
  dia_descanso: false,
  borrador: true,
  publicado_en: null,
  plantilla_id: 't1',
  plantilla: 'Apertura',
  hora_inicio: '06:00',
  hora_fin: '13:00',
  ...extra,
});

describe('semana', () => {
  it('el lunes y los 7 días salen del date, sin zona', () => {
    expect(diaIso('2026-11-16')).toBe(1);
    expect(diaIso('2026-11-22')).toBe(7);
    expect(lunesDe('2026-11-22')).toBe('2026-11-16');
    expect(diasDeSemana('2026-11-16')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(lunesDe('2026-12-31')).toBe('2026-12-28');
  });
});

describe('celdas y hallazgos', () => {
  const asignaciones = [turno('x1', 'p1', '2026-11-18'), turno('x2', 'p1', '2026-11-18', { plantilla: 'Cierre', hora_inicio: '13:00' }), turno('x3', 'p2', '2026-11-21')];
  const validacion: Validacion = {
    bloqueos: [{ codigo: 'turno_cruzado', employment_id: 'p1', fechas: ['2026-11-18', '2026-11-18'], asignaciones: ['x1', 'x2'] }],
    alertas: [
      { codigo: 'extra_diaria_supera_tope', employment_id: 'p2', fechas: ['2026-11-21'], minutos_extra: 180 },
      { codigo: 'semana_supera_jornada', employment_id: 'p2', semana: '2026-11-16', minutos_planeados: 2640 },
      { codigo: 'trabaja_dia_descanso', employment_id: 'p2', fechas: ['2026-11-22'] },
    ],
  };
  const datos = {
    asignaciones,
    ausencias: [{ id: 'l1', employment_id: 'p3', desde: '2026-11-16', hasta: '2026-11-20', estado: 'approved' as const, clase: 'incapacidad', etiqueta: null }],
    festivos: [{ fecha: '2026-11-16', nombre: 'Independencia de Cartagena', origen: 'plataforma' as const }],
  };
  const indice = indexarSemana(datos, validacion);

  it('un cruce pinta los dos bloques y cada uno dice con cuál se pisa', () => {
    const c = celdasDe(indice, 'p1', '2026-11-18', asignaciones);
    expect(c.map((x) => x.tipo)).toEqual(['cruce', 'cruce']);
    expect(c[0].cruzaCon).toBe('Cierre');
    expect(c[1].cruzaCon).toBe('Apertura');
  });

  it('un tope pinta el día en ámbar y la persona en ámbar; el cruce en rojo', () => {
    expect(celdasDe(indice, 'p2', '2026-11-21', asignaciones)[0].tipo).toBe('tope');
    expect(tonoHoras('p2', indice, '2026-11-16')).toBe('advertencia');
    expect(tonoHoras('p1', indice, '2026-11-16')).toBe('peligro');
    expect(tonoHoras('p9', indice, '2026-11-16')).toBe('neutro');
  });

  it('la ausencia de salud se pinta sin tipo; el festivo viaja en la celda', () => {
    const c = celdasDe(indice, 'p3', '2026-11-17', asignaciones)[0];
    expect(c.tipo).toBe('ausencia');
    expect(esAusenciaDeSalud(c.ausencia!)).toBe(true);
    expect(celdasDe(indice, 'p9', '2026-11-16', asignaciones)[0].festivo?.nombre).toBeTruthy();
  });

  it('cruces bloquean; topes dejan publicar con motivo (decisión 4); los avisos no son topes', () => {
    expect(resumenHallazgos(validacion)).toEqual({ cruces: 1, topes: 2, otras: 1 });
    expect(esTope({ codigo: 'trabaja_dia_descanso' })).toBe(false);
    expect(esTope({ codigo: 'extra_semanal_supera_tope' })).toBe(true);
  });

  it('horas de la semana sin los días de descanso', () => {
    const lista = [...asignaciones, turno('x4', 'p2', '2026-11-22', { dia_descanso: true, minutos: 0 })];
    expect(minutosDePersona(lista, 'p2', diasDeSemana('2026-11-16'))).toBe(420);
  });

  it('filtros: con cruces, borrador y búsqueda sin tildes', () => {
    const personas = [persona('p1', { nombre: 'Andrés Morales' }), persona('p2'), persona('p3')];
    const dias = diasDeSemana('2026-11-16');
    const base = { personas, ...datos };
    expect(filtrarPersonas(base, dias, indice, { ...FILTROS_INICIALES, mostrar: 'cruces' }).map((p) => p.id)).toEqual(['p1']);
    expect(filtrarPersonas(base, dias, indice, { ...FILTROS_INICIALES, texto: 'andres' }).map((p) => p.id)).toEqual(['p1']);
    // p3 no tiene turno pero sí ausencia aprobada: se ve con «Incluir ausencias».
    expect(filtrarPersonas(base, dias, indice, FILTROS_INICIALES).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(filtrarPersonas(base, dias, indice, { ...FILTROS_INICIALES, incluirAusencias: false }).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('CSV con comillas cuando hace falta', () => {
    const csv = csvSemana([persona('p1', { nombre: 'Ruiz, Carolina' })], ['2026-11-18'], asignaciones, {
      persona: 'Persona',
      horas: 'Horas',
      descanso: 'Descanso',
      dia: (d) => d,
    });
    expect(csv.split('\n')[1]).toBe('"Ruiz, Carolina",06:00-13:00 Apertura / 13:00-13:00 Cierre,14');
  });
});

describe('plantillas', () => {
  const noche = { inicio: 19, fin: 6 };
  it('2 p. m. a 9 p. m. con 30 min no pagados: 6 h 30, 2 h nocturnas (desde las 7 p. m.)', () => {
    expect(calcularPlantilla('14:00', '21:00', 30, false, noche)).toEqual({ duracion: 390, nocturnas: 120, diurnas: 270, cruzaMedianoche: false });
  });
  it('10 p. m. a 5 a. m. cruza la medianoche y es toda nocturna', () => {
    expect(calcularPlantilla('22:00', '05:00', 0, false, noche)).toEqual({ duracion: 420, nocturnas: 420, diurnas: 0, cruzaMedianoche: true });
  });
  it('sin parámetro no inventa nocturnas', () => {
    expect(calcularPlantilla('22:00', '05:00', 0, false, { inicio: null, fin: null }).nocturnas).toBe(0);
  });
  it('días como rangos', () => {
    expect(rangosDias([5, 6])).toEqual([[5, 6]]);
    expect(rangosDias([1, 2, 3, 5])).toEqual([[1, 3], [5, 5]]);
  });
});

describe('marcación (Figma 20.9)', () => {
  const t = { fecha: '2026-11-16', inicio: '2026-11-16T11:00:00Z', fin: '2026-11-16T18:00:00Z', dia_descanso: false, descanso_min: 30, plantilla: 'Apertura' };
  it('antes, tarde, en turno, en descanso y fuera de turno', () => {
    expect(vistaMarcacion({ turno: t, marcas: [] }, new Date('2026-11-16T10:58:00Z')).fase).toBe('antes');
    const tarde = vistaMarcacion({ turno: t, marcas: [], tolerancia_min: 0 }, new Date('2026-11-16T11:18:00Z'));
    expect([tarde.fase, tarde.minutos]).toEqual(['tarde', 18]);
    expect(vistaMarcacion({ turno: t, marcas: [], tolerancia_min: 20 }, new Date('2026-11-16T11:18:00Z')).fase).toBe('antes');
    const en = vistaMarcacion({ turno: t, marcas: [{ tipo: 'check_in', hora: '2026-11-16T11:02:00Z' }] }, new Date('2026-11-16T14:14:00Z'));
    expect([en.fase, en.accion, en.minutos]).toEqual(['enTurno', 'check_out', 192]);
    const pausa = vistaMarcacion(
      { turno: t, marcas: [{ tipo: 'check_in', hora: '2026-11-16T11:02:00Z' }, { tipo: 'break_start', hora: '2026-11-16T14:30:00Z' }] },
      new Date('2026-11-16T14:42:00Z')
    );
    expect([pausa.fase, pausa.accion, pausa.minutos]).toEqual(['enDescanso', 'break_end', 12]);
    expect(descansoRestante(pausa.descansoDesde, 30, new Date('2026-11-16T14:42:00Z'))).toBe(18);
    expect(vistaMarcacion({ turno: t, marcas: [] }, new Date('2026-11-17T02:05:00Z')).fase).toBe('fueraDeTurno');
    expect(vistaMarcacion({ turno: null, marcas: [] }, new Date('2026-11-16T12:00:00Z')).fase).toBe('fueraDeTurno');
  });

  it('decisión 9: celular con ubicación por defecto, QR opcional, remoto solo con modalidad', () => {
    expect(metodosDisponibles({ mecanismos: ['app', 'qr'], modalidad: 'presencial' }, 1)).toEqual(['ubicacion', 'qr']);
    expect(metodosDisponibles({ mecanismos: ['app'], modalidad: 'remoto' }, 1)).toEqual(['remoto']);
    expect(metodosDisponibles({ mecanismos: ['app', 'qr'], modalidad: 'hibrido' }, 3)).toEqual(['ubicacion', 'qr', 'remoto']);
  });

  it('distancia a la sede con la misma fórmula de la base', () => {
    expect(Math.round(distanciaMetros(4.65, -74.05, 4.66, -74.05))).toBe(1112);
  });

  it('sin señal: la cola se lee con cuidado y decide la siguiente marca', () => {
    expect(leerCola('no es json')).toEqual([]);
    const cola = leerCola(JSON.stringify([{ id: '1', tipo: 'check_in', capturada: '2026-11-16T11:02:00Z', metodo: 'app', remoto: false }, { id: 'x' }]));
    expect(cola).toHaveLength(1);
    expect(siguienteConCola('check_in', cola)).toBe('check_out');
  });
});

describe('TurnoCard «en descanso» (decisión 7)', () => {
  const base = { hoy: '2026-11-16', zona: 'America/Bogota', turno: { inicio: '06:00', fin: '13:00' } };
  it('la última marca de inicio de descanso pone la tarjeta en descanso', () => {
    const r = calcularTurno({
      ...base,
      ahora: new Date('2026-11-16T14:42:00Z'),
      marcaciones: [
        { tipo: 'check_in', en: '2026-11-16T11:02:00Z' },
        { tipo: 'break_start', en: '2026-11-16T14:30:00Z' },
      ],
    });
    expect(r.estado).toBe('enDescanso');
    expect(r.minutos).toBe(12);
    expect(r.descansoDesde).toBe('2026-11-16T14:30:00Z');
  });
  it('al terminar el descanso vuelve a «en turno»', () => {
    const r = calcularTurno({
      ...base,
      ahora: new Date('2026-11-16T15:10:00Z'),
      marcaciones: [
        { tipo: 'check_in', en: '2026-11-16T11:02:00Z' },
        { tipo: 'break_start', en: '2026-11-16T14:30:00Z' },
        { tipo: 'break_end', en: '2026-11-16T15:00:00Z' },
      ],
    });
    expect(r.estado).toBe('enTurno');
  });
});

describe('Mi equipo (Figma 20.15)', () => {
  const personas = [
    { id: 'a', nombre: 'Andrés Felipe Morales Rincón', cargo: null, area: 'Cocina', area_id: 'c', directo: true },
    { id: 'b', nombre: 'Luis Alberto Mejía', cargo: null, area: 'Cocina', area_id: 'c', directo: false },
    { id: 'c', nombre: 'Daniela Ospina', cargo: null, area: 'Cocina', area_id: 'c', directo: true },
    { id: 'd', nombre: 'Kevin Rueda', cargo: null, area: 'Cocina', area_id: 'c', directo: false },
  ];
  it('directas e indirectas', () => {
    expect(conteoEquipo(personas)).toEqual({ total: 4, directas: 2, indirectas: 2 });
  });
  it('cruce cuando dos de la misma área faltan a la vez, con su tramo', () => {
    const dias = ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];
    const aus = [
      { id: '1', employment_id: 'a', desde: '2026-12-14', hasta: '2026-12-24', estado: 'approved' as const, clase: 'vacaciones', etiqueta: 'Vacaciones' },
      { id: '2', employment_id: 'b', desde: '2026-12-21', hasta: '2026-12-26', estado: 'requested' as const, clase: 'vacaciones', etiqueta: 'Vacaciones' },
    ];
    const cruces = crucesPorDia(dias, aus, personas);
    expect(cruces.has('2026-12-20')).toBe(false);
    expect(cruces.get('2026-12-21')).toEqual([{ area: 'Cocina', ausentes: 2, total: 4 }]);
    expect(tramosDeCruce(cruces, dias)).toEqual([{ area: 'Cocina', desde: '2026-12-21', hasta: '2026-12-24', quedan: 2, total: 4 }]);
  });
  it('nombre corto de las píldoras', () => {
    expect(nombreCorto('Andrés Felipe Morales Rincón')).toBe('A. Morales');
    expect(nombreCorto('Luis Alberto Mejía')).toBe('L. Mejía');
  });
});
