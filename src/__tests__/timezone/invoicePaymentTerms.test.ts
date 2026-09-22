import { calcularEstadoVencimientoFactura } from '@/components/finanzas/facturas-venta/id/paymentTerms';

const BOGOTA = 'America/Bogota';

describe('calcularEstadoVencimientoFactura', () => {
  const base = {
    issueDate: '2026-09-19T05:00:00.000Z',
    dueDate: '2026-10-19T05:00:00.000Z',
    paymentTerms: 30,
    timezone: BOGOTA,
  };

  it('calcula los dias restantes desde due_date, no desde un string de presentacion', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        today: '2026-09-19',
      }),
    ).toBe('30 días restantes');
  });

  it('indica que vence hoy cuando hoy coincide con due_date', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        today: '2026-10-19',
      }),
    ).toBe('vence hoy');
  });

  it('indica cuantos dias lleva vencida cuando hoy es posterior a due_date', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        today: '2026-10-21',
      }),
    ).toBe('vencido hace 2 días');
  });

  it('usa issue_date + payment_terms solo cuando due_date es nulo', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        dueDate: null,
        today: '2026-09-19',
      }),
    ).toBe('30 días restantes');
  });

  it('prioriza due_date cuando difiere de issue_date + payment_terms', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        dueDate: '2026-10-25T05:00:00.000Z',
        today: '2026-09-19',
      }),
    ).toBe('36 días restantes');
  });

  it('convierte due_date al dia calendario de la organizacion', () => {
    expect(
      calcularEstadoVencimientoFactura({
        ...base,
        // Este instante ya es 20/10 en UTC, pero todavia 19/10 en Bogota.
        dueDate: '2026-10-20T02:00:00.000Z',
        today: '2026-10-19',
      }),
    ).toBe('vence hoy');
  });
});
