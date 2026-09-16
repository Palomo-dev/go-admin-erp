/// <reference types="jest" />
/**
 * F2 — modelo puro de la biblioteca de objeciones (`objectionModel.ts`).
 * Filtros, transformación formulario ↔ payload y validación: escrito antes
 * que el código (brief §7.6) y visto en rojo.
 */
import {
  EMPTY_FILTERS,
  OBJECTION_CATEGORIES,
  categoryLabel,
  countActiveFilters,
  filterObjections,
  formToPayload,
  joinList,
  normalizeObjection,
  objectionToForm,
  splitList,
  validateForm,
  focusAfterResolve,
  type ObjectionFormState,
} from '../objectionModel';
import type { Objection } from '../objectionService';

const base = (extra: Partial<Objection>): Objection => ({
  id: 'o-1',
  organization_id: 120,
  title: 'Es muy caro',
  category: 'precio',
  detection_signals: ['caro', 'presupuesto'],
  recommended_response: 'Reencuadrar en valor.',
  discovery_questions: ['¿Con qué lo comparas?'],
  related_case_studies: null,
  vertical_id: null,
  is_active: true,
  sort_order: 10,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...extra,
});

const LIST: Objection[] = [
  base({}),
  base({ id: 'o-2', title: 'Ya tenemos un proveedor', category: 'competencia', detection_signals: ['ya tenemos', 'proveedor actual'], recommended_response: 'Proponer piloto.', sort_order: 20 }),
  base({ id: 'o-3', title: 'No es el momento', category: 'timing', detection_signals: ['más adelante'], recommended_response: null, is_active: false, sort_order: 30 }),
];

describe('catálogo de categorías', () => {
  it('cubre las siete categorías sembradas más «otra», con etiqueta humana', () => {
    const values = OBJECTION_CATEGORIES.map((c) => c.value);
    expect(values).toEqual(['precio', 'competencia', 'timing', 'decisor', 'funcionalidad', 'confianza', 'implementación', 'otra']);
    expect(categoryLabel('implementación')).toBe('Implementación');
    expect(categoryLabel('timing')).toBe('Momento');
    // Una categoría desconocida (escrita a mano en la BD) no rompe: se muestra tal cual.
    expect(categoryLabel('logística')).toBe('logística');
  });
});

describe('filterObjections', () => {
  it('sin filtros devuelve todo en el orden recibido', () => {
    expect(filterObjections(LIST, EMPTY_FILTERS).map((o) => o.id)).toEqual(['o-1', 'o-2', 'o-3']);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('busca en título, señales, respuesta y etiqueta de categoría, sin acentos ni mayúsculas', () => {
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, query: 'PROVEEDOR' }).map((o) => o.id)).toEqual(['o-2']);
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, query: 'mas adelante' }).map((o) => o.id)).toEqual(['o-3']);
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, query: 'reencuadrar' }).map((o) => o.id)).toEqual(['o-1']);
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, query: 'momento' }).map((o) => o.id)).toEqual(['o-3']);
  });

  it('filtra por categoría y por estado, y cuenta los filtros activos', () => {
    const f = { query: '', category: 'timing', status: 'inactive' as const };
    expect(filterObjections(LIST, f).map((o) => o.id)).toEqual(['o-3']);
    expect(filterObjections(LIST, { ...f, status: 'active' })).toEqual([]);
    expect(countActiveFilters(f)).toBe(2);
    expect(countActiveFilters({ ...EMPTY_FILTERS, query: ' ' })).toBe(0);
  });

  it('cada estado por separado excluye al otro (M5: quitar la rama «inactive» sobrevivía)', () => {
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, status: 'inactive' }).map((o) => o.id)).toEqual(['o-3']);
    expect(filterObjections(LIST, { ...EMPTY_FILTERS, status: 'active' }).map((o) => o.id)).toEqual(['o-1', 'o-2']);
  });
});

describe('splitList / joinList', () => {
  it('separa por saltos de línea, recorta espacios y descarta vacíos y duplicados', () => {
    expect(splitList(' caro \n\nprecio\ncaro\n  ')).toEqual(['caro', 'precio']);
    expect(splitList('')).toEqual([]);
    expect(joinList(['a', 'b'])).toBe('a\nb');
    expect(joinList(null)).toBe('');
  });
});

describe('objectionToForm / formToPayload', () => {
  it('una objeción nueva empieza vacía y activa', () => {
    expect(objectionToForm(null)).toEqual({
      title: '',
      category: '',
      signalsText: '',
      recommended_response: '',
      questionsText: '',
      is_active: true,
    });
  });

  it('el formulario es la inversa exacta de la objeción', () => {
    const form = objectionToForm(LIST[0]);
    expect(form).toEqual({
      title: 'Es muy caro',
      category: 'precio',
      signalsText: 'caro\npresupuesto',
      recommended_response: 'Reencuadrar en valor.',
      questionsText: '¿Con qué lo comparas?',
      is_active: true,
    });
    expect(formToPayload(form)).toEqual({
      title: 'Es muy caro',
      category: 'precio',
      detection_signals: ['caro', 'presupuesto'],
      recommended_response: 'Reencuadrar en valor.',
      discovery_questions: ['¿Con qué lo comparas?'],
      is_active: true,
    });
  });

  it('recorta el título y convierte la respuesta vacía en null', () => {
    const form: ObjectionFormState = { ...objectionToForm(null), title: '  Es caro  ', category: 'precio', recommended_response: '   ' };
    expect(formToPayload(form)).toEqual({
      title: 'Es caro',
      category: 'precio',
      detection_signals: [],
      recommended_response: null,
      discovery_questions: [],
      is_active: true,
    });
  });
});

describe('validateForm', () => {
  it('exige título y categoría, en ese orden (foco al primer error)', () => {
    expect(validateForm(objectionToForm(null))).toEqual([
      { field: 'title', message: 'Escribe el título de la objeción.' },
      { field: 'category', message: 'Elige una categoría.' },
    ]);
  });

  it('acota el título a 120 caracteres y acepta un formulario válido', () => {
    const ok: ObjectionFormState = { ...objectionToForm(null), title: 'Es caro', category: 'precio' };
    expect(validateForm(ok)).toEqual([]);
    expect(validateForm({ ...ok, title: 'x'.repeat(121) })).toEqual([{ field: 'title', message: 'Máximo 120 caracteres.' }]);
  });

  it('MD4: un título de solo espacios es un título vacío (no un título de 3 caracteres)', () => {
    const blank: ObjectionFormState = { ...objectionToForm(null), title: '   ', category: 'precio' };
    expect(validateForm(blank)).toEqual([{ field: 'title', message: 'Escribe el título de la objeción.' }]);
    // Y el límite se mide sobre el título recortado: 120 «x» con espacios alrededor es válido.
    expect(validateForm({ ...blank, title: `  ${'x'.repeat(120)}  ` })).toEqual([]);
  });
});

describe('focusAfterResolve — a dónde va el foco cuando «Marcar resuelta» se desmonta (brief §4)', () => {
  type El = { isConnected: boolean; name: string };
  const body: El = { isConnected: true, name: 'body' };
  const item: El = { isConnected: true, name: 'li' };
  const register: El = { isConnected: true, name: 'registrar' };

  it('si el foco cayó al body (el botón se deshabilitó y desmontó), va al ítem resuelto', () => {
    expect(focusAfterResolve(body, body, item, register)).toBe(item);
  });

  it('si el elemento activo ya no está en el DOM (el botón desmontado seguía «activo»), va al ítem resuelto', () => {
    const gone: El = { isConnected: false, name: 'button' };
    expect(focusAfterResolve(gone, body, item, register)).toBe(item);
    expect(focusAfterResolve(null, body, item, register)).toBe(item);
  });

  it('sin ítem (la lista se recargó sin él), va a «Registrar objeción»; sin nada, no hace nada', () => {
    expect(focusAfterResolve(body, body, null, register)).toBe(register);
    expect(focusAfterResolve(body, body, null, null)).toBeNull();
  });

  it('si el usuario ya movió el foco a otro sitio (Tab mientras guardaba), no se le quita', () => {
    const other: El = { isConnected: true, name: 'input' };
    expect(focusAfterResolve(other, body, item, register)).toBeNull();
  });
});

describe('normalizeObjection', () => {
  it('convierte los jsonb nulos o malformados en listas vacías y descarta valores no textuales', () => {
    const row = { ...base({}), detection_signals: null, discovery_questions: 'no-es-lista' as unknown as string[] };
    const n = normalizeObjection(row);
    expect(n.detection_signals).toEqual([]);
    expect(n.discovery_questions).toEqual([]);
    expect(normalizeObjection({ ...base({}), detection_signals: ['a', 3, null, ' b '] as unknown as string[] }).detection_signals).toEqual(['a', 'b']);
  });
});
