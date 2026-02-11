import { supabase } from '@/lib/supabase/config';

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
  metadata: Record<string, any> | null;
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
  metadata: Record<string, any>;
}

export interface CategoryStats {
  total: number;
  active: number;
  inactive: number;
  root: number;
  withChildren: number;
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

    if (error) throw error;
    return data || [];
  },

  /** Obtiene una categoría por ID (int) */
  async getById(id: number): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /** Obtiene una categoría por UUID */
  async getByUuid(uuid: string): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('uuid', uuid)
      .single();

    if (error) throw error;
    return data;
  },

  /** Obtiene el conteo de productos por categoría */
  async getProductCounts(organizationId: number): Promise<Record<number, number>> {
    const { data, error } = await supabase
      .from('products')
      .select('category_id')
      .eq('organization_id', organizationId)
      .not('category_id', 'is', null);

    if (error) throw error;

    const counts: Record<number, number> = {};
    (data || []).forEach((p: any) => {
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
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Actualiza una categoría por ID (int) */
  async update(id: number, formData: Partial<CategoryFormData>): Promise<Category> {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

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

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Actualiza una categoría por UUID */
  async updateByUuid(uuid: string, formData: Partial<CategoryFormData>): Promise<Category> {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

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

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('uuid', uuid)
      .select()
      .single();

    if (error) throw error;
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

    if (error) throw error;
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

    if (error) throw error;
  },

  /** Duplica una categoría */
  async duplicate(id: number, organizationId: number): Promise<Category> {
    const original = await this.getById(id);

    return this.create(organizationId, {
      name: `${original.name} (copia)`,
      slug: `${original.slug}-copia-${Date.now()}`,
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
    });
  },

  /** Duplica una categoría por UUID */
  async duplicateByUuid(uuid: string, organizationId: number): Promise<Category> {
    const original = await this.getByUuid(uuid);

    return this.create(organizationId, {
      name: `${original.name} (copia)`,
      slug: `${original.slug}-copia-${Date.now()}`,
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
    });
  },

  /** Mueve una categoría (reordenar / cambiar padre) */
  async move(id: number, parentId: number | null, rank: number): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ parent_id: parentId, rank, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /** Toggle activo/inactivo */
  async toggleActive(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /** Toggle activo/inactivo por UUID */
  async toggleActiveByUuid(uuid: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('uuid', uuid);

    if (error) throw error;
  },
};

export default categoryService;
