/// <reference types="jest" />
/**
 * F10 — narrativa de la propuesta: secciones `situacion|problemas|solucion|roi|pricing`
 * construidas desde la oportunidad (cliente, discovery plano, objeciones, ROI, pricing),
 * fusión que respeta lo editado por el vendedor, validación del PATCH y render HTML escapado.
 */
import {
  buildProposalSections,
  coerceSections,
  hasEditedSections,
  mergeSections,
  validateSectionsInput,
  renderProposalHtml,
  SECTION_KEYS,
  type ProposalContext,
} from '@/lib/services/crm/proposalNarrative';

const ctx: ProposalContext = {
  opportunityName: 'Implementación POS',
  customerName: 'Cliente de prueba',
  discoveryFields: [
    { id: 'who_is', label: 'Quién es', type: 'text' },
    { id: 'problem', label: 'Problema principal', type: 'textarea' },
    { id: 'budget', label: 'Presupuesto', type: 'text' },
  ],
  discovery: { who_is: 'Gerente general', problem: 'Inventario en Excel con mermas del 15%', budget: '' },
  objections: [
    { title: 'Precio alto', recommended_response: 'Comparar con el costo de las mermas', resolved: true },
    { title: 'Ya tienen software', recommended_response: null, resolved: false },
  ],
  roi: { summary: 'Ahorro anual estimado: $ 3.600.000 · ROI 100 % · retorno en 12 meses', outputs: { roi_pct: 100 } },
  pricing: {
    currency: 'COP',
    lines: [
      { description: 'Plan Pro', qty: 12, unit_price: 500000, total: 6000000 },
      { description: 'Implementación', qty: 1, unit_price: 800000, total: 800000 },
    ],
    total: 6800000,
    billingCycleMonths: 12,
  },
};

describe('F10 proposalNarrative — buildProposalSections', () => {
  it('produce las cinco secciones en orden canónico con título y contenido', () => {
    const s = buildProposalSections(ctx);
    expect(Object.keys(s)).toEqual([...SECTION_KEYS]);
    for (const k of SECTION_KEYS) {
      expect(s[k].title.length).toBeGreaterThan(0);
      expect(s[k].content.length).toBeGreaterThan(0);
    }
  });

  it('la situación nombra al cliente y recoge las respuestas del discovery plano con su etiqueta', () => {
    const s = buildProposalSections(ctx);
    expect(s.situacion.content).toContain('Cliente de prueba');
    expect(s.situacion.content).toContain('Quién es: Gerente general');
    expect(s.situacion.content).not.toContain('Presupuesto'); // vacío → no se lista
  });

  it('los problemas salen del campo `problem` y de las objeciones sin resolver', () => {
    const s = buildProposalSections(ctx);
    expect(s.problemas.content).toContain('mermas del 15%');
    expect(s.problemas.content).toContain('Ya tienen software');
    expect(s.problemas.content).not.toContain('Precio alto'); // resuelta → va en solución
  });

  it('la solución recoge las respuestas recomendadas de las objeciones resueltas', () => {
    const s = buildProposalSections(ctx);
    expect(s.solucion.content).toContain('Comparar con el costo de las mermas');
  });

  it('ROI usa el resumen calculado; sin ROI deja un texto honesto de «pendiente»', () => {
    expect(buildProposalSections(ctx).roi.content).toContain('ROI 100 %');
    const sin = buildProposalSections({ ...ctx, roi: null });
    expect(sin.roi.content).toMatch(/pendiente/i);
  });

  it('pricing lleva las líneas, el total y el ciclo; sin líneas usa el monto de la oportunidad', () => {
    const s = buildProposalSections(ctx);
    expect(s.pricing.lines).toHaveLength(2);
    expect(s.pricing.total).toBe(6800000);
    expect(s.pricing.content).toContain('12 meses');
    const sinLineas = buildProposalSections({ ...ctx, pricing: { currency: 'COP', lines: [], total: 0, billingCycleMonths: null }, opportunityAmount: 950000 });
    expect(sinLineas.pricing.total).toBe(950000);
  });

  it('nunca lee discovery de otra oportunidad: solo usa el objeto que recibe', () => {
    const s = buildProposalSections({ ...ctx, discovery: {} });
    expect(s.situacion.content).not.toContain('Gerente general');
  });
});

describe('F10 proposalNarrative — mergeSections', () => {
  it('conserva el contenido editado por el vendedor y solo rellena lo vacío', () => {
    const generated = buildProposalSections(ctx);
    // r2: solo se conserva lo editado a mano (edited:true); lo generado (edited:false) se regenera
    const existing = { ...generated, situacion: { ...generated.situacion, content: 'Texto editado a mano', edited: true }, roi: { ...generated.roi, content: '' } };
    const merged = mergeSections(existing, generated);
    expect(merged.situacion.content).toBe('Texto editado a mano');
    expect(merged.roi.content).toBe(generated.roi.content);
    const notEdited = { ...generated, situacion: { ...generated.situacion, content: 'Texto generado antes', edited: false } };
    expect(mergeSections(notEdited, generated).situacion.content).toBe(generated.situacion.content);
    // la bandera sobrevive al viaje por la BD (coerceSections valida y reconstruye cada sección)
    const round = coerceSections(JSON.parse(JSON.stringify(existing)))!;
    expect(round.situacion.edited).toBe(true);
    expect(round.problemas.edited).toBe(false);
    expect(coerceSections({ ...existing, roi: { title: 'ROI', content: 'x', outputs: null } })!.roi.edited).toBeUndefined();
  });

  it('con `existing` null devuelve lo generado', () => {
    const generated = buildProposalSections(ctx);
    expect(mergeSections(null, generated)).toEqual(generated);
  });

  it('el pricing regenerado siempre gana (viene de los productos, no del texto)', () => {
    const generated = buildProposalSections(ctx);
    const existing = { ...generated, pricing: { ...generated.pricing, total: 1, lines: [] } };
    expect(mergeSections(existing, generated).pricing.total).toBe(6800000);
  });

  // de tester r1 (F2): «Regenerar» refresca de verdad lo no editado, conserva filas legado sin `edited`, force descarta ediciones
  it('F2 la sección NO editada se refresca con el discovery nuevo; una fila anterior a la bandera (sin `edited`) se conserva; force regenera todo; hasEditedSections', () => {
    const first = buildProposalSections(ctx);
    expect(first.situacion.edited).toBe(false);
    const edited = { ...first, situacion: { ...first.situacion, content: 'EDITADO', edited: true } };
    const regenerated = buildProposalSections({ ...ctx, discovery: { ...ctx.discovery, problem: 'nuevo dato relevante' } });
    expect(regenerated.problemas.content).not.toBe(first.problemas.content);
    const merged = mergeSections(edited, regenerated);
    expect(merged.situacion).toMatchObject({ content: 'EDITADO', edited: true });
    expect(merged.problemas.content).toBe(regenerated.problemas.content);
    const legacy = { ...first, problemas: { title: first.problemas.title, content: 'LEGADO' } };
    expect(mergeSections(legacy, regenerated).problemas.content).toBe('LEGADO');
    expect(mergeSections(edited, regenerated, { force: true }).situacion.content).toBe(regenerated.situacion.content);
    expect(hasEditedSections(edited)).toBe(true);
    expect(hasEditedSections(first)).toBe(false);
    expect(hasEditedSections(null)).toBe(false);
  });
});

describe('F10 proposalNarrative — validateSectionsInput (PATCH)', () => {
  it('acepta solo las claves conocidas con title/content string y recorta espacios', () => {
    const r = validateSectionsInput({ situacion: { title: ' Situación ', content: ' hola ' }, extra: { title: 'x', content: 'y' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sections.situacion).toEqual({ title: 'Situación', content: 'hola' });
      expect('extra' in r.sections).toBe(false);
    }
  });

  it('rechaza contenido que no sea string, títulos vacíos y textos de más de 20 000 caracteres', () => {
    expect(validateSectionsInput({ situacion: { title: 'a', content: 5 } }).ok).toBe(false);
    expect(validateSectionsInput({ situacion: { title: '', content: 'x' } }).ok).toBe(false);
    expect(validateSectionsInput({ situacion: { title: 'a', content: 'x'.repeat(20001) } }).ok).toBe(false);
    expect(validateSectionsInput(null).ok).toBe(false);
    expect(validateSectionsInput([]).ok).toBe(false);
  });

  it('en pricing valida las líneas: números finitos y no negativos', () => {
    const bad = validateSectionsInput({ pricing: { title: 'Inversión', content: 'x', lines: [{ description: 'a', qty: -1, unit_price: 1, total: 1 }], total: 1 } });
    expect(bad.ok).toBe(false);
    const good = validateSectionsInput({ pricing: { title: 'Inversión', content: 'x', lines: [{ description: 'a', qty: 1, unit_price: 2, total: 2 }], total: 2 } });
    expect(good.ok).toBe(true);
  });
});

describe('F10 proposalNarrative — renderProposalHtml', () => {
  it('escapa HTML del contenido (sin inyección) y respeta saltos de línea', () => {
    const generated = buildProposalSections(ctx);
    generated.situacion.content = '<script>alert(1)</script>\nlínea 2';
    const html = renderProposalHtml(generated, { number: 'COT-0001', customerName: 'A & B <Ltda>', organizationName: 'Org', validUntil: '2026-10-15', currency: 'COP' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;Ltda&gt;');
    expect(html).toContain('<br');
    expect(html).toContain('COT-0001');
  });

  it('incluye la tabla de precios con el total formateado en la moneda', () => {
    const html = renderProposalHtml(buildProposalSections(ctx), { number: 'COT-2', customerName: 'C', organizationName: 'O', validUntil: null, currency: 'COP' });
    expect(html).toContain('Plan Pro');
    expect(html).toMatch(/6[.,]800[.,]000/);
  });
});
