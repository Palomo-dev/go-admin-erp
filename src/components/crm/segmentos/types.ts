// Tipos para Segmentos
import type { FiltroSegmento } from '@/lib/services/crm/segmentosFiltroLogica';

export interface Segment {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  /** Lista de reglas (un grupo) o `{ grupos }` (O entre grupos): ver `segmentosFiltroLogica`. */
  filter_json: FilterRule[] | FiltroSegmento | null;
  is_dynamic: boolean;
  customer_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | string[];
}

export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty';

export interface CreateSegmentInput {
  name: string;
  description?: string;
  filter_json?: FilterRule[] | FiltroSegmento;
  is_dynamic?: boolean;
}

export interface UpdateSegmentInput {
  name?: string;
  description?: string;
  filter_json?: FilterRule[] | FiltroSegmento;
  is_dynamic?: boolean;
}

export interface SegmentStats {
  total: number;
  dynamic: number;
  static: number;
  totalCustomers: number;
}

// Campos disponibles para filtrar: SOLO columnas reales de `customers`
// (verificadas por MCP el 2026-10-06) y las mismas de la lista blanca de
// `crm_segment_preview`. Antes había `country`, `last_interaction_at` e
// `is_active`, que no existen: la consulta fallaba y el conteo daba 0.
export const FILTER_FIELDS = [
  { value: 'full_name', label: 'Nombre completo', type: 'text' },
  { value: 'company_name', label: 'Empresa', type: 'text' },
  { value: 'email', label: 'Email', type: 'text' },
  { value: 'phone', label: 'Teléfono', type: 'text' },
  { value: 'city', label: 'Ciudad', type: 'text' },
  { value: 'lifecycle_stage', label: 'Etapa del ciclo', type: 'text' },
  { value: 'lead_source', label: 'Origen', type: 'text' },
  { value: 'tags', label: 'Etiquetas', type: 'array' },
  { value: 'created_at', label: 'Fecha de registro', type: 'date' },
  { value: 'last_contact_at', label: 'Último contacto', type: 'date' },
  { value: 'health_score', label: 'Salud', type: 'number' },
] as const;

export const FILTER_OPERATORS: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'not_equals', label: 'No es igual a' },
    { value: 'contains', label: 'Contiene' },
    { value: 'not_contains', label: 'No contiene' },
    { value: 'starts_with', label: 'Empieza con' },
    { value: 'ends_with', label: 'Termina con' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' },
  ],
  date: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'greater_than', label: 'Después de' },
    { value: 'less_than', label: 'Antes de' },
    { value: 'between', label: 'Entre' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' },
  ],
  array: [
    { value: 'contains', label: 'Contiene' },
    { value: 'not_contains', label: 'No contiene' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' },
  ],
  boolean: [
    { value: 'equals', label: 'Es' },
  ],
  number: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'greater_than', label: 'Mayor que' },
    { value: 'less_than', label: 'Menor que' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' },
  ],
};
