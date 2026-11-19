/**
 * Prueba gratis vigente (metadata gratis_365_*): el webhook de Stripe no la degrada, no le acorta
 * fechas ni la cancela, y deja registro de lo que ignoró. Puro, sin base ni red.
 */
import {
  ESTADOS_DEGRADANTES,
  MAX_EVENTOS_IGNORADOS,
  avisoEventoIgnorado,
  estaProtegida,
  marcaGratis,
  protegerGratisVigente,
  type CambioDeStripe,
  type SuscripcionLocal,
} from '../protegerGratisVigente';

const AHORA = new Date('2026-11-18T12:00:00.000Z');
const TRIAL_LOCAL = '2027-11-16T05:00:00.000Z';
const PERIODO_LOCAL = '2027-11-16T05:00:00.000Z';
/** Lo que manda Stripe cuando vence SU prueba: fechas de hoy. */
const CORTA = '2026-11-18T05:00:00.000Z';

const local = (o: Partial<SuscripcionLocal> = {}): SuscripcionLocal => ({
  status: 'trialing',
  trial_end: TRIAL_LOCAL,
  current_period_end: PERIODO_LOCAL,
  metadata: { gratis_365_2026_11_16: { por: 'soporte', dias: 365 } },
  ...o,
});
const stripe = (o: Partial<CambioDeStripe> = {}): CambioDeStripe => ({ action: 'updated', status: 'past_due', trial_end: CORTA, current_period_end: CORTA, ...o });

describe('1 · marca vigente + past_due', () => {
  test('queda trialing, sin acortar fechas, y queda el registro', () => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe(), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, ignorado: true, status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: PERIODO_LOCAL });
    if (!d.protegida) throw new Error('debía protegerse');
    expect(d.metadata.webhook_ignorados).toEqual([
      { en: AHORA.toISOString(), action: 'updated', stripe_status: 'past_due', stripe_trial_end: CORTA, stripe_current_period_end: CORTA },
    ]);
    expect(d.bloqueaCancelacion).toBe(false);
  });

  test('el aviso lleva org, suscripción, acción, estado de Stripe y las fechas omitidas', () => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe(), ahora: AHORA });
    if (!d.protegida) throw new Error('debía protegerse');
    const aviso = avisoEventoIgnorado(120, 'sub_123', d);
    for (const parte of ['org 120', 'sub_123', 'action=updated', 'stripe_status=past_due', `stripe_trial_end=${CORTA}`, `stripe_current_period_end=${CORTA}`, `se deja ${TRIAL_LOCAL}`]) {
      expect(aviso).toContain(parte);
    }
  });
});

describe('2 · los demás estados degradantes y el borrado', () => {
  test.each(['unpaid', 'canceled', 'incomplete', 'incomplete_expired'])('%s: no se aplica, queda trialing con sus fechas', (estado) => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe({ status: estado }), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, ignorado: true, status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: PERIODO_LOCAL });
  });

  test('canceled y deleted: además no se cancela ni se desactivan módulos', () => {
    const cancelada = protegerGratisVigente({ local: local(), stripe: stripe({ status: 'canceled' }), ahora: AHORA });
    const borrada = protegerGratisVigente({ local: local(), stripe: stripe({ action: 'deleted', status: 'active' }), ahora: AHORA });
    expect(cancelada).toMatchObject({ protegida: true, bloqueaCancelacion: true, status: 'trialing' });
    expect(borrada).toMatchObject({ protegida: true, ignorado: true, bloqueaCancelacion: true, status: 'trialing' });
    if (!borrada.protegida) throw new Error('debía protegerse');
    expect(borrada.evento).toMatchObject({ action: 'deleted', stripe_status: 'active' });
  });

  test('la lista de degradantes es la acordada', () => {
    expect([...ESTADOS_DEGRADANTES].sort()).toEqual(['canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid']);
  });

  test('si la fila local ya quedó degradada (cuenta congelada), vuelve a trialing', () => {
    const d = protegerGratisVigente({ local: local({ status: 'past_due' }), stripe: stripe(), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, status: 'trialing' });
  });
});

describe('3 · fechas más cortas en Stripe', () => {
  test('con un estado no degradante igual se conservan las locales y se registra', () => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe({ status: 'trialing' }), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, ignorado: true, status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: PERIODO_LOCAL });
  });

  test('Stripe sin fechas (null) tampoco las borra', () => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe({ status: 'trialing', trial_end: null, current_period_end: null }), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, trial_end: TRIAL_LOCAL, current_period_end: PERIODO_LOCAL });
  });

  test('fechas iguales o posteriores sí se aplican y no hay nada que registrar', () => {
    const mas = '2028-01-04T05:00:00.000Z';
    const d = protegerGratisVigente({ local: local(), stripe: stripe({ status: 'trialing', trial_end: mas, current_period_end: TRIAL_LOCAL }), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, ignorado: false, trial_end: mas, current_period_end: TRIAL_LOCAL, evento: null });
    if (!d.protegida) throw new Error('debía protegerse');
    expect(d.metadata).not.toHaveProperty('webhook_ignorados');
  });
});

describe('4 · active con un periodo más corto', () => {
  test('pasa a active sin acortar fechas', () => {
    const d = protegerGratisVigente({ local: local(), stripe: stripe({ status: 'active', trial_end: null, current_period_end: '2026-12-18T05:00:00.000Z' }), ahora: AHORA });
    expect(d).toMatchObject({ protegida: true, status: 'active', trial_end: TRIAL_LOCAL, current_period_end: PERIODO_LOCAL, bloqueaCancelacion: false });
  });
});

describe('5 · sin protección: el webhook sigue como siempre', () => {
  test('sin marca', () => {
    expect(protegerGratisVigente({ local: local({ metadata: { otra: true } }), stripe: stripe(), ahora: AHORA })).toEqual({ protegida: false });
    expect(protegerGratisVigente({ local: local({ metadata: null }), stripe: stripe(), ahora: AHORA })).toEqual({ protegida: false });
  });
  test('marca con el trial_end local vencido o vacío', () => {
    expect(protegerGratisVigente({ local: local({ trial_end: '2026-11-17T05:00:00.000Z' }), stripe: stripe(), ahora: AHORA })).toEqual({ protegida: false });
    expect(protegerGratisVigente({ local: local({ trial_end: null }), stripe: stripe(), ahora: AHORA })).toEqual({ protegida: false });
  });
  test('sin fila local', () => {
    expect(protegerGratisVigente({ local: null, stripe: stripe(), ahora: AHORA })).toEqual({ protegida: false });
  });
});

describe('6 · cualquier clave gratis_365_* protege', () => {
  test('otra fecha en la clave', () => {
    const meta = { gratis_365_2027_01_04: true };
    expect(marcaGratis(meta)).toBe('gratis_365_2027_01_04');
    expect(estaProtegida(local({ metadata: meta }), AHORA)).toBe(true);
    expect(protegerGratisVigente({ local: local({ metadata: meta }), stripe: stripe(), ahora: AHORA })).toMatchObject({ protegida: true, status: 'trialing' });
  });
  test('una clave parecida que no empieza por gratis_365_ no protege', () => {
    expect(marcaGratis({ prueba_gratis_365: true, gratis_30_x: true })).toBeNull();
  });
});

describe('7 · el registro no borra la marca', () => {
  test('la marca y lo demás de la metadata siguen; los eventos se acumulan', () => {
    const meta = { gratis_365_2026_11_16: { por: 'soporte' }, origen: 'manual', webhook_ignorados: [{ en: 'antes', action: 'updated', stripe_status: 'past_due', stripe_trial_end: null, stripe_current_period_end: null }] };
    const d = protegerGratisVigente({ local: local({ metadata: meta }), stripe: stripe({ status: 'unpaid' }), ahora: AHORA });
    if (!d.protegida) throw new Error('debía protegerse');
    expect(d.metadata.gratis_365_2026_11_16).toEqual({ por: 'soporte' });
    expect(d.metadata.origen).toBe('manual');
    expect(d.metadata.webhook_ignorados).toHaveLength(2);
    expect((d.metadata.webhook_ignorados as Array<{ stripe_status: string }>)[1].stripe_status).toBe('unpaid');
    // La entrada no se muta.
    expect(meta.webhook_ignorados).toHaveLength(1);
  });

  test('el registro tiene tope: se quedan los más recientes', () => {
    const muchos = Array.from({ length: MAX_EVENTOS_IGNORADOS }, (_, i) => ({ en: String(i) }));
    const d = protegerGratisVigente({ local: local({ metadata: { gratis_365_x: true, webhook_ignorados: muchos } }), stripe: stripe(), ahora: AHORA });
    if (!d.protegida) throw new Error('debía protegerse');
    const lista = d.metadata.webhook_ignorados as Array<{ en: string }>;
    expect(lista).toHaveLength(MAX_EVENTOS_IGNORADOS);
    expect(lista[0].en).toBe('1');
    expect(lista[lista.length - 1].en).toBe(AHORA.toISOString());
    expect(d.metadata.gratis_365_x).toBe(true);
  });
});
