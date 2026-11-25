import { decisionCorreoOperativo, motivoSinCorreoOperativo, veredictoCorreoOperativo, veredictosCorreoOperativo } from '../cuentaCorreo';

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

/**
 * Base de mentira que anota cada consulta. `organizaciones` y `suscripciones` son las filas que
 * hay; `falla` hace que la consulta POR LOTE de esa tabla devuelva error.
 */
function baseAnotada(opts: {
  organizaciones: { id: number; status: string | null }[];
  suscripciones: { organization_id: number; status: string; trial_end?: string | null; current_period_end?: string | null; created_at: string }[];
  falla?: 'organizations' | 'subscriptions';
}) {
  const consultas: string[] = [];
  const db = {
    from(tabla: string) {
      const filtro: { en?: number[]; igual?: number } = {};
      const constructor = {
        select() { return constructor; },
        in(_columna: string, valores: number[]) { filtro.en = valores; return constructor; },
        eq(_columna: string, valor: number) { filtro.igual = valor; return constructor; },
        order() { return constructor; },
        limit() { return constructor; },
        // Una por una (`veredictoCorreoOperativo`).
        maybeSingle: async () => {
          consultas.push(`${tabla}:una`);
          if (tabla === 'organizations') {
            return { data: opts.organizaciones.find((o) => o.id === filtro.igual) ?? null, error: null };
          }
          const propias = opts.suscripciones
            .filter((s) => s.organization_id === filtro.igual)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { data: propias[0] ?? null, error: null };
        },
        // Por lote (`veredictosCorreoOperativo`): el constructor se espera directamente.
        then(resolver: (r: { data: unknown; error: { message: string } | null }) => void) {
          consultas.push(`${tabla}:lote`);
          if (opts.falla === tabla) return resolver({ data: null, error: { message: 'fallo simulado' } });
          const ids = filtro.en ?? [];
          if (tabla === 'organizations') return resolver({ data: opts.organizaciones.filter((o) => ids.includes(o.id)), error: null });
          const filas = opts.suscripciones
            .filter((s) => ids.includes(s.organization_id))
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return resolver({ data: filas, error: null });
        },
      };
      return constructor;
    },
  };
  return { db, consultas };
}

describe('veredictosCorreoOperativo (por lote)', () => {
  const organizaciones = [
    { id: 120, status: 'active' },
    { id: 121, status: 'active' },
    { id: 122, status: 'suspended' },
    { id: 123, status: 'active' },
  ];
  const suscripciones = [
    // 120: la más reciente está al día, aunque la anterior se canceló.
    { organization_id: 120, status: 'canceled', created_at: '2026-01-01T00:00:00Z' },
    { organization_id: 120, status: 'active', created_at: '2026-09-01T00:00:00Z' },
    // 121: prueba vencida.
    { organization_id: 121, status: 'trialing', trial_end: '2026-10-01T00:00:00Z', created_at: '2026-09-15T00:00:00Z' },
    // 122: suspendida, con suscripción activa.
    { organization_id: 122, status: 'active', created_at: '2026-09-01T00:00:00Z' },
    // 123: sin suscripción.
  ];

  test('dos consultas para todas las organizaciones y el mismo veredicto que una por una', async () => {
    const lote = baseAnotada({ organizaciones, suscripciones });
    const ids = [120, 121, 122, 123, 999];
    const veredictos = await veredictosCorreoOperativo(lote.db as never, ids, AHORA);
    expect(lote.consultas).toEqual(['organizations:lote', 'subscriptions:lote']);

    expect(veredictos.get(120)).toEqual({ enviar: true });
    expect(veredictos.get(121)).toEqual({ enviar: false, motivo: 'prueba_vencida' });
    expect(veredictos.get(122)).toEqual({ enviar: false, motivo: 'organizacion_suspendida' });
    expect(veredictos.get(123)).toEqual({ enviar: true });
    expect(veredictos.get(999)).toEqual({ enviar: false, motivo: 'organizacion_inexistente' });

    // Igual que preguntar una por una.
    for (const id of ids) {
      const una = baseAnotada({ organizaciones, suscripciones });
      await expect(veredictoCorreoOperativo(una.db as never, id, AHORA)).resolves.toEqual(veredictos.get(id));
    }
  });

  test('ids repetidos o inválidos no multiplican consultas; sin ids no consulta', async () => {
    const lote = baseAnotada({ organizaciones, suscripciones });
    const veredictos = await veredictosCorreoOperativo(lote.db as never, [120, 120, 121, 0, -3, Number.NaN], AHORA);
    expect(lote.consultas).toEqual(['organizations:lote', 'subscriptions:lote']);
    expect([...veredictos.keys()].sort()).toEqual([120, 121]);

    const vacio = baseAnotada({ organizaciones, suscripciones });
    expect((await veredictosCorreoOperativo(vacio.db as never, [], AHORA)).size).toBe(0);
    expect(vacio.consultas).toEqual([]);
  });

  test('si la consulta por lote falla, se decide una por una (nunca con datos a medias)', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const lote = baseAnotada({ organizaciones, suscripciones, falla: 'subscriptions' });
    const veredictos = await veredictosCorreoOperativo(lote.db as never, [120, 121], AHORA);
    expect(veredictos.get(120)).toEqual({ enviar: true });
    expect(veredictos.get(121)).toEqual({ enviar: false, motivo: 'prueba_vencida' });
    expect(lote.consultas.filter((c) => c.endsWith(':una'))).toHaveLength(4);
    error.mockRestore();
  });
});
