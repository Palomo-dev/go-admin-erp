/**
 * Operación de Membresías (clases, reservas, check-in, control de acceso):
 * lógica pura de src/components/membresias/operacion/logica.ts.
 *
 * Los valores de estado y método son los de las CHECK de la base, verificadas
 * con el MCP el 2026-09-28 (pg_constraint):
 *   gym_classes.status           ∈ active | cancelled | completed
 *   class_reservations.status    ∈ booked | checked_in | cancelled | no_show
 *   class_reservations.source    ∈ app | web | staff | kiosk
 *   member_checkins.method       ∈ qr | manual | rfid | fingerprint | facial
 *   gym_access_devices.type      ∈ turnstile | scanner | tablet | kiosk | door_lock
 */
import {
  ESTADOS_CLASE,
  ESTADOS_RESERVA,
  METODOS_ENTRADA,
  NIVELES_CLASE,
  ORIGENES_RESERVA,
  TIPOS_DISPOSITIVO,
  cuposLibres,
  diaIsoDe,
  diasDeSemana,
  esAvisoConocido,
  esDelDia,
  esMotivoConocido,
  estadoClase,
  estadoReserva,
  horaEnZona,
  horarioClase,
  horarioDuplicado,
  horarioMovido,
  lunesDe,
  metodoDeEntrada,
  metodoValido,
  minutosEntre,
  ocupaCupo,
  rangoFiltroReservas,
  sumarMinutos,
  tiposDeClase,
  tokenSeguro,
  tonoResultadoEntrada,
} from '@/components/membresias/operacion/logica';

const CHECK_BASE = {
  clase: ['active', 'cancelled', 'completed'],
  reserva: ['booked', 'checked_in', 'cancelled', 'no_show'],
  origen: ['app', 'web', 'staff', 'kiosk'],
  metodo: ['qr', 'manual', 'rfid', 'fingerprint', 'facial'],
  dispositivo: ['turnstile', 'scanner', 'tablet', 'kiosk', 'door_lock'],
  nivel: ['beginner', 'intermediate', 'advanced', 'all_levels'],
};
const ordenar = (a: readonly string[]) => [...a].sort();

describe('valores que acepta la base', () => {
  it('las listas del código son exactamente las de las CHECK', () => {
    expect(ordenar(ESTADOS_CLASE)).toEqual(ordenar(CHECK_BASE.clase));
    expect(ordenar(ESTADOS_RESERVA)).toEqual(ordenar(CHECK_BASE.reserva));
    expect(ordenar(ORIGENES_RESERVA)).toEqual(ordenar(CHECK_BASE.origen));
    expect(ordenar(METODOS_ENTRADA)).toEqual(ordenar(CHECK_BASE.metodo));
    expect(ordenar(TIPOS_DISPOSITIVO)).toEqual(ordenar(CHECK_BASE.dispositivo));
    expect(ordenar(NIVELES_CLASE)).toEqual(ordenar(CHECK_BASE.nivel));
  });

  it('los valores viejos que la base rechaza se leen como los válidos', () => {
    expect(estadoClase('scheduled')).toBe('active');
    expect(estadoClase('in_progress')).toBe('active');
    expect(estadoClase('completed')).toBe('completed');
    expect(estadoClase(null)).toBe('active');
    expect(estadoReserva('attended')).toBe('checked_in');
    expect(estadoReserva('no_show')).toBe('no_show');
    expect(estadoReserva('raro')).toBe('booked');
    expect(metodoValido('card')).toBe('manual');
    expect(metodoValido('biometric')).toBe('manual');
    expect(metodoValido('nfc')).toBe('manual');
    expect(metodoValido('rfid')).toBe('rfid');
  });
});

describe('método de entrada', () => {
  it('qr solo si el lector leyó exactamente el código de acceso', () => {
    expect(metodoDeEntrada('lector', 'm-0142', 'M-0142')).toBe('qr');
    expect(metodoDeEntrada('lector', ' M-0142 ', 'M-0142')).toBe('qr');
  });
  it('lo tecleado, o un documento leído por el lector, es manual', () => {
    expect(metodoDeEntrada('teclado', 'M-0142', 'M-0142')).toBe('manual');
    expect(metodoDeEntrada('lector', '1020456789', 'M-0142')).toBe('manual');
    expect(metodoDeEntrada('lector', 'M-0142', null)).toBe('manual');
  });
});

describe('resultado del check-in', () => {
  it('en gracia deja entrar con aviso (P5)', () => {
    expect(tonoResultadoEntrada({ permitido: true, aviso: 'en_gracia' })).toBe('advertencia');
    expect(tonoResultadoEntrada({ permitido: true, aviso: 'activada_hoy' })).toBe('exito');
    expect(tonoResultadoEntrada({ permitido: true, aviso: null })).toBe('exito');
    expect(tonoResultadoEntrada({ permitido: false, aviso: null })).toBe('peligro');
  });
  it('conoce los motivos y avisos de fn_membresia_registrar_checkin', () => {
    for (const m of ['sin_membresia', 'pendiente_de_pago', 'congelada', 'vencida', 'sede_no_permitida', 'fuera_de_horario', 'limite_diario']) {
      expect(esMotivoConocido(m)).toBe(true);
    }
    expect(esMotivoConocido('Membresía vencida')).toBe(false);
    expect(esAvisoConocido('en_gracia')).toBe(true);
    expect(esAvisoConocido('activada_hoy')).toBe(true);
  });
});

describe('fechas en la zona de la organización', () => {
  it('semana de lunes a domingo', () => {
    expect(diaIsoDe('2026-09-28')).toBe(1);
    expect(diaIsoDe('2026-10-04')).toBe(7);
    expect(lunesDe('2026-10-04')).toBe('2026-09-28');
    expect(lunesDe('2026-09-28')).toBe('2026-09-28');
    expect(diasDeSemana('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('arma el instante de la clase en la zona, no en la del navegador', () => {
    const { inicio, fin } = horarioClase('2026-09-28', '07:00', 60, 'America/Bogota');
    expect(new Date(inicio).toISOString()).toBe('2026-09-28T12:00:00.000Z');
    expect(new Date(fin).toISOString()).toBe('2026-09-28T13:00:00.000Z');
    expect(horaEnZona(inicio, 'America/Bogota')).toBe('07:00');
  });

  it('duplicar conserva hora de pared y duración, y cae en el día elegido', () => {
    const original = { start_at: '2026-09-28T12:00:00.000Z', end_at: '2026-09-28T12:45:00.000Z' };
    const copia = horarioDuplicado(original, '2026-10-05', 'America/Bogota');
    expect(new Date(copia.inicio).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(new Date(copia.fin).toISOString()).toBe('2026-10-05T12:45:00.000Z');
    expect(esDelDia(copia.inicio, '2026-10-05', 'America/Bogota')).toBe(true);
  });

  it('duplicar cruzando el cambio de horario mantiene la hora local', () => {
    // 07:00 en Madrid en verano (UTC+2) → 07:00 en invierno (UTC+1).
    const original = { start_at: '2026-10-20T05:00:00.000Z', end_at: '2026-10-20T06:00:00.000Z' };
    const copia = horarioDuplicado(original, '2026-10-27', 'Europe/Madrid');
    expect(new Date(copia.inicio).toISOString()).toBe('2026-10-27T06:00:00.000Z');
    expect(horaEnZona(copia.inicio, 'Europe/Madrid')).toBe('07:00');
  });

  it('mover en el calendario conserva la duración', () => {
    const original = { start_at: '2026-09-28T12:00:00.000Z', end_at: '2026-09-28T13:30:00.000Z' };
    const movida = horarioMovido(original, '2026-09-30', '18:15', 'America/Bogota');
    expect(new Date(movida.inicio).toISOString()).toBe('2026-09-30T23:15:00.000Z');
    expect(new Date(movida.fin).toISOString()).toBe('2026-10-01T00:45:00.000Z');
  });

  it('«Hoy» de reservas es el día de la clase en la zona (no booked_at ni UTC)', () => {
    const r = rangoFiltroReservas('hoy', '2026-09-28', 'America/Bogota');
    expect(r).not.toBeNull();
    expect(new Date(r!.desde).toISOString()).toBe('2026-09-28T05:00:00.000Z');
    expect(new Date(r!.hasta).toISOString()).toBe('2026-09-29T05:00:00.000Z');
    // Una clase a las 21:00 de Bogotá es del día 28 aunque en UTC ya sea el 29.
    expect(esDelDia('2026-09-29T02:00:00.000Z', '2026-09-28', 'America/Bogota')).toBe(true);
    const semana = rangoFiltroReservas('semana', '2026-09-28', 'America/Bogota');
    expect(new Date(semana!.hasta).toISOString()).toBe('2026-10-05T05:00:00.000Z');
    expect(rangoFiltroReservas('todas', '2026-09-28', 'America/Bogota')).toBeNull();
  });

  it('horas', () => {
    expect(sumarMinutos('23:30', 45)).toBe('00:15');
    expect(sumarMinutos('07:00', 60)).toBe('08:00');
    expect(minutosEntre('07:00', '08:30')).toBe(90);
    expect(minutosEntre('23:00', '00:30')).toBe(90);
  });
});

describe('cupo, tipos y token', () => {
  it('las canceladas no ocupan cupo', () => {
    expect(ocupaCupo('booked')).toBe(true);
    expect(ocupaCupo('checked_in')).toBe(true);
    expect(ocupaCupo('cancelled')).toBe(false);
    expect(cuposLibres(10, 12)).toBe(0);
    expect(cuposLibres(10, 3)).toBe(7);
  });

  it('los tipos de clase no quedan cableados: suma los que usa la organización', () => {
    const tipos = tiposDeClase(['yoga', 'Aqua fitness', null, 'Aqua fitness', '']);
    expect(tipos).toContain('yoga');
    expect(tipos.filter((t) => t === 'Aqua fitness')).toHaveLength(1);
    expect(tipos[tipos.length - 1]).toBe('Aqua fitness');
  });

  it('token con la longitud y el alfabeto pedidos, sin Math.random', () => {
    let i = 0;
    const fuente = {
      getRandomValues<T extends ArrayBufferView | null>(arr: T): T {
        const a = arr as unknown as Uint8Array;
        for (let k = 0; k < a.length; k++) a[k] = (i++ * 37) % 256;
        return arr;
      },
    };
    const espia = jest.spyOn(Math, 'random');
    const tok = tokenSeguro(32, fuente as Pick<Crypto, 'getRandomValues'>);
    expect(tok).toHaveLength(32);
    expect(tok).toMatch(/^[A-Za-z0-9]+$/);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });
});
