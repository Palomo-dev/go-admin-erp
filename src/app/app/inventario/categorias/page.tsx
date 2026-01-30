'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus,
  RefreshCw,
  FolderTree,
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  Copy,
  FolderPlus,
  Loader2,
  GripVertical,
  MoveRight,
} from 'lucide-react';

interface Categoria {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  rank: number;
  children?: Categoria[];
  level?: number;
}

interface FlatCategory {
  id: number;
  name: string;
  parent_id: number | null;
  rank: number;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export default function CategoriasPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [flatCategories, setFlatCategories] = useState<FlatCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const organizationId = getOrganizationId();
      
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', organizationId)
        .order('rank', { ascending: true });

      if (error) throw error;

      const hierarchy = buildHierarchy(data || []);
      setCategorias(hierarchy);
      
      const allIds = new Set((data || []).map(c => c.id));
      setExpandedIds(allIds);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las categorías',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const flat = flattenCategories(categorias, expandedIds);
    setFlatCategories(flat);
  }, [categorias, expandedIds]);

  const buildHierarchy = (flat: Categoria[]): Categoria[] => {
    const map = new Map<number, Categoria>();
    const roots: Categoria[] = [];

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
          parent.children!.push(node);
          node.level = (parent.level || 0) + 1;
        } else {
          roots.push(node);
        }
      }
    });

    const sortChildren = (cats: Categoria[]): Categoria[] => {
      return cats.sort((a, b) => a.rank - b.rank).map(cat => ({
        ...cat,
        children: sortChildren(cat.children || [])
      }));
    };

    return sortChildren(roots);
  };

  const flattenCategories = (cats: Categoria[], expanded: Set<number>, level = 0): FlatCategory[] => {
    const result: FlatCategory[] = [];
    
    cats.forEach(cat => {
      const hasChildren = !!(cat.children && cat.children.length > 0);
      const isExpanded = expanded.has(cat.id);
      
      result.push({
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id,
        rank: cat.rank,
        level,
        hasChildren,
        isExpanded
      });
      
      if (hasChildren && isExpanded) {
        result.push(...flattenCategories(cat.children!, expanded, level + 1));
      }
    });
    
    return result;
  };

  const handleDragEnd = async (result: DropResult) => {
    setDragOverId(null);
    
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    
    if (sourceIndex === destIndex) return;

    const draggedItem = flatCategories[sourceIndex];
    const targetItem = flatCategories[destIndex];
    
    if (!draggedItem || !targetItem) return;

    try {
      let newParentId: number | null = null;
      let newRank: number;

      // Si se suelta sobre un elemento con nivel mayor, se convierte en hijo
      if (targetItem.level > draggedItem.level || 
          (destIndex > sourceIndex && targetItem.hasChildren && targetItem.isExpanded)) {
        // Convertir en hijo del target
        newParentId = targetItem.id;
        newRank = 0;
      } else if (targetItem.level < draggedItem.level) {
        // Mover al mismo nivel que el target
        newParentId = targetItem.parent_id;
        newRank = targetItem.rank + 1;
      } else {
        // Mismo nivel - reordenar
        newParentId = targetItem.parent_id;
        newRank = destIndex > sourceIndex ? targetItem.rank + 1 : targetItem.rank;
      }

      const { error } = await supabase
        .from('categories')
        .update({ 
          parent_id: newParentId, 
          rank: newRank 
        })
        .eq('id', draggedItem.id);

      if (error) throw error;

      toast({ 
        title: 'Categoría movida',
        description: newParentId !== draggedItem.parent_id 
          ? 'La categoría se movió a una nueva ubicación'
          : 'El orden se actualizó correctamente'
      });
      
      loadData();
    } catch (error) {
      console.error('Error moviendo categoría:', error);
      toast({
        title: 'Error',
        description: 'No se pudo mover la categoría',
        variant: 'destructive',
      });
    }
  };

  const handleMakeChild = async (childId: number, newParentId: number) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ parent_id: newParentId, rank: 0 })
        .eq('id', childId);

      if (error) throw error;

      toast({ title: 'Categoría anidada correctamente' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo anidar la categoría',
        variant: 'destructive',
      });
    }
  };

  const handleMakeRoot = async (categoryId: number) => {
    try {
      const maxRankResult = await supabase
        .from('categories')
        .select('rank')
        .is('parent_id', null)
        .order('rank', { ascending: false })
        .limit(1);
      
      const newRank = (maxRankResult.data?.[0]?.rank || 0) + 1;

      const { error } = await supabase
        .from('categories')
        .update({ parent_id: null, rank: newRank })
        .eq('id', categoryId);

      if (error) throw error;

      toast({ title: 'Categoría movida a raíz' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo mover la categoría',
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = () => loadData(true);
  const handleCreate = () => router.push('/app/inventario/categorias/nuevo');
  const handleEdit = (id: number) => router.push(`/app/inventario/categorias/${id}/editar`);
  const handleAddChild = (parentId: number) => router.push(`/app/inventario/categorias/nuevo?parent=${parentId}`);

  const handleDuplicate = async (id: number) => {
    try {
      const organizationId = getOrganizationId();
      const { data: original } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (!original) throw new Error('Categoría no encontrada');

      const { error } = await supabase
        .from('categories')
        .insert({
          organization_id: organizationId,
          parent_id: original.parent_id,
          name: `${original.name} (copia)`,
          slug: `${original.slug}-copia`,
          rank: original.rank + 1
        });

      if (error) throw error;

      toast({ title: 'Categoría duplicada' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la categoría',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (id: number) => {
    setCategoryToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryToDelete);

      if (error) throw error;

      toast({ title: 'Categoría eliminada' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la categoría',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setCategoryToDelete(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filterFlat = (cats: FlatCategory[], term: string): FlatCategory[] => {
    if (!term) return cats;
    return cats.filter(c => c.name.toLowerCase().includes(term.toLowerCase()));
  };

  const countTotal = (cats: Categoria[]): number => {
    return cats.reduce((sum, cat) => sum + 1 + countTotal(cat.children || []), 0);
  };

  const filteredFlat = filterFlat(flatCategories, searchTerm);
  const totalCount = countTotal(categorias);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <FolderTree className="h-6 w-6 text-blue-600" />
              </div>
              Categorías de Productos
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Categorías - Arrastra para reordenar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Categoría
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FolderTree className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <FolderTree className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Raíz</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{categorias.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <GripVertical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Drag & Drop</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Activo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <MoveRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tip</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">Arrastra sobre otra para anidar</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar categorías..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Árbol de Categorías con Drag & Drop */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 dark:text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-blue-600" />
              Estructura de Categorías
            </span>
            <span className="text-sm font-normal text-gray-500">
              {totalCount} categoría(s)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredFlat.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No hay categorías</p>
              <p className="text-sm mt-1">Crea tu primera categoría para organizar tus productos</p>
              <Button onClick={handleCreate} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Crear Categoría
              </Button>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="categories">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-1"
                  >
                    {filteredFlat.map((cat, index) => (
                      <Draggable key={cat.id} draggableId={cat.id.toString()} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all group ${
                              snapshot.isDragging 
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-lg' 
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                            style={{
                              ...provided.draggableProps.style,
                              marginLeft: `${cat.level * 24}px`,
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                {...provided.dragHandleProps}
                                className="p-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>

                              {cat.hasChildren ? (
                                <button
                                  onClick={() => toggleExpand(cat.id)}
                                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                >
                                  {cat.isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-6" />
                              )}
                              
                              <FolderTree className={`h-5 w-5 ${cat.level === 0 ? 'text-blue-500' : 'text-gray-400'}`} />
                              
                              <span className="font-medium text-gray-900 dark:text-white truncate">
                                {cat.name}
                              </span>

                              {cat.hasChildren && (
                                <Badge variant="secondary" className="text-xs">
                                  {cat.isExpanded ? '−' : '+'}
                                </Badge>
                              )}

                              {cat.level > 0 && (
                                <Badge variant="outline" className="text-xs text-gray-500">
                                  Nivel {cat.level}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {cat.level > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMakeRoot(cat.id)}
                                  className="h-8 w-8 p-0"
                                  title="Mover a raíz"
                                >
                                  <MoveRight className="h-4 w-4 rotate-180" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddChild(cat.id)}
                                className="h-8 w-8 p-0"
                                title="Agregar subcategoría"
                              >
                                <FolderPlus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(cat.id)}
                                className="h-8 w-8 p-0"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicate(cat.id)}
                                className="h-8 w-8 p-0"
                                title="Duplicar"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(cat.id)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      {/* Navegación Rápida */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <Link href="/app/inventario">
              <Button variant="outline" size="sm">← Volver a Inventario</Button>
            </Link>
            <Link href="/app/inventario/productos">
              <Button variant="outline" size="sm">Productos</Button>
            </Link>
            <Link href="/app/inventario/etiquetas">
              <Button variant="outline" size="sm">Etiquetas</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Confirmación de Eliminación */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar categoría?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. La categoría será eliminada permanentemente.
              Las subcategorías quedarán huérfanas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
