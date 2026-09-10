/**
 * Fase 0 — Politica de respuesta del bot conversacional.
 *
 * Se importa SIN extension: TypeScript y Jest resuelven el `.ts`, mientras que la
 * Edge Function lo importa CON extension, como exige Deno. Un solo archivo de
 * logica, dos runtimes.
 */
import {
  decidirSilencio,
  dentroDeHorarioLaboral,
  secretosCoinciden,
  type EntradaDecision,
  type HorarioSemanal,
} from '../../../supabase/functions/_shared/ai-chat/politicaRespuesta';

describe('secretosCoinciden', () => {
  it('acepta secretos identicos', () => {
    expect(secretosCoinciden('abc123', 'abc123')).toBe(true);
  });

  it('rechaza secretos distintos de igual longitud', () => {
    expect(secretosCoinciden('abc123', 'abc124')).toBe(false);
  });

  it('rechaza longitudes distintas sin lanzar', () => {
    expect(secretosCoinciden('abc', 'abcdef')).toBe(false);
    expect(secretosCoinciden('', 'x')).toBe(false);
  });

  it('rechaza el secreto vacio contra uno real', () => {
    expect(secretosCoinciden('', 'secreto')).toBe(false);
  });
});

describe('dentroDeHorarioLaboral', () => {
  // 2026-09-09 es miercoles. 14:00 UTC.
  const miercoles14h = new Date('2026-09-09T14:00:00Z');

  it('devuelve null si no hay horario configurado', () => {
    // Este es el caso de los 7 canales productivos hoy: business_hours = {}.
    expect(dentroDeHorarioLaboral({}, miercoles14h)).toBeNull();
    expect(dentroDeHorarioLaboral(null, miercoles14h)).toBeNull();
    expect(dentroDeHorarioLaboral(undefined, miercoles14h)).toBeNull();
  });

  it('detecta que estamos dentro de la franja', () => {
    const horario: HorarioSemanal = { miercoles: { open: '08:00', close: '18:00' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBe(true);
  });

  it('detecta que estamos fuera de la franja', () => {
    const horario: HorarioSemanal = { miercoles: { open: '08:00', close: '12:00' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBe(false);
  });

  it('acepta el nombre del dia con tilde', () => {
    const horario: HorarioSemanal = { 'miércoles': { open: '08:00', close: '18:00' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBe(true);
  });

  it('trata el dia marcado como cerrado como fuera de horario', () => {
    const horario: HorarioSemanal = { miercoles: { closed: true } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBe(false);
  });

  it('devuelve null si el dia no esta definido en el horario', () => {
    const horario: HorarioSemanal = { lunes: { open: '08:00', close: '18:00' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBeNull();
  });

  it('devuelve null si la franja esta mal formada', () => {
    const horario: HorarioSemanal = { miercoles: { open: 'manana', close: 'tarde' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBeNull();
  });

  it('incluye los bordes de la franja', () => {
    const horario: HorarioSemanal = { miercoles: { open: '14:00', close: '14:00' } };
    expect(dentroDeHorarioLaboral(horario, miercoles14h)).toBe(true);
  });
});

describe('decidirSilencio', () => {
  const base: EntradaDecision = {
    aiMode: 'hybrid',
    iaActiva: true,
    autoRespuestaActiva: true,
    minutosDesdeUltimoAgente: null,
    pausaPorAgenteMinutos: 30,
    respetarHorarioLaboral: false,
    horario: null,
  };

  it('en manual nunca responde', () => {
    expect(decidirSilencio({ ...base, aiMode: 'manual' })).toBe('canal_manual');
  });

  it('respeta is_active y auto_response_enabled', () => {
    expect(decidirSilencio({ ...base, iaActiva: false })).toBe('ia_desactivada');
    expect(decidirSilencio({ ...base, autoRespuestaActiva: false })).toBe('ia_desactivada');
  });

  it('en ai_only responde aunque haya un agente escribiendo', () => {
    const r = decidirSilencio({ ...base, aiMode: 'ai_only', minutosDesdeUltimoAgente: 1 });
    expect(r).toBeNull();
  });

  it('en hybrid calla si un agente escribio dentro de la ventana', () => {
    const r = decidirSilencio({ ...base, minutosDesdeUltimoAgente: 5 });
    expect(r).toBe('agente_humano_activo');
  });

  it('en hybrid responde si el agente escribio hace mas de la ventana', () => {
    const r = decidirSilencio({ ...base, minutosDesdeUltimoAgente: 45 });
    expect(r).toBeNull();
  });

  it('en hybrid responde si nunca escribio un agente', () => {
    expect(decidirSilencio(base)).toBeNull();
  });

  it('preserva el comportamiento actual: sin horario configurado, responde', () => {
    // Este es EL caso critico de la Fase 0. Los 7 canales productivos son hybrid
    // con business_hours vacio. Si el horario se tratara como "estoy trabajando",
    // el bot dejaria de responder en produccion.
    const r = decidirSilencio({ ...base, respetarHorarioLaboral: true, horario: {} });
    expect(r).toBeNull();
  });

  it('con el flag activo y horario definido, calla dentro del horario laboral', () => {
    const r = decidirSilencio({
      ...base,
      respetarHorarioLaboral: true,
      horario: { miercoles: { open: '08:00', close: '18:00' } },
      ahora: new Date('2026-09-09T14:00:00Z'),
    });
    expect(r).toBe('horario_laboral');
  });

  it('con el flag activo, responde fuera del horario laboral', () => {
    const r = decidirSilencio({
      ...base,
      respetarHorarioLaboral: true,
      horario: { miercoles: { open: '08:00', close: '12:00' } },
      ahora: new Date('2026-09-09T14:00:00Z'),
    });
    expect(r).toBeNull();
  });

  it('con el flag desactivado ignora el horario aunque este definido', () => {
    const r = decidirSilencio({
      ...base,
      respetarHorarioLaboral: false,
      horario: { miercoles: { open: '08:00', close: '18:00' } },
      ahora: new Date('2026-09-09T14:00:00Z'),
    });
    expect(r).toBeNull();
  });

  it('la pausa por agente tiene prioridad sobre el horario', () => {
    const r = decidirSilencio({
      ...base,
      minutosDesdeUltimoAgente: 2,
      respetarHorarioLaboral: true,
      horario: { miercoles: { open: '08:00', close: '18:00' } },
      ahora: new Date('2026-09-09T14:00:00Z'),
    });
    expect(r).toBe('agente_humano_activo');
  });
});
