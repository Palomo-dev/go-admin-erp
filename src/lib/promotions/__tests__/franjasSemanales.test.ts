/**
 * Franjas semanales que cruzan días (`promotions.schedule_windows`,
 * migración 20261120180000) y el esquema de siempre, por el MISMO predicado
 * (`vigenteEnHorario`) que usan el motor, la cartelera y el solapamiento.
 *
 * Caso real de un cliente: «sábado 16:00 a domingo 14:00». Se prueba minuto a
 * minuto contra un oráculo independiente (aritmética de Bogotá = UTC−5 sin
 * cambio de hora), con varias franjas y con el cruce de semana domingo →
 * lunes. Corre igual con TZ=UTC y TZ=America/Bogota: la hora sale de la
 * zona de la organización, nunca del proceso.
 */
import {
  activaEnHorario,
  franjasSemanalesDe,
  tramosSemanalesDe,
  vigenteEnHorario,
  type FranjaSemanal,
} from '@/lib/promotions/vigencia';
import { evaluarPromociones, promocionVigente, type ContextoPromocion, type FilaPromocion } from '@/lib/promotions/motorPromociones';
import { semanasSeCruzan, seSolapan, type PromoSolape } from '@/lib/promotions/solapamiento';

const ZONA = 'America/Bogota';
/** Instante de una hora de pared de Bogotá (UTC−5 fijo). */
const bog = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

const FINDE: FranjaSemanal = { desde_dia: 'saturday', desde_hora: '16:00', hasta_dia: 'sunday', hasta_hora: '14:00' };
const VIERNES_NOCHE: FranjaSemanal = { desde_dia: 'friday', desde_hora: '20:00', hasta_dia: 'saturday', hasta_hora: '02:00' };
const DOMINGO_A_LUNES: FranjaSemanal = { desde_dia: 'sunday', desde_hora: '22:00', hasta_dia: 'monday', hasta_hora: '03:00' };

/** Minuto de la semana (lunes 00:00 = 0) de un instante, leído en Bogotá sin Intl. */
function minutoSemanaBogota(t: Date): number {
  const local = new Date(t.getTime() - 5 * 3600 * 1000);
  const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
  return dow * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Oráculo: [inicio, fin) en minutos de la semana, con vuelta al lunes. */
function oraculo(franjas: Array<[number, number]>, t: Date): boolean {
  const m = minutoSemanaBogota(t);
  return franjas.some(([a, b]) => (a <= m && m < b) || (a <= m + 10080 && m + 10080 < b));
}

const DIA = 1440;
// lunes=0 … domingo=6
const MIN = (dia: number, hh: number, mm = 0) => dia * DIA + hh * 60 + mm;

describe('franjasSemanalesDe', () => {
  it('nulo, ausente, no-lista o lista vacía = esquema de siempre', () => {
    expect(franjasSemanalesDe(null)).toBeNull();
    expect(franjasSemanalesDe(undefined)).toBeNull();
    expect(franjasSemanalesDe({})).toBeNull();
    expect(franjasSemanalesDe([])).toBeNull();
  });
  it('descarta franjas ilegibles o sin duración; normaliza HH:mm', () => {
    expect(franjasSemanalesDe([FINDE, { desde_dia: 'sabado', desde_hora: '16:00', hasta_dia: 'sunday', hasta_hora: '14:00' }])).toEqual([FINDE]);
    expect(franjasSemanalesDe([{ ...FINDE, desde_hora: '16:00:00' }])).toEqual([FINDE]);
    expect(franjasSemanalesDe([{ desde_dia: 'monday', desde_hora: '10:00', hasta_dia: 'monday', hasta_hora: '10:00' }])).toEqual([]);
  });
  it('lista con solo franjas ilegibles: nunca activa (no cae al esquema viejo)', () => {
    const p = { schedule_windows: [{ desde_dia: 'x' }], start_time: null, end_time: null };
    expect(tramosSemanalesDe(p)).toEqual([]);
    expect(activaEnHorario(p, bog('2026-11-21', '17:00'), ZONA)).toBe(false);
  });
  it('mismo día con fin antes del inicio = casi una semana (dura < 7 días)', () => {
    const [[a, b]] = tramosSemanalesDe({ schedule_windows: [{ desde_dia: 'saturday', desde_hora: '16:00', hasta_dia: 'saturday', hasta_hora: '14:00' }] });
    expect(b - a).toBe(7 * 86400 - 2 * 3600);
  });
});

describe('«sábado 16:00 → domingo 14:00» minuto a minuto', () => {
  const p = { schedule_windows: [FINDE] };

  it('toda la semana del 16 al 23 de noviembre de 2026 coincide con el oráculo', () => {
    const esperado: Array<[number, number]> = [[MIN(5, 16), MIN(6, 14)]];
    const inicio = bog('2026-11-16', '00:00').getTime();
    let activos = 0;
    for (let i = 0; i < 8 * DIA; i++) {
      const t = new Date(inicio + i * 60000);
      const real = activaEnHorario(p, t, ZONA);
      if (real !== oraculo(esperado, t)) throw new Error(`difiere en ${t.toISOString()}: motor=${real}`);
      if (real) activos++;
    }
    expect(activos).toBe(22 * 60);
  });

  it('bordes: 15:59 no, 16:00 sí, domingo 13:59 sí, 14:00 ya no', () => {
    expect(activaEnHorario(p, bog('2026-11-21', '15:59'), ZONA)).toBe(false);
    expect(activaEnHorario(p, bog('2026-11-21', '16:00'), ZONA)).toBe(true);
    expect(activaEnHorario(p, bog('2026-11-22', '00:00'), ZONA)).toBe(true);
    expect(activaEnHorario(p, bog('2026-11-22', '13:59'), ZONA)).toBe(true);
    expect(activaEnHorario(p, bog('2026-11-22', '14:00'), ZONA)).toBe(false);
  });

  it('con el reloj en UTC: el domingo 00:30 de Bogotá todavía es sábado en ninguna parte del cálculo', () => {
    expect(activaEnHorario(p, new Date('2026-11-22T05:30:00Z'), ZONA)).toBe(true);
    expect(activaEnHorario(p, new Date('2026-11-22T19:00:00Z'), ZONA)).toBe(false); // domingo 14:00
    expect(activaEnHorario(p, new Date('2026-11-22T18:59:00Z'), ZONA)).toBe(true); // domingo 13:59
  });

  it('otra zona de la organización mueve la franja con ella', () => {
    // Sábado 16:00 en Madrid (UTC+1 en noviembre) = sábado 10:00 en Bogotá.
    expect(activaEnHorario(p, bog('2026-11-21', '10:00'), 'Europe/Madrid')).toBe(true);
    expect(activaEnHorario(p, bog('2026-11-21', '09:59'), 'Europe/Madrid')).toBe(false);
  });
});

describe('varias franjas y cruce de semana', () => {
  const p = { schedule_windows: [VIERNES_NOCHE, FINDE, DOMINGO_A_LUNES] };
  const esperado: Array<[number, number]> = [
    [MIN(4, 20), MIN(5, 2)],
    [MIN(5, 16), MIN(6, 14)],
    [MIN(6, 22), MIN(7, 3)], // pasa del domingo al lunes siguiente
  ];

  it('minuto a minuto durante dos semanas (incluye el paso domingo → lunes)', () => {
    const inicio = bog('2026-11-16', '00:00').getTime();
    for (let i = 0; i < 15 * DIA; i++) {
      const t = new Date(inicio + i * 60000);
      if (activaEnHorario(p, t, ZONA) !== oraculo(esperado, t)) throw new Error(`difiere en ${t.toISOString()}`);
    }
  });

  it('lunes 02:59 sigue (cola del domingo), 03:00 ya no; domingo 21:59 no', () => {
    expect(activaEnHorario(p, bog('2026-11-23', '02:59'), ZONA)).toBe(true);
    expect(activaEnHorario(p, bog('2026-11-23', '03:00'), ZONA)).toBe(false);
    expect(activaEnHorario(p, bog('2026-11-22', '21:59'), ZONA)).toBe(false);
    expect(activaEnHorario(p, bog('2026-11-22', '22:00'), ZONA)).toBe(true);
  });
});

describe('end_date y la cola de la franja (vigenteEnHorario)', () => {
  it('vence el sábado: la ocurrencia que empezó ese sábado sigue hasta el domingo 14:00', () => {
    const p = { schedule_windows: [FINDE], end_date: '2026-11-21T23:59:59.999-05:00' };
    expect(vigenteEnHorario(p, bog('2026-11-21', '20:00'), ZONA)).toBe(true);
    expect(vigenteEnHorario(p, bog('2026-11-22', '13:59'), ZONA)).toBe(true);
    expect(vigenteEnHorario(p, bog('2026-11-22', '14:00'), ZONA)).toBe(false);
    expect(vigenteEnHorario(p, bog('2026-11-28', '17:00'), ZONA)).toBe(false);
  });

  it('vence el domingo 22 a mediodía (fecha con hora): la ocurrencia del sábado ya pasó el corte al día siguiente', () => {
    // La ocurrencia pertenece al sábado; se compara contra sábado 23:59:59 < fin → sigue.
    const p = { schedule_windows: [FINDE], end_date: '2026-11-22T12:00:00-05:00' };
    expect(vigenteEnHorario(p, bog('2026-11-22', '13:00'), ZONA)).toBe(true);
  });

  it('una franja de tres días cuenta su cola completa aunque venza el primer día', () => {
    const p = {
      schedule_windows: [{ desde_dia: 'friday', desde_hora: '18:00', hasta_dia: 'monday', hasta_hora: '06:00' }],
      end_date: '2026-11-20T23:59:59.999-05:00',
    };
    expect(vigenteEnHorario(p, bog('2026-11-22', '12:00'), ZONA)).toBe(true);
    expect(vigenteEnHorario(p, bog('2026-11-23', '05:59'), ZONA)).toBe(true);
    expect(vigenteEnHorario(p, bog('2026-11-23', '06:00'), ZONA)).toBe(false);
    expect(vigenteEnHorario(p, bog('2026-11-27', '19:00'), ZONA)).toBe(false);
  });

  it('el mismo día de la ocurrencia manda el instante (fecha fin a media tarde)', () => {
    const p = { schedule_windows: [FINDE], end_date: '2026-11-21T17:00:00-05:00' };
    expect(vigenteEnHorario(p, bog('2026-11-21', '16:30'), ZONA)).toBe(true);
    expect(vigenteEnHorario(p, bog('2026-11-21', '17:30'), ZONA)).toBe(false);
    expect(vigenteEnHorario(p, bog('2026-11-22', '01:00'), ZONA)).toBe(false);
  });
});

describe('el esquema de siempre no cambia (compatibilidad)', () => {
  const legacy = { applicable_days: ['saturday'], start_time: '16:00:00', end_time: '14:00:00' };
  it('sábado + 16:00–14:00: el fin queda incluido al segundo, como antes', () => {
    expect(activaEnHorario(legacy, bog('2026-11-22', '14:00'), ZONA)).toBe(true);
    expect(activaEnHorario(legacy, new Date('2026-11-22T19:00:01Z'), ZONA)).toBe(false);
    expect(activaEnHorario(legacy, bog('2026-11-21', '10:00'), ZONA)).toBe(false);
  });
  it('schedule_windows manda sobre las columnas viejas si las dos vienen', () => {
    const ambas = { ...legacy, schedule_windows: [VIERNES_NOCHE] };
    expect(activaEnHorario(ambas, bog('2026-11-21', '17:00'), ZONA)).toBe(false);
    expect(activaEnHorario(ambas, bog('2026-11-20', '21:00'), ZONA)).toBe(true);
  });
  it('sin días ni horas: todo el día, todos los días', () => {
    expect(activaEnHorario({}, bog('2026-11-18', '03:17'), ZONA)).toBe(true);
  });
});

describe('el motor y el solapamiento usan las mismas franjas', () => {
  const ctx = (ahora: Date): ContextoPromocion => ({ canal: 'pos', ahora, zonaHoraria: ZONA, sucursalId: 7 });
  const fila = (extra: Partial<FilaPromocion> = {}): FilaPromocion => ({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Fin de semana',
    promotion_type: 'percentage',
    discount_value: 10,
    applies_to: 'all',
    start_date: '2026-11-01T00:00:00-05:00',
    end_date: null,
    is_active: true,
    applies_to_pos: true,
    schedule_windows: [FINDE],
    promotion_rules: [],
    ...extra,
  });

  it('promocionVigente y evaluarPromociones respetan la franja', () => {
    expect(promocionVigente(fila(), ctx(bog('2026-11-22', '09:30')))).toBe(true);
    expect(promocionVigente(fila(), ctx(bog('2026-11-22', '14:00')))).toBe(false);
    const linea = { product_id: 1, quantity: 1, unit_price: 10000 };
    expect(evaluarPromociones([fila()], [linea], ctx(bog('2026-11-22', '09:30'))).discountTotal).toBe(1000);
    expect(evaluarPromociones([fila()], [linea], ctx(bog('2026-11-23', '09:30'))).discountTotal).toBe(0);
  });

  it('start_date sigue mandando (no hay cola hacia atrás)', () => {
    const p = fila({ start_date: '2026-11-22T00:00:00-05:00' });
    expect(promocionVigente(p, ctx(bog('2026-11-21', '20:00')))).toBe(false);
    expect(promocionVigente(p, ctx(bog('2026-11-22', '10:00')))).toBe(true);
  });

  const solape = (extra: Partial<PromoSolape>): PromoSolape => ({ id: String(Math.random()), name: 'x', applies_to: 'all', ...extra });
  it('solapamiento: franja semanal contra esquema diario', () => {
    const finde = solape({ schedule_windows: [FINDE] });
    expect(semanasSeCruzan(finde, solape({ applicable_days: ['sunday'], start_time: '10:00', end_time: '12:00' }))).toBe(true);
    expect(semanasSeCruzan(finde, solape({ applicable_days: ['sunday'], start_time: '14:00', end_time: '18:00' }))).toBe(false);
    expect(semanasSeCruzan(finde, solape({ applicable_days: ['saturday'], start_time: '08:00', end_time: '15:59' }))).toBe(false);
    // Domingo → lunes contra lunes temprano: se cruza en la vuelta de semana.
    expect(semanasSeCruzan(solape({ schedule_windows: [DOMINGO_A_LUNES] }), solape({ applicable_days: ['monday'], start_time: '01:00', end_time: '02:00' }))).toBe(true);
    expect(seSolapan(finde, solape({ schedule_windows: [VIERNES_NOCHE] }))).toBe(false);
  });
});
