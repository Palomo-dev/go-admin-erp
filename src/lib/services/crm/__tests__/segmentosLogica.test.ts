import { normalizarFiltroSegmento, coincideSegmento, prefiltroIgualdadSegmento, type ClienteSegmento } from '../segmentosLogica';
import { CONDITION_FIELD_LABELS, CONDITION_OPERATOR_LABELS } from '../automation/conditionsI18n';
import { CAMPOS_SEGMENTO } from '../segmentosLogica';
const now = new Date('2026-10-01T12:00:00Z');
const customer: ClienteSegmento = { full_name: 'Fixture', email: null, phone: null, can_email: true, can_voice: true, can_whatsapp: true, email_bounced: false, id: 'c1', city: 'Ciudad de prueba', tags: ['vip'], health_score: 55,
  last_purchase_at: '2026-09-28T12:00:00Z', purchased_category_ids: [8], consent: {} };
const matches = (input: unknown, c = customer) => coincideSegmento(normalizarFiltroSegmento(input), c, 120, now);
test('OR de grupos AND: compra reciente y categoría, o ciudad y etiqueta', () => {
  const rules = { op: 'or', rules: [
    { op: 'and', rules: [{ field: 'customer.last_purchase_at', operator: 'within_days', value: 7 },
      { field: 'customer.purchased_category_ids', operator: 'contains', value: 8 }] },
    { op: 'and', rules: [{ field: 'city', operator: 'equals', value: 'Otra ciudad' },
      { field: 'tags', operator: 'contains', value: 'vip' }] },
  ] };
  expect(matches(rules)).toBe(true);
  expect(matches(rules, { ...customer, last_purchase_at: null })).toBe(false);
  expect(matches(rules, { ...customer, last_purchase_at: null, city: 'Otra ciudad' })).toBe(true);
});
test.each([null, {}, 'x', { op: 'xor', rules: [] }, [{ field: 'country', operator: 'equals', value: 'x' }],
  [{ field: 'city', operator: 'inventado', value: 'x' }], { op: 'and', rules: [], unexpected: 1 },
  [{ field: 'email', operator: 'contains', value: { injection: true } }]])('rechaza filtros malformados sin convertirlos en toda la base: %j', input => {
  expect(() => normalizarFiltroSegmento(input)).toThrow();
});
test('etiquetas vacías y rango heredado conservan su significado', () => {
  expect(matches([{ field: 'tags', operator: 'is_empty' }], { ...customer, tags: [] })).toBe(true);
  expect(matches([{ field: 'tags', operator: 'is_empty' }])).toBe(false);
  expect(matches([{ field: 'health_score', operator: 'between', value: [50, 60] }])).toBe(true);
  expect(matches([{ field: 'health_score', operator: 'between', value: [10, 20] }])).toBe(false);
});
test('lista explícita vacía incluye toda la base; límites impiden árboles ilimitados', () => {
  expect(matches([])).toBe(true);
  expect(() => normalizarFiltroSegmento(Array.from({ length: 51 }, () => ({ field: 'city', operator: 'equals', value: 'x' })))).toThrow();
  let root: unknown = { field: 'city', operator: 'equals', value: 'x' };
  for (let i = 0; i < 8; i++) root = { op: 'and', rules: [root] };
  expect(() => normalizarFiltroSegmento(root)).toThrow();
});
test('los campos y los nuevos operadores tienen etiquetas en los cuatro idiomas', () => {
  for (const locale of ['es', 'en', 'fr', 'pt'] as const) {
    for (const field of CAMPOS_SEGMENTO) expect(CONDITION_FIELD_LABELS[locale][field]).toBeTruthy();
    for (const op of ['starts_with', 'ends_with']) expect(CONDITION_OPERATOR_LABELS[locale][op]).toBeTruthy();
  }
});

test('la preselección nunca restringe una alternativa OR ni un valor nulo', () => {
  const rule = { field: 'customer.city', operator: 'eq', value: 'Fixture' };
  expect(prefiltroIgualdadSegmento(normalizarFiltroSegmento({ op: 'or', rules: [rule, { ...rule, value: 'Otro' }] }))).toBeNull();
  expect(prefiltroIgualdadSegmento(normalizarFiltroSegmento({ op: 'and', rules: [{ op: 'or', rules: [rule, { ...rule, value: 'Otro' }] }, { field: 'status', operator: 'equals', value: 'active' }] }))).toEqual({ field: 'status', value: 'active' });
  expect(prefiltroIgualdadSegmento(normalizarFiltroSegmento([{ ...rule, value: null }]))).toBeNull();
});
