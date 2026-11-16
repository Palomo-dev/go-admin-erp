/**
 * Motor de clasificación de horas de RR. HH. (ADR-002 §3).
 *
 * Vive en src/__tests__/timezone/ para que `npm run test:tz-all` lo corra con
 * TZ=UTC, America/Bogota, America/Mexico_City, Europe/Madrid, America/Santiago y
 * Asia/Kathmandu: el resultado no puede depender del TZ del proceso, solo de la
 * zona de la sede que recibe el motor.
 *
 * Los parámetros de abajo son los que hay cargados en `hr_legal_parameters`
 * (COL) el 2026-11-15, con sus vigencias. Solo viven en esta prueba: el motor no
 * tiene ningún valor legal escrito.
 */
import {
  ParametroFaltanteError,
  clasificarDia,
  clasificarDias,
  huellaDe,
  lunesDeLaSemana,
  type EntradaDia,
  type ParametrosJornada,
  type ResultadoDia,
} from '@/lib/hrm/jornada/motorHoras';
import { addPlainDays } from '@/lib/utils/dateCore';
import {
  entradaDesdeInsumos,
  intervalosDesdeMarcaciones,
  intervalosDesdeTurno,
  resultadoParaGuardar,
  type InsumosJornada,
} from '@/lib/hrm/jornada/insumos';

const ZONA = 'America/Bogota';

const PARAMETROS: ParametrosJornada = {
  nocturno_hora_inicio: [{ desde: '2025-12-25', hasta: null, valor: 19 }],
  nocturno_hora_fin: [{ desde: '2025-12-25', hasta: null, valor: 6 }],
  recargo_nocturno: [{ desde: '2026-01-01', hasta: null, valor: 0.35 }],
  recargo_dominical_festivo: [
    { desde: '2025-07-01', hasta: '2026-06-30', valor: 0.8 },
    { desde: '2026-07-01', hasta: '2027-06-30', valor: 0.9 },
    { desde: '2027-07-01', hasta: null, valor: 1 },
  ],
  recargo_extra_diurna: [{ desde: '2026-01-01', hasta: null, valor: 0.25 }],
  recargo_extra_nocturna: [{ desde: '2026-01-01', hasta: null, valor: 0.75 }],
  jornada_max_semanal: [
    { desde: '2025-07-15', hasta: '2026-07-14', valor: 44 },
    { desde: '2026-07-15', hasta: null, valor: 42 },
  ],
  jornada_max_diaria: [{ desde: '2023-07-15', hasta: null, valor: 8 }],
  jornada_flexible_max_diaria: [{ desde: '2023-07-15', hasta: null, valor: 9 }],
  divisor_hora_mensual: [
    { desde: '2025-07-15', hasta: '2026-07-14', valor: 220 },
    { desde: '2026-07-15', hasta: null, valor: 210 },
  ],
  horas_extra_max_dia: [{ desde: '2025-06-25', hasta: null, valor: 2 }],
  horas_extra_max_semana: [{ desde: '2025-06-25', hasta: null, valor: 12 }],
};

/** Festivos de ley de hr_holidays (COL) que tocan estas pruebas. */
const FESTIVOS = ['2026-06-29', '2026-07-20', '2026-12-25', '2027-01-01', '2027-07-05', '2027-07-20'];

/** Hora de pared de Bogotá (UTC-5, sin horario de verano) como instante ISO. */
const bog = (fecha: string, hora: string) => `${fecha}T${hora}:00-05:00`;

function dia(fechaTrabajo: string, inicio: string, fin: string, extra: Partial<EntradaDia> = {}): EntradaDia {
  return {
    fechaTrabajo,
    zona: ZONA,
    intervalos: [{ inicio, fin }],
    festivos: FESTIVOS,
    parametros: PARAMETROS,
    ...extra,
  };
}

function lineas(r: ResultadoDia) {
  return r.lineas
    .map((l) => `${l.fecha_local} ${l.categoria} ${l.minutos} @${l.recargo} /${l.divisor}${l.motivo_dominical ? ` (${l.motivo_dominical})` : ''}`)
    .sort();
}

describe('motor de horas: turnos que cruzan la medianoche y festivos', () => {
  test('domingo 28-jun-2026 22:00 → lunes 29-jun-2026 06:00 (San Pedro, festivo): todo dominical nocturno al 80 % + 35 %', () => {
    const r = clasificarDia(dia('2026-06-28', bog('2026-06-28', '22:00'), bog('2026-06-29', '06:00')));
    expect(lineas(r)).toEqual([
      '2026-06-28 dom_nocturna 120 @1.15 /220 (dia_descanso)',
      '2026-06-29 dom_nocturna 360 @1.15 /220 (festivo)',
    ]);
    expect(r.totalMinutos).toBe(480);
    expect(r.extras).toBe(0);
    expect(r.minutos.dom_nocturna).toBe(480);
  });

  test('domingo 4-jul-2027 22:00 → lunes 5-jul-2027 06:00 (San Pedro trasladado): dominical al 100 % + 35 %', () => {
    const r = clasificarDia(dia('2027-07-04', bog('2027-07-04', '22:00'), bog('2027-07-05', '06:00')));
    expect(lineas(r)).toEqual([
      '2027-07-04 dom_nocturna 120 @1.35 /210 (dia_descanso)',
      '2027-07-05 dom_nocturna 360 @1.35 /210 (festivo)',
    ]);
  });

  test('un festivo entre semana sin ser domingo también es dominical (lunes 20-jul-2026, 06:00 → 14:00)', () => {
    const r = clasificarDia(dia('2026-07-20', bog('2026-07-20', '06:00'), bog('2026-07-20', '14:00')));
    expect(lineas(r)).toEqual(['2026-07-20 dom_diurna 480 @0.9 /210 (festivo)']);
  });

  test('un día propio de la empresa no genera recargo: no llega como festivo (jueves 31-dic-2026)', () => {
    const r = clasificarDia(dia('2026-12-31', bog('2026-12-31', '06:00'), bog('2026-12-31', '14:00')));
    expect(lineas(r)).toEqual(['2026-12-31 ord_diurna 480 @0 /210']);
  });
});

describe('motor de horas: cada hora usa la vigencia de su día', () => {
  test('cruce del 1-jul-2026 con día de descanso pactado el miércoles: el tramo del 1-jul va al 90 %', () => {
    const r = clasificarDia(dia('2026-06-30', bog('2026-06-30', '22:00'), bog('2026-07-01', '06:00'), { diaDescanso: 3 }));
    expect(lineas(r)).toEqual([
      '2026-06-30 ord_nocturna 120 @0.35 /220',
      '2026-07-01 dom_nocturna 360 @1.25 /220 (dia_descanso)',
    ]);
  });

  test('la misma noche una semana antes (miércoles 24-jun-2026) va al 80 %', () => {
    const r = clasificarDia(dia('2026-06-23', bog('2026-06-23', '22:00'), bog('2026-06-24', '06:00'), { diaDescanso: 3 }));
    expect(lineas(r)).toContain('2026-06-24 dom_nocturna 360 @1.15 /220 (dia_descanso)');
  });

  test('cruce del 1-jul-2026 con descanso el martes: el tramo del 30-jun va al 80 % y el del 1-jul ya no es dominical', () => {
    const r = clasificarDia(dia('2026-06-30', bog('2026-06-30', '22:00'), bog('2026-07-01', '06:00'), { diaDescanso: 2 }));
    expect(lineas(r)).toEqual([
      '2026-06-30 dom_nocturna 120 @1.15 /220 (dia_descanso)',
      '2026-07-01 ord_nocturna 360 @0.35 /220',
    ]);
  });

  test('cruce del 1-jul-2027 con descanso el jueves: el tramo del 1-jul va al 100 %', () => {
    const r = clasificarDia(dia('2027-06-30', bog('2027-06-30', '22:00'), bog('2027-07-01', '06:00'), { diaDescanso: 4 }));
    expect(lineas(r)).toEqual([
      '2027-06-30 ord_nocturna 120 @0.35 /210',
      '2027-07-01 dom_nocturna 360 @1.35 /210 (dia_descanso)',
    ]);
  });

  test('cruce del 1-jul-2027 con descanso el miércoles: el 30-jun sigue al 90 %', () => {
    const r = clasificarDia(dia('2027-06-30', bog('2027-06-30', '22:00'), bog('2027-07-01', '06:00'), { diaDescanso: 3 }));
    expect(lineas(r)).toEqual([
      '2027-06-30 dom_nocturna 120 @1.25 /210 (dia_descanso)',
      '2027-07-01 ord_nocturna 360 @0.35 /210',
    ]);
  });

  test('el divisor de la hora cambia el 15-jul-2026: noche del 14 al 15', () => {
    const r = clasificarDia(dia('2026-07-14', bog('2026-07-14', '22:00'), bog('2026-07-15', '06:00')));
    expect(lineas(r)).toEqual(['2026-07-14 ord_nocturna 120 @0.35 /220', '2026-07-15 ord_nocturna 360 @0.35 /210']);
  });
});

describe('motor de horas: jornada semanal de 44 h a 42 h el 15-jul-2026', () => {
  const semana = (lunes: string) =>
    [0, 1, 2, 3, 4, 5].map((i) => {
      const f = addPlainDays(lunes, i);
      return dia(f, bog(f, '06:00'), bog(f, '14:00'), { topeDiarioMinutos: 480 });
    });

  test('semana del 13 al 18-jul-2026 (48 h): el sábado se mide contra 42 h → 2 h ordinarias y 6 h extra', () => {
    const r = clasificarDias(semana('2026-07-13'));
    expect(r.map((x) => [x.fechaTrabajo, x.ordinarias, x.extras])).toEqual([
      ['2026-07-13', 480, 0],
      ['2026-07-14', 480, 0],
      ['2026-07-15', 480, 0],
      ['2026-07-16', 480, 0],
      ['2026-07-17', 480, 0],
      ['2026-07-18', 120, 360],
    ]);
    expect(lineas(r[1])).toEqual(['2026-07-14 ord_diurna 480 @0 /220']);
    expect(lineas(r[2])).toEqual(['2026-07-15 ord_diurna 480 @0 /210']);
    expect(lineas(r[5])).toEqual(['2026-07-18 extra_diurna 360 @0.25 /210', '2026-07-18 ord_diurna 120 @0 /210']);
    // 6 h de extra en un día supera el tope de 2 h: alerta, no bloqueo.
    expect(r[5].alertas).toEqual([{ codigo: 'extra_supera_tope_diario', minutos: 360, tope_minutos: 120 }]);
    expect(r[5].semana).toEqual({ ordinarias: 2520, extras: 360 });
  });

  test('la semana anterior (6 al 11-jul-2026) todavía es de 44 h → el sábado da 4 h ordinarias y 4 extra', () => {
    const r = clasificarDias(semana('2026-07-06'));
    expect(r[5].ordinarias).toBe(240);
    expect(r[5].extras).toBe(240);
    expect(r[5].lineas.every((l) => l.divisor === 220)).toBe(true);
  });

  test('el contrato de 48 h (valor viejo por defecto) no sube el tope legal', () => {
    const r = clasificarDias(semana('2026-07-13').map((d) => ({ ...d, contratoHorasSemana: 48 })));
    expect(r[5].extras).toBe(360);
  });

  test('un contrato de medio tiempo (24 h) baja el tope semanal', () => {
    const r = clasificarDias(semana('2026-08-03').slice(0, 4).map((d) => ({ ...d, contratoHorasSemana: 24 })));
    expect(r.map((x) => x.extras)).toEqual([0, 0, 0, 480]);
  });

  test('al cambiar de semana el acumulado vuelve a cero', () => {
    const dias = [...semana('2026-07-13'), ...semana('2026-07-20').slice(1, 2)];
    const r = clasificarDias(dias);
    expect(r[6].fechaTrabajo).toBe('2026-07-21');
    expect(r[6].extras).toBe(0);
    expect(lunesDeLaSemana('2026-07-19')).toBe('2026-07-13');
    expect(lunesDeLaSemana('2026-07-20')).toBe('2026-07-20');
  });
});

describe('motor de horas: horas extra y sus topes', () => {
  test('11 h de día (martes 4-ago-2026, 06:00 → 17:00): 8 ordinarias y 3 extra diurnas, alerta del tope diario', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '06:00'), bog('2026-08-04', '17:00')));
    expect(lineas(r)).toEqual(['2026-08-04 extra_diurna 180 @0.25 /210', '2026-08-04 ord_diurna 480 @0 /210']);
    expect(r.alertas.map((a) => a.codigo)).toEqual(['extra_supera_tope_diario']);
  });

  test('de 12:00 a 22:00: la extra cae de noche y va al 75 %, sin sumar el 35 %', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '12:00'), bog('2026-08-04', '22:00')));
    expect(lineas(r)).toEqual([
      '2026-08-04 extra_nocturna 120 @0.75 /210',
      '2026-08-04 ord_diurna 420 @0 /210',
      '2026-08-04 ord_nocturna 60 @0.35 /210',
    ]);
    expect(r.alertas).toEqual([]);
  });

  test('con 11 h extra en la semana, 2 h más superan el tope de 12 h semanales', () => {
    const r = clasificarDia(
      dia('2026-08-04', bog('2026-08-04', '12:00'), bog('2026-08-04', '22:00'), {
        semana: { ordinariasPrevias: 480, extrasPrevias: 660 },
      })
    );
    expect(r.alertas).toEqual([{ codigo: 'extra_supera_tope_semanal', minutos: 780, tope_minutos: 720 }]);
  });

  test('domingo 9-ago-2026 de 12:00 a 23:00: extra dominical nocturna = 90 % + 75 %', () => {
    const r = clasificarDia(dia('2026-08-09', bog('2026-08-09', '12:00'), bog('2026-08-09', '23:00')));
    expect(lineas(r)).toEqual([
      '2026-08-09 dom_diurna 420 @0.9 /210 (dia_descanso)',
      '2026-08-09 dom_nocturna 60 @1.25 /210 (dia_descanso)',
      '2026-08-09 extra_dom_nocturna 180 @1.65 /210 (dia_descanso)',
    ]);
  });

  test('la extra diurna dominical suma 90 % + 25 % (domingo 9-ago-2026, 06:00 → 17:00)', () => {
    const r = clasificarDia(dia('2026-08-09', bog('2026-08-09', '06:00'), bog('2026-08-09', '17:00')));
    expect(lineas(r)).toContain('2026-08-09 extra_dom_diurna 180 @1.15 /210 (dia_descanso)');
  });

  test('el turno pactado de 6 h hace extra lo que pasa de 6 h aunque no llegue a 8', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '08:00'), bog('2026-08-04', '15:00'), { topeDiarioMinutos: 360 }));
    expect([r.ordinarias, r.extras]).toEqual([360, 60]);
  });

  test('un turno de 10 h publicado no vuelve ordinarias las horas por encima de 8', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '06:00'), bog('2026-08-04', '16:00'), { topeDiarioMinutos: 600 }));
    expect([r.ordinarias, r.extras]).toEqual([480, 120]);
  });

  test('con jornada flexible pactada el día llega a 9 h sin extra', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '06:00'), bog('2026-08-04', '15:00'), { jornadaFlexible: true }));
    expect([r.ordinarias, r.extras]).toEqual([540, 0]);
  });

  test('dirección, confianza y manejo (exento) no genera extra ni alertas, pero sí recargo nocturno', () => {
    const r = clasificarDia(dia('2026-08-04', bog('2026-08-04', '08:00'), bog('2026-08-04', '21:00'), { exentoHorasExtra: true }));
    expect(r.extras).toBe(0);
    expect(r.alertas).toEqual([]);
    expect(r.minutos.ord_nocturna).toBe(120);
  });
});

describe('motor de horas: marcaciones, descansos y turnos', () => {
  test('el descanso no pagado se resta: 07:00 → 16:00 con pausa de 12:00 a 13:00 = 8 h', () => {
    const { intervalos, incompleta } = intervalosDesdeMarcaciones([
      { tipo: 'check_in', hora: bog('2026-08-04', '07:00') },
      { tipo: 'break_start', hora: bog('2026-08-04', '12:00') },
      { tipo: 'break_end', hora: bog('2026-08-04', '13:00') },
      { tipo: 'check_out', hora: bog('2026-08-04', '16:00') },
    ]);
    expect(incompleta).toBe(false);
    const r = clasificarDia({ ...dia('2026-08-04', '', ''), intervalos });
    expect([r.ordinarias, r.extras]).toEqual([480, 0]);
  });

  test('con descanso pagado la pausa no corta', () => {
    const { intervalos } = intervalosDesdeMarcaciones(
      [
        { tipo: 'check_in', hora: bog('2026-08-04', '07:00') },
        { tipo: 'break_start', hora: bog('2026-08-04', '12:00') },
        { tipo: 'break_end', hora: bog('2026-08-04', '12:30') },
        { tipo: 'check_out', hora: bog('2026-08-04', '15:00') },
      ],
      true
    );
    expect(intervalos).toEqual([{ inicio: bog('2026-08-04', '07:00'), fin: bog('2026-08-04', '15:00') }]);
  });

  test('una entrada sin salida no se clasifica y deja la alerta', () => {
    const { intervalos, incompleta } = intervalosDesdeMarcaciones([{ tipo: 'check_in', hora: bog('2026-08-04', '07:00') }]);
    expect(intervalos).toEqual([]);
    const r = clasificarDia({ ...dia('2026-08-04', '', ''), intervalos, marcacionIncompleta: incompleta });
    expect(r.totalMinutos).toBe(0);
    expect(r.alertas).toEqual([{ codigo: 'marcacion_incompleta' }]);
  });

  test('turno publicado de 22:00 a 06:00 con 60 min sin pagar: el descanso va a la mitad y quedan 7 h', () => {
    const intervalos = intervalosDesdeTurno({
      inicio: bog('2026-08-04', '22:00'),
      fin: bog('2026-08-05', '06:00'),
      descanso_minutos: 60,
      descanso_pagado: false,
    });
    expect(intervalos).toHaveLength(2);
    const r = clasificarDia({ ...dia('2026-08-04', '', ''), intervalos });
    expect(r.totalMinutos).toBe(420);
    expect(r.minutos.ord_nocturna).toBe(420);
  });

  test('intervalos que se solapan se unen y los segundos se truncan', () => {
    const r = clasificarDia({
      ...dia('2026-08-04', '', ''),
      intervalos: [
        { inicio: '2026-08-04T11:00:42Z', fin: '2026-08-04T15:00:59Z' },
        { inicio: '2026-08-04T14:00:00Z', fin: '2026-08-04T16:00:30Z' },
      ],
    });
    expect(r.totalMinutos).toBe(300);
  });
});

describe('motor de horas: zona de la sede, no del proceso', () => {
  test('los mismos instantes son nocturnos en Bogotá (19:00) y diurnos en Ciudad de México (18:00)', () => {
    const base = { intervalos: [{ inicio: '2026-08-05T00:00:00Z', fin: '2026-08-05T01:00:00Z' }] };
    const bogota = clasificarDia({ ...dia('2026-08-04', '', ''), ...base });
    const mexico = clasificarDia({ ...dia('2026-08-04', '', ''), ...base, zona: 'America/Mexico_City' });
    expect(lineas(bogota)).toEqual(['2026-08-04 ord_nocturna 60 @0.35 /210']);
    expect(lineas(mexico)).toEqual(['2026-08-04 ord_diurna 60 @0 /210']);
  });

  test('Katmandú (UTC+5:45): la medianoche local parte el turno en el minuto exacto', () => {
    const r = clasificarDia({
      ...dia('2026-08-04', '', ''),
      zona: 'Asia/Kathmandu',
      intervalos: [{ inicio: '2026-08-04T17:15:00Z', fin: '2026-08-04T19:15:00Z' }],
    });
    expect(lineas(r)).toEqual(['2026-08-04 ord_nocturna 60 @0.35 /210', '2026-08-05 ord_nocturna 60 @0.35 /210']);
  });

  test('Santiago con cambio de hora (5-abr-2026): una noche de 23:00 a 07:00 dura 9 h reales', () => {
    const r = clasificarDia({
      ...dia('2026-04-04', '', ''),
      zona: 'America/Santiago',
      intervalos: [{ inicio: '2026-04-05T02:00:00Z', fin: '2026-04-05T11:00:00Z' }],
    });
    expect(r.totalMinutos).toBe(540);
    expect(r.minutos.ord_nocturna + r.minutos.dom_nocturna + r.minutos.extra_nocturna + r.minutos.extra_dom_nocturna).toBe(480);
  });
});

describe('motor de horas: parámetros e idempotencia', () => {
  test('sin el nocturno vigente (antes del 25-dic-2025) el día no se clasifica', () => {
    expect(() => clasificarDia(dia('2025-12-20', bog('2025-12-20', '06:00'), bog('2025-12-20', '14:00')))).toThrow(
      ParametroFaltanteError
    );
  });

  test('un parámetro por confirmar no se usa para calcular', () => {
    const parametros: ParametrosJornada = {
      ...PARAMETROS,
      divisor_hora_mensual: [{ desde: '2026-07-15', hasta: null, valor: 210, estado: 'por_confirmar' }],
    };
    expect(() => clasificarDia({ ...dia('2026-08-04', bog('2026-08-04', '06:00'), bog('2026-08-04', '14:00')), parametros })).toThrow(
      /parametro_no_configurado: divisor_hora_mensual en 2026-08-04/
    );
  });

  test('misma entrada, mismo resultado y misma huella; otra entrada, otra huella', () => {
    const e = dia('2026-06-28', bog('2026-06-28', '22:00'), bog('2026-06-29', '06:00'));
    const a = clasificarDia(e);
    const b = clasificarDia(JSON.parse(JSON.stringify(e)));
    expect(b).toEqual(a);
    expect(huellaDe(e)).toBe(a.huella);
    const otra = clasificarDia({ ...e, diaDescanso: 6 });
    expect(otra.huella).not.toBe(a.huella);
  });

  test('las líneas suman exactamente los minutos trabajados', () => {
    const r = clasificarDia(dia('2026-06-30', bog('2026-06-30', '13:00'), bog('2026-07-01', '03:30'), { diaDescanso: 3 }));
    expect(r.lineas.reduce((s, l) => s + l.minutos, 0)).toBe(14 * 60 + 30);
    expect(r.totalMinutos).toBe(870);
  });
});

describe('insumos de la base → motor → lo que se guarda', () => {
  const insumos: InsumosJornada = {
    employment_id: '11111111-1111-4111-8111-111111111111',
    fecha: '2026-06-28',
    zona: ZONA,
    version: 3,
    estado: 'open',
    fuente: 'marcaciones',
    eventos: [
      { tipo: 'check_in', hora: '2026-06-29T03:00:00+00:00' },
      { tipo: 'check_out', hora: '2026-06-29T11:00:00+00:00' },
    ],
    turno: { inicio: '2026-06-29T03:00:00+00:00', fin: '2026-06-29T11:00:00+00:00', minutos: 480, descanso_minutos: 0, descanso_pagado: false },
    ajustes: { dia_descanso: 0, exento_horas_extra: false, jornada_flexible: false, mecanismos: ['app', 'qr'] },
    contrato_horas_semana: 48,
    festivos: ['2026-06-29'],
    // fn_hr_parametro_tramos recorta las vigencias al rango pedido (día − 1 a día + 2).
    parametros: Object.fromEntries(
      Object.entries(PARAMETROS).map(([k, tramos]) => [
        k,
        (tramos ?? []).map((t) => ({ ...t, desde: t.desde < '2026-06-27' ? '2026-06-27' : t.desde, estado: 'vigente' })),
      ])
    ),
    semana: { desde: '2026-06-22', ordinarias_previas: 0, extras_previas: 0 },
    tolerancia_tardanza: 0,
  };

  test('clasifica el día nocturno del domingo al lunes festivo igual que con la entrada directa', () => {
    const entrada = entradaDesdeInsumos(insumos);
    expect(entrada).not.toBeNull();
    const r = clasificarDia(entrada!);
    expect(lineas(r)).toEqual([
      '2026-06-28 dom_nocturna 120 @1.15 /220 (dia_descanso)',
      '2026-06-29 dom_nocturna 360 @1.15 /220 (festivo)',
    ]);
    const guardable = resultadoParaGuardar(r, 'marcaciones');
    expect(guardable.fuente).toBe('marcaciones');
    expect(guardable.lineas[0]).toEqual(
      expect.objectContaining({ categoria: 'dom_nocturna', fecha_local: '2026-06-28', minutos: 120, recargo: 1.15, divisor: 220 })
    );
  });

  test('sin fuente (ni marcaciones ni turno para quien no marca) no hay nada que clasificar', () => {
    expect(entradaDesdeInsumos({ ...insumos, fuente: null })).toBeNull();
  });
});
