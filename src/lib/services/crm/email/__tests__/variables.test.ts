/// <reference types="jest" />
/**
 * Variables de plantilla (FASE-07 §4.2 / C23): rutas con punto, defaults,
 * filtros, escape HTML, triple llave prohibida, extracción de rutas.
 */
import { escapeHtml, extractVariablePaths, getPath, renderVariables, sampleContext, VARIABLE_CATALOG } from '../variables';

const ctx = sampleContext();

describe('renderVariables', () => {
  it('resuelve rutas con punto y reporta las usadas', () => {
    const r = renderVariables('Hola {{contact.first_name}} de {{contact.company_name}}', ctx);
    expect(r.out).toBe('Hola Carlos de Empresa S.A.S');
    expect(r.used).toEqual(['contact.first_name', 'contact.company_name']);
    expect(r.missing).toEqual([]);
  });

  it('aplica el default cuando la ruta está vacía y no lo reporta como faltante', () => {
    const r = renderVariables('Hola {{contact.nickname|amigo}}', ctx);
    expect(r.out).toBe('Hola amigo');
    expect(r.missing).toEqual([]);
  });

  it('reporta faltantes sin default y los deja vacíos', () => {
    const r = renderVariables('{{contact.nickname}}|{{custom.nope}}', ctx);
    expect(r.out).toBe('|');
    expect(r.missing).toEqual(['contact.nickname', 'custom.nope']);
  });

  it('escapa HTML por defecto y no cuando escapeHtml:false', () => {
    const evil = sampleContext({ contact: { first_name: '<img src=x onerror=alert(1)>' } });
    expect(renderVariables('{{contact.first_name}}', evil).out).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(renderVariables('{{contact.first_name}}', evil, { escapeHtml: false }).out).toBe('<img src=x onerror=alert(1)>');
  });

  it('prohíbe {{{raw}}} y el filtro raw', () => {
    const r = renderVariables('a{{{contact.first_name}}}b {{contact.first_name|raw}}', ctx);
    expect(r.out).toBe('ab ');
    expect(r.missing).toEqual(expect.arrayContaining(['raw:contact.first_name']));
  });

  it('formatea money con la moneda del contexto, date largo/corto, upper/lower', () => {
    expect(renderVariables('{{opportunity.amount|money}}', ctx).out).toMatch(/1\.200\.000/);
    expect(renderVariables('{{quote.total|money}}', sampleContext({ quote: { total: 10, currency: 'USD' } })).out).toMatch(/US\$|USD/);
    expect(renderVariables('{{opportunity.expected_close_date|date}}', ctx).out).toMatch(/octubre/i);
    expect(renderVariables('{{opportunity.expected_close_date|date:short}}', ctx).out).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(renderVariables('{{contact.first_name|upper}}', ctx).out).toBe('CARLOS');
    expect(renderVariables('{{contact.first_name|lower}}', ctx).out).toBe('carlos');
  });

  it('combina filtro y default en cualquier orden', () => {
    expect(renderVariables('{{custom.x|money|0}}', ctx).out).toMatch(/0/);
    expect(renderVariables('{{custom.x|hola|upper}}', ctx).out).toBe('HOLA');
  });

  it('deja literal las llaves que no son una ruta válida', () => {
    expect(renderVariables('css {{ }} y {{1abc}}', ctx).out).toBe('css {{ }} y {{1abc}}');
  });

  it('no permite acceder a __proto__/constructor', () => {
    expect(getPath(ctx, 'contact.__proto__')).toBeUndefined();
    expect(getPath(ctx, 'constructor.prototype')).toBeUndefined();
    expect(renderVariables('{{contact.constructor}}', ctx).missing).toEqual(['contact.constructor']);
  });
});

describe('helpers', () => {
  it('extractVariablePaths devuelve rutas únicas sin filtros', () => {
    expect(extractVariablePaths('{{a.b|money}} {{a.b}} {{ c.d | x }}')).toEqual(['a.b', 'c.d']);
  });
  it('escapeHtml cubre & < > " \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('el catálogo tiene ejemplos resolubles en el contexto de ejemplo (salvo el logo, opcional)', () => {
    for (const v of VARIABLE_CATALOG.filter((x) => x.path !== 'org.logo_url')) {
      const value = getPath(ctx, v.path);
      expect(value === undefined || value === null || value === '').toBe(false);
    }
  });
});
