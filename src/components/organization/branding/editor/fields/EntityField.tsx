'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';
import type { BaseFieldProps } from './types';

interface EntityFieldProps extends BaseFieldProps {
  organizationId?: number;
}

interface CategoryNode {
  id: number;
  name: string;
  image_url?: string;
  parent_id?: number | null;
}

interface ProductNode {
  id: number;
  name: string;
  sku?: string;
  image_url?: string;
}

interface PageNode {
  id: string;
  slug: string;
  title: string;
}

/**
 * Selector con búsqueda contra Supabase según `field.entity`.
 * - `category`: árbol con padres/hijos, reordenable (drag).
 * - `product`: búsqueda por nombre/SKU con miniatura.
 *
 * Para `multiple: true` guarda un array de ids (ej: `selected_category_ids`).
 * Para `multiple: false` guarda un único id.
 */
export default function EntityField({ field, value, onChange, organizationId }: EntityFieldProps) {
  const entity = field.entity;
  const multiple = field.multiple ?? false;

  if (entity === 'category') {
    return (
      <CategoryEntity
        field={field}
        value={value}
        onChange={onChange}
        organizationId={organizationId}
        multiple={multiple}
      />
    );
  }
  if (entity === 'product') {
    return (
      <ProductEntity
        field={field}
        value={value}
        onChange={onChange}
        organizationId={organizationId}
        multiple={multiple}
      />
    );
  }
  if (entity === 'page') {
    return (
      <PageEntity
        field={field}
        value={value}
        onChange={onChange}
        organizationId={organizationId}
        multiple={multiple}
      />
    );
  }
  if (entity === 'branch') {
    return (
      <BranchEntity
        field={field}
        value={value}
        onChange={onChange}
        organizationId={organizationId}
        multiple={multiple}
      />
    );
  }
  if (entity === 'table_zone') {
    return (
      <TableZoneEntity
        field={field}
        value={value}
        onChange={onChange}
        organizationId={organizationId}
        multiple={multiple}
      />
    );
  }
  return (
    <p className="text-[10px] text-gray-400">Entidad "{entity}" no soportada</p>
  );
}

// ============================================================
// CATEGORY
// ============================================================

function CategoryEntity({
  value,
  onChange,
  organizationId,
  multiple,
}: {
  field: BaseFieldProps['field'];
  value: unknown;
  onChange: (v: unknown) => void;
  organizationId?: number;
  multiple: boolean;
}) {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, image_url, parent_id')
          .eq('organization_id', organizationId)
          .order('name', { ascending: true });
        if (error) throw error;
        setCategories(data || []);
      } catch {
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const selectedIds = (Array.isArray(value) ? value : []) as number[];
  const selectedCats = selectedIds
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean) as CategoryNode[];
  const unselectedCats = categories.filter(
    (c) => !selectedIds.includes(c.id) && c.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleToggle = (catId: number, checked: boolean) => {
    if (multiple) {
      onChange(checked ? [...selectedIds, catId] : selectedIds.filter((id) => id !== catId));
    } else {
      onChange(checked ? catId : null);
    }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      const reordered = [...selectedIds];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      onChange(reordered);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-500 dark:text-gray-400">
        Categorías seleccionadas ({selectedIds.length})
      </Label>

      {selectedCats.length > 0 && (
        <div className="space-y-1">
          {selectedCats.map((cat, idx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 cursor-grab',
                dragIdx === idx && 'opacity-50',
              )}
            >
              <GripVertical className="h-3 w-3 text-gray-400 shrink-0 dark:text-gray-500" />
              {cat.image_url ? (
                <img src={cat.image_url} alt={cat.name} className="w-6 h-6 rounded object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <span className="text-[10px]">🏷️</span>
                </div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 break-words">{cat.name}</span>
              <span className="text-[9px] text-gray-400 shrink-0 dark:text-gray-500">#{idx + 1}</span>
              <button
                type="button"
                onClick={() => handleToggle(cat.id, false)}
                className="p-0.5 text-red-400 hover:text-red-600 shrink-0 dark:text-red-500 dark:hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {unselectedCats.length > 0 && (
        <div className="space-y-1 mt-2">
          <div className="relative">
            <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-7 text-[11px] pl-6"
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
            {unselectedCats.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={(checked) => handleToggle(cat.id, !!checked)}
                />
                {cat.image_url ? (
                  <img src={cat.image_url} alt={cat.name} className="w-5 h-5 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <span className="text-[9px]">🏷️</span>
                  </div>
                )}
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 break-words">{cat.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {categories.length === 0 && (
        <p className="text-[10px] text-gray-400 text-center py-2 dark:text-gray-500">No hay categorías creadas</p>
      )}

      <p className="text-[9px] text-gray-400 dark:text-gray-500">
        {selectedIds.length === 0
          ? 'Sin selección: se muestran todas las categorías'
          : 'Arrastra para reordenar. Solo se mostrarán las seleccionadas.'}
      </p>
    </div>
  );
}

// ============================================================
// PRODUCT
// ============================================================

function ProductEntity({
  value,
  onChange,
  organizationId,
  multiple,
}: {
  field: BaseFieldProps['field'];
  value: unknown;
  onChange: (v: unknown) => void;
  organizationId?: number;
  multiple: boolean;
}) {
  const [results, setResults] = useState<ProductNode[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const selectedIds = (Array.isArray(value) ? value : value ? [value] : []) as number[];

  useEffect(() => {
    const search = async () => {
      if (!organizationId || query.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, image_url')
          .eq('organization_id', organizationId)
          .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
          .limit(20);
        if (error) throw error;
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [query, organizationId]);

  const handleToggle = (prodId: number, checked: boolean) => {
    if (multiple) {
      onChange(checked ? [...selectedIds, prodId] : selectedIds.filter((id) => id !== prodId));
    } else {
      onChange(checked ? prodId : null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="h-7 text-[11px] pl-6"
        />
      </div>

      {searching && <p className="text-[10px] text-gray-400">Buscando...</p>}

      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
          {results.map((prod) => {
            const isSelected = selectedIds.includes(prod.id);
            return (
              <label
                key={prod.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleToggle(prod.id, !!checked)}
                />
                {prod.image_url ? (
                  <img src={prod.image_url} alt={prod.name} className="w-6 h-6 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <span className="text-[9px]">📦</span>
                  </div>
                )}
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 break-words flex-1">
                  {prod.name}
                </span>
                {prod.sku && (
                  <span className="text-[9px] text-gray-400 shrink-0">{prod.sku}</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-[10px] text-gray-400 text-center py-2">Sin resultados</p>
      )}
    </div>
  );
}

// ============================================================
// PAGE — páginas internas del sitio (website_pages)
// ============================================================

function PageEntity({
  value,
  onChange,
  organizationId,
  multiple,
}: {
  field: BaseFieldProps['field'];
  value: unknown;
  onChange: (v: unknown) => void;
  organizationId?: number;
  multiple: boolean;
}) {
  const [pages, setPages] = useState<PageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('website_pages')
          .select('id, slug, title')
          .eq('organization_id', organizationId)
          .eq('is_published', true)
          .order('title', { ascending: true });
        if (error) throw error;
        setPages(data || []);
      } catch {
        setPages([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  // `value` es un uuid (string) para multiple=false, o array de uuids para multiple=true.
  const selectedIds = (Array.isArray(value) ? value : value ? [value] : []) as string[];
  const filtered = pages.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.slug.toLowerCase().includes(query.toLowerCase()),
  );

  const handleToggle = (pageId: string, checked: boolean) => {
    if (multiple) {
      onChange(checked ? [...selectedIds, pageId] : selectedIds.filter((id) => id !== pageId));
    } else {
      onChange(checked ? pageId : null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar página..."
          className="h-7 text-[11px] pl-6"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
          {filtered.map((page) => {
            const isSelected = selectedIds.includes(page.id);
            return (
              <label
                key={page.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleToggle(page.id, !!checked)}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 break-words flex-1">
                  {page.title}
                </span>
                <span className="text-[9px] text-gray-400 shrink-0">/{page.slug}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 text-center py-2">
          {pages.length === 0 ? 'No hay páginas publicadas' : 'Sin resultados'}
        </p>
      )}
    </div>
  );
}

// ============================================================
// BRANCH — sucursales físicas (branches)
// ============================================================

interface BranchNode {
  id: number;
  name: string;
}

function BranchEntity({
  value,
  onChange,
  organizationId,
  multiple,
}: {
  field: BaseFieldProps['field'];
  value: unknown;
  onChange: (v: unknown) => void;
  organizationId?: number;
  multiple: boolean;
}) {
  const [branches, setBranches] = useState<BranchNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name', { ascending: true });
        if (error) throw error;
        setBranches(data || []);
      } catch {
        setBranches([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const selectedIds = (Array.isArray(value) ? value : value ? [value] : []) as number[];
  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleToggle = (branchId: number, checked: boolean) => {
    if (multiple) {
      onChange(checked ? [...selectedIds, branchId] : selectedIds.filter((id) => id !== branchId));
    } else {
      onChange(checked ? branchId : null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar sucursal..."
          className="h-7 text-[11px] pl-6"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
          {filtered.map((branch) => {
            const isSelected = selectedIds.includes(branch.id);
            return (
              <label
                key={branch.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleToggle(branch.id, !!checked)}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 break-words flex-1">
                  {branch.name}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 text-center py-2">
          {branches.length === 0 ? 'No hay sucursales creadas' : 'Sin resultados'}
        </p>
      )}
    </div>
  );
}

// ============================================================
// TABLE_ZONE — zonas de restaurante (restaurant_zone_layouts)
// ============================================================

interface ZoneNode {
  id: string;
  zone_name: string;
}

function TableZoneEntity({
  value,
  onChange,
  organizationId,
  multiple,
}: {
  field: BaseFieldProps['field'];
  value: unknown;
  onChange: (v: unknown) => void;
  organizationId?: number;
  multiple: boolean;
}) {
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurant_zone_layouts')
          .select('id, zone_name')
          .eq('organization_id', organizationId)
          .order('zone_name', { ascending: true });
        if (error) throw error;
        // Deduplicar por zone_name (puede haber varias filas con la misma zona)
        const seen = new Set<string>();
        const unique = (data || []).filter((z) => {
          if (seen.has(z.zone_name)) return false;
          seen.add(z.zone_name);
          return true;
        });
        setZones(unique);
      } catch {
        setZones([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const selectedIds = (Array.isArray(value) ? value : value ? [value] : []) as string[];
  const filtered = zones.filter((z) =>
    z.zone_name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleToggle = (zoneId: string, checked: boolean) => {
    if (multiple) {
      onChange(checked ? [...selectedIds, zoneId] : selectedIds.filter((id) => id !== zoneId));
    } else {
      onChange(checked ? zoneId : null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar zona..."
          className="h-7 text-[11px] pl-6"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 dark:border-gray-700 p-1">
          {filtered.map((zone) => {
            const isSelected = selectedIds.includes(zone.id);
            return (
              <label
                key={zone.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleToggle(zone.id, !!checked)}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-0 break-words flex-1">
                  {zone.zone_name}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 text-center py-2">
          {zones.length === 0 ? 'No hay zonas configuradas' : 'Sin resultados'}
        </p>
      )}
    </div>
  );
}
