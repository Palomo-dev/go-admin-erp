'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  Tag,
  Link as LinkIcon,
  Loader2,
  ArrowUp,
  ArrowDown,
  IndentIncrease,
  IndentDecrease,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  websiteMenuGroupService,
  type MenuGroupItem,
  type MenuItemType,
} from '@/lib/services/websiteMenuGroupService';
import { websitePageBuilderService, type WebsitePage } from '@/lib/services/websitePageBuilderService';
import { websiteMenuService, type AvailableCategory } from '@/lib/services/websiteMenuService';

interface MenuGroupEditorProps {
  menuId: string;
  organizationId: number;
}

const itemTypeConfig: Record<MenuItemType, { label: string; icon: typeof FileText; color: string }> = {
  page: { label: 'Página', icon: FileText, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  category: { label: 'Categoría', icon: Tag, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  policy: { label: 'Política', icon: FileText, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  custom_link: { label: 'Enlace', icon: LinkIcon, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

export default function MenuGroupEditor({ menuId, organizationId }: MenuGroupEditorProps) {
  const [items, setItems] = useState<MenuGroupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addType, setAddType] = useState<MenuItemType>('page');
  const [availablePages, setAvailablePages] = useState<WebsitePage[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AvailableCategory[] | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const loadItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const tree = await websiteMenuGroupService.getMenuTree(menuId);
      setItems(tree);
    } catch (error) {
      console.error('Error loading menu items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [menuId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const loadPages = useCallback(async () => {
    try {
      const pages = await websitePageBuilderService.getPages(organizationId);
      setAvailablePages(pages);
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  }, [organizationId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddPage = async (pageId: string) => {
    try {
      await websiteMenuGroupService.addMenuItem({
        menu_id: menuId,
        organization_id: organizationId,
        item_type: 'page',
        page_id: pageId,
        display_order: items.length,
      });
      setShowAddDialog(false);
      loadItems();
    } catch (error) {
      console.error('Error adding page item:', error);
    }
  };

  const handleAddCustomLink = async () => {
    if (!customLabel.trim()) return;
    try {
      await websiteMenuGroupService.addMenuItem({
        menu_id: menuId,
        organization_id: organizationId,
        item_type: 'custom_link',
        custom_label: customLabel,
        custom_url: customUrl,
        display_order: items.length,
      });
      setCustomLabel('');
      setCustomUrl('');
      setShowAddDialog(false);
      loadItems();
    } catch (error) {
      console.error('Error adding custom link:', error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await websiteMenuGroupService.removeMenuItem(itemId);
      loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const loadCategories = useCallback(async () => {
    try {
      setAvailableCategories(null);
      setAvailableCategories(await websiteMenuService.getAvailableCategories(organizationId));
    } catch (error) {
      console.error('Error loading categories:', error);
      setAvailableCategories([]);
    }
  }, [organizationId]);

  const handleAddCategory = async (categoryId: number) => {
    try {
      await websiteMenuGroupService.addMenuItem({
        menu_id: menuId,
        organization_id: organizationId,
        item_type: 'category',
        category_id: categoryId,
        display_order: items.length,
      });
      setShowAddDialog(false);
      loadItems();
    } catch (error) {
      console.error('Error adding category item:', error);
    }
  };

  /** Hermanos de un ítem (raíz o hijos de su padre) y su padre, si lo tiene. */
  const ubicar = (id: string, lista: MenuGroupItem[] = items, padre: MenuGroupItem | null = null): { hermanos: MenuGroupItem[]; padre: MenuGroupItem | null } | null => {
    if (lista.some((i) => i.id === id)) return { hermanos: lista, padre };
    for (const i of lista) {
      const r = i.children?.length ? ubicar(id, i.children, i) : null;
      if (r) return r;
    }
    return null;
  };

  /** Escribe display_order 0..N de una lista de hermanos (un update por ítem). */
  const guardarOrden = async (ordenados: MenuGroupItem[]) => {
    for (let n = 0; n < ordenados.length; n++) {
      if (ordenados[n].display_order !== n) {
        await websiteMenuGroupService.updateMenuItem(ordenados[n].id, { display_order: n });
      }
    }
  };

  const conMovimiento = async (accion: () => Promise<void>) => {
    if (moviendo) return;
    setMoviendo(true);
    try {
      await accion();
    } catch (error) {
      console.error('Error moving menu item:', error);
    } finally {
      setMoviendo(false);
      loadItems();
    }
  };

  const handleMove = (itemId: string, delta: -1 | 1) =>
    conMovimiento(async () => {
      const u = ubicar(itemId);
      if (!u) return;
      const i = u.hermanos.findIndex((h) => h.id === itemId);
      const j = i + delta;
      if (j < 0 || j >= u.hermanos.length) return;
      const ordenados = [...u.hermanos];
      [ordenados[i], ordenados[j]] = [ordenados[j], ordenados[i]];
      await guardarOrden(ordenados);
    });

  /** Anida bajo el hermano anterior (queda de último entre sus hijos). */
  const handleIndent = (itemId: string) =>
    conMovimiento(async () => {
      const u = ubicar(itemId);
      if (!u) return;
      const i = u.hermanos.findIndex((h) => h.id === itemId);
      if (i <= 0) return;
      const nuevoPadre = u.hermanos[i - 1];
      await websiteMenuGroupService.nestMenuItem(itemId, nuevoPadre.id);
      await websiteMenuGroupService.updateMenuItem(itemId, { display_order: nuevoPadre.children?.length ?? 0 });
      await guardarOrden(u.hermanos.filter((h) => h.id !== itemId));
    });

  /** Sube un nivel: queda justo después de su padre. */
  const handleOutdent = (itemId: string) =>
    conMovimiento(async () => {
      const u = ubicar(itemId);
      if (!u?.padre) return;
      const delPadre = ubicar(u.padre.id);
      if (!delPadre) return;
      await websiteMenuGroupService.nestMenuItem(itemId, u.padre.parent_item_id ?? null);
      const item = u.hermanos.find((h) => h.id === itemId)!;
      const destino = [...delPadre.hermanos];
      destino.splice(destino.findIndex((h) => h.id === u.padre!.id) + 1, 0, item);
      await guardarOrden(destino.map((h) => (h.id === itemId ? { ...h, display_order: -1 } : h)));
      await guardarOrden(u.hermanos.filter((h) => h.id !== itemId));
    });

  const renderItem = (item: MenuGroupItem, level: number = 0): React.ReactNode => {
    const config = itemTypeConfig[item.item_type] || itemTypeConfig.custom_link;
    const Icon = config.icon;
    const isExpanded = expandedIds.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const label = item.custom_label || item.page_title || item.category_name || 'Sin título';

    return (
      <div key={item.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-gray-100 dark:hover:bg-white/5 group',
            level > 0 && 'ml-' + (level * 4)
          )}
          style={{ marginLeft: level * 16 }}
        >

          {hasChildren ? (
            <button onClick={() => toggleExpand(item.id)} className="shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              )}
            </button>
          ) : (
            <div className="w-3 shrink-0" />
          )}

          <Icon className="h-3 w-3 text-gray-500 dark:text-gray-400 shrink-0" />
          <span className="text-xs flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
            {label}
          </span>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0', config.color)}>
            {config.label}
          </span>
          {item.badge && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500 text-white shrink-0">
              {item.badge}
            </span>
          )}

          {/* Acciones: orden, nivel y eliminar */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => handleMove(item.id, -1)}
              disabled={moviendo}
              className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-40"
              title="Subir"
              aria-label={`Subir ${label}`}
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleMove(item.id, 1)}
              disabled={moviendo}
              className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-40"
              title="Bajar"
              aria-label={`Bajar ${label}`}
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            {level < 2 && (
              <button
                onClick={() => handleIndent(item.id)}
                disabled={moviendo}
                className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-40"
                title="Anidar bajo el anterior"
                aria-label={`Anidar ${label} bajo el ítem anterior`}
              >
                <IndentIncrease className="h-3 w-3" />
              </button>
            )}
            {level > 0 && (
              <button
                onClick={() => handleOutdent(item.id)}
                disabled={moviendo}
                className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-40"
                title="Subir un nivel"
                aria-label={`Subir ${label} un nivel`}
              >
                <IndentDecrease className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="p-0.5 text-gray-400 hover:text-red-500"
              title="Eliminar"
              aria-label={`Eliminar ${label}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Hijos */}
        {hasChildren && isExpanded && (
          <div>
            {item.children!.map((child) => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header del editor */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {items.length} items
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setAddType('page');
              loadPages();
              setShowAddDialog(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Página
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setAddType('category');
              loadCategories();
              setShowAddDialog(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Categoría
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setAddType('custom_link');
              setShowAddDialog(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Enlace
          </Button>
        </div>
      </div>

      {/* Lista de items */}
      {items.length > 0 ? (
        <div className="space-y-0.5 rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-white dark:bg-gray-800/50">
          {items.map((item) => renderItem(item))}
        </div>
      ) : (
        <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
          No hay items en este menú. Agrega páginas, categorías o enlaces para comenzar.
        </div>
      )}

      {/* Dialog de agregar */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddDialog(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 w-[320px] max-h-[400px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">
              {addType === 'page' ? 'Agregar Página' : addType === 'category' ? 'Agregar Categoría' : 'Agregar Enlace'}
            </h3>

            {addType === 'page' && (
              <div className="space-y-1.5">
                {availablePages.length === 0 ? (
                  <p className="text-xs text-gray-400">Cargando páginas...</p>
                ) : (
                  availablePages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handleAddPage(page.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-white/5 text-left"
                    >
                      <FileText className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{page.title}</span>
                      <span className="text-[9px] text-gray-400">/{page.slug}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {addType === 'category' && (
              <div className="space-y-1">
                {availableCategories === null ? (
                  <p className="text-xs text-gray-400">Cargando categorías...</p>
                ) : availableCategories.length === 0 ? (
                  <p className="text-xs text-gray-400">No hay categorías activas en el inventario.</p>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 pb-1">
                      Lleva a la página de la categoría; sus subcategorías se muestran debajo en el sitio.
                    </p>
                    {(function filas(lista: AvailableCategory[], nivel: number): React.ReactNode[] {
                      return lista.flatMap((cat) => [
                        <button
                          key={cat.id}
                          onClick={() => handleAddCategory(cat.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-white/5 text-left"
                          style={{ paddingLeft: 8 + nivel * 14 }}
                        >
                          <Tag className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{cat.name}</span>
                          <span className="text-[9px] text-gray-400">/{cat.slug}</span>
                        </button>,
                        ...filas(cat.children, nivel + 1),
                      ]);
                    })(availableCategories, 0)}
                  </>
                )}
              </div>
            )}

            {addType === 'custom_link' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Texto del enlace"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="https://..."
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleAddCustomLink}
                  disabled={!customLabel.trim()}
                >
                  Agregar enlace
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
