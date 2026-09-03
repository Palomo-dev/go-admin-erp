import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RuleField =
  | 'name' | 'sku' | 'brand' | 'reference' | 'barcode'
  | 'supplier' | 'tag' | 'status' | 'product_type'
  | 'price_min' | 'price_max';

export type RuleOperator =
  | 'contains' | 'not_contains'
  | 'equals' | 'not_equals'
  | 'starts_with' | 'ends_with'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'in' | 'not_in';

export type LogicCombiner = 'AND' | 'OR';

export interface CategoryRule {
  id: number;
  category_id: number;
  organization_id: number;
  field: RuleField;
  operator: RuleOperator;
  value: string | null;
  value_array: string[];
  logic_combiner: LogicCombiner;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryRuleInput {
  field: RuleField;
  operator: RuleOperator;
  value: string | null;
  value_array?: string[];
  logic_combiner: LogicCombiner;
  display_order: number;
  is_active?: boolean;
}

// ─── Metadatos de campos y operadores ────────────────────────────────────────

export const FIELD_LABELS: Record<RuleField, string> = {
  name: 'Nombre',
  sku: 'SKU',
  brand: 'Marca',
  reference: 'Referencia',
  barcode: 'Código de barras',
  supplier: 'Proveedor',
  tag: 'Etiqueta',
  status: 'Estado',
  product_type: 'Tipo de producto',
  price_min: 'Precio mínimo',
  price_max: 'Precio máximo',
};

export const FIELD_TYPES: Record<RuleField, 'text' | 'number' | 'select' | 'multiselect'> = {
  name: 'text',
  sku: 'text',
  brand: 'text',
  reference: 'text',
  barcode: 'text',
  supplier: 'select',
  tag: 'select',
  status: 'select',
  product_type: 'select',
  price_min: 'number',
  price_max: 'number',
};

export const FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  status: [
    { value: 'active', label: 'Activo' },
    { value: 'inactive', label: 'Inactivo' },
    { value: 'discontinued', label: 'Descontinuado' },
  ],
  product_type: [
    { value: 'product', label: 'Producto' },
    { value: 'service', label: 'Servicio' },
    { value: 'bundle', label: 'Combo/Kit' },
  ],
};

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: 'Contiene',
  not_contains: 'No contiene',
  equals: 'Es igual a',
  not_equals: 'No es igual a',
  starts_with: 'Empieza con',
  ends_with: 'Termina con',
  gt: 'Mayor que',
  lt: 'Menor que',
  gte: 'Mayor o igual que',
  lte: 'Menor o igual que',
  in: 'Está en la lista',
  not_in: 'No está en la lista',
};

export const OPERATORS_BY_TYPE: Record<string, RuleOperator[]> = {
  text: ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'in', 'not_in'],
  number: ['gt', 'lt', 'gte', 'lte', 'equals', 'not_equals'],
  select: ['equals', 'not_equals'],
  multiselect: ['in', 'not_in'],
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getRules(categoryId: number): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from('category_rules')
    .select('*')
    .eq('category_id', categoryId)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function saveRules(
  categoryId: number,
  organizationId: number,
  rules: CategoryRuleInput[]
): Promise<CategoryRule[]> {
  // Eliminar reglas existentes
  const { error: deleteError } = await supabase
    .from('category_rules')
    .delete()
    .eq('category_id', categoryId);

  if (deleteError) throw deleteError;

  if (rules.length === 0) return [];

  // Insertar nuevas reglas
  const rows = rules.map((r, i) => ({
    category_id: categoryId,
    organization_id: organizationId,
    field: r.field,
    operator: r.operator,
    value: r.value,
    value_array: r.value_array || [],
    logic_combiner: i === 0 ? 'AND' : r.logic_combiner,
    display_order: i,
    is_active: r.is_active ?? true,
  }));

  const { data, error } = await supabase
    .from('category_rules')
    .insert(rows)
    .select('*');

  if (error) throw error;
  return data || [];
}

export async function deleteRules(categoryId: number): Promise<void> {
  const { error } = await supabase
    .from('category_rules')
    .delete()
    .eq('category_id', categoryId);
  if (error) throw error;
}

// ─── Evaluación de reglas ────────────────────────────────────────────────────

/**
 * Construye una query de Supabase aplicando los filtros de las reglas.
 * Soporta combinación AND/OR entre reglas.
 * Retorna los IDs de productos que cumplen todas las reglas.
 */
export async function evaluateRules(
  organizationId: number,
  rules: CategoryRule[]
): Promise<{ id: number; uuid: string; name: string; sku: string }[]> {
  if (rules.length === 0) return [];

  // Separar reglas por combinador
  // Estrategia: agrupar reglas conectadas por OR, y aplicar AND entre grupos
  const groups: CategoryRule[][] = [];
  let currentGroup: CategoryRule[] = [rules[0]];

  for (let i = 1; i < rules.length; i++) {
    if (rules[i].logic_combiner === 'OR') {
      currentGroup.push(rules[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [rules[i]];
    }
  }
  groups.push(currentGroup);

  // Para cada grupo (OR), obtener los productos que cumplen CUALQUIER regla del grupo
  // Luego intersectar los resultados entre grupos (AND)
  let resultIds: Set<number> | null = null;

  for (const group of groups) {
    const groupIds = new Set<number>();

    for (const rule of group) {
      const ids = await getMatchingProductIds(organizationId, rule);
      ids.forEach(id => groupIds.add(id));
    }

    if (resultIds === null) {
      resultIds = groupIds;
    } else {
      // Intersección (AND entre grupos)
      resultIds = new Set([...resultIds].filter((id: number) => groupIds.has(id)));
    }
  }

  if (!resultIds || resultIds.size === 0) return [];

  // Obtener info de los productos
  const { data, error } = await supabase
    .from('products')
    .select('id, uuid, name, sku')
    .in('id', [...resultIds])
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene los IDs de productos que cumplen una regla individual.
 */
async function getMatchingProductIds(organizationId: number, rule: CategoryRule): Promise<number[]> {
  let query = supabase
    .from('products')
    .select('id')
    .eq('organization_id', organizationId);

  const val = rule.value?.trim() || '';

  switch (rule.field) {
    case 'name':
    case 'sku':
    case 'brand':
    case 'reference':
    case 'barcode':
      applyTextFilter(query, rule.field, rule.operator, val);
      break;

    case 'status':
    case 'product_type':
      if (rule.operator === 'equals') {
        query = query.eq(rule.field, val);
      } else if (rule.operator === 'not_equals') {
        query = query.neq(rule.field, val);
      }
      break;

    case 'price_min': {
      // Precio mínimo: productos cuyo precio actual >= val
      const { data, error } = await supabase
        .from('product_prices')
        .select('product_id')
        .eq('organization_id', organizationId)
        .is('effective_to', null)
        .gte('price', parseFloat(val));
      if (error) throw error;
      return (data || []).map(r => r.product_id);
    }

    case 'price_max': {
      const { data, error } = await supabase
        .from('product_prices')
        .select('product_id')
        .eq('organization_id', organizationId)
        .is('effective_to', null)
        .lte('price', parseFloat(val));
      if (error) throw error;
      return (data || []).map(r => r.product_id);
    }

    case 'supplier': {
      // Buscar productos cuyo proveedor coincida
      const { data, error } = await supabase
        .from('product_suppliers')
        .select('product_id')
        .eq('supplier_id', parseInt(val));
      if (error) throw error;
      return (data || []).map(r => r.product_id);
    }

    case 'tag': {
      // Buscar productos con la etiqueta
      const { data, error } = await supabase
        .from('product_tag_relations')
        .select('product_id')
        .eq('tag_id', parseInt(val));
      if (error) throw error;
      return (data || []).map(r => r.product_id);
    }

    default:
      return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(r => r.id);
}

/**
 * Aplica un filtro de texto a una query de Supabase según el operador.
 */
function applyTextFilter(
  query: any,
  field: string,
  operator: RuleOperator,
  value: string
): void {
  switch (operator) {
    case 'contains':
      query.ilike(field, `%${value}%`);
      break;
    case 'not_contains':
      query.not.ilike(field, `%${value}%`);
      break;
    case 'equals':
      query.eq(field, value);
      break;
    case 'not_equals':
      query.neq(field, value);
      break;
    case 'starts_with':
      query.ilike(field, `${value}%`);
      break;
    case 'ends_with':
      query.ilike(field, `%${value}`);
      break;
    case 'in':
      if (value) {
        const values = value.split(',').map(v => v.trim()).filter(Boolean);
        query.in(field, values);
      }
      break;
    case 'not_in':
      if (value) {
        const values = value.split(',').map(v => v.trim()).filter(Boolean);
        query.not.in(field, values);
      }
      break;
    default:
      break;
  }
}

// ─── Asignación ──────────────────────────────────────────────────────────────

/**
 * Asigna los productos que cumplen las reglas a la categoría usando la tabla
 * N:M product_category_relations. No sobrescribe la categoría principal
 * (category_id) del producto — añade una relación adicional.
 * También elimina relaciones previas asignadas por regla que ya no cumplen.
 */
export async function applyRules(
  categoryId: number,
  organizationId: number,
  rules: CategoryRule[]
): Promise<{ assigned: number; removed: number }> {
  const products = await evaluateRules(organizationId, rules);
  const newProductIds = new Set(products.map(p => p.id));

  // 1. Obtener relaciones actuales asignadas por regla para esta categoría
  const { data: existing, error: queryErr } = await supabase
    .from('product_category_relations')
    .select('product_id')
    .eq('category_id', categoryId)
    .eq('assigned_by_rule', true);

  if (queryErr) throw queryErr;

  const existingIds = new Set((existing || []).map(r => r.product_id));

  // 2. Insertar nuevas relaciones (productos que cumplen pero no estaban)
  const toInsert = products
    .filter(p => !existingIds.has(p.id))
    .map(p => ({
      product_id: p.id,
      category_id: categoryId,
      organization_id: organizationId,
      assigned_by_rule: true,
    }));

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('product_category_relations')
      .upsert(toInsert, { onConflict: 'product_id,category_id' });
    if (insertErr) throw insertErr;
  }

  // 3. Eliminar relaciones por regla que ya no cumplen
  const toRemove = [...existingIds].filter(id => !newProductIds.has(id));
  let removed = 0;
  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from('product_category_relations')
      .delete()
      .in('product_id', toRemove)
      .eq('category_id', categoryId)
      .eq('assigned_by_rule', true);
    if (delErr) throw delErr;
    removed = toRemove.length;
  }

  return { assigned: toInsert.length, removed };
}

/**
 * Obtiene los productos asignados a una categoría vía la tabla N:M.
 */
export async function getCategoryProducts(categoryId: number): Promise<
  { id: number; uuid: string; name: string; sku: string; assigned_by_rule: boolean }[]
> {
  const { data, error } = await supabase
    .from('product_category_relations')
    .select(`
      assigned_by_rule,
      products!inner(id, uuid, name, sku)
    `)
    .eq('category_id', categoryId)
    .order('assigned_by_rule', { ascending: false });

  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.products.id,
    uuid: r.products.uuid,
    name: r.products.name,
    sku: r.products.sku,
    assigned_by_rule: r.assigned_by_rule,
  }));
}

/**
 * Asigna manualmente un producto a una categoría (relación N:M).
 */
export async function addProductToCategory(
  productId: number,
  categoryId: number,
  organizationId: number
): Promise<void> {
  const { error } = await supabase
    .from('product_category_relations')
    .upsert({
      product_id: productId,
      category_id: categoryId,
      organization_id: organizationId,
      assigned_by_rule: false,
    }, { onConflict: 'product_id,category_id' });
  if (error) throw error;
}

/**
 * Remueve un producto de una categoría (relación N:M).
 */
export async function removeProductFromCategory(
  productId: number,
  categoryId: number
): Promise<void> {
  const { error } = await supabase
    .from('product_category_relations')
    .delete()
    .eq('product_id', productId)
    .eq('category_id', categoryId);
  if (error) throw error;
}

// ─── Helpers para selects ────────────────────────────────────────────────────

export async function getSuppliersForSelect(organizationId: number): Promise<{ id: number; name: string }[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getTagsForSelect(organizationId: number): Promise<{ id: number; name: string }[]> {
  const { data, error } = await supabase
    .from('product_tags')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name');
  if (error) throw error;
  return data || [];
}

const categoryRulesService = {
  getRules,
  saveRules,
  deleteRules,
  evaluateRules,
  applyRules,
  getCategoryProducts,
  addProductToCategory,
  removeProductFromCategory,
  getSuppliersForSelect,
  getTagsForSelect,
};

export default categoryRulesService;
