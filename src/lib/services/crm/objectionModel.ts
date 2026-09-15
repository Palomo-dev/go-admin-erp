/**
 * Modelo puro de la biblioteca de objeciones (FASE-02, brief UX §5):
 * filtros, formulario ↔ payload y validación. Sin I/O: lo que toca la BD vive
 * en `objectionService.ts` y las rutas `/api/crm/objections/**`.
 */

import type { Objection, ObjectionInput } from './objectionService';

// ─── Categorías ──────────────────────────────────────────────────────────────

export interface ObjectionCategory {
  value: string;
  label: string;
}

/** Las siete sembradas en cada organización más «otra» para las escritas a mano. */
export const OBJECTION_CATEGORIES: ObjectionCategory[] = [
  { value: 'precio', label: 'Precio' },
  { value: 'competencia', label: 'Competencia' },
  { value: 'timing', label: 'Momento' },
  { value: 'decisor', label: 'Decisor' },
  { value: 'funcionalidad', label: 'Funcionalidad' },
  { value: 'confianza', label: 'Confianza' },
  { value: 'implementación', label: 'Implementación' },
  { value: 'otra', label: 'Otra' },
];

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return 'Sin categoría';
  return OBJECTION_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ─── Normalización de filas ──────────────────────────────────────────────────

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

/** Los jsonb pueden llegar nulos o malformados (filas escritas a mano): listas siempre. */
export function normalizeObjection(row: Objection): Objection {
  return {
    ...row,
    detection_signals: textList(row.detection_signals),
    discovery_questions: textList(row.discovery_questions),
    related_case_studies: textList(row.related_case_studies),
  };
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface ObjectionFilters {
  query: string;
  /** Valor de categoría o `'all'`. */
  category: string;
  status: 'all' | 'active' | 'inactive';
}

export const EMPTY_FILTERS: ObjectionFilters = { query: '', category: 'all', status: 'all' };

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function countActiveFilters(filters: ObjectionFilters): number {
  return (filters.query.trim() ? 1 : 0) + (filters.category !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);
}

export function filterObjections(list: Objection[], filters: ObjectionFilters): Objection[] {
  const q = fold(filters.query.trim());
  return list.filter((o) => {
    if (filters.status === 'active' && !o.is_active) return false;
    if (filters.status === 'inactive' && o.is_active) return false;
    if (filters.category !== 'all' && o.category !== filters.category) return false;
    if (!q) return true;
    const haystack = [
      o.title,
      categoryLabel(o.category),
      o.category ?? '',
      o.recommended_response ?? '',
      ...(o.detection_signals ?? []),
      ...(o.discovery_questions ?? []),
    ].map(fold);
    return haystack.some((h) => h.includes(q));
  });
}

// ─── Formulario ──────────────────────────────────────────────────────────────

export interface ObjectionFormState {
  title: string;
  category: string;
  /** Una señal por línea. */
  signalsText: string;
  recommended_response: string;
  /** Una pregunta por línea. */
  questionsText: string;
  is_active: boolean;
}

export interface FormError {
  field: 'title' | 'category';
  message: string;
}

export const TITLE_MAX = 120;

export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const item = raw.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function joinList(items: string[] | null | undefined): string {
  return (items ?? []).join('\n');
}

export function objectionToForm(objection: Objection | null): ObjectionFormState {
  if (!objection) {
    return { title: '', category: '', signalsText: '', recommended_response: '', questionsText: '', is_active: true };
  }
  return {
    title: objection.title,
    category: objection.category ?? '',
    signalsText: joinList(objection.detection_signals),
    recommended_response: objection.recommended_response ?? '',
    questionsText: joinList(objection.discovery_questions),
    is_active: objection.is_active,
  };
}

export function formToPayload(form: ObjectionFormState): ObjectionInput {
  const response = form.recommended_response.trim();
  return {
    title: form.title.trim(),
    category: form.category,
    detection_signals: splitList(form.signalsText),
    recommended_response: response ? response : null,
    discovery_questions: splitList(form.questionsText),
    is_active: form.is_active,
  };
}

export function validateForm(form: ObjectionFormState): FormError[] {
  const errors: FormError[] = [];
  const title = form.title.trim();
  if (!title) errors.push({ field: 'title', message: 'Escribe el título de la objeción.' });
  else if (title.length > TITLE_MAX) errors.push({ field: 'title', message: `Máximo ${TITLE_MAX} caracteres.` });
  if (!form.category) errors.push({ field: 'category', message: 'Elige una categoría.' });
  return errors;
}

// ─── Foco tras «Marcar resuelta» (brief §4) ──────────────────────────────────

/**
 * El botón «Marcar resuelta» se deshabilita al guardar y se desmonta al
 * resolverse: el foco cae al `body`. Decide a dónde va: al ítem resuelto, si
 * sigue en la lista; si no, a «Registrar objeción». Si el usuario ya movió el
 * foco a otro sitio mientras guardaba, no se le quita (devuelve `null`).
 */
export function focusAfterResolve<T>(
  active: { isConnected: boolean } | null,
  body: unknown,
  resolvedItem: T | null,
  registerButton: T | null,
): T | null {
  const lost = !active || active === body || !active.isConnected;
  if (!lost) return null;
  return resolvedItem ?? registerButton;
}
