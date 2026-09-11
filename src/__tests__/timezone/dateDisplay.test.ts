// ============================================================
// Tests del contrato de la nueva capa de fechas (dateDisplay.ts).
//
// Estos tests definen el comportamiento esperado de las funciones
// que se implementaran en src/lib/utils/dateDisplay.ts.
// Deben FALLAR antes de que dateDisplay.ts exista (import error)
// y PASAR despues de su implementacion.
//
// Se ejecutan con TZ=UTC (jest.setup.tz.ts) para reproducir Vercel.
// Las funciones usan Intl.DateTimeFormat con timeZone explicito,
// por lo que el resultado es independiente del TZ del runtime.
// ============================================================

import {
  formatDateInTz,
  formatDateTimeInTz,
  formatTimeInTz,
  formatPlainDate,
  todayInTz,
  toPlainDate,
  plainDateToInstant,
} from '@/lib/utils/dateDisplay';

const BOGOTA = 'America/Bogota';
const MEXICO = 'America/Mexico_City';
const MADRID = 'Europe/Madrid';

describe('dateDisplay — formatDateInTz (timestamptz -> dia calendario)', () => {
  it('venta a las 20:30 Bogota del 10/09 muestra 10/09/2026', () => {
    // 2026-09-10T20:30:00-05:00 = instante en Bogota a las 20:30 del 10/09
    const iso = '2026-09-10T20:30:00-05:00';
    expect(formatDateInTz(iso, BOGOTA)).toBe('10/09/2026');
  });

  it('venta a las 01:30Z del 11/09 muestra 10/09/2026 (mismo instante, formato Z)', () => {
    // 2026-09-11T01:30:00Z = 20:30 del 10/09 en Bogota (UTC-5)
    const iso = '2026-09-11T01:30:00Z';
    expect(formatDateInTz(iso, BOGOTA)).toBe('10/09/2026');
  });

  it('venta a las 23:59 Bogota del 10/09 muestra 10/09/2026', () => {
    const iso = '2026-09-10T23:59:00-05:00';
    expect(formatDateInTz(iso, BOGOTA)).toBe('10/09/2026');
  });

  it('venta a las 00:01 Bogota del 11/09 muestra 11/09/2026', () => {
    const iso = '2026-09-11T00:01:00-05:00';
    expect(formatDateInTz(iso, BOGOTA)).toBe('11/09/2026');
  });

  it('acepta Date ademas de string', () => {
    const date = new Date('2026-09-11T01:30:00Z');
    expect(formatDateInTz(date, BOGOTA)).toBe('10/09/2026');
  });

  it('devuelve string vacio o placeholder para null/undefined', () => {
    expect(formatDateInTz(null, BOGOTA)).toBe('');
    expect(formatDateInTz(undefined, BOGOTA)).toBe('');
    expect(formatDateInTz('', BOGOTA)).toBe('');
  });

  it('respeta zona horaria de Mexico City (UTC-6)', () => {
    // 2026-09-11T01:30:00Z = 19:30 del 10/09 en Mexico City (UTC-6)
    const iso = '2026-09-11T01:30:00Z';
    expect(formatDateInTz(iso, MEXICO)).toBe('10/09/2026');
  });

  it('respeta zona horaria de Madrid (UTC+2 en verano)', () => {
    // 2026-09-11T01:30:00Z = 03:30 del 11/09 en Madrid (UTC+2 en septiembre)
    const iso = '2026-09-11T01:30:00Z';
    expect(formatDateInTz(iso, MADRID)).toBe('11/09/2026');
  });
});

describe('dateDisplay — formatDateTimeInTz', () => {
  it('formatea fecha y hora en Bogota', () => {
    const iso = '2026-09-11T01:30:00Z'; // 20:30 del 10/09 en Bogota
    expect(formatDateTimeInTz(iso, BOGOTA)).toBe('10/09/2026 20:30');
  });

  it('formatea fecha y hora en Madrid', () => {
    const iso = '2026-09-11T01:30:00Z'; // 03:30 del 11/09 en Madrid
    expect(formatDateTimeInTz(iso, MADRID)).toBe('11/09/2026 03:30');
  });
});

describe('dateDisplay — formatTimeInTz', () => {
  it('formatea solo la hora en Bogota', () => {
    const iso = '2026-09-11T01:30:00Z'; // 20:30 del 10/09 en Bogota
    expect(formatTimeInTz(iso, BOGOTA)).toBe('20:30');
  });

  it('formatea solo la hora en Madrid', () => {
    const iso = '2026-09-11T01:30:00Z'; // 03:30 del 11/09 en Madrid
    expect(formatTimeInTz(iso, MADRID)).toBe('03:30');
  });
});

describe('dateDisplay — formatPlainDate (columna date pura)', () => {
  it('formatea YYYY-MM-DD sin convertir zona horaria', () => {
    expect(formatPlainDate('2026-09-10')).toBe('10/09/2026');
  });

  it('no desplaza la fecha (no hay conversion de zona)', () => {
    // Una columna date pura "2026-09-10" es el dia calendario, no un instante.
    // No debe convertirse a ninguna zona horaria.
    expect(formatPlainDate('2026-09-10')).toBe('10/09/2026');
    expect(formatPlainDate('2026-09-11')).toBe('11/09/2026');
  });

  it('devuelve placeholder para null/undefined', () => {
    expect(formatPlainDate(null)).toBe('');
    expect(formatPlainDate(undefined)).toBe('');
  });
});

describe('dateDisplay — todayInTz', () => {
  it('a las 02:00Z del 12/09, en Bogota es 11/09', () => {
    // 2026-09-12T02:00:00Z = 21:00 del 11/09 en Bogota (UTC-5)
    // todayInTz debe devolver 2026-09-11
    // Usamos un mock de Date para reproducir este instante exacto.
    const realDate = Date;
    const mockDate = new Date('2026-09-12T02:00:00Z');
    global.Date = class extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(mockDate.getTime());
        } else {
          super(...(args as [number]));
        }
      }
      static now() {
        return mockDate.getTime();
      }
    } as unknown as typeof Date;

    try {
      expect(todayInTz(BOGOTA)).toBe('2026-09-11');
    } finally {
      global.Date = realDate;
    }
  });

  it('a las 02:00Z del 12/09, en Madrid es 12/09', () => {
    // 2026-09-12T02:00:00Z = 04:00 del 12/09 en Madrid (UTC+2)
    const realDate = Date;
    const mockDate = new Date('2026-09-12T02:00:00Z');
    global.Date = class extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(mockDate.getTime());
        } else {
          super(...(args as [number]));
        }
      }
      static now() {
        return mockDate.getTime();
      }
    } as unknown as typeof Date;

    try {
      expect(todayInTz(MADRID)).toBe('2026-09-12');
    } finally {
      global.Date = realDate;
    }
  });
});

describe('dateDisplay — toPlainDate (Date del navegador -> YYYY-MM-DD en TZ)', () => {
  it('convierte un Date local a YYYY-MM-DD en Bogota', () => {
    // Un Date que representa el 10/09/2026 a las 20:30 local
    const date = new Date('2026-09-11T01:30:00Z'); // 20:30 del 10/09 en Bogota
    expect(toPlainDate(date, BOGOTA)).toBe('2026-09-10');
  });

  it('convierte un Date local a YYYY-MM-DD en Madrid', () => {
    const date = new Date('2026-09-11T01:30:00Z'); // 03:30 del 11/09 en Madrid
    expect(toPlainDate(date, MADRID)).toBe('2026-09-11');
  });
});

describe('dateDisplay — plainDateToInstant (YYYY-MM-DD + HH:mm -> ISO con offset)', () => {
  it('construye un instante para Bogota (UTC-5)', () => {
    const iso = plainDateToInstant('2026-09-10', BOGOTA, '20:30');
    // 2026-09-10T20:30:00-05:00 = 2026-09-11T01:30:00Z
    expect(new Date(iso).toISOString()).toBe('2026-09-11T01:30:00.000Z');
  });

  it('sin hora, usa 00:00 por defecto', () => {
    const iso = plainDateToInstant('2026-09-10', BOGOTA);
    // 2026-09-10T00:00:00-05:00 = 2026-09-10T05:00:00Z
    expect(new Date(iso).toISOString()).toBe('2026-09-10T05:00:00.000Z');
  });

  it('construye un instante para Madrid (UTC+2 en verano)', () => {
    const iso = plainDateToInstant('2026-09-10', MADRID, '15:00');
    // 2026-09-10T15:00:00+02:00 = 2026-09-10T13:00:00Z
    expect(new Date(iso).toISOString()).toBe('2026-09-10T13:00:00.000Z');
  });
});

describe('dateDisplay — independencia del TZ del runtime', () => {
  // Estos tests se ejecutan con TZ=UTC (jest.setup.tz.ts).
  // El resultado debe ser el mismo sin importar el TZ del runtime.
  it('formatDateInTz produce el mismo resultado con TZ=UTC', () => {
    const iso = '2026-09-11T01:30:00Z';
    expect(formatDateInTz(iso, BOGOTA)).toBe('10/09/2026');
  });

  it('todayInTz con TZ=UTC sigue respetando la zona de la org', () => {
    // A las 02:00Z, en Bogota son las 21:00 del dia anterior.
    const realDate = Date;
    const mockDate = new Date('2026-09-12T02:00:00Z');
    global.Date = class extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(mockDate.getTime());
        } else {
          super(...(args as [number]));
        }
      }
      static now() {
        return mockDate.getTime();
      }
    } as unknown as typeof Date;

    try {
      expect(todayInTz(BOGOTA)).toBe('2026-09-11');
    } finally {
      global.Date = realDate;
    }
  });
});
