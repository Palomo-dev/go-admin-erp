import {
  AJUSTES_RESERVA_RECOMENDADOS,
  COLUMNAS_AJUSTES,
  COLUMNAS_CARTA_QR,
  COLUMNAS_DEPOSITO_D7,
  gruposAQuitar,
  guardarAjustesReserva,
  resolverAjustesSede,
  validarAjustesReserva,
} from '@/lib/services/restaurantBookingSettingsService';

describe('ajuste de la sede «las rondas de la Carta QR entran solas»', () => {
  it('apagado por defecto y aceptado por el DTO anterior (sin la clave)', () => {
    const { qr_rounds_auto_confirm: _q, ...sinClave } = AJUSTES_RESERVA_RECOMENDADOS;
    const r = validarAjustesReserva(sinClave);
    expect(r.ok && r.ajustes.qr_rounds_auto_confirm).toBe(false);
    expect(COLUMNAS_AJUSTES).toContain('qr_rounds_auto_confirm');
  });

  it('la sede gana y la organización respalda', () => {
    const filas = [
      { branch_id: null, qr_rounds_auto_confirm: true },
      { branch_id: 115, qr_rounds_auto_confirm: false },
    ];
    expect(resolverAjustesSede(filas, 115).efectiva.qr_rounds_auto_confirm).toBe(false);
    expect(resolverAjustesSede(filas, 200).efectiva.qr_rounds_auto_confirm).toBe(true);
    expect(resolverAjustesSede([], 115).efectiva.qr_rounds_auto_confirm).toBe(false);
  });

  it('tras un 42703 quita solo el grupo que la base nombra; si no nombra ninguno, todos', () => {
    const grupos = [COLUMNAS_DEPOSITO_D7, COLUMNAS_CARTA_QR];
    expect(gruposAQuitar('column qr_rounds_auto_confirm does not exist', grupos)).toEqual([COLUMNAS_CARTA_QR]);
    expect(gruposAQuitar('column deposit_refund_hours does not exist', grupos)).toEqual([COLUMNAS_DEPOSITO_D7]);
    expect(gruposAQuitar('otra cosa', grupos)).toEqual(grupos);
  });

  it('guardar sin la migración de la Carta QR conserva las columnas del depósito', async () => {
    const escrituras: Array<Record<string, unknown>> = [];
    let intento = 0;
    const hacer = () => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) c[m] = () => c;
      c.upsert = (fila: Record<string, unknown>) => {
        escrituras.push(fila);
        return c;
      };
      c.maybeSingle = async () => ({ data: { id: 115 }, error: null });
      c.single = async () =>
        intento++ === 0
          ? { data: null, error: { code: '42703', message: 'column restaurant_booking_settings.qr_rounds_auto_confirm does not exist' } }
          : { data: { branch_id: 115, ...AJUSTES_RESERVA_RECOMENDADOS }, error: null };
      return c;
    };
    await guardarAjustesReserva({ from: hacer } as never, 140, 115, { ...AJUSTES_RESERVA_RECOMENDADOS, qr_rounds_auto_confirm: true });
    expect(escrituras).toHaveLength(2);
    expect(escrituras[0]).toHaveProperty('qr_rounds_auto_confirm', true);
    expect(escrituras[1]).not.toHaveProperty('qr_rounds_auto_confirm');
    expect(escrituras[1]).toHaveProperty('deposit_refundable');
  });
});
