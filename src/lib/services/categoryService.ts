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
  metadata: Record<string, any> | null;
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
  metadata: Record<string, any>;
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
        station: formData.station || null,
        requires_preparation: formData.requires_preparation,
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
    if (formData.station !== undefined) updateData.station = formData.station || null;
    if (formData.requires_preparation !== undefined) updateData.requires_preparation = formData.requires_preparation;

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
    if (formData.station !== undefined) updateData.station = formData.station || null;
    if (formData.requires_preparation !== undefined) updateData.requires_preparation = formData.requires_preparation;

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
      station: original.station || null,
      requires_preparation: original.requires_preparation ?? false,
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

  /** Importa categorías desde un array de filas */
  async importCategories(
    organizationId: number,
    items: CategoryImportRow[]
  ): Promise<{ success: number; errors: { row: number; error: string }[] }> {
    const existing = await this.getAll(organizationId);
    const nameToId = new Map<string, number>();
    existing.forEach(c => nameToId.set(c.name.toLowerCase(), c.id));

    const sorted = [...items].sort((a, b) => {
      const aHasParent = a.parent_name ? 1 : 0;
      const bHasParent = b.parent_name ? 1 : 0;
      return aHasParent - bHasParent;
    });

    let success = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const rowNumber = i + 1;

      const name = (item.name || '').trim();
      if (!name) {
        errors.push({ row: rowNumber, error: 'El nombre es obligatorio' });
        continue;
      }

      let parentId: number | null = null;
      if (item.parent_name) {
        const parentName = item.parent_name.trim().toLowerCase();
        if (nameToId.has(parentName)) {
          parentId = nameToId.get(parentName)!;
        } else {
          errors.push({ row: rowNumber, error: `No se encontró la categoría padre "${item.parent_name}"` });
          continue;
        }
      }

      const slug = item.slug || generateSlug(name);
      const color = item.color || '#6366f1';
      const isActive = item.is_active !== undefined ? item.is_active : true;
      const displayOrder = item.display_order !== undefined ? item.display_order : 0;
      const requiresPreparation = item.requires_preparation !== undefined ? item.requires_preparation : false;

      try {
        const { data, error } = await supabase
          .from('categories')
          .insert({
            organization_id: organizationId,
            name,
            slug,
            parent_id: parentId,
            rank: 0,
            icon: item.icon || null,
            color,
            description: item.description || null,
            is_active: isActive,
            display_order: displayOrder,
            meta_title: item.meta_title || null,
            meta_description: item.meta_description || null,
            metadata: {},
            station: item.station || null,
            requires_preparation: requiresPreparation,
          })
          .select()
          .single();

        if (error) {
          errors.push({ row: rowNumber, error: error.message });
          continue;
        }

        nameToId.set(name.toLowerCase(), data.id);
        success++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al insertar';
        errors.push({ row: rowNumber, error: message });
      }
    }

    return { success, errors };
  },
};

export default categoryService;
