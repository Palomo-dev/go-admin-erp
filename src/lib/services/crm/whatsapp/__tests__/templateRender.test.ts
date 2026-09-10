import { renderTemplateComponents, renderedToText, toTwilioContentVariables, validateHsm, toMetaComponents } from '../templateRender';
import { toPositionalBody } from '../templateProvider';
import type { HsmMeta } from '../types';

const ctx = { contact: { first_name: 'Laura', full_name: 'Laura Gómez' }, opportunity: { name: 'Plan Pro', amount: 1200000, currency: 'COP' }, org: { name: 'ACME' }, user: { first_name: 'Ana' }, custom: { fecha: '10 de septiembre' } };

function meta(over: Partial<HsmMeta> = {}): HsmMeta {
  return {
    provider: 'meta', status: 'APPROVED', category: 'utility', language: 'es', parameter_format: 'named',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Hola desde {{empresa}}' },
      { type: 'BODY', text: 'Hola {{nombre}}, tu reunión es el {{fecha}} para "{{oportunidad}}".' },
      { type: 'FOOTER', text: 'Responde BAJA para no recibir más' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmar' }, { type: 'URL', text: 'Ver', url: 'https://acme.co/p/{{token}}' }] },
    ],
    variable_map: { empresa: 'org.name', nombre: 'contact.first_name|cliente', fecha: 'custom.fecha', oportunidad: 'opportunity.name', token: 'custom.token' },
    ...over,
  };
}

describe('renderTemplateComponents (named params v26.0)', () => {
  test('resuelve header/body/button url con parameter_name y reporta faltantes', () => {
    const r = renderTemplateComponents({ name: 'confirmacion_reunion', body: '', meta: meta() }, ctx, {});
    expect(r.header).toBe('Hola desde ACME');
    expect(r.body).toBe('Hola Laura, tu reunión es el 10 de septiembre para "Plan Pro".');
    expect(r.missing).toEqual(['token']);
    expect(r.payload.name).toBe('confirmacion_reunion');
    expect(r.payload.language).toEqual({ code: 'es' });
    const comps = r.payload.components as Array<Record<string, unknown>>;
    expect(comps[0]).toEqual({ type: 'header', parameters: [{ type: 'text', parameter_name: 'empresa', text: 'ACME' }] });
    expect(comps[1]).toMatchObject({ type: 'body' });
    expect((comps[1].parameters as unknown[]).length).toBe(3);
    expect(comps[2]).toEqual({ type: 'button', sub_type: 'url', index: 1, parameters: [{ type: 'text', text: '' }] });
    expect(renderedToText(r)).toBe('Hola desde ACME\nHola Laura, tu reunión es el 10 de septiembre para "Plan Pro".\nResponde BAJA para no recibir más');
  });

  test('overrides del usuario tienen prioridad y default |cliente aplica cuando falta el nombre', () => {
    const r = renderTemplateComponents({ name: 't', body: '', meta: meta() }, { ...ctx, contact: {} }, { token: 'abc123', fecha: 'mañana' });
    expect(r.body).toContain('Hola cliente, tu reunión es el mañana');
    expect(r.missing).toEqual([]);
    expect(r.buttons[1].url).toBe('https://acme.co/p/abc123');
  });

  test('Twilio: cuerpo posicional y variables {{1}}..{{n}} por positional_map', () => {
    const { body, positional_map } = toPositionalBody('Hola {{nombre}}, el {{fecha}} ({{nombre}})');
    expect(body).toBe('Hola {{1}}, el {{2}} ({{1}})');
    expect(positional_map).toEqual(['nombre', 'fecha']);
    const r = renderTemplateComponents({ name: 't', body: '', meta: meta({ twilio: { content_sid: 'HX1', positional_map }, parameter_format: 'positional' }) }, ctx, { token: 'x' });
    expect(toTwilioContentVariables(r, positional_map)).toEqual({ '1': 'Laura', '2': '10 de septiembre' });
    const comps = r.payload.components as Array<{ parameters: Array<Record<string, unknown>> }>;
    expect(comps[0].parameters[0]).toEqual({ type: 'text', text: 'ACME' });
  });

  test('validateHsm rechaza nombre inválido, variables adyacentes/extremos y >3 botones', () => {
    expect(() => validateHsm({ name: 'Mal Nombre', components: [{ type: 'BODY', text: 'hola' }] })).toThrow(/minúsculas/);
    expect(() => validateHsm({ name: 'ok_1', components: [{ type: 'BODY', text: '{{a}} hola' }] })).toThrow(/empezar/);
    expect(() => validateHsm({ name: 'ok_1', components: [{ type: 'BODY', text: 'hola {{a}} {{b}} fin' }] })).toThrow(/adyacentes/);
    expect(() => validateHsm({ name: 'ok_1', components: [{ type: 'BODY', text: 'hola' }, { type: 'BUTTONS', buttons: [1, 2, 3, 4].map((i) => ({ type: 'QUICK_REPLY' as const, text: `b${i}` })) }] })).toThrow(/3 botones/);
    expect(() => validateHsm({ name: 'ok_1', components: [{ type: 'BODY', text: 'Hola {{nombre}}, gracias.' }] })).not.toThrow();
  });

  test('toMetaComponents añade example.body_text_named_params', () => {
    const out = toMetaComponents([{ type: 'BODY', text: 'Hola {{nombre}}, fin.' }], { nombre: 'contact.first_name' }) as Array<Record<string, unknown>>;
    expect(out[0]).toEqual({ type: 'BODY', text: 'Hola {{nombre}}, fin.', example: { body_text_named_params: [{ param_name: 'nombre', example: 'Laura' }] } });
  });
});
