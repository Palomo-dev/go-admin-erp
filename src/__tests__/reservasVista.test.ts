/**
 * Lógica pura de las pantallas de Reservas de mesas (Figma 445:194862,
 * 1699:864094 y 1801:169066) y del aviso al cliente (1807:25).
 */
import {
  claveOrigen,
  esSolicitudWeb,
  estadoFila,
  horaCorta,
  kpisAgenda,
  kpisLista,
  minutos,
  nombreCorto,
  nombreTurno,
  ordenarPorHora,
  ordenarReservas,
  pagina,
  rangoHorario,
} from '@/components/pos/reservas-mesas/reservasVista';
import { codigoReserva, correoAvisoReserva, tipoAviso, type DatosAviso } from '@/lib/services/restaurante/avisoReserva';
import type { RestaurantReservation } from '@/components/pos/reservas-mesas/reservasMesasService';

function reserva(p: Partial<RestaurantReservation>): RestaurantReservation {
  return {
    id: 'r',
    customer_name: 'Ana Pérez',
    party_size: 2,
    reservation_date: '2026-10-09',
    reservation_time: '19:30:00',
    status: 'confirmed',
    source: 'admin',
    created_at: '2026-10-09T00:00:00Z',
    ...p,
  } as RestaurantReservation;
}

describe('formatos', () => {
  it('horaCorta usa a. m./p. m. y «m.» al mediodía', () => {
    expect(horaCorta('19:30:00')).toBe('7:30 p. m.');
    expect(horaCorta('08:05')).toBe('8:05 a. m.');
    expect(horaCorta('12:00')).toBe('12:00 m.');
    expect(horaCorta('12:30')).toBe('12:30 p. m.');
    expect(horaCorta('00:15')).toBe('12:15 a. m.');
    expect(horaCorta('raro')).toBe('raro');
  });

  it('nombreCorto deja nombre + inicial', () => {
    expect(nombreCorto('Marcela  ospina Ruiz')).toBe('Marcela O.');
    expect(nombreCorto('Cher')).toBe('Cher');
    expect(nombreCorto('')).toBe('');
  });

  it('nombreTurno por la hora de inicio', () => {
    expect(nombreTurno('07:00')).toBe('desayuno');
    expect(nombreTurno('12:00')).toBe('almuerzo');
    expect(nombreTurno('15:59')).toBe('almuerzo');
    expect(nombreTurno('16:00')).toBe('cena');
  });

  it('minutos de HH:MM', () => {
    expect(minutos('19:30')).toBe(1170);
    expect(minutos('00:00')).toBe(0);
  });
});

describe('origen y solicitud', () => {
  it('admin se muestra como equipo', () => {
    expect(claveOrigen('website')).toBe('web');
    expect(claveOrigen('phone')).toBe('telefono');
    expect(claveOrigen('whatsapp')).toBe('whatsapp');
    expect(claveOrigen('admin')).toBe('equipo');
  });

  it('solicitud = pendiente + web', () => {
    expect(esSolicitudWeb({ status: 'pending', source: 'website' })).toBe(true);
    expect(esSolicitudWeb({ status: 'pending', source: 'phone' })).toBe(false);
    expect(esSolicitudWeb({ status: 'confirmed', source: 'website' })).toBe(false);
  });
});

describe('KPI', () => {
  const ahora = new Date('2026-10-09T20:00:00Z');
  const dia = [
    reserva({ status: 'pending', source: 'website', party_size: 6, created_at: '2026-10-09T19:52:00Z' }),
    reserva({ status: 'pending', source: 'website', party_size: 2, created_at: '2026-10-09T18:00:00Z' }),
    reserva({ status: 'confirmed', party_size: 4 }),
    reserva({ status: 'seated', party_size: 3 }),
    reserva({ status: 'no_show', party_size: 2 }),
    reserva({ status: 'cancelled', party_size: 5 }),
  ];

  it('kpisAgenda cuenta por estado y minutos desde la última solicitud web', () => {
    const k = kpisAgenda(dia, ahora);
    expect(k.porConfirmar).toBe(2);
    expect(k.ultimaWebHaceMin).toBe(8);
    expect(k.confirmadas).toBe(1);
    expect(k.personasConfirmadas).toBe(4);
    expect(k.sentadas).toBe(1);
    expect(k.personasSentadas).toBe(3);
    expect(k.noShow).toBe(1);
    // Vivas: pendientes, confirmadas, sentadas (y completadas); no cuentan canceladas ni no-show.
    expect(k.reservas).toBe(4);
    expect(k.personas).toBe(15);
  });

  it('kpisAgenda sin solicitudes web deja la hora en null', () => {
    expect(kpisAgenda([reserva({ status: 'pending', source: 'phone' })], ahora).ultimaWebHaceMin).toBeNull();
  });

  it('kpisLista: comensales sin canceladas y % de no-show con un decimal', () => {
    const k = kpisLista(dia);
    expect(k.total).toBe(6);
    expect(k.comensales).toBe(17);
    expect(k.solicitudesWeb).toBe(2);
    expect(k.confirmadas).toBe(1);
    expect(k.sentadas).toBe(1);
    expect(k.noShow).toBe(1);
    expect(k.canceladas).toBe(1);
    expect(k.pctNoShow).toBe(16.7);
    expect(kpisLista([]).pctNoShow).toBe(0);
  });
});

describe('estadoFila', () => {
  it('distingue solicitud web de pendiente', () => {
    expect(estadoFila({ status: 'pending', source: 'website' }).clave).toBe('solicitud');
    expect(estadoFila({ status: 'pending', source: 'phone' }).clave).toBe('pendiente');
  });

  it('confirmada tarde lleva los minutos', () => {
    expect(estadoFila({ status: 'confirmed', source: 'admin' }, { retrasoMin: 15 })).toEqual({
      clave: 'confirmadaTarde',
      tono: 'aviso',
      valores: { minutos: 15 },
    });
    expect(estadoFila({ status: 'confirmed', source: 'admin' }, { retrasoMin: 0 }).clave).toBe('confirmada');
  });

  it('completada con venta y no-show reincidente', () => {
    expect(estadoFila({ status: 'completed', source: 'admin' }, { venta: 'V-1042' }).valores.venta).toBe('V-1042');
    expect(estadoFila({ status: 'completed', source: 'admin' }).clave).toBe('completada');
    expect(estadoFila({ status: 'no_show', source: 'admin' }, { inasistencias: 2 })).toEqual({
      clave: 'noShowReincidente',
      tono: 'peligro',
      valores: { vez: 2 },
    });
    expect(estadoFila({ status: 'no_show', source: 'admin' }, { inasistencias: 1 }).clave).toBe('noShow');
    expect(estadoFila({ status: 'cancelled', source: 'admin' }).clave).toBe('cancelada');
  });
});

describe('orden y página', () => {
  it('ordena por fecha, hora y nombre', () => {
    const filas = [
      reserva({ id: 'c', reservation_time: '20:00:00', customer_name: 'Beto' }),
      reserva({ id: 'b', reservation_time: '19:30:00', customer_name: 'Zoe' }),
      reserva({ id: 'a', reservation_time: '19:30:00', customer_name: 'Álvaro' }),
      reserva({ id: 'd', reservation_date: '2026-10-08', reservation_time: '21:00:00' }),
    ];
    expect(ordenarPorHora(filas).map((r) => r.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('pagina es 1-based', () => {
    const n = Array.from({ length: 25 }, (_, i) => i);
    expect(pagina(n, 1, 10)).toEqual(n.slice(0, 10));
    expect(pagina(n, 3, 10)).toEqual([20, 21, 22, 23, 24]);
    expect(pagina(n, 0, 10)).toEqual(n.slice(0, 10));
  });
});

describe('aviso al cliente', () => {
  const datos: DatosAviso = {
    id: '7q2kabcd-0000-0000-0000-000000000000',
    customer_name: '<b>Ana</b> Pérez',
    party_size: 4,
    reservation_date: '2026-10-09',
    reservation_time: '19:30:00',
    status: 'confirmed',
    cancellation_reason: null,
    mesa: 'Mesa 7',
    sede: 'Sede Norte',
    sede_direccion: 'Calle 1 # 2-3',
    organizacion: 'Restaurante de prueba',
    politica: 'Tolerancia de 15 min.',
  };

  it('tipoAviso solo para confirmada o cancelada', () => {
    expect(tipoAviso('confirmed')).toBe('confirmada');
    expect(tipoAviso('cancelled')).toBe('rechazada');
    expect(tipoAviso('pending')).toBeNull();
  });

  it('codigoReserva = 8 primeros del uuid en mayúscula', () => {
    expect(codigoReserva(datos.id)).toBe('7Q2KABCD');
  });

  it('confirmada: asunto con código, botón de gestión y HTML escapado', () => {
    const c = correoAvisoReserva(datos, 'confirmada', { enlaceGestion: 'https://x.test/reserva/mesa/t', enlaceReservar: null, otraHora: null });
    expect(c.asunto).toBe('Tu mesa en Sede Norte está confirmada · 7Q2KABCD');
    expect(c.html).toContain('Consultar o cancelar');
    expect(c.html).toContain('7:30 p. m.');
    expect(c.html).toContain('Tolerancia de 15 min.');
    expect(c.html).not.toContain('<b>Ana</b>');
    expect(c.html).toContain('&lt;b&gt;Ana');
    expect(c.texto).toContain('Consultar o cancelar: https://x.test/reserva/mesa/t');
  });

  it('rechazada: motivo, otra hora y sin política', () => {
    const c = correoAvisoReserva(
      { ...datos, status: 'cancelled', cancellation_reason: 'Evento privado' },
      'rechazada',
      { enlaceGestion: null, enlaceReservar: 'https://x.test/reservas', otraHora: '21:00' },
    );
    expect(c.asunto).toBe('No pudimos confirmar tu reserva en Sede Norte');
    expect(c.texto).toContain('Motivo: Evento privado.');
    expect(c.texto).toContain('¿Te sirve a las 9:00 p. m.?');
    expect(c.texto).toContain('Reservar de nuevo: https://x.test/reservas');
    expect(c.texto).not.toContain('Política');
  });
});

describe('rangoHorario (configuración en el celular)', () => {
  const dias = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const porDefecto = [{ from: '12:00', to: '15:00' }];

  it('cuenta días abiertos y toma la primera apertura y el último cierre', () => {
    const r = rangoHorario(
      { mon: [], tue: [{ from: '12:00', to: '15:00' }, { from: '19:00', to: '23:30' }], sun: [{ from: '11:30', to: '16:00' }] },
      dias,
      porDefecto,
    );
    // lunes cerrado; martes y domingo propios; mié–sáb con el horario por defecto.
    expect(r).toEqual({ dias: 6, desde: '11:30', hasta: '23:30' });
  });

  it('todo cerrado', () => {
    const cerrado = Object.fromEntries(dias.map((d) => [d, []]));
    expect(rangoHorario(cerrado, dias, porDefecto)).toEqual({ dias: 0, desde: null, hasta: null });
  });
});

describe('ordenarReservas', () => {
  const filas = [
    reserva({ id: 'a', reservation_time: '19:00:00', customer_name: 'Zoe', party_size: 2, status: 'seated' }),
    reserva({ id: 'b', reservation_time: '20:00:00', customer_name: 'Ana', party_size: 6, status: 'pending', source: 'website' }),
    reserva({ id: 'c', reservation_time: '21:00:00', customer_name: 'Beto', party_size: 4, status: 'confirmed' }),
  ];
  it('sin orden = orden del día', () => {
    expect(ordenarReservas(filas, null).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('por cliente y por personas descendente', () => {
    expect(ordenarReservas(filas, { campo: 'cliente', direccion: 'asc' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(ordenarReservas(filas, { campo: 'personas', direccion: 'desc' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('por estado sigue el ciclo de la reserva', () => {
    expect(ordenarReservas(filas, { campo: 'estado', direccion: 'asc' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});
