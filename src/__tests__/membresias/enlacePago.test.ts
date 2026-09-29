// ============================================================
// Enlace de pago de una membresía (C5, §12.2): cuándo se ofrece y con qué motivo se deshabilita.
// Hoy ningún riel de enlace paga la factura por fn_registrar_pago (el camino que activa la
// membresía), así que con pasarela el motivo es `pago_no_activa_membresia`; el día que exista,
// basta con `rielQueActiva`.
// ============================================================
import { RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA, evaluarEnlacePago, pasarelasEnLinea } from '@/lib/services/membresias/enlacePago';

describe('enlace de pago', () => {
  it('sin pasarela en línea conectada: sin_pasarela (los conectores que no cobran en línea no cuentan)', () => {
    expect(evaluarEnlacePago({ estadoMembresia: 'active', pasarelasConectadas: ['booking_ota', 'bold_pos', null] })).toEqual({
      disponible: false,
      motivo: 'sin_pasarela',
      pasarelas: [],
    });
  });

  it('con pasarela: deshabilitado mientras su cobro no active la membresía', () => {
    expect(RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA).toBe(false);
    expect(evaluarEnlacePago({ estadoMembresia: 'past_due', pasarelasConectadas: ['wompi_co', 'wompi_co', 'stripe_payments'] })).toEqual({
      disponible: false,
      motivo: 'pago_no_activa_membresia',
      pasarelas: ['wompi_co', 'stripe_payments'],
    });
  });

  it('cuando exista un riel que active la membresía, se ofrece', () => {
    expect(evaluarEnlacePago({ estadoMembresia: 'active', pasarelasConectadas: ['bold_link'], rielQueActiva: true })).toEqual({
      disponible: true,
      motivo: null,
      pasarelas: ['bold_link'],
    });
  });

  it('membresía cancelada: nunca', () => {
    expect(evaluarEnlacePago({ estadoMembresia: 'cancelled', pasarelasConectadas: ['wompi_co'], rielQueActiva: true }).motivo).toBe('membresia_cancelada');
  });

  it('orden estable de pasarelas', () => {
    expect(pasarelasEnLinea(['paypal_checkout', 'wompi_co'])).toEqual(['wompi_co', 'paypal_checkout']);
  });
});
