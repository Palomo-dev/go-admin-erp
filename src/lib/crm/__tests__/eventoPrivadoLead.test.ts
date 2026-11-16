/**
 * Evento privado de un lead del sitio (Figma 1951:941568): lectura de
 * `customers.metadata.lead.capturas` (migraciones D6 y D6b).
 */
import { eventoPrivadoDeLead, fechaInicialReserva, instanteCaptura, personasInicialesReserva, solicitudSinAtender } from '../eventoPrivadoLead';

const CAPTURA = {
  form: 'private_events',
  branch_id: 115,
  details: { event_type: 'Cumpleaños', event_date: '2026-10-24', guests: 25, venue: 'Terraza', budget_label: '$80.000 a $120.000', message: 'Queremos la terraza y torta propia.' },
  captured_at: '2026-10-06T15:12:00+00',
};

describe('eventoPrivadoDeLead', () => {
  test('lee la última captura del formulario de eventos privados', () => {
    const otra = { form: 'contact', captured_at: '2026-10-07T10:00:00+00' };
    const vieja = { ...CAPTURA, branch_id: 7, details: { event_type: 'Boda' } };
    expect(eventoPrivadoDeLead({ capturas: [vieja, CAPTURA, otra] })).toEqual({
      branchId: 115,
      tipo: 'Cumpleaños',
      fecha: '2026-10-24',
      invitados: 25,
      presupuestoTexto: '$80.000 a $120.000',
      presupuestoNumero: null,
      lugar: 'Terraza',
      mensaje: 'Queremos la terraza y torta propia.',
      capturadoEn: '2026-10-06T15:12:00+00:00',
    });
  });

  test('lead sin evento: null (la tarjeta no aparece)', () => {
    expect(eventoPrivadoDeLead(null)).toBeNull();
    expect(eventoPrivadoDeLead({})).toBeNull();
    expect(eventoPrivadoDeLead({ capturas: 'x' })).toBeNull();
    expect(eventoPrivadoDeLead({ ultima_captura_web: { form: 'private_events' } })).toBeNull();
    expect(eventoPrivadoDeLead({ capturas: [{ form: 'contact', branch_id: 3 }] })).toBeNull();
  });

  test('sin sede: branchId null', () => {
    const e = eventoPrivadoDeLead({ capturas: [{ form: 'private_events', details: { guests: 10 } }] });
    expect(e?.branchId).toBeNull();
    expect(e?.invitados).toBe(10);
  });

  test('descarta lo que no cuadra (metadata no confiable)', () => {
    const e = eventoPrivadoDeLead({
      capturas: [{ form: 'private_events', branch_id: '115; drop', details: { event_date: '2026-02-31', guests: 99999, budget_per_person: -5, event_type: { x: 1 }, message: '   ' }, captured_at: 'ayer' }],
    });
    expect(e).toEqual({ branchId: null, tipo: null, fecha: null, invitados: null, presupuestoTexto: null, presupuestoNumero: null, lugar: null, mensaje: null, capturadoEn: null });
  });

  test('presupuesto numérico de formularios con un valor único', () => {
    expect(eventoPrivadoDeLead({ capturas: [{ form: 'private_events', details: { budget_per_person: 50000 } }] })?.presupuestoNumero).toBe(50000);
  });

  test('capturas viejas sin `form` pero con datos del evento cuentan', () => {
    expect(eventoPrivadoDeLead({ capturas: [{ details: { event_type: 'Grado' } }] })?.tipo).toBe('Grado');
  });
});

describe('ayudas', () => {
  test('instanteCaptura completa el offset de solo horas', () => {
    expect(instanteCaptura('2026-10-06T10:12:00-05')).toBe('2026-10-06T10:12:00-05:00');
    expect(Date.parse(instanteCaptura('2026-10-06T10:12:00-05') as string)).toBe(Date.parse('2026-10-06T15:12:00Z'));
    expect(instanteCaptura('2026-10-06T10:12:00+05:30')).toBe('2026-10-06T10:12:00+05:30');
    expect(instanteCaptura(null)).toBeNull();
  });

  test('«Nuevo» mientras nadie contacte después de la solicitud', () => {
    expect(solicitudSinAtender('2026-10-06T15:12:00+00:00', null)).toBe(true);
    expect(solicitudSinAtender('2026-10-06T15:12:00+00:00', '2026-10-01T00:00:00Z')).toBe(true);
    expect(solicitudSinAtender('2026-10-06T15:12:00+00:00', '2026-10-07T00:00:00Z')).toBe(false);
    expect(solicitudSinAtender(null, null)).toBe(false);
  });

  test('la reserva precarga la fecha del evento, nunca una pasada', () => {
    expect(fechaInicialReserva('2026-10-24', '2026-10-06')).toBe('2026-10-24');
    expect(fechaInicialReserva('2026-10-01', '2026-10-06')).toBe('2026-10-06');
    expect(fechaInicialReserva(null, '2026-10-06')).toBe('2026-10-06');
  });

  test('personas: los invitados, dentro de 1..200', () => {
    expect(personasInicialesReserva(25)).toBe(25);
    expect(personasInicialesReserva(800)).toBe(200);
    expect(personasInicialesReserva(null)).toBe(2);
  });
});
