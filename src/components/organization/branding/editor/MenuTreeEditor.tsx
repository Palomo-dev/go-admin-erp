'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Tag,
  FolderTree,
} from 'lucide-react';
import { websiteMenuService, AvailableCategory } from '@/lib/services/websiteMenuService';
import {
  websitePageBuilderService,
  WebsitePage,
  WebsitePageWithChildren,
} from '@/lib/services/websitePageBuilderService';
import { cn } from '@/utils/Utils';

// ============================================================
// PROPS
// ============================================================

interface MenuTreeEditorProps {
  organizationId: number;
  pendingUpdatesRef?: React.MutableRefObject<Map<string, Record<string, unknown>>>;
  onPendingChanges?: (hasPending: boolean) => void;
}

// ============================================================
// HELPERS DE ÁRBOL (optimistas)
// ============================================================

/** Actualiza un item del árbol in-place recursivamente */
function updateItemInTree(
  items: WebsitePageWithChildren[],
  pageId: string,
  updater: (item: WebsitePageWithChildren) => WebsitePageWithChildren
): WebsitePageWithChildren[] {
  return items.map(item => {
    if (item.id === pageId) {
      return updater(item);
    }
    if (item.children.length > 0) {
      return { ...item, children: updateItemInTree(item.children, pageId, updater) };
    }
    return item;
  });
}

/** Remueve un item del árbol recursivamente */
function removeFromTree(
  items: WebsitePageWithChildren[],
  pageId: string
): WebsitePageWithChildren[] {
  return items
    .filter(item => item.id !== pageId)
    .map(item => ({
      ...item,
      children: item.children.length > 0 ? removeFromTree(item.children, pageId) : [],
    }));
}

/** Reordena dos items al mismo nivel (swap de posiciones reales en el array) */
function swapInTree(
  items: WebsitePageWithChildren[],
  idA: string,
  idB: string
): { tree: WebsitePageWithChildren[]; updates: { id: string; header_order: number }[] } | null {
  // Buscar el array de siblings que contiene AMBOS items
  const findSiblingArray = (
    nodes: WebsitePageWithChildren[]
  ): WebsitePageWithChildren[] | null => {
    const hasA = nodes.some(n => n.id === idA);
    const hasB = nodes.some(n => n.id === idB);
    if (hasA && hasB) return nodes;
    for (const node of nodes) {
      if (node.children.length > 0) {
        const found = findSiblingArray(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const siblings = findSiblingArray(items);
  if (!siblings) return null;

  const idxA = siblings.findIndex(n => n.id === idA);
  const idxB = siblings.findIndex(n => n.id === idB);
  if (idxA < 0 || idxB < 0) return null;

  // Crear nuevo array de siblings con swap
  const newSiblings = [...siblings];
  const tmp = newSiblings[idxA];
  newSiblings[idxA] = newSiblings[idxB];
  newSiblings[idxB] = tmp;

  // Reasignar header_order secuencialmente y recopilar updates
  const updates: { id: string; header_order: number }[] = [];
  const reorderedSiblings = newSiblings.map((n, i) => {
    if (n.header_order !== i) {
      updates.push({ id: n.id, header_order: i });
    }
    return { ...n, header_order: i };
  });

  if (updates.length === 0) return null;

  // Reemplazar el array de siblings en el árbol original
  const replaceSiblings = (
    nodes: WebsitePageWithChildren[]
  ): WebsitePageWithChildren[] => {
    // Si este es el array de siblings, reemplazarlo
    if (nodes === siblings) {
      return reorderedSiblings;
    }
    // Si no, buscar recursivamente
    return nodes.map(node => ({
      ...node,
      children: node.children.length > 0 ? replaceSiblings(node.children) : [],
    }));
  };

  const newTree = replaceSiblings(items);
  return { tree: newTree, updates };
}

/** Aplana el árbol a lista */
function flattenTree(items: WebsitePageWithChildren[]): WebsitePage[] {
  const result: WebsitePage[] = [];
  const walk = (nodes: WebsitePageWithChildren[]) => {
    nodes.forEach(n => {
      result.push(n);
      if (n.children.length > 0) walk(n.children);
    });
  };
  walk(items);
  return result;
}

/** Buscar los siblings de un item (mismo parent_page_id) en el árbol */
function findSiblings(
  items: WebsitePageWithChildren[],
  pageId: string,
  parent: string | null
): WebsitePageWithChildren[] | null {
  // Si el item está en este nivel
  const item = items.find(n => n.id === pageId);
  if (item && (item.parent_page_id ?? null) === (parent ?? null)) {
    return items;
  }
  // Buscar recursivamente en los hijos
  for (const node of items) {
    if (node.children.length > 0) {
      const found = findSiblings(node.children, pageId, node.id);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================
// ITEM ROW (renderizado recursivo del árbol)
// ============================================================

interface MenuItemRowProps {
  item: WebsitePageWithChildren;
  level: number;
  expandedIds: Set<string>;
  editingId: string | null;
  availableCategories: AvailableCategory[];
  draggedId: string | null;
  dragOverId: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string | null) => void;
  onNest: (pageId: string, parentId: string | null) => void;
  onRemove: (pageId: string) => void;
  onLinkCategory: (pageId: string, categoryId: number | null) => void;
  onUpdateBadge: (pageId: string, badge: string | null) => void;
  onUpdateIcon: (pageId: string, icon: string | null) => void;
  onMoveUp: (pageId: string) => void;
  onMoveDown: (pageId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
}

function MenuItemRow({
  item,
  level,
  expandedIds,
  editingId,
  availableCategories,
  draggedId,
  dragOverId,
  onToggle,
  onEdit,
  onNest,
  onRemove,
  onLinkCategory,
  onUpdateBadge,
  onUpdateIcon,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: MenuItemRowProps) {
  const isExpanded = expandedIds.has(item.id);
  const isEditing = editingId === item.id;
  const hasChildren = item.children.length > 0;
  const isDragging = draggedId === item.id;
  const isDragOver = dragOverId === item.id && draggedId !== item.id;

  const flatCategories = availableCategories.filter(
    c => !c.is_linked || c.linked_page_id === item.id
  );

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(item.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(e, item.id);
        }}
        onDragEnd={onDragEnd}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(item.id);
        }}
        className={cn(
          'flex items-center gap-2 py-2 border-b border-gray-100 transition-colors',
          isDragging
            ? 'opacity-40 bg-blue-50 dark:bg-blue-950/30'
            : isDragOver
              ? 'bg-blue-50 border-t-2 border-t-blue-400 dark:bg-blue-950/20'
              : 'hover:bg-gray-50'
        )}
        style={{ paddingLeft: level * 20 }}
      >
        <GripVertical
          className={cn(
            'h-4 w-4 flex-shrink-0 cursor-grab active:cursor-grabbing',
            isDragging ? 'text-blue-500' : 'text-gray-300'
          )}
        />

        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(item.id)}
            className="flex-shrink-0 text-gray-500 hover:text-gray-700"
            aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {item.menu_icon ? (
          <span className="text-base flex-shrink-0">{item.menu_icon}</span>
        ) : (
          item.linked_category_id ? (
            <Tag className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <FolderTree className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )
        )}

        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{item.title}</span>

        {item.linked_category_id && (
          <Badge variant="secondary" className="text-xs">
            {availableCategories.find(c => c.id === item.linked_category_id)?.name || 'Categoría'}
          </Badge>
        )}
        {item.menu_badge && (
          <Badge variant="default" className="text-xs">{item.menu_badge}</Badge>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onMoveUp(item.id)}
          className="h-7 w-7 p-0"
          title="Mover arriba"
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onMoveDown(item.id)}
          className="h-7 w-7 p-0"
          title="Mover abajo"
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(isEditing ? null : item.id)}
          className="h-7 px-2"
        >
          {isEditing ? 'Cerrar' : 'Editar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(item.id)}
          className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
          title="Quitar del menú"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isEditing && (
        <div
          className="bg-gray-50 p-3 rounded-md space-y-3 border border-gray-200"
          style={{ marginLeft: level * 20 }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600">Icono (emoji)</Label>
              <Input
                value={item.menu_icon ?? ''}
                onChange={(e) => onUpdateIcon(item.id, e.target.value || null)}
                placeholder="🏠"
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Badge</Label>
              <Input
                value={item.menu_badge ?? ''}
                onChange={(e) => onUpdateBadge(item.id, e.target.value || null)}
                placeholder="Nuevo"
                className="h-8"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Vincular a categoría</Label>
            <Select
              value={item.linked_category_id ? String(item.linked_category_id) : 'none'}
              onValueChange={(value) => {
                const categoryId = value === 'none' ? null : Number(value);
                onLinkCategory(item.id, categoryId);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {flatCategories.map(cat => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateBadge(item.id, null)}
            >
              Limpiar badge
            </Button>
          </div>
        </div>
      )}

      {isExpanded && hasChildren && (
        <div>
          {item.children.map(child => (
            <MenuItemRow
              key={child.id}
              item={child}
              level={level + 1}
              expandedIds={expandedIds}
              editingId={editingId}
              availableCategories={availableCategories}
              draggedId={draggedId}
              dragOverId={dragOverId}
              onToggle={onToggle}
              onEdit={onEdit}
              onNest={onNest}
              onRemove={onRemove}
              onLinkCategory={onLinkCategory}
              onUpdateBadge={onUpdateBadge}
              onUpdateIcon={onUpdateIcon}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function MenuTreeEditor({ organizationId, pendingUpdatesRef, onPendingChanges }: MenuTreeEditorProps) {
  const [menuTree, setMenuTree] = useState<WebsitePageWithChildren[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AvailableCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Cambios pendientes (se guardan al presionar "Guardar" en el editor)
  const pendingMenuUpdates = useRef<Map<string, {
    header_order?: number;
    show_in_header?: boolean;
    menu_icon?: string | null;
    menu_badge?: string | null;
    linked_category_id?: number | null;
    parent_page_id?: string | null;
  }>>(new Map());

  const markPending = (pageId: string, updates: { header_order?: number; show_in_header?: boolean; menu_icon?: string | null; menu_badge?: string | null; linked_category_id?: number | null; parent_page_id?: string | null }) => {
    // Actualizar ref local
    const existing = pendingMenuUpdates.current.get(pageId) || {};
    pendingMenuUpdates.current.set(pageId, { ...existing, ...updates });
    // También actualizar el ref del parent (para que se guarde al presionar "Guardar")
    if (pendingUpdatesRef) {
      const parentExisting = pendingUpdatesRef.current.get(pageId) || {};
      pendingUpdatesRef.current.set(pageId, { ...parentExisting, ...updates });
    }
    onPendingChanges?.(pendingMenuUpdates.current.size > 0);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [availablePages, setAvailablePages] = useState<WebsitePage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Drag & drop
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Ref para acceso sincrónico al estado más reciente (evita stale closures)
  const menuTreeRef = useRef(menuTree);
  useEffect(() => {
    menuTreeRef.current = menuTree;
  }, [menuTree]);

  // Resize del contenedor
  const [containerHeight, setContainerHeight] = useState(400);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // ---- CARGA INICIAL (solo al montar) ----
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pageTree, categories, allPages] = await Promise.all([
        websitePageBuilderService.getMenuTree(organizationId),
        websiteMenuService.getAvailableCategories(organizationId),
        websitePageBuilderService.getPages(organizationId),
      ]);
      setMenuTree(pageTree);
      setAvailableCategories(categories);
      setAvailablePages(allPages.filter(p => !p.show_in_header));
      const allIds = new Set<string>();
      const collect = (items: WebsitePageWithChildren[]) => {
        items.forEach(i => {
          allIds.add(i.id);
          if (i.children.length > 0) collect(i.children);
        });
      };
      collect(pageTree);
      setExpandedIds(allIds);
    } catch (error) {
      console.error('Error cargando menú:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- RESIZE DEL CONTENEDOR ----
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientY - startY.current;
      const newHeight = Math.max(200, Math.min(800, startHeight.current + delta));
      setContainerHeight(newHeight);
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    startY.current = e.clientY;
    startHeight.current = containerHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  // ---- ACCIONES OPTIMISTAS ----
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Reordenar: swap optimista LOCAL (sin llamar al backend, se guarda al presionar "Guardar")
  const handleSwap = useCallback(
    (idA: string, idB: string) => {
      const currentTree = menuTreeRef.current;
      const result = swapInTree(currentTree, idA, idB);
      if (!result) return;
      // Update optimista inmediato (state + ref sincronizado)
      menuTreeRef.current = result.tree;
      setMenuTree(result.tree);
      // Marcar cambios pendientes (no se guarda al backend aquí)
      result.updates.forEach(u => markPending(u.id, { header_order: u.header_order }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleMoveUp = useCallback(
    (pageId: string) => {
      const currentTree = menuTreeRef.current;
      const flat = flattenTree(currentTree);
      const item = flat.find(p => p.id === pageId);
      if (!item) return;
      const siblings = findSiblings(currentTree, pageId, item.parent_page_id ?? null);
      if (!siblings) return;
      const idx = siblings.findIndex(s => s.id === pageId);
      if (idx <= 0) return;
      handleSwap(pageId, siblings[idx - 1].id);
    },
    [handleSwap]
  );

  const handleMoveDown = useCallback(
    (pageId: string) => {
      const currentTree = menuTreeRef.current;
      const flat = flattenTree(currentTree);
      const item = flat.find(p => p.id === pageId);
      if (!item) return;
      const siblings = findSiblings(currentTree, pageId, item.parent_page_id ?? null);
      if (!siblings) return;
      const idx = siblings.findIndex(s => s.id === pageId);
      if (idx < 0 || idx >= siblings.length - 1) return;
      handleSwap(pageId, siblings[idx + 1].id);
    },
    [handleSwap]
  );

  // Drag & drop: al soltar, buscar item destino y hacer swap
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      handleSwap(draggedId, targetId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  // Actualizar icono: optimista LOCAL
  const handleUpdateIcon = useCallback(
    (pageId: string, icon: string | null) => {
      setMenuTree(prev =>
        updateItemInTree(prev, pageId, item => ({ ...item, menu_icon: icon }))
      );
      markPending(pageId, { menu_icon: icon });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Actualizar badge: optimista LOCAL
  const handleUpdateBadge = useCallback(
    (pageId: string, badge: string | null) => {
      setMenuTree(prev =>
        updateItemInTree(prev, pageId, item => ({ ...item, menu_badge: badge }))
      );
      markPending(pageId, { menu_badge: badge });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Vincular categoría: optimista LOCAL
  const handleLinkCategory = useCallback(
    (pageId: string, categoryId: number | null) => {
      setMenuTree(prev =>
        updateItemInTree(prev, pageId, item => ({
          ...item,
          linked_category_id: categoryId,
        }))
      );
      markPending(pageId, { linked_category_id: categoryId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Anidar: optimista LOCAL (recarga para reconstruir jerarquía visual)
  const handleNest = useCallback(
    async (pageId: string, parentId: string | null) => {
      markPending(pageId, { parent_page_id: parentId });
      // TODO: reconstruir jerarquía local sin recargar
      await loadData();
      // Re-aplicar cambios pendientes después de recargar
      onPendingChanges?.(pendingMenuUpdates.current.size > 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadData, onPendingChanges]
  );

  // Quitar del menú: optimista LOCAL
  const handleRemoveFromMenu = useCallback(
    (pageId: string) => {
      const removed = flattenTree(menuTreeRef.current).find(p => p.id === pageId);
      setMenuTree(prev => removeFromTree(prev, pageId));
      // Actualizar páginas disponibles
      if (removed) {
        setAvailablePages(prev => [...prev, removed].sort((a, b) => a.title.localeCompare(b.title)));
      }
      markPending(pageId, { show_in_header: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Agregar categoría: necesita crear página virtual en el backend
  const handleAddCategory = useCallback(
    async (categoryId: number) => {
      try {
        await websiteMenuService.addCategoryToMenu(organizationId, categoryId);
        await loadData();
        setSelectedCategoryIds(new Set());
        setShowCategoryPicker(false);
      } catch (error) {
        console.error('Error agregando categoría al menú:', error);
      }
    },
    [organizationId, loadData]
  );

  // Agregar páginas: optimista LOCAL
  const handleAddPagesToMenu = useCallback(
    async () => {
      setIsSaving(true);
      const headerCount = menuTreeRef.current.length;
      const items = Array.from(selectedPageIds);
      // Update optimista: mover páginas al árbol localmente
      const newItems: WebsitePageWithChildren[] = items.map((id, i) => {
        const page = availablePages.find(p => p.id === id);
        if (!page) return null;
        return {
          ...page,
          show_in_header: true,
          header_order: headerCount + i,
          children: [],
          level: 0,
        } as WebsitePageWithChildren;
      }).filter((p): p is WebsitePageWithChildren => p !== null);
      setMenuTree(prev => [...prev, ...newItems]);
      // Quitar de disponibles
      setAvailablePages(prev => prev.filter(p => !selectedPageIds.has(p.id)));
      // Marcar cambios pendientes
      items.forEach((id, i) => {
        markPending(id, { show_in_header: true, header_order: headerCount + i });
      });
      setSelectedPageIds(new Set());
      setShowPagePicker(false);
      setIsSaving(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availablePages, selectedPageIds]
  );

  const togglePageSelection = (id: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategorySelection = (id: number) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- RENDER ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Cargando menú...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Árbol del Menú del Header
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowPagePicker(!showPagePicker); setShowCategoryPicker(false); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar Página
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowCategoryPicker(!showCategoryPicker); setShowPagePicker(false); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar Categoría
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        💡 Arrastra los items para reordenar. Usa ↑ ↓ como alternativa.
      </p>

      {showPagePicker && (
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
          <p className="text-xs text-gray-600">
            Selecciona las páginas que quieres agregar al menú del header:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {availablePages.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                No hay páginas disponibles. Todas las páginas ya están en el menú o no existen páginas creadas.
              </p>
            ) : (
              availablePages.map(page => (
                <label
                  key={page.id}
                  className="flex items-center gap-2 p-2 rounded cursor-pointer text-sm hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={selectedPageIds.has(page.id)}
                    onChange={() => togglePageSelection(page.id)}
                  />
                  <FolderTree className="h-3.5 w-3.5 text-gray-400" />
                  <span className="flex-1 font-medium">{page.title}</span>
                  <span className="text-xs text-gray-400">/{page.slug}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowPagePicker(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={selectedPageIds.size === 0 || isSaving}
              onClick={handleAddPagesToMenu}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Agregar ${selectedPageIds.size || ''}`}
            </Button>
          </div>
        </div>
      )}

      {showCategoryPicker && (
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
          <p className="text-xs text-gray-600">
            Selecciona las categorías que quieres agregar como items del menú:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {availableCategories.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No hay categorías disponibles.</p>
            ) : (
              availableCategories.map(cat => (
                <label
                  key={cat.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded cursor-pointer text-sm',
                    cat.is_linked
                      ? 'opacity-50 cursor-not-allowed bg-gray-100'
                      : 'hover:bg-white'
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={cat.is_linked}
                    checked={selectedCategoryIds.has(cat.id)}
                    onChange={() => toggleCategorySelection(cat.id)}
                  />
                  {cat.icon && <span>{cat.icon}</span>}
                  <span className="flex-1">{cat.name}</span>
                  {cat.is_linked && <Badge variant="secondary" className="text-xs">Vinculada</Badge>}
                </label>
              ))
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCategoryPicker(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={selectedCategoryIds.size === 0 || isSaving}
              onClick={async () => {
                setIsSaving(true);
                try {
                  for (const catId of selectedCategoryIds) {
                    await handleAddCategory(catId);
                  }
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
            </Button>
          </div>
        </div>
      )}

      {menuTree.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-200 rounded-md">
          No hay items en el menú. Agrega páginas con el botón &quot;Agregar Página&quot; o categorías con &quot;Agregar Categoría&quot;.
        </div>
      ) : (
        <div className="relative">
          <div
            className="border border-gray-200 rounded-md overflow-y-auto overflow-x-hidden"
            style={{ height: containerHeight }}
          >
            {menuTree.map(item => (
              <MenuItemRow
                key={item.id}
                item={item}
                level={0}
                expandedIds={expandedIds}
                editingId={editingId}
                availableCategories={availableCategories}
                draggedId={draggedId}
                dragOverId={dragOverId}
                onToggle={toggleExpand}
                onEdit={setEditingId}
                onNest={handleNest}
                onRemove={handleRemoveFromMenu}
                onLinkCategory={handleLinkCategory}
                onUpdateBadge={handleUpdateBadge}
                onUpdateIcon={handleUpdateIcon}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
              />
            ))}
          </div>
          {/* Resize handle */}
          <div
            ref={resizeRef}
            onMouseDown={startResize}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-gray-200 hover:bg-blue-400 transition-colors rounded-b-md"
            title="Arrastra para redimensionar"
          >
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-0.5 bg-gray-400 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
