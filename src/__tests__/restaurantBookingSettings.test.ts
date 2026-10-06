/**
 * Paquete D (restaurante): configuración de reservas por sede
 * (`restaurant_booking_settings`). Valida el DTO, la regla sede → organización
 * → defecto (la misma que `fn_ajustes_reserva`) y que «Configurar con valores
 * recomendados» guarde `is_enabled = true` de forma explícita.
 */
import {
  AJUSTES_RESERVA_POR_DEFECTO,
  AJUSTES_RESERVA_RECOMENDADOS,
  DIAS_SERVICIO,
  guardarAjustesReserva,
  resolverAjustesSede,
  validarAjustesReserva,
  turnosDeFecha,
  TURNOS_POR_DEFECTO,
} from '@/lib/services/restaurantBookingSettingsService';

describe('validarAjustesReserva', () => {
  it('acepta los valores recomendados y los deja activos', () => {
    const r = validarAjustesReserva(AJUSTES_RESERVA_RECOMENDADOS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ajustes.is_enabled).toBe(true);
      expect(Object.keys(r.ajustes.service_hours).sort()).toEqual([...DIAS_SERVICIO].sort());
    }
  });

  it('el DEFAULT de la tabla deja las reservas apagadas: por eso «recomendados» lo pone explícito', () => {
    expect(AJUSTES_RESERVA_POR_DEFECTO.is_enabled).toBe(false);
    expect(AJUSTES_RESERVA_RECOMENDADOS.is_enabled).toBe(true);
  });

  it('rechaza mínimo mayor que máximo, turnos invertidos, horas mal escritas y claves de día desconocidas', () => {
    const r = validarAjustesReserva({
      ...AJUSTES_RESERVA_RECOMENDADOS,
      min_party_size: 10,
      max_party_size: 4,
      service_hours: { mon: [{ from: '22:00', to: '12:00' }], tue: [{ from: '7:00', to: '12:00' }] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.min_party_size).toBe('MIN_MAYOR_QUE_MAX');
      expect(r.errores['service_hours.mon.0']).toBe('TURNO_INVERTIDO');
      expect(r.errores['service_hours.tue.0.from']).toBe('HORA_INVALIDA');
    }
    expect(validarAjustesReserva({ ...AJUSTES_RESERVA_RECOMENDADOS, service_hours: { lunes: [] } }).ok).toBe(false);
  });

  it('exige monto con depósito, zonas si el cliente elige zona y correos válidos', () => {
    const r = validarAjustesReserva({
      ...AJUSTES_RESERVA_RECOMENDADOS,
      require_deposit: true,
      deposit_amount: null,
      allow_zone_choice: true,
      allowed_zones: [],
      notify_emails: ['no-es-correo'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.deposit_amount).toBe('DEPOSITO_REQUERIDO');
      expect(r.errores.allowed_zones).toBe('ZONAS_REQUERIDAS');
      expect(r.errores['notify_emails.0']).toBe('CORREO_INVALIDO');
    }
  });

  it('normaliza: sin elección de zona no guarda zonas, sin depósito no guarda monto, correos en minúscula y sin repetir', () => {
    const r = validarAjustesReserva({
      ...AJUSTES_RESERVA_RECOMENDADOS,
      allow_zone_choice: false,
      allowed_zones: ['Terraza'],
      require_deposit: false,
      deposit_amount: 5000,
      notify_emails: ['Equipo@Ejemplo.com', 'equipo@ejemplo.com'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ajustes.allowed_zones).toBeNull();
      expect(r.ajustes.deposit_amount).toBeNull();
      expect(r.ajustes.notify_emails).toEqual(['equipo@ejemplo.com']);
    }
  });

  it('no acepta columnas ajenas (organization_id viene de la sesión, nunca del body)', () => {
    expect(validarAjustesReserva({ ...AJUSTES_RESERVA_RECOMENDADOS, organization_id: 999 }).ok).toBe(false);
  });
});

describe('resolverAjustesSede (misma regla que fn_ajustes_reserva)', () => {
  const org = { branch_id: null, is_enabled: true, max_party_size: 20 };
  const sede = { branch_id: 115, is_enabled: false, max_party_size: 6 };

  it('la fila de la sede gana', () => {
    const r = resolverAjustesSede([org, sede], 115);
    expect(r.origen).toBe('sede');
    expect(r.efectiva.max_party_size).toBe(6);
    expect(r.efectiva.is_enabled).toBe(false);
  });

  it('sin fila propia, la de la organización hace de respaldo', () => {
    const r = resolverAjustesSede([org], 115);
    expect(r.origen).toBe('organizacion');
    expect(r.propia).toBeNull();
    expect(r.efectiva.max_party_size).toBe(20);
  });

  it('sin ninguna fila, los valores por defecto de la base', () => {
    const r = resolverAjustesSede([], 115);
    expect(r.origen).toBe('defecto');
    expect(r.efectiva).toEqual(AJUSTES_RESERVA_POR_DEFECTO);
  });
});

describe('guardarAjustesReserva', () => {
  function cliente() {
    const llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = [];
    const hacer = (tabla: string) => {
      const c: Record<string, unknown> = {};
      const registrar = (metodo: string) => (...args: unknown[]) => {
        llamadas.push({ tabla, metodo, args });
        return c;
      };
      for (const m of ['select', 'eq', 'is', 'upsert', 'update', 'insert']) c[m] = registrar(m);
      c.maybeSingle = async () => ({ data: tabla === 'branches' ? { id: 115 } : null, error: null });
      c.single = async () => ({ data: { branch_id: 115, ...AJUSTES_RESERVA_RECOMENDADOS }, error: null });
      return c;
    };
    return { llamadas, supabase: { from: (t: string) => hacer(t) } };
  }

  it('con sede hace upsert sobre (organization_id, branch_id) con la organización de la sesión', async () => {
    const { llamadas, supabase } = cliente();
    await guardarAjustesReserva(supabase as never, 140, 115, AJUSTES_RESERVA_RECOMENDADOS);
    const upsert = llamadas.find((l) => l.metodo === 'upsert');
    expect(upsert?.tabla).toBe('restaurant_booking_settings');
    expect(upsert?.args[0]).toMatchObject({ organization_id: 140, branch_id: 115, is_enabled: true });
    expect(upsert?.args[1]).toEqual({ onConflict: 'organization_id,branch_id' });
  });

  it('sin sede no usa onConflict (el UNIQUE no deduplica NULL): busca e inserta', async () => {
    const { llamadas, supabase } = cliente();
    await guardarAjustesReserva(supabase as never, 140, null, AJUSTES_RESERVA_RECOMENDADOS);
    expect(llamadas.some((l) => l.metodo === 'upsert')).toBe(false);
    expect(llamadas.find((l) => l.metodo === 'insert')?.args[0]).toMatchObject({ organization_id: 140, branch_id: null });
  });
});

describe('intervalo de franja y turnos del día (revisión 2026-10-07)', () => {
  it('solo admite múltiplos de 15 (la rejilla de fn_restaurant_slot_valido)', () => {
    const base = { ...AJUSTES_RESERVA_RECOMENDADOS };
    expect(validarAjustesReserva({ ...base, slot_interval_minutes: 45 }).ok).toBe(true);
    const r = validarAjustesReserva({ ...base, slot_interval_minutes: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.slot_interval_minutes).toBe('INTERVALO_INVALIDO');
  });
  it('turnosDeFecha: el día con clave usa sus turnos (vacío = cerrado) y si no, los por defecto', () => {
    // 2026-10-10 es sábado.
    expect(turnosDeFecha({ sat: [{ from: '08:00', to: '11:00' }] }, '2026-10-10')).toEqual([{ from: '08:00', to: '11:00' }]);
    expect(turnosDeFecha({ sat: [] }, '2026-10-10')).toEqual([]);
    expect(turnosDeFecha({}, '2026-10-10')).toEqual(TURNOS_POR_DEFECTO);
    expect(turnosDeFecha(null, '2026-10-11')).toEqual(TURNOS_POR_DEFECTO);
  });
});
