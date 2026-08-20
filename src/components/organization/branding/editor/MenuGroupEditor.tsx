'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  Tag,
  Link as LinkIcon,
  Layers,
  Loader2,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  websiteMenuGroupService,
  type MenuGroupItem,
  type MenuItemType,
} from '@/lib/services/websiteMenuGroupService';
import { websitePageBuilderService, type WebsitePage } from '@/lib/services/websitePageBuilderService';

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

  const handleNestItem = async (itemId: string, parentId: string | null) => {
    try {
      await websiteMenuGroupService.nestMenuItem(itemId, parentId);
      loadItems();
    } catch (error) {
      console.error('Error nesting item:', error);
    }
  };

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
          <GripVertical className="h-3 w-3 text-gray-300 dark:text-gray-600 cursor-grab shrink-0 opacity-0 group-hover:opacity-100" />

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

          {/* Acciones */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {level === 0 && (
              <button
                onClick={() => handleNestItem(item.id, null)}
                className="p-0.5 text-gray-400 hover:text-blue-500"
                title="Mover al nivel raíz"
              >
                <Layers className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="p-0.5 text-gray-400 hover:text-red-500"
              title="Eliminar"
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
          No hay items en este menú. Agrega páginas o enlaces para comenzar.
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
              {addType === 'page' ? 'Agregar Página' : 'Agregar Enlace'}
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
