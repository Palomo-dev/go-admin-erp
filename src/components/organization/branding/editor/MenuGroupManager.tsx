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
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Menu as MenuIcon,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  websiteMenuGroupService,
  type MenuGroup,
} from '@/lib/services/websiteMenuGroupService';
import MenuGroupEditor from './MenuGroupEditor';

interface MenuGroupManagerProps {
  organizationId: number;
  selectedMenuId?: string | null;
  onSelectMenu?: (menuId: string | null) => void;
}

export default function MenuGroupManager({
  organizationId,
  selectedMenuId,
  onSelectMenu,
}: MenuGroupManagerProps) {
  const [menus, setMenus] = useState<MenuGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuLocation, setNewMenuLocation] = useState<'header' | 'footer' | 'both' | 'none'>('footer');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadMenus = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await websiteMenuGroupService.getMenus(organizationId);
      setMenus(data);
    } catch (error) {
      console.error('Error loading menus:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  const handleCreate = async () => {
    if (!newMenuName.trim()) return;
    try {
      const slug = newMenuName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const created = await websiteMenuGroupService.createMenu(organizationId, {
        name: newMenuName,
        slug,
        location: newMenuLocation,
      });
      setNewMenuName('');
      setShowCreateForm(false);
      loadMenus();
      setExpandedMenuId(created.id);
      onSelectMenu?.(created.id);
    } catch (error) {
      console.error('Error creating menu:', error);
    }
  };

  const handleDelete = async (menuId: string) => {
    if (!confirm('¿Eliminar este menú y todos sus items?')) return;
    try {
      await websiteMenuGroupService.deleteMenu(menuId);
      if (expandedMenuId === menuId) setExpandedMenuId(null);
      if (selectedMenuId === menuId) onSelectMenu?.(null);
      loadMenus();
    } catch (error) {
      console.error('Error deleting menu:', error);
    }
  };

  const handleRename = async (menuId: string) => {
    if (!editName.trim()) return;
    try {
      await websiteMenuGroupService.updateMenu(menuId, { name: editName });
      setEditingId(null);
      loadMenus();
    } catch (error) {
      console.error('Error renaming menu:', error);
    }
  };

  const toggleExpand = (menuId: string) => {
    setExpandedMenuId((prev) => (prev === menuId ? null : menuId));
    onSelectMenu?.(menuId);
  };

  const locationLabels: Record<string, string> = {
    header: 'Header',
    footer: 'Footer',
    both: 'Ambos',
    none: 'Sin asignar',
  };

  const locationColors: Record<string, string> = {
    header: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    footer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    both: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    none: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Menús Nombrados
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Nuevo
        </Button>
      </div>

      {/* Formulario de creación */}
      {showCreateForm && (
        <div className="space-y-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre del menú</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ej: Menú Principal, Menú Footer..."
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ubicación</Label>
            <Select value={newMenuLocation} onValueChange={(v) => setNewMenuLocation(v as typeof newMenuLocation)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="footer">Footer</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
                <SelectItem value="none">Sin asignar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreate} disabled={!newMenuName.trim()}>
              <Check className="h-3 w-3 mr-1" />
              Crear
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreateForm(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Lista de menús */}
      {menus.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
          No hay menús creados. Crea uno nuevo para comenzar.
        </div>
      ) : (
        <div className="space-y-1.5">
          {menus.map((menu) => {
            const isExpanded = expandedMenuId === menu.id;
            const isEditing = editingId === menu.id;
            const isSelected = selectedMenuId === menu.id;

            return (
              <div key={menu.id}>
                {/* Fila del menú */}
                <div
                  className={cn(
                    'flex items-center gap-2 py-2 px-2.5 rounded-lg border transition-colors cursor-pointer',
                    isSelected
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5'
                  )}
                  onClick={() => toggleExpand(menu.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  )}
                  <MenuIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" />

                  {isEditing ? (
                    <Input
                      className="h-6 text-xs flex-1"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(menu.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs font-medium flex-1 truncate text-gray-700 dark:text-gray-200">
                      {menu.name}
                    </span>
                  )}

                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                    locationColors[menu.location] || locationColors.footer
                  )}>
                    {locationLabels[menu.location] || menu.location}
                  </span>

                  {/* Acciones */}
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isEditing && (
                      <button
                        onClick={() => {
                          setEditingId(menu.id);
                          setEditName(menu.name);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded"
                        title="Renombrar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => handleRename(menu.id)}
                          className="p-1 text-gray-400 hover:text-green-500 rounded"
                          title="Guardar"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(menu.id)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Editor de items del menú */}
                {isExpanded && (
                  <div className="mt-1.5 ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                    <MenuGroupEditor menuId={menu.id} organizationId={organizationId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
