/**
 * Control «Cuándo está activa»: cómo se guarda cada modo, validación, vista
 * previa de la semana y próximas activaciones dentro de la vigencia. Las
 * fechas son de Bogotá; corre igual con TZ=UTC y TZ=America/Bogota.
 */
import {
  columnasDeHorario,
  duracionBorradorMinutos,
  duracionDiariaMinutos,
  horarioDesdeColumnas,
  proximasActivaciones,
  terminaAlDiaSiguiente,
  validarHorario,
  vistaSemanal,
  FRANJA_VACIA,
  type HorarioFormulario,
} from '@/lib/promotions/horarioPromocion';
import { toPlainDate } from '@/lib/utils/dateCore';

const ZONA = 'America/Bogota';
const FINDE = { desde_dia: 'saturday', desde_hora: '16:00', hasta_dia: 'sunday', hasta_hora: '14:00' } as const;
const base: HorarioFormulario = { modo: 'todo', dias: [], inicio: '', fin: '', franjas: [{ ...FRANJA_VACIA }] };
const local = (d: Date) => `${toPlainDate(d, ZONA)} ${new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)}`;

describe('columnasDeHorario', () => {
  it('«Todo el día» deja todo en NULL', () => {
    expect(columnasDeHorario({ ...base, dias: ['monday'], inicio: '10:00', fin: '12:00', franjas: [{ ...FINDE }] })).toEqual({
      applicable_days: null, start_time: null, end_time: null, schedule_windows: null,
    });
  });
  it('«Mismo horario cada día» guarda días (lunes primero) y franja, sin franjas semanales', () => {
    expect(columnasDeHorario({ ...base, modo: 'cadaDia', dias: ['saturday', 'friday'], inicio: '20:00', fin: '02:00', franjas: [{ ...FINDE }] })).toEqual({
      applicable_days: ['friday', 'saturday'], start_time: '20:00', end_time: '02:00', schedule_windows: null,
    });
  });
  it('«Franja que cruza días» guarda solo schedule_windows', () => {
    expect(columnasDeHorario({ ...base, modo: 'cruza', dias: ['monday'], inicio: '10:00', fin: '11:00', franjas: [{ ...FINDE }] })).toEqual({
      applicable_days: null, start_time: null, end_time: null, schedule_windows: [FINDE],
    });
  });
});

describe('horarioDesdeColumnas', () => {
  it('reconoce los tres modos', () => {
    expect(horarioDesdeColumnas({}).modo).toBe('todo');
    expect(horarioDesdeColumnas({ applicable_days: ['friday'], start_time: '20:00:00', end_time: '02:00:00' })).toMatchObject({ modo: 'cadaDia', dias: ['friday'], inicio: '20:00', fin: '02:00' });
    expect(horarioDesdeColumnas({ schedule_windows: [FINDE] })).toMatchObject({ modo: 'cruza', franjas: [FINDE] });
  });
  it('ida y vuelta sin pérdidas', () => {
    const h: HorarioFormulario = { ...base, modo: 'cruza', franjas: [{ ...FINDE }, { desde_dia: 'friday', desde_hora: '20:00', hasta_dia: 'saturday', hasta_hora: '02:00' }] };
    expect(columnasDeHorario(horarioDesdeColumnas(columnasDeHorario(h)))).toEqual(columnasDeHorario(h));
  });
});

describe('validarHorario', () => {
  it('cada día pide las dos horas y que sean distintas', () => {
    expect(validarHorario({ ...base, modo: 'cadaDia', inicio: '20:00', fin: '' })).toEqual({ error: 'horasFaltantes' });
    expect(validarHorario({ ...base, modo: 'cadaDia', inicio: '20:00', fin: '20:00' })).toEqual({ error: 'horasIguales' });
    expect(validarHorario({ ...base, modo: 'cadaDia', inicio: '20:00', fin: '02:00' })).toBeNull();
  });
  it('cruza días: franjas completas y con duración', () => {
    expect(validarHorario({ ...base, modo: 'cruza', franjas: [] })).toEqual({ error: 'sinFranjas' });
    expect(validarHorario({ ...base, modo: 'cruza', franjas: [{ ...FINDE }, { ...FRANJA_VACIA }] })).toEqual({ error: 'franjaIncompleta', franja: 1 });
    expect(validarHorario({ ...base, modo: 'cruza', franjas: [{ ...FINDE, hasta_dia: 'saturday', hasta_hora: '16:00' }] })).toEqual({ error: 'franjaSinDuracion', franja: 0 });
    expect(validarHorario({ ...base, modo: 'cruza', franjas: [{ ...FINDE }] })).toBeNull();
  });
});

describe('duraciones', () => {
  it('«Dura 22 h» y «termina al día siguiente · 6 h»', () => {
    expect(duracionBorradorMinutos({ ...FINDE })).toBe(22 * 60);
    expect(duracionBorradorMinutos({ ...FRANJA_VACIA })).toBeNull();
    expect(duracionDiariaMinutos('20:00', '02:00')).toBe(6 * 60);
    expect(terminaAlDiaSiguiente('20:00', '02:00')).toBe(true);
    expect(terminaAlDiaSiguiente('08:00', '12:00')).toBe(false);
  });
});

describe('vistaSemanal', () => {
  it('sábado 16:00 → 24:00 y domingo 00:00 → 14:00 (continúa)', () => {
    const v = vistaSemanal({ schedule_windows: [FINDE] });
    expect(v[5]).toEqual([{ desde: 16 * 3600, hasta: 24 * 3600, continua: false }]);
    expect(v[6]).toEqual([{ desde: 0, hasta: 14 * 3600, continua: true }]);
    expect(v.slice(0, 5).every((d) => d.length === 0)).toBe(true);
  });
  it('domingo → lunes se dibuja en el lunes de la misma semana', () => {
    const v = vistaSemanal({ schedule_windows: [{ desde_dia: 'sunday', desde_hora: '22:00', hasta_dia: 'monday', hasta_hora: '03:00' }] });
    expect(v[0]).toEqual([{ desde: 0, hasta: 3 * 3600, continua: true }]);
    expect(v[6]).toEqual([{ desde: 22 * 3600, hasta: 24 * 3600, continua: false }]);
  });
  it('cada día con madrugada: viernes y sábado 20:00–02:00', () => {
    const v = vistaSemanal({ applicable_days: ['friday', 'saturday'], start_time: '20:00', end_time: '02:00' });
    expect(v[5].map((s) => s.continua)).toEqual([true, false]);
    expect(v[6]).toEqual([{ desde: 0, hasta: 2 * 3600 + 1, continua: true }]);
  });
});

describe('proximasActivaciones', () => {
  it('ejemplo del Figma: vigencia 1 nov – 31 dic, hoy viernes 20 nov', () => {
    const r = proximasActivaciones({ schedule_windows: [FINDE] }, {
      ahora: new Date('2026-11-20T15:00:00-05:00'), zona: ZONA, desde: '2026-11-01', hasta: '2026-12-31',
    });
    expect(r.primeras.map((a) => `${local(a.inicio)} → ${local(a.fin)}`)).toEqual([
      '2026-11-21 16:00 → 2026-11-22 14:00',
      '2026-11-28 16:00 → 2026-11-29 14:00',
      '2026-12-05 16:00 → 2026-12-06 14:00',
    ]);
    expect(r.total).toBe(6);
    expect(r.ultima && local(r.ultima.fin)).toBe('2026-12-27 14:00');
  });

  it('la que está en curso se lista; la que ya terminó no', () => {
    const domingo = proximasActivaciones({ schedule_windows: [FINDE] }, { ahora: new Date('2026-11-22T10:00:00-05:00'), zona: ZONA, hasta: '2026-11-30' });
    expect(local(domingo.primeras[0].inicio)).toBe('2026-11-21 16:00');
    expect(domingo.total).toBe(2);
    const tarde = proximasActivaciones({ schedule_windows: [FINDE] }, { ahora: new Date('2026-11-22T15:00:00-05:00'), zona: ZONA, hasta: '2026-11-30' });
    expect(local(tarde.primeras[0].inicio)).toBe('2026-11-28 16:00');
    expect(tarde.total).toBe(1);
  });

  it('la que empieza el último día de la vigencia cuenta entera', () => {
    const r = proximasActivaciones({ schedule_windows: [FINDE] }, { ahora: new Date('2026-11-20T12:00:00-05:00'), zona: ZONA, hasta: '2026-11-21' });
    expect(r.total).toBe(1);
    expect(local(r.ultima!.fin)).toBe('2026-11-22 14:00');
  });

  it('sin fecha de fin: total null; vigencia que empieza más adelante parte de ese día', () => {
    const r = proximasActivaciones({ schedule_windows: [FINDE] }, { ahora: new Date('2026-11-20T12:00:00-05:00'), zona: ZONA, desde: '2026-12-01' });
    expect(r.total).toBeNull();
    expect(local(r.primeras[0].inicio)).toBe('2026-12-05 16:00');
  });

  it('vigencia vencida: ninguna', () => {
    const r = proximasActivaciones({ schedule_windows: [FINDE] }, { ahora: new Date('2026-11-20T12:00:00-05:00'), zona: ZONA, hasta: '2026-10-01' });
    expect(r).toEqual({ primeras: [], total: 0, ultima: null });
  });
});
