import { parseTemplateStatusUpdate, applyTemplateStatusUpdate } from '../webhookTemplateStatus';
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
    const { sb } = makeSupabase({
      templates: (ops) => (has(ops, 'update') ? (updates.push({ templates: opArg(ops, 'update') }), { data: null }) : { data: [{ id: 'tpl-1', organization_id: 7, metadata: { status: 'APPROVED' } }] }),
      campaigns: (ops) => (has(ops, 'update') ? (updates.push({ campaigns: opArg(ops, 'update') }), { data: null }) : { data: [{ id: 'camp-1', statistics: { state: null } }] }),
    });
    const r = await applyTemplateStatusUpdate({ event: 'PAUSED', message_template_id: '555', message_template_name: null, message_template_language: null, reason: 'LOW_QUALITY', quality_score: null, field: 'message_template_status_update' }, 'waba-1', sb);
    expect(r).toEqual({ updated: 1, paused_campaigns: 1 });
    expect((updates[0].templates as { metadata: Record<string, unknown> }).metadata).toMatchObject({ status: 'PAUSED', paused_reason: 'LOW_QUALITY' });
    expect((updates[1].campaigns as { statistics: Record<string, unknown> }).statistics).toMatchObject({ state: 'paused', template_paused: true });
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
