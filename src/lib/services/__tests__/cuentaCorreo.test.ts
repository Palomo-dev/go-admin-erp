import { decisionCorreoOperativo, motivoSinCorreoOperativo, veredictoCorreoOperativo } from '../cuentaCorreo';

const AHORA = new Date('2026-10-05T12:00:00.000Z');

describe('correo operativo según la cuenta', () => {
  test('una cuenta al día o en prueba vigente sí recibe', () => {
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'active' }, AHORA)).toBeNull();
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'inactive', estadoSuscripcion: 'active' }, AHORA)).toBeNull();
    expect(motivoSinCorreoOperativo({
      estadoOrganizacion: 'active',
      estadoSuscripcion: 'trialing',
      finPrueba: '2026-10-20T00:00:00.000Z',
    }, AHORA)).toBeNull();
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active' }, AHORA)).toBeNull();
  });

  test('suspendida, congelada, eliminada o con la prueba vencida no recibe', () => {
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'suspended', estadoSuscripcion: 'active' }, AHORA)).toBe('organizacion_suspendida');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'frozen' }, AHORA)).toBe('organizacion_congelada');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'deleted' }, AHORA)).toBe('organizacion_eliminada');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'trial_expired' }, AHORA)).toBe('prueba_vencida');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'otro' }, AHORA)).toBe('organizacion_congelada');
    expect(motivoSinCorreoOperativo({
      estadoOrganizacion: 'active',
      estadoSuscripcion: 'trialing',
      finPrueba: '2026-10-01T00:00:00.000Z',
    }, AHORA)).toBe('prueba_vencida');
    expect(motivoSinCorreoOperativo({
      estadoOrganizacion: 'active',
      estadoSuscripcion: 'trialing',
      finPeriodo: '2026-10-01T00:00:00.000Z',
    }, AHORA)).toBe('prueba_vencida');
  });

  test('cancelada, impaga, incompleta o pausada no recibe; la activa con prueba vieja sí', () => {
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'canceled' }, AHORA)).toBe('suscripcion_cancelada');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'past_due' }, AHORA)).toBe('pago_pendiente');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'unpaid' }, AHORA)).toBe('pago_pendiente');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'incomplete_expired' }, AHORA)).toBe('suscripcion_incompleta');
    expect(motivoSinCorreoOperativo({ estadoOrganizacion: 'active', estadoSuscripcion: 'paused' }, AHORA)).toBe('suscripcion_pausada');
    expect(motivoSinCorreoOperativo({
      estadoOrganizacion: 'active',
      estadoSuscripcion: 'active',
      finPrueba: '2020-01-01T00:00:00.000Z',
    }, AHORA)).toBeNull();
  });

  test('una consulta fallida se reintenta y una cuenta cerrada se omite', () => {
    expect(decisionCorreoOperativo({ enviar: true })).toBe('enviar');
    expect(decisionCorreoOperativo({ enviar: false, motivo: 'consulta' })).toBe('reintentar');
    expect(decisionCorreoOperativo({ enviar: false, motivo: 'prueba_vencida' })).toBe('omitir');
  });

  test('si no se puede leer la organización, no envía en este pase', async () => {
    const db = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: null, error: { message: 'timeout' } }),
        };
      },
    };
    await expect(veredictoCorreoOperativo(db as never, 120, AHORA)).resolves.toEqual({ enviar: false, motivo: 'consulta' });
  });

  test('sin fila de suscripción, una organización activa sí recibe', async () => {
    const db = {
      from(tabla: string) {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle: async () => (
            tabla === 'organizations'
              ? { data: { status: 'active' }, error: null }
              : { data: null, error: null }
          ),
        };
      },
    };
    await expect(veredictoCorreoOperativo(db as never, 120, AHORA)).resolves.toEqual({ enviar: true });
  });
});
