/**
 * Ley 2300 de 2023 en el agente de voz: ventana de contacto con festivos de
 * Colombia, reprogramación a la siguiente ventana y tope semanal.
 *
 * Vive en `src/__tests__/timezone` para correr con `npm run test:tz-all`
 * (TZ=UTC, America/Bogota, Mexico, Madrid, Santiago, Katmandú): nada de
 * `ley2300.ts` puede depender del huso del proceso.
 */

import {
  decidirContactoLey2300,
  domingoDePascua,
  esFestivoColombia,
  evaluarTopeSemanal,
  festivosColombia,
  inicioSemanaLocal,
  inicioSemanaSiguienteLocal,
  siguienteVentanaLey2300,
  ventanaDelDia,
  ventanaLey2300Abierta,
  zonaHorariaDestinatario,
  ZONA_COLOMBIA,
} from '@/lib/services/crm/voiceAgent/ley2300';

/** Instante de una hora de pared de Bogotá (UTC−5 fijo, sin horario de verano). */
const bog = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

describe('Festivos nacionales de Colombia (Ley 51 de 1983 + Pascua)', () => {
  test('domingo de Pascua', () => {
    expect(domingoDePascua(2025)).toBe('2025-04-20');
    expect(domingoDePascua(2026)).toBe('2026-04-05');
    expect(domingoDePascua(2027)).toBe('2027-03-28');
  });

  test('los 18 festivos de 2026, con los traslados al lunes', () => {
    expect(festivosColombia(2026)).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes (6 ene, martes → lunes 12)
      '2026-03-23', // San José (19 mar, jueves → lunes 23)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Día del Trabajo
      '2026-05-18', // Ascensión
      '2026-06-08', // Corpus Christi
      '2026-06-15', // Sagrado Corazón
      '2026-06-29', // San Pedro y San Pablo (ya es lunes)
      '2026-07-20', // Independencia
      '2026-08-07', // Batalla de Boyacá
      '2026-08-17', // Asunción (15 ago, sábado → lunes 17)
      '2026-10-12', // Día de la Raza (ya es lunes)
      '2026-11-02', // Todos los Santos (1 nov, domingo → lunes 2)
      '2026-11-16', // Independencia de Cartagena (11 nov, miércoles → lunes 16)
      '2026-12-08', // Inmaculada Concepción
      '2026-12-25', // Navidad
    ]);
  });

  test('2027: móviles de Pascua y traslados', () => {
    const f = festivosColombia(2027);
    expect(f).toHaveLength(18);
    expect(f).toEqual(expect.arrayContaining(['2027-03-25', '2027-03-26', '2027-05-10', '2027-05-31', '2027-06-07']));
    expect(f).toContain('2027-01-11'); // Reyes: 6 ene 2027 es miércoles → lunes 11
  });

  test('un día laborable cualquiera no es festivo', () => {
    expect(esFestivoColombia('2026-09-29')).toBe(false);
    expect(esFestivoColombia('2026-10-12')).toBe(true);
  });
});

describe('Ventana de contacto (art. 3): L-V 7–19, sábado 8–15, nunca domingo ni festivo', () => {
  test('ventanas por tipo de día', () => {
    expect(ventanaDelDia('2026-09-29')).toEqual({ desde: 7 * 60, hasta: 19 * 60 }); // martes
    expect(ventanaDelDia('2026-10-03')).toEqual({ desde: 8 * 60, hasta: 15 * 60 }); // sábado
    expect(ventanaDelDia('2026-10-04')).toBeNull(); // domingo
    expect(ventanaDelDia('2026-10-12')).toBeNull(); // festivo en lunes
  });

  test.each([
    ['martes 06:59', bog('2026-09-29', '06:59'), false],
    ['martes 07:00', bog('2026-09-29', '07:00'), true],
    ['martes 18:59', bog('2026-09-29', '18:59'), true],
    ['martes 19:00', bog('2026-09-29', '19:00'), false],
    ['sábado 07:59', bog('2026-10-03', '07:59'), false],
    ['sábado 08:00', bog('2026-10-03', '08:00'), true],
    ['sábado 14:59', bog('2026-10-03', '14:59'), true],
    ['sábado 15:00', bog('2026-10-03', '15:00'), false],
    ['domingo 10:00', bog('2026-10-04', '10:00'), false],
    ['festivo (12 oct) 10:00', bog('2026-10-12', '10:00'), false],
    ['Jueves Santo 10:00', bog('2026-04-02', '10:00'), false],
  ])('%s', (_nombre, instante, abierta) => {
    expect(ventanaLey2300Abierta(instante, ZONA_COLOMBIA)).toBe(abierta);
  });

  test('la hora es la del destinatario, no la del servidor ni la de UTC', () => {
    // 23:30 UTC del martes = 18:30 en Bogotá (abierta) pero ya miércoles en UTC.
    const t = new Date('2026-09-29T23:30:00Z');
    expect(ventanaLey2300Abierta(t, ZONA_COLOMBIA)).toBe(true);
    // 00:30 UTC del miércoles = 19:30 del martes en Bogotá: cerrada.
    expect(ventanaLey2300Abierta(new Date('2026-09-30T00:30:00Z'), ZONA_COLOMBIA)).toBe(false);
  });
});

describe('Reprogramación a la siguiente ventana', () => {
  test('dentro de la ventana devuelve el mismo instante', () => {
    const t = bog('2026-09-29', '10:15');
    expect(siguienteVentanaLey2300(t).getTime()).toBe(t.getTime());
  });

  test('antes de abrir → hoy a las 07:00', () => {
    expect(siguienteVentanaLey2300(bog('2026-09-29', '05:00')).toISOString()).toBe(bog('2026-09-29', '07:00').toISOString());
  });

  test('viernes 19:30 → sábado 08:00', () => {
    expect(siguienteVentanaLey2300(bog('2026-10-02', '19:30')).toISOString()).toBe(bog('2026-10-03', '08:00').toISOString());
  });

  test('sábado 15:00 → martes 07:00 (domingo y lunes festivo 12 de octubre)', () => {
    expect(siguienteVentanaLey2300(bog('2026-10-10', '15:00')).toISOString()).toBe(bog('2026-10-13', '07:00').toISOString());
  });

  test('Semana Santa: miércoles 19:00 → sábado 08:00 (jueves y viernes santos)', () => {
    expect(siguienteVentanaLey2300(bog('2026-04-01', '19:00')).toISOString()).toBe(bog('2026-04-04', '08:00').toISOString());
  });

  test('Navidad: jueves 24 de diciembre 20:00 → sábado 26 a las 08:00', () => {
    expect(siguienteVentanaLey2300(bog('2026-12-24', '20:00')).toISOString()).toBe(bog('2026-12-26', '08:00').toISOString());
  });

  test('el resultado siempre cae dentro de una ventana abierta', () => {
    for (let h = 0; h < 24 * 14; h += 5) {
      const desde = new Date(bog('2026-12-20', '00:00').getTime() + h * 3600_000);
      const en = siguienteVentanaLey2300(desde);
      expect(ventanaLey2300Abierta(en)).toBe(true);
      expect(en.getTime()).toBeGreaterThanOrEqual(desde.getTime());
    }
  });
});

describe('Semana y tope de contactos (1 por canal, 2 en total)', () => {
  test('la semana va de lunes 00:00 a lunes 00:00 en la zona del destinatario', () => {
    const miercoles = bog('2026-09-30', '12:00');
    expect(inicioSemanaLocal(miercoles).toISOString()).toBe(bog('2026-09-28', '00:00').toISOString());
    expect(inicioSemanaSiguienteLocal(miercoles).toISOString()).toBe(bog('2026-10-05', '00:00').toISOString());
    // Domingo por la noche sigue siendo la semana que empezó el lunes anterior.
    expect(inicioSemanaLocal(bog('2026-10-04', '23:00')).toISOString()).toBe(bog('2026-09-28', '00:00').toISOString());
  });

  test('conteo de contactos por semana', () => {
    expect(evaluarTopeSemanal({}, 'voice')).toEqual({ permitido: true });
    expect(evaluarTopeSemanal({ email: 1 }, 'voice')).toEqual({ permitido: true });
    expect(evaluarTopeSemanal({ voice: 1 }, 'voice')).toEqual({ permitido: false, motivo: 'tope_canal_semana' });
    expect(evaluarTopeSemanal({ email: 1, whatsapp: 1 }, 'voice')).toEqual({ permitido: false, motivo: 'tope_total_semana' });
    expect(evaluarTopeSemanal({ mensajeria: 1, email: 1 }, 'voice')).toEqual({ permitido: false, motivo: 'tope_total_semana' });
    expect(evaluarTopeSemanal({ voice: 0, email: 0 }, 'voice')).toEqual({ permitido: true });
  });
});

describe('Decisión única del despachador', () => {
  const base = { telefonoE164: '+573001112233', zonaCliente: 'America/Bogota', canal: 'voice' as const, conteosSemana: {} };

  test('martes 10:00 sin contactos → contactar', () => {
    expect(decidirContactoLey2300({ ...base, ahora: bog('2026-09-29', '10:00') })).toEqual({ accion: 'contactar', zona: ZONA_COLOMBIA });
  });

  test('martes 20:00 → reprogramar al miércoles 07:00', () => {
    const d = decidirContactoLey2300({ ...base, ahora: bog('2026-09-29', '20:00') });
    expect(d).toMatchObject({ accion: 'reprogramar', motivo: 'fuera_de_horario' });
    expect(d.accion === 'reprogramar' && d.en.toISOString()).toBe(bog('2026-09-30', '07:00').toISOString());
  });

  test('ya hubo una llamada contestada esta semana → la primera ventana de la semana que viene', () => {
    const d = decidirContactoLey2300({ ...base, ahora: bog('2026-09-29', '10:00'), conteosSemana: { voice: 1 } });
    expect(d).toMatchObject({ accion: 'reprogramar', motivo: 'tope_canal_semana' });
    expect(d.accion === 'reprogramar' && d.en.toISOString()).toBe(bog('2026-10-05', '07:00').toISOString());
  });

  test('semana llena y el lunes siguiente es festivo → martes 07:00', () => {
    const d = decidirContactoLey2300({ ...base, ahora: bog('2026-10-07', '10:00'), conteosSemana: { email: 1, whatsapp: 1 } });
    expect(d).toMatchObject({ accion: 'reprogramar', motivo: 'tope_total_semana' });
    expect(d.accion === 'reprogramar' && d.en.toISOString()).toBe(bog('2026-10-13', '07:00').toISOString());
  });

  test('un +57 manda Colombia aunque la ficha diga otra zona', () => {
    expect(zonaHorariaDestinatario('+573001112233', 'Europe/Madrid')).toBe(ZONA_COLOMBIA);
    expect(zonaHorariaDestinatario('+34600111222', 'Europe/Madrid')).toBe('Europe/Madrid');
    expect(zonaHorariaDestinatario('+34600111222', 'Zona/Inventada')).toBe(ZONA_COLOMBIA);
    // 03:00 en Bogotá es 10:00 en Madrid: un +57 no se llama aunque la ficha diga Madrid.
    const d = decidirContactoLey2300({ ...base, zonaCliente: 'Europe/Madrid', ahora: bog('2026-09-29', '03:00') });
    expect(d.accion).toBe('reprogramar');
  });
});

describe('Exención por número de prueba interno (solo el tope semanal)', () => {
  const base = { telefonoE164: '+573000000000', zonaCliente: 'America/Bogota', canal: 'voice' as const };

  test('con la semana llena por el mismo canal y por el total, un número de prueba se contacta y la decisión lo marca', () => {
    for (const conteosSemana of [{ voice: 1 }, { voice: 3 }, { email: 1, whatsapp: 1 }]) {
      const d = decidirContactoLey2300({ ...base, ahora: bog('2026-09-29', '10:00'), conteosSemana, exencion: 'numero_prueba' });
      expect(d).toEqual({ accion: 'contactar', zona: ZONA_COLOMBIA, exencion: 'numero_prueba' });
    }
  });

  test('la franja horaria NO se exime: noche, domingo y festivo siguen reprogramando', () => {
    const casos: Array<[Date, string]> = [
      [bog('2026-09-29', '20:00'), bog('2026-09-30', '07:00').toISOString()], // martes 20:00 → miércoles 07:00
      [bog('2026-10-04', '10:00'), bog('2026-10-05', '07:00').toISOString()], // domingo → lunes 07:00
      [bog('2026-10-12', '10:00'), bog('2026-10-13', '07:00').toISOString()], // lunes festivo → martes 07:00
      [bog('2026-10-10', '15:30'), bog('2026-10-13', '07:00').toISOString()], // sábado 15:30 → martes (lunes festivo)
    ];
    for (const [ahora, esperado] of casos) {
      const d = decidirContactoLey2300({ ...base, ahora, conteosSemana: { voice: 1 }, exencion: 'numero_prueba' });
      expect(d).toMatchObject({ accion: 'reprogramar', motivo: 'fuera_de_horario', exencion: 'numero_prueba' });
      expect(d.accion === 'reprogramar' && d.en.toISOString()).toBe(esperado);
    }
  });

  test('sin exención (null o ausente) el tope semanal aplica igual que antes', () => {
    for (const exencion of [null, undefined]) {
      const d = decidirContactoLey2300({ ...base, ahora: bog('2026-09-29', '10:00'), conteosSemana: { voice: 1 }, exencion });
      expect(d).toMatchObject({ accion: 'reprogramar', motivo: 'tope_canal_semana' });
      expect('exencion' in d).toBe(false);
    }
  });
});
