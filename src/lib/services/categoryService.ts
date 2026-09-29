import { supabase } from '@/lib/supabase/config';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  uuid: string;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  rank: number;
  icon: string | null;
  color: string;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  display_order: number;
  meta_title: string | null;
  meta_description: string | null;
  metadata: Record<string, unknown> | null;
  station: string | null;
  requires_preparation: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  level: number;
  product_count?: number;
}

export interface CategoryFormData {
  name: string;
  slug: string;
  parent_id: number | null;
  rank: number;
  icon: string;
  color: string;
  image_url: string;
  description: string;
  is_active: boolean;
  display_order: number;
  meta_title: string;
  meta_description: string;
  metadata: Record<string, unknown>;
  station: string | null;
  requires_preparation: boolean;
}

export interface CategoryStats {
  total: number;
  active: number;
  inactive: number;
  root: number;
  withChildren: number;
}

export interface CategoryImportRow {
  /** Número de fila del archivo (para los mensajes de la revisión). */
  fila?: number;
  name?: string;
  parent_name?: string;
  slug?: string;
  color?: string;
  icon?: string;
  description?: string;
  is_active?: boolean;
  display_order?: number;
  station?: string;
  requires_preparation?: boolean;
  meta_title?: string;
  meta_description?: string;
}

/** Fila de `categorias_listado`: la categoría con sus conteos. */
export interface CategoriaListado extends Category {
  /** Productos visibles del catálogo con esta categoría como principal (sin variantes ni borrados). */
  productos: number;
  /** Productos que llegan por reglas y no la tienen como principal. */
  productos_regla: number;
  hijas: number;
}

export interface ResumenProductosCategorias {
  productos_total: number;
  productos_sin_categoria: number;
}

export interface ListadoCategorias {
  categorias: CategoriaListado[];
  resumen: ResumenProductosCategorias;
}

export interface ConexionesCategoria {
  productos: number;
  por_regla: number;
  adicionales: number;
  reglas: number;
  promociones: number;
  paginas_web: number;
  menus_web: number;
  favorita: boolean;
  /** Posición entre sus hermanas (1-indexada) y cuántas son. */
  posicion: number | null;
  hermanas: number;
}

interface ProductoFila {
  id: number;
  uuid: string;
  name: string;
  sku: string | null;
  status: string | null;
}

export interface ProductoDeCategoria extends ProductoFila {
  origen: 'principal' | 'regla' | 'adicional';
}

/**
 * Error de las RPC de categorías con el motivo legible y el código del
 * servidor (`hint`): `CATEGORIA_CICLO`, `CATEGORIA_CON_PRODUCTOS`,
 * `CATEGORIA_NO_ENCONTRADA`… `sinPermiso` = la BD negó el acceso a la
 * organización (`fn_assert_acceso_org`, 42501) o RLS rechazó la operación.
 */
export class ErrorCategoria extends Error {
  codigo: string | null;
  sinPermiso: boolean;
  slugDuplicado: boolean;

  constructor(error: { message?: string; code?: string; hint?: string | null; details?: string | null }) {
    const slugDuplicado =
      error.code === '23505' && `${error.message ?? ''} ${error.details ?? ''}`.includes('slug');
    super(
      slugDuplicado
        ? 'Ya existe una categoría con esa dirección (slug) en tu organización'
        : error.message || 'No se pudo completar la operación',
    );
    this.name = 'ErrorCategoria';
    this.codigo = error.hint ?? null;
    this.sinPermiso = error.code === '42501' && this.codigo !== 'CATEGORIA_NO_ENCONTRADA';
    this.slugDuplicado = slugDuplicado;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildCategoryTree(flat: Category[]): CategoryWithChildren[] {
  const map = new Map<number, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  flat.forEach(cat => {
    map.set(cat.id, { ...cat, children: [], level: 0 });
  });

  flat.forEach(cat => {
    const node = map.get(cat.id)!;
    if (cat.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(cat.parent_id);
      if (parent) {
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        roots.push(node);
      }
    }
  });

  const sortChildren = (cats: CategoryWithChildren[]): CategoryWithChildren[] => {
    return cats
      .sort((a, b) => a.display_order - b.display_order || a.rank - b.rank || a.name.localeCompare(b.name))
      .map(cat => ({ ...cat, children: sortChildren(cat.children) }));
  };

  return sortChildren(roots);
}

export function computeStats(categories: Category[]): CategoryStats {
  const parentIds = new Set(categories.filter(c => c.parent_id !== null).map(c => c.parent_id));
  return {
    total: categories.length,
    active: categories.filter(c => c.is_active).length,
    inactive: categories.filter(c => !c.is_active).length,
    root: categories.filter(c => c.parent_id === null).length,
    withChildren: parentIds.size,
  };
}

export const emptyFormData: CategoryFormData = {
  name: '',
  slug: '',
  parent_id: null,
  rank: 0,
  icon: 'Package',
  color: '#3B82F6',
  image_url: '',
  description: '',
  is_active: true,
  display_order: 0,
  meta_title: '',
  meta_description: '',
  metadata: {},
  station: null,
  requires_preparation: false,
};

// ─── Servicio CRUD ───────────────────────────────────────────────────────────

const categoryService = {
  /** Obtiene todas las categorías de la organización */
  async getAll(organizationId: number): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true })
      .order('rank', { ascending: true });

    if (error) throw new ErrorCategoria(error);
    return data || [];
  },

  /** Obtiene una categoría por ID (int) */
  async getById(id: number): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new ErrorCategoria(error);
    return data;
  },

  /** Obtiene una categoría por UUID */
  async getByUuid(uuid: string): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('uuid', uuid)
      .single();

    if (error) throw new ErrorCategoria(error);
    return data;
  },

  /** Obtiene el conteo de productos por categoría */
  async getProductCounts(organizationId: number): Promise<Record<number, number>> {
    const { data, error } = await supabase
      .from('products')
      .select('category_id')
      .eq('organization_id', organizationId)
      .not('category_id', 'is', null);

    if (error) throw new ErrorCategoria(error);

    const counts: Record<number, number> = {};
    (data || []).forEach((p: { category_id: number }) => {
      counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    });
    return counts;
  },

  /** Crea una nueva categoría */
  async create(organizationId: number, formData: CategoryFormData): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        organization_id: organizationId,
        name: formData.name.trim(),
        slug: formData.slug || generateSlug(formData.name),
        parent_id: formData.parent_id,
        rank: formData.rank,
        icon: formData.icon || null,
        color: formData.color || '#3B82F6',
        image_url: formData.image_url || null,
        description: formData.description || null,
        is_active: formData.is_active,
        display_order: formData.display_order,
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        metadata: formData.metadata || {},
        station: formData.station || null,
        requires_preparation: formData.requires_preparation,
      })
      .select()
      .single();

    if (error) throw new ErrorCategoria(error);
    return data;
  },

  /** Actualiza una categoría por ID (int) */
  async update(id: number, formData: Partial<CategoryFormData>): Promise<Category> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (formData.name !== undefined) updateData.name = formData.name.trim();
    if (formData.slug !== undefined) updateData.slug = formData.slug;
    if (formData.parent_id !== undefined) updateData.parent_id = formData.parent_id;
    if (formData.rank !== undefined) updateData.rank = formData.rank;
    if (formData.icon !== undefined) updateData.icon = formData.icon || null;
    if (formData.color !== undefined) updateData.color = formData.color;
    if (formData.image_url !== undefined) updateData.image_url = formData.image_url || null;
    if (formData.description !== undefined) updateData.description = formData.description || null;
    if (formData.is_active !== undefined) updateData.is_active = formData.is_active;
    if (formData.display_order !== undefined) updateData.display_order = formData.display_order;
    if (formData.meta_title !== undefined) updateData.meta_title = formData.meta_title || null;
    if (formData.meta_description !== undefined) updateData.meta_description = formData.meta_description || null;
    if (formData.metadata !== undefined) updateData.metadata = formData.metadata;
    if (formData.station !== undefined) updateData.station = formData.station || null;
    if (formData.requires_preparation !== undefined) updateData.requires_preparation = formData.requires_preparation;

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new ErrorCategoria(error);
    return data;
  },

  /** Actualiza una categoría por UUID */
  async updateByUuid(uuid: string, formData: Partial<CategoryFormData>): Promise<Category> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (formData.name !== undefined) updateData.name = formData.name.trim();
    // Un slug vacío no se guarda: `slug` es NOT NULL y la dirección pública de
    // la categoría. Se deriva del nombre, igual que al crear.
    if (formData.slug !== undefined) {
      updateData.slug = formData.slug.trim() || generateSlug(formData.name ?? '') || undefined;
      if (updateData.slug === undefined) delete updateData.slug;
    }
    if (formData.parent_id !== undefined) updateData.parent_id = formData.parent_id;
    if (formData.rank !== undefined) updateData.rank = formData.rank;
    if (formData.icon !== undefined) updateData.icon = formData.icon || null;
    if (formData.color !== undefined) updateData.color = formData.color;
    if (formData.image_url !== undefined) updateData.image_url = formData.image_url || null;
    if (formData.description !== undefined) updateData.description = formData.description || null;
    if (formData.is_active !== undefined) updateData.is_active = formData.is_active;
    if (formData.display_order !== undefined) updateData.display_order = formData.display_order;
    if (formData.meta_title !== undefined) updateData.meta_title = formData.meta_title || null;
    if (formData.meta_description !== undefined) updateData.meta_description = formData.meta_description || null;
    if (formData.metadata !== undefined) updateData.metadata = formData.metadata;
    if (formData.station !== undefined) updateData.station = formData.station || null;
    if (formData.requires_preparation !== undefined) updateData.requires_preparation = formData.requires_preparation;

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('uuid', uuid)
      .select()
      .single();

    if (error) throw new ErrorCategoria(error);
    return data;
  },

  /** Elimina una categoría */
  async delete(id: number): Promise<void> {
    // Primero, mover subcategorías a raíz
    await supabase
      .from('categories')
      .update({ parent_id: null })
      .eq('parent_id', id);

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw new ErrorCategoria(error);
  },

  /** Elimina una categoría por UUID */
  async deleteByUuid(uuid: string): Promise<void> {
    const cat = await this.getByUuid(uuid);
    await supabase
      .from('categories')
      .update({ parent_id: null })
      .eq('parent_id', cat.id);

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('uuid', uuid);

    if (error) throw new ErrorCategoria(error);
  },

  /** Duplica una categoría */
  async duplicate(id: number, organizationId: number): Promise<Category> {
    const original = await this.getById(id);

    return this.create(organizationId, {
      name: `${original.name} (copia)`,
      // Primer slug libre («bebidas-copia», «bebidas-copia-2»…), no un epoch ilegible.
      slug: await this.sugerirSlug(organizationId, `${original.slug}-copia`),
      parent_id: original.parent_id,
      rank: original.rank + 1,
      icon: original.icon || 'Package',
      color: original.color,
      image_url: original.image_url || '',
      description: original.description || '',
      is_active: original.is_active,
      display_order: original.display_order,
      meta_title: original.meta_title || '',
      meta_description: original.meta_description || '',
      metadata: original.metadata || {},
      station: original.station || null,
      requires_preparation: original.requires_preparation ?? false,
    });
  },

  /** Duplica una categoría por UUID */
  async duplicateByUuid(uuid: string, organizationId: number): Promise<Category> {
    const original = await this.getByUuid(uuid);

    return this.create(organizationId, {
      name: `${original.name} (copia)`,
      // Primer slug libre («bebidas-copia», «bebidas-copia-2»…), no un epoch ilegible.
      slug: await this.sugerirSlug(organizationId, `${original.slug}-copia`),
      parent_id: original.parent_id,
      rank: original.rank + 1,
      icon: original.icon || 'Package',
      color: original.color,
      image_url: original.image_url || '',
      description: original.description || '',
      is_active: original.is_active,
      display_order: original.display_order,
      meta_title: original.meta_title || '',
      meta_description: original.meta_description || '',
      metadata: original.metadata || {},
      station: original.station || null,
      requires_preparation: original.requires_preparation ?? false,
    });
  },

  /** Mueve una categoría (reordenar / cambiar padre) */
  async move(id: number, parentId: number | null, rank: number): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ parent_id: parentId, rank, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new ErrorCategoria(error);
  },

  /** Toggle activo/inactivo */
  async toggleActive(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new ErrorCategoria(error);
  },

  /** Toggle activo/inactivo por UUID */
  async toggleActiveByUuid(uuid: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('uuid', uuid);

    if (error) throw new ErrorCategoria(error);
  },

  // ─── Rediseño (RPC 20260923191636_categorias_arbol_sin_ciclos_y_rpc) ──────

  /**
   * Árbol con conteos calculados en la BD (principal, por regla, hijas) y el
   * resumen de los KPI. Sustituye a `getAll` + `getProductCounts`, que
   * descargaba una fila por producto solo para contar.
   */
  async getListado(organizationId: number): Promise<ListadoCategorias> {
    const { data, error } = await supabase.rpc('categorias_listado', { p_org: organizationId });
    if (error) throw new ErrorCategoria(error);
    const r = (data ?? {}) as { categorias?: CategoriaListado[]; resumen?: ResumenProductosCategorias };
    return {
      categorias: r.categorias ?? [],
      resumen: r.resumen ?? { productos_total: 0, productos_sin_categoria: 0 },
    };
  },

  /**
   * Mueve una o varias categorías bajo `parentId` (`null` = raíz) en una sola
   * transacción. El servidor rechaza ciclos y padres de otra organización.
   */
  async moverCategorias(organizationId: number, ids: number[], parentId: number | null): Promise<number> {
    const { data, error } = await supabase.rpc('mover_categorias', {
      p_org: organizationId,
      p_ids: ids,
      p_padre: parentId,
    });
    if (error) throw new ErrorCategoria(error);
    return (data as number) ?? 0;
  },

  /**
   * Elimina una categoría. Si tiene productos y no se indica `destinoId`, el
   * servidor lo bloquea (`ErrorCategoria.codigo === 'CATEGORIA_CON_PRODUCTOS'`).
   * Las subcategorías suben al padre de la eliminada.
   */
  async eliminarCategoria(
    organizationId: number,
    id: number,
    destinoId: number | null = null,
  ): Promise<{ productos_movidos: number; subcategorias_movidas: number }> {
    const { data, error } = await supabase.rpc('eliminar_categoria', {
      p_org: organizationId,
      p_id: id,
      p_destino: destinoId,
    });
    if (error) throw new ErrorCategoria(error);
    return (data as { productos_movidos: number; subcategorias_movidas: number }) ?? {
      productos_movidos: 0,
      subcategorias_movidas: 0,
    };
  },

  /** Conteos de «Cómo se conecta» del detalle. */
  async getConexiones(organizationId: number, id: number): Promise<ConexionesCategoria> {
    const { data, error } = await supabase.rpc('categoria_conexiones', { p_org: organizationId, p_id: id });
    if (error) throw new ErrorCategoria(error);
    return data as ConexionesCategoria;
  },

  /** Activa o desactiva varias categorías de la organización de una vez. */
  async setActivas(organizationId: number, ids: number[], isActive: boolean): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .in('id', ids);
    if (error) throw new ErrorCategoria(error);
  },

  /** ¿El slug está libre en la organización? (`categories_organization_id_slug_key`). */
  async slugDisponible(organizationId: number, slug: string, excluirId?: number): Promise<boolean> {
    let q = supabase.from('categories').select('id').eq('organization_id', organizationId).eq('slug', slug).limit(1);
    if (excluirId) q = q.neq('id', excluirId);
    const { data, error } = await q;
    if (error) throw new ErrorCategoria(error);
    return !data || data.length === 0;
  },

  /** Primer slug libre a partir de `base`: `base`, `base-2`, `base-3`… */
  async sugerirSlug(organizationId: number, base: string, excluirId?: number): Promise<string> {
    const limpio = generateSlug(base) || 'categoria';
    let q = supabase
      .from('categories')
      .select('slug')
      .eq('organization_id', organizationId)
      .like('slug', `${limpio}%`);
    if (excluirId) q = q.neq('id', excluirId);
    const { data, error } = await q;
    if (error) throw new ErrorCategoria(error);
    const usados = new Set((data ?? []).map((r: { slug: string }) => r.slug));
    if (!usados.has(limpio)) return limpio;
    for (let n = 2; n < 1000; n++) {
      const candidato = `${limpio}-${n}`;
      if (!usados.has(candidato)) return candidato;
    }
    return `${limpio}-${usados.size + 1}`;
  },

  /** Marca o quita la categoría como favorita del POS (`category_favorites`). */
  async setFavorita(organizationId: number, categoryId: number, favorita: boolean): Promise<void> {
    if (favorita) {
      const { error } = await supabase
        .from('category_favorites')
        .upsert({ organization_id: organizationId, category_id: categoryId }, { onConflict: 'organization_id,category_id' });
      if (error) throw new ErrorCategoria(error);
      return;
    }
    const { error } = await supabase
      .from('category_favorites')
      .delete()
      .eq('organization_id', organizationId)
      .eq('category_id', categoryId);
    if (error) throw new ErrorCategoria(error);
  },

  /**
   * Productos de la categoría: los que la tienen como principal y los que
   * llegan por `product_category_relations` (regla o asignación manual).
   */
  async getProductosDeCategoria(organizationId: number, categoryId: number): Promise<ProductoDeCategoria[]> {
    const [principales, relaciones] = await Promise.all([
      supabase
        .from('products')
        .select('id, uuid, name, sku, status')
        .eq('organization_id', organizationId)
        .eq('category_id', categoryId)
        .is('parent_product_id', null)
        .or('status.is.null,status.neq.deleted')
        .order('name'),
      supabase
        .from('product_category_relations')
        .select('assigned_by_rule, products!inner(id, uuid, name, sku, status)')
        .eq('organization_id', organizationId)
        .eq('category_id', categoryId),
    ]);
    if (principales.error) throw new ErrorCategoria(principales.error);
    if (relaciones.error) throw new ErrorCategoria(relaciones.error);

    const salida = new Map<number, ProductoDeCategoria>();
    for (const p of (principales.data ?? []) as ProductoFila[]) {
      salida.set(p.id, { ...p, origen: 'principal' });
    }
    type FilaRelacion = { assigned_by_rule: boolean; products: ProductoFila | ProductoFila[] | null };
    for (const r of (relaciones.data ?? []) as unknown as FilaRelacion[]) {
      const p = Array.isArray(r.products) ? r.products[0] : r.products;
      if (!p || salida.has(p.id) || p.status === 'deleted') continue;
      salida.set(p.id, { ...p, origen: r.assigned_by_rule ? 'regla' : 'adicional' });
    }
    return [...salida.values()];
  },

  /** Exporta las categorías a CSV (string) */
  async exportCategoriesToCSV(organizationId: number): Promise<string> {
    const categories = await this.getAll(organizationId);
    const nameById = new Map<number, string>();
    categories.forEach(c => nameById.set(c.id, c.name));

    const headers = [
      'Nombre',
      'Categoría Padre',
      'Slug',
      'Color',
      'Icono',
      'Descripción',
      'Activa',
      'Orden',
      'Estación',
      'Requiere Preparación',
      'Meta Título',
      'Meta Descripción',
    ];

    const rows = categories.map(c => [
      c.name,
      c.parent_id !== null ? (nameById.get(c.parent_id) || '') : '',
      c.slug,
      c.color,
      c.icon || '',
      c.description || '',
      c.is_active ? 'Sí' : 'No',
      String(c.display_order),
      c.station || '',
      c.requires_preparation ? 'Sí' : 'No',
      c.meta_title || '',
      c.meta_description || '',
    ]);

    const escapeCell = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
    const csvLines = [headers.map(escapeCell).join(',')];
    rows.forEach(r => csvLines.push(r.map(escapeCell).join(',')));

    return csvLines.join('\n');
  },

  /** Exporta las categorías a XLSX (Blob) */
  async exportCategoriesToXLSX(organizationId: number): Promise<Blob> {
    const categories = await this.getAll(organizationId);
    const nameById = new Map<number, string>();
    categories.forEach(c => nameById.set(c.id, c.name));

    const rows = categories.map(c => ({
      'Nombre': c.name,
      'Categoría Padre': c.parent_id !== null ? (nameById.get(c.parent_id) || '') : '',
      'Slug': c.slug,
      'Color': c.color,
      'Icono': c.icon || '',
      'Descripción': c.description || '',
      'Activa': c.is_active ? 'Sí' : 'No',
      'Orden': c.display_order,
      'Estación': c.station || '',
      'Requiere Preparación': c.requires_preparation ? 'Sí' : 'No',
      'Meta Título': c.meta_title || '',
      'Meta Descripción': c.meta_description || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Categorías');
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  },

  /** Exporta las categorías a PDF (Blob) */
  async exportCategoriesToPDF(organizationId: number): Promise<Blob> {
    const categories = await this.getAll(organizationId);
    const nameById = new Map<number, string>();
    categories.forEach(c => nameById.set(c.id, c.name));

    const headers = [
      'Nombre',
      'Categoría Padre',
      'Slug',
      'Color',
      'Icono',
      'Descripción',
      'Activa',
      'Orden',
      'Estación',
      'Requiere Prep.',
      'Meta Título',
      'Meta Descripción',
    ];

    const body = categories.map(c => [
      c.name,
      c.parent_id !== null ? (nameById.get(c.parent_id) || '') : '',
      c.slug,
      c.color,
      c.icon || '',
      c.description || '',
      c.is_active ? 'Sí' : 'No',
      String(c.display_order),
      c.station || '',
      c.requires_preparation ? 'Sí' : 'No',
      c.meta_title || '',
      c.meta_description || '',
    ]);

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Listado de Categorías', 14, 15);
    autoTable(doc, {
      head: [headers],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] },
      startY: 22,
    });

    return doc.output('blob');
  },

  /**
   * Importar categorías (Figma «Importar categorías» `973:186211`) por
   * `fn_categorias_importar`: con `aplicar = false` solo revisa (cada fila con
   * su acción y su motivo); con `true` crea en UNA transacción lo válido, los
   * padres antes que sus hijas. Permiso de catálogo en el servidor.
   */
  async importarCategorias(organizationId: number, filas: readonly CategoryImportRow[], aplicar: boolean): Promise<unknown> {
    const { data, error } = await supabase.rpc('fn_categorias_importar', {
      p_org: organizationId,
      p_filas: filas,
      p_aplicar: aplicar,
    });
    if (error) throw error;
    return data;
  },
};

export default categoryService;
