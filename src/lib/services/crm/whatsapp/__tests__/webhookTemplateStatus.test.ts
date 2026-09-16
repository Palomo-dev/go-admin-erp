import { parseTemplateStatusUpdate, applyTemplateStatusUpdate, templateEventKey, templateEventTime, lastWebhookTimeKey } from '../webhookTemplateStatus';
import { isOptOutKeyword, isOptInKeyword, normalizeKeyword } from '../consent';
import { extractInboundText, inboundContentType } from '../inboundService';
import { makeSupabase, has, opArg } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));

describe('parseTemplateStatusUpdate (webhook message_template_status_update)', () => {
  test('APPROVED / REJECTED con reason', () => {
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'APPROVED', message_template_id: 123, message_template_name: 'x', message_template_language: 'es', reason: 'NONE' }))
      .toEqual({ event: 'APPROVED', message_template_id: '123', message_template_name: 'x', message_template_language: 'es', reason: null, quality_score: null, field: 'message_template_status_update' });
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'rejected', message_template_id: '1', reason: 'INVALID_FORMAT' })).toMatchObject({ event: 'REJECTED', reason: 'INVALID_FORMAT' });
  });
  test('evento desconocido o campo no soportado → null', () => {
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'FLAGGED' })).toBeNull();
    expect(parseTemplateStatusUpdate('messages', { event: 'APPROVED' })).toBeNull();
    expect(parseTemplateStatusUpdate('message_template_status_update', null)).toBeNull();
  });
  test('quality update', () => {
    expect(parseTemplateStatusUpdate('message_template_quality_update', { message_template_id: 9, new_quality_score: 'RED' })).toMatchObject({ quality_score: 'RED', field: 'message_template_quality_update' });
  });
  test('applyTemplateStatusUpdate: PAUSED actualiza status y pausa campañas sending', async () => {
    const updates: Record<string, unknown>[] = [];
    const { sb, calls } = makeSupabase({
      templates: (ops) => (has(ops, 'update') ? (updates.push({ templates: opArg(ops, 'update') }), { data: null }) : { data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'APPROVED' } }] }),
      campaigns: (ops) => (has(ops, 'update') ? (updates.push({ campaigns: opArg(ops, 'update') }), { data: null }) : { data: [{ id: 'camp-1', statistics: { state: null } }] }),
    });
    // F0-SEC r3 (H2): el 4.º argumento son las organizaciones autorizadas (dueñas del WABA que firmó).
    const r = await applyTemplateStatusUpdate({ event: 'PAUSED', message_template_id: '555', message_template_name: null, message_template_language: null, reason: 'LOW_QUALITY', quality_score: null, field: 'message_template_status_update' }, 'waba-1', sb, [7]);
    expect(r).toEqual({ updated: 1, paused_campaigns: 1 });
    const select = calls.find((c) => c.table === 'templates' && has(c.ops, 'select'))!;
    expect(has(select.ops, 'in', 'organization_id')).toBe(true);
    expect(opArg<number[]>(select.ops, 'in', 1)).toEqual([7]);
    expect((updates[0].templates as { metadata: Record<string, unknown> }).metadata).toMatchObject({ status: 'PAUSED', paused_reason: 'LOW_QUALITY' });
    expect((updates[1].campaigns as { statistics: Record<string, unknown> }).statistics).toMatchObject({ state: 'paused', template_paused: true });
  });
  test('applyTemplateStatusUpdate sin organizaciones autorizadas → no consulta nada (fail-closed, H2)', async () => {
    const { sb, calls } = makeSupabase({});
    const update = { event: 'DISABLED' as const, message_template_id: '555', message_template_name: null, message_template_language: null, reason: null, quality_score: null, field: 'message_template_status_update' as const };
    await expect(applyTemplateStatusUpdate(update, 'waba-1', sb, [])).resolves.toEqual({ updated: 0, paused_campaigns: 0 });
    await expect(applyTemplateStatusUpdate(update, 'waba-1', sb, [0, -1, 1.5, NaN])).resolves.toEqual({ updated: 0, paused_campaigns: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe('F0-pulido · replay fuera de orden (entry.time monotónico por campo)', () => {
  const status = (event: 'PAUSED' | 'APPROVED' | 'DISABLED', extra: Partial<Parameters<typeof applyTemplateStatusUpdate>[0]> = {}) =>
    ({ event, message_template_id: '555', message_template_name: null, message_template_language: null, reason: null, quality_score: null, field: 'message_template_status_update' as const, ...extra });
  const key = (event: 'PAUSED' | 'APPROVED' | 'DISABLED', time: number) => templateEventKey({ field: 'message_template_status_update', event }, time);

  test('templateEventTime lee el time de la clave; null sin clave o con clave rara', () => {
    expect(templateEventTime(key('PAUSED', 1700000000))).toBe(1700000000);
    expect(templateEventTime('message_template_status_update:PAUSED:0')).toBe(0);
    expect(templateEventTime(null)).toBeNull();
    expect(templateEventTime('message_template_status_update:PAUSED')).toBeNull();
    expect(templateEventTime('message_template_status_update:PAUSED:1e9')).toBeNull();
    expect(templateEventTime('x:' + '9'.repeat(17))).toBeNull();
  });

  test('lastWebhookTimeKey: una columna por campo', () => {
    expect(lastWebhookTimeKey('message_template_status_update')).toBe('last_webhook_time');
    expect(lastWebhookTimeKey('message_template_quality_update')).toBe('last_quality_webhook_time');
  });

  test('PAUSED@t1 con last_webhook_time = t2 > t1 → se ignora (updated 0, sin update ni campañas) y se registra', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, calls } = makeSupabase({
      templates: () => ({ data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'APPROVED', last_webhook_event: key('APPROVED', 1700000060), last_webhook_time: 1700000060 } }] }),
      campaigns: () => ({ data: [{ id: 'camp-1', statistics: { state: null } }] }),
    });
    const r = await applyTemplateStatusUpdate(status('PAUSED'), 'waba-1', sb, [7], key('PAUSED', 1700000000));
    expect(r).toEqual({ updated: 0, paused_campaigns: 0 });
    expect(calls.filter((c) => has(c.ops, 'update'))).toHaveLength(0);
    expect(calls.filter((c) => c.table === 'campaigns')).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fuera de orden'), expect.objectContaining({ templateId: 'tpl-1', organizationId: 7, eventTime: 1700000000, lastApplied: 1700000060 }));
    warn.mockRestore();
  });

  test('time igual al último aplicado con OTRA clave → se aplica; time mayor → se aplica y avanza last_webhook_time', async () => {
    const updates: Record<string, unknown>[] = [];
    const mk = (lastTime: number) => makeSupabase({
      templates: (ops) => (has(ops, 'update') ? (updates.push(opArg(ops, 'update') as Record<string, unknown>), { data: null }) : { data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'PAUSED', last_webhook_event: key('PAUSED', lastTime), last_webhook_time: lastTime } }] }),
      campaigns: () => ({ data: [] }),
    });
    await expect(applyTemplateStatusUpdate(status('APPROVED'), 'waba-1', mk(1700000000).sb, [7], key('APPROVED', 1700000000))).resolves.toEqual({ updated: 1, paused_campaigns: 0 });
    expect((updates[0].metadata as Record<string, unknown>).last_webhook_time).toBe(1700000000);
    await expect(applyTemplateStatusUpdate(status('DISABLED'), 'waba-1', mk(1700000000).sb, [7], key('DISABLED', 1700000120))).resolves.toEqual({ updated: 1, paused_campaigns: 0 });
    expect((updates[1].metadata as Record<string, unknown>).last_webhook_time).toBe(1700000120);
  });

  test('last_webhook_time basura ("ayer", -1, objeto) no bloquea: se aplica y se sobreescribe con un entero; sin clave no se escribe', async () => {
    for (const junk of ['ayer', -1, { $gt: 0 }, null]) {
      const updates: Record<string, unknown>[] = [];
      const { sb } = makeSupabase({
        templates: (ops) => (has(ops, 'update') ? (updates.push(opArg(ops, 'update') as Record<string, unknown>), { data: null }) : { data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'APPROVED', last_webhook_time: junk } }] }),
        campaigns: () => ({ data: [] }),
      });
      await expect(applyTemplateStatusUpdate(status('PAUSED'), 'waba-1', sb, [7], key('PAUSED', 5))).resolves.toEqual({ updated: 1, paused_campaigns: 0 });
      expect((updates[0].metadata as Record<string, unknown>).last_webhook_time).toBe(5);
    }
    const updates: Record<string, unknown>[] = [];
    const { sb } = makeSupabase({
      templates: (ops) => (has(ops, 'update') ? (updates.push(opArg(ops, 'update') as Record<string, unknown>), { data: null }) : { data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'APPROVED', last_webhook_time: 1700000060 } }] }),
      campaigns: () => ({ data: [] }),
    });
    await expect(applyTemplateStatusUpdate(status('PAUSED'), 'waba-1', sb, [7], null)).resolves.toEqual({ updated: 1, paused_campaigns: 0 });
    expect((updates[0].metadata as Record<string, unknown>).last_webhook_time).toBe(1700000060);
    expect((updates[0].metadata as Record<string, unknown>).status).toBe('PAUSED');
  });
});

describe('opt-out keywords', () => {
  test.each(['  baja ', 'Cancelar.', 'NO MÁS', 'no mas', 'STOP', 'salir'])('%s → opt-out', (t) => expect(isOptOutKeyword(t)).toBe(true));
  test('frases largas no cuentan', () => {
    expect(isOptOutKeyword('no quiero bajar')).toBe(false);
    expect(isOptOutKeyword('stop me gustaría más info')).toBe(false);
  });
  test('opt-in y normalización', () => {
    expect(isOptInKeyword('Alta')).toBe(true);
    expect(normalizeKeyword('¡Cancélar!')).toBe('CANCELAR');
  });
});

describe('inbound helpers', () => {
  test('extractInboundText y content_type válidos para el CHECK', () => {
    expect(extractInboundText({ type: 'text', text: { body: 'hola' } })).toBe('hola');
    expect(extractInboundText({ type: 'image', image: {} })).toBe('[Imagen]');
    expect(extractInboundText({ type: 'document', document: { filename: 'a.pdf' } })).toBe('[Documento a.pdf]');
    expect(extractInboundText({ type: 'interactive', interactive: { button_reply: { title: 'Confirmar' } } })).toBe('Confirmar');
    expect(inboundContentType('sticker')).toBe('image');
    expect(inboundContentType('document')).toBe('file');
    expect(inboundContentType('interactive')).toBe('text');
  });
});
