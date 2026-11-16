/**
 * Reglas puras de Asistencia, Horas extra y recargos y Novedades (Figma 20.10–20.12).
 * Los días son `date`: el resultado no depende del `TZ` del proceso.
 */
import {
  agruparTramos,
  claveEstadoHoy,
  conteoNovedades,
  desglosePeriodo,
  domingosDelMes,
  enPestana,
  estadoVisible,
  finDeMes,
  hojaAprobable,
  lunesDe,
  minutosColumna,
  ordenarHoy,
  origenNovedad,
  partesRecargo,
  periodoQuincena,
  puedeMarcarPeriodo,
  quincenaSiguiente,
  resumenHoy,
  textoDiferencia,
  textoDuracion,
  textoPct,
  tonoNovedad,
  topePrincipal,
  type FilaHoy,
  type LineaHoras,
  type TramoHoras,
} from '../asistenciaLogica';

const fila = (estado: FilaHoy['estado'], extra: Partial<FilaHoy> = {}): FilaHoy => ({
  employment_id: `e-${estado}-${extra.nombre ?? ''}`,
  person_id: null,
  nombre: extra.nombre ?? estado,
  cargo: null,
  area: null,
  sede: null,
  branch_id: null,
  turno: {
    nombre: 'Apertura',
    inicio: '2026-11-16T11:00:00Z',
    fin: '2026-11-16T18:00:00Z',
  },
  entrada: null,
  salida: null,
  como: null,
  tarde_minutos: null,
  remoto: false,
  ausencia: null,
  ...extra,
  estado,
});

describe('período', () => {
  test('la quincena del día: 1–15 o 16–fin de mes, con años bisiestos', () => {
    expect(periodoQuincena('2026-11-16')).toEqual({
      desde: '2026-11-16',
      hasta: '2026-11-30',
    });
    expect(periodoQuincena('2026-11-15')).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-15',
    });
    expect(periodoQuincena('2028-02-20')).toEqual({
      desde: '2028-02-16',
      hasta: '2028-02-29',
    });
    expect(finDeMes('2026-12-03')).toBe('2026-12-31');
  });
  test('la quincena siguiente cruza el mes y el año', () => {
    expect(quincenaSiguiente('2026-11-15')).toEqual({
      desde: '2026-11-16',
      hasta: '2026-11-30',
    });
    expect(quincenaSiguiente('2026-12-31')).toEqual({
      desde: '2027-01-01',
      hasta: '2027-01-15',
    });
  });
  test('lunes de la semana y domingos del mes', () => {
    expect(lunesDe('2026-11-15')).toBe('2026-11-09');
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
    expect(domingosDelMes('2026-11')).toBe(5);
    expect(domingosDelMes('2026-02')).toBe(4);
  });
});

describe('textos de horas', () => {
  test('duración, diferencia y porcentaje', () => {
    expect(textoDuracion(4760)).toBe('79 h 20 min');
    expect(textoDuracion(4565)).toBe('76 h 05 min');
    expect(textoDuracion(360)).toBe('6 h');
    expect(textoDuracion(18)).toBe('18 min');
    expect(textoDuracion(0)).toBe('0 h');
    expect(textoDiferencia(8)).toBe('+ 8 min');
    expect(textoDiferencia(-21)).toBe('− 21 min');
    expect(textoDiferencia(0)).toBe('—');
    expect(textoPct(0.9)).toBe('90 %');
    expect(textoPct(1.25)).toBe('125 %');
  });
});

describe('hoy', () => {
  test('cifras: presentes de quienes tienen turno, faltan, tarde y en descanso', () => {
    const filas = [
      fila('presente'),
      fila('tarde', { tarde_minutos: 18, entrada: 'x' }),
      fila('falta'),
      fila('descanso'),
      fila('ausencia', { turno: null, ausencia: { clase: 'vacaciones' } }),
    ];
    expect(resumenHoy(filas)).toEqual({
      conTurno: 4,
      presentes: 3,
      faltan: 1,
      tarde: 1,
      descanso: 1,
    });
  });
  test('quien falta va primero', () => {
    const orden = ordenarHoy([fila('presente', { nombre: 'Ana' }), fila('falta', { nombre: 'Zoe' }), fila('tarde', { nombre: 'Luis' })]);
    expect(orden.map((f) => f.estado)).toEqual(['falta', 'tarde', 'presente']);
  });
  test('salud: el jefe ve «ausencia justificada» y RR. HH. sin permiso «incapacidad»; nunca el tipo', () => {
    expect(
      claveEstadoHoy({
        estado: 'ausencia',
        remoto: false,
        ausencia: { clase: 'justificada' },
      })
    ).toBe('justificada');
    expect(
      claveEstadoHoy({
        estado: 'ausencia',
        remoto: false,
        ausencia: { clase: 'incapacidad' },
      })
    ).toBe('incapacidad');
    expect(
      claveEstadoHoy({
        estado: 'ausencia',
        remoto: false,
        ausencia: { clase: 'incapacidad_comun', nombre: 'EG' },
      })
    ).toBe('incapacidad');
    expect(
      claveEstadoHoy({
        estado: 'ausencia',
        remoto: false,
        ausencia: { clase: 'vacaciones' },
      })
    ).toBe('vacaciones');
    expect(claveEstadoHoy({ estado: 'presente', remoto: true, ausencia: null })).toBe('presenteRemoto');
  });
});

describe('hojas', () => {
  test('una hoja con ajustes por aprobar no se aprueba', () => {
    expect(hojaAprobable({ estado: 'por_aprobar', pendientes: 0 })).toBe(true);
    expect(hojaAprobable({ estado: 'por_aprobar', pendientes: 2 })).toBe(false);
    expect(hojaAprobable({ estado: 'aprobada', pendientes: 0 })).toBe(false);
  });
});

const linea = (categoria: LineaHoras['categoria'], minutos: number, recargo: number, fecha_local = '2026-11-15'): LineaHoras => ({
  categoria,
  minutos,
  recargo,
  divisor: 210,
  fecha_local,
  motivo: null,
});

describe('desglose de horas (20.11.1)', () => {
  test('ordinarias, dominicales y extra; recargos por valor vigente, sin la ordinaria diurna', () => {
    const d = desglosePeriodo([
      {
        lineas: [linea('ord_diurna', 360, 0), linea('ord_nocturna', 60, 0.35)],
      },
      {
        lineas: [linea('dom_diurna', 398, 0.9), linea('extra_nocturna', 140, 0.75)],
      },
      {
        lineas: [linea('dom_nocturna', 240, 1.25, '2026-11-15'), linea('dom_nocturna', 240, 1.35, '2026-11-16')],
      },
    ]);
    expect(d.ordinarias).toBe(420);
    expect(d.dominicales).toBe(878);
    expect(d.extra).toBe(140);
    expect(d.total).toBe(1438);
    expect(d.nocturnas).toBe(60 + 480);
    expect(d.recargos.map((r) => [r.categoria, r.recargo, r.minutos])).toEqual([
      ['ord_nocturna', 0.35, 60],
      ['dom_diurna', 0.9, 398],
      ['dom_nocturna', 1.25, 240],
      ['dom_nocturna', 1.35, 240],
      ['extra_nocturna', 0.75, 140],
    ]);
  });
  test('la extra dominical va en la columna de extra', () => {
    const l = [linea('extra_dom_nocturna', 30, 1.65), linea('extra_nocturna', 60, 0.75)];
    expect(minutosColumna(l, 'extra_nocturna')).toBe(90);
    expect(minutosColumna(l, 'dom_nocturna')).toBe(0);
  });
  test('el recargo se lee como la práctica: dominical + nocturno; si no cuadra, el guardado', () => {
    const v = {
      dominical: 0.9,
      nocturno: 0.35,
      extraDiurna: 0.25,
      extraNocturna: 0.75,
    };
    expect(partesRecargo('dom_nocturna', 1.25, v)).toEqual([0.9, 0.35]);
    expect(partesRecargo('extra_nocturna', 0.75, v)).toEqual([0.75]);
    expect(partesRecargo('extra_dom_diurna', 1.15, v)).toEqual([0.9, 0.25]);
    expect(partesRecargo('dom_nocturna', 1.35, v)).toEqual([1.35]);
    expect(partesRecargo('dom_diurna', 0.9, {})).toEqual([0.9]);
    expect(partesRecargo('ord_diurna', 0, v)).toEqual([]);
  });
  test('un turno que cruza la medianoche y un cambio de vigencia queda en dos tramos', () => {
    const t = (inicio: string, fin: string, fecha_local: string, recargo: number): TramoHoras => ({
      inicio,
      fin,
      fecha_local,
      minutos: (Date.parse(fin) - Date.parse(inicio)) / 60000,
      categoria: 'dom_nocturna',
      recargo,
      divisor: 210,
    });
    const tramos = agruparTramos([
      t('2026-11-16T03:00:00Z', '2026-11-16T05:00:00Z', '2026-11-15', 1.25),
      t('2026-11-16T01:00:00Z', '2026-11-16T03:00:00Z', '2026-11-15', 1.25),
      t('2026-11-16T05:00:00Z', '2026-11-16T09:00:00Z', '2026-11-16', 1.35),
    ]);
    expect(tramos).toHaveLength(2);
    expect(tramos[0]).toMatchObject({
      inicio: '2026-11-16T01:00:00Z',
      fin: '2026-11-16T05:00:00Z',
      minutos: 240,
      recargo: 1.25,
    });
    expect(tramos[1]).toMatchObject({
      fecha_local: '2026-11-16',
      minutos: 240,
      recargo: 1.35,
    });
  });
});

describe('topes (20.11.3)', () => {
  test('el semanal manda sobre el diario y este sobre la jornada', () => {
    expect(
      topePrincipal({
        supera_semanal: true,
        supera_diario: true,
        supera_jornada: true,
      })
    ).toBe('semanal');
    expect(
      topePrincipal({
        supera_semanal: false,
        supera_diario: true,
        supera_jornada: true,
      })
    ).toBe('diario');
    expect(
      topePrincipal({
        supera_semanal: false,
        supera_diario: false,
        supera_jornada: true,
      })
    ).toBe('jornada');
    expect(
      topePrincipal({
        supera_semanal: false,
        supera_diario: false,
        supera_jornada: false,
      })
    ).toBeNull();
  });
});

describe('novedades (20.12)', () => {
  const n = (estado: 'pendiente' | 'esperando_contraparte' | 'aprobada' | 'rechazada') => ({ estado });
  test('pestañas y conteo', () => {
    const filas = [n('pendiente'), n('esperando_contraparte'), n('aprobada'), n('aprobada'), n('rechazada')];
    expect(conteoNovedades(filas)).toEqual({
      porAprobar: 2,
      aprobadas: 2,
      rechazadas: 1,
    });
    expect(filas.filter((f) => enPestana(f, 'por_aprobar'))).toHaveLength(2);
    expect(filas.filter((f) => enPestana(f, 'aprobadas'))).toHaveLength(2);
    expect(filas.filter((f) => enPestana(f, 'todas'))).toHaveLength(5);
  });
  test('origen: marcación, turnos o ajuste manual', () => {
    expect(origenNovedad({ tipo: 'horas_extra', origen: 'automatica' })).toBe('marcacion');
    expect(origenNovedad({ tipo: 'tardanza', origen: 'automatica' })).toBe('marcacion');
    expect(origenNovedad({ tipo: 'ausencia', origen: 'automatica' })).toBe('turnos');
    expect(origenNovedad({ tipo: 'cambio_turno', origen: 'empleado' })).toBe('turnos');
    expect(origenNovedad({ tipo: 'ajuste_marca', origen: 'ajuste' })).toBe('ajuste');
    expect(origenNovedad({ tipo: 'ausencia', origen: 'gestor' })).toBe('gestor');
  });
  test('«Lista para nómina» manda sobre «Aprobada» y es de marca', () => {
    expect(estadoVisible({ estado: 'aprobada', lista_nomina: true })).toBe('lista_nomina');
    expect(estadoVisible({ estado: 'pendiente', lista_nomina: false })).toBe('pendiente');
    expect(tonoNovedad('lista_nomina')).toBe('marca');
    expect(tonoNovedad('pendiente')).toBe('advertencia');
  });
  test('el período se marca solo con 0 por aprobar, con permiso y si no está ya listo', () => {
    const r = (puede: boolean, lista: boolean) => ({
      puede_gestionar: puede,
      periodo: {
        hojas: 3,
        listas: lista ? 3 : 0,
        lista_nomina: lista,
        listo_en: null,
      },
    });
    expect(puedeMarcarPeriodo(r(true, false), 0)).toBe(true);
    expect(puedeMarcarPeriodo(r(true, false), 12)).toBe(false);
    expect(puedeMarcarPeriodo(r(false, false), 0)).toBe(false);
    expect(puedeMarcarPeriodo(r(true, true), 0)).toBe(false);
  });
});
