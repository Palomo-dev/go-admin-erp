'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/utils/Utils';
import {
  Plus,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  Copy,
  FolderPlus,
  MoreVertical,
  Eye,
  Package,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ToggleLeft,
  ImageIcon,
  Palette,
  Tag,
  GripVertical,
  Home,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { FlatNode } from './useCategories';

interface CategoriesTreeTableProps {
  filtered: FlatNode[];
  searchTerm: string;
  onToggleExpand: (id: number) => void;
  onToggleActive: (id: number, current: boolean) => void;
  onDuplicate: (id: number) => void;
  onMakeRoot: (id: number) => void;
  onDelete: (id: number) => void;
  onMoveToParent?: (categoryId: number, newParentId: number | null) => void;
}

export function CategoriesTreeTable({
  filtered,
  searchTerm,
  onToggleExpand,
  onToggleActive,
  onDuplicate,
  onMakeRoot,
  onDelete,
  onMoveToParent,
}: CategoriesTreeTableProps) {
  const router = useRouter();
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  const renderCatIcon = (iconName: string | null, color: string) => {
    if (!iconName) return null;
    const IconComp = (LucideIcons as any)[iconName];
    if (!IconComp) return null;
    return (
      <div
        className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <IconComp className="h-3.5 w-3.5" style={{ color }} />
      </div>
    );
  };

  const isDescendant = (parentId: number, childId: number): boolean => {
    const childNode = filtered.find(n => n.category.id === childId);
    if (!childNode) return false;
    let current = childNode.category.parent_id;
    while (current !== null) {
      if (current === parentId) return true;
      const parent = filtered.find(n => n.category.id === current);
      current = parent?.category.parent_id ?? null;
    }
    return false;
  };

  const ROOT_DROP_INDEX = filtered.length;

  const handleDragEnd = (result: DropResult) => {
    setDragOverId(null);
    setDragOverRoot(false);
    if (!result.destination || !onMoveToParent) return;

    const draggedId = parseInt(result.draggableId);
    const destinationIndex = result.destination.index;

    // Si se soltó en la fila "mover a raíz"
    if (destinationIndex >= ROOT_DROP_INDEX) {
      const draggedNode = filtered.find(n => n.category.id === draggedId);
      if (draggedNode?.category.parent_id !== null) {
        onMoveToParent(draggedId, null);
      }
      return;
    }

    const targetNode = filtered[destinationIndex];
    if (!targetNode) return;

    const targetId = targetNode.category.id;

    if (draggedId === targetId) return;
    if (isDescendant(draggedId, targetId)) return;

    const draggedNode = filtered.find(n => n.category.id === draggedId);
    if (draggedNode?.category.parent_id === targetId) return;

    onMoveToParent(draggedId, targetId);
  };

  const handleDragUpdate = (update: any) => {
    if (!update.destination) {
      setDragOverId(null);
      setDragOverRoot(false);
      return;
    }
    const destIndex = update.destination.index;
    if (destIndex >= ROOT_DROP_INDEX) {
      setDragOverId(null);
      setDragOverRoot(true);
      return;
    }
    setDragOverRoot(false);
    const targetNode = filtered[destIndex];
    if (targetNode) {
      const draggedId = parseInt(update.draggableId);
      if (targetNode.category.id !== draggedId) {
        setDragOverId(targetNode.category.id);
      }
    }
  };

  if (filtered.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="text-center py-16 px-4">
          <FolderTree className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            {searchTerm ? 'Sin resultados' : 'No hay categorías'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Crea tu primera categoría'}
          </p>
          {!searchTerm && (
            <Button onClick={() => router.push('/app/inventario/categorias/nuevo')} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Crear Categoría
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <DragDropContext onDragEnd={handleDragEnd} onDragUpdate={handleDragUpdate}>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableHead className="w-[40px]" />
                <TableHead className="w-[350px]">
                  <span className="flex items-center gap-1.5"><FolderTree className="h-3.5 w-3.5" /> Nombre</span>
                </TableHead>
                <TableHead className="w-[60px] text-center">
                  <span className="flex items-center justify-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Color</span>
                </TableHead>
                <TableHead className="w-[80px] text-center">
                  <span className="flex items-center justify-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Imagen</span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Estado</span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="flex items-center justify-center gap-1.5"><Package className="h-3.5 w-3.5" /> Productos</span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="flex items-center justify-center gap-1.5"><FolderTree className="h-3.5 w-3.5" /> Hijas</span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="flex items-center justify-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Slug</span>
                </TableHead>
                <TableHead className="w-[100px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <Droppable droppableId="categories-tree">
              {(provided) => (
                <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                  {filtered.map((node, index) => {
                    const cat = node.category;
                    const isDragTarget = dragOverId === cat.id;
                    return (
                      <Draggable key={cat.id} draggableId={cat.id.toString()} index={index}>
                        {(provided, snapshot) => (
                          <TableRow
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              'hover:bg-gray-50 dark:hover:bg-gray-800/30 group transition-colors',
                              snapshot.isDragging && 'bg-blue-50 dark:bg-blue-900/20 shadow-lg',
                              isDragTarget && !snapshot.isDragging && 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400 ring-inset',
                            )}
                          >
                            {/* Drag handle */}
                            <TableCell className="w-[40px] px-2">
                              <div
                                {...provided.dragHandleProps}
                                className="flex items-center justify-center cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                title="Arrastra para mover a otra categoría"
                              >
                                <GripVertical className="h-4 w-4 text-gray-400" />
                              </div>
                            </TableCell>

                            {/* Nombre con árbol */}
                            <TableCell>
                              <div className="flex items-center gap-1.5" style={{ paddingLeft: `${node.level * 24}px` }}>
                                {node.hasChildren ? (
                                  <button onClick={() => onToggleExpand(cat.id)} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                                    {node.isExpanded
                                      ? <ChevronDown className="h-4 w-4 text-gray-400" />
                                      : <ChevronRight className="h-4 w-4 text-gray-400" />}
                                  </button>
                                ) : (
                                  <span className="w-5 flex-shrink-0" />
                                )}
                                {renderCatIcon(cat.icon || null, cat.color || '#3B82F6')}
                                {!cat.icon && (
                                  <span className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-200 dark:border-gray-600" style={{ backgroundColor: cat.color || '#3B82F6' }} />
                                )}
                                <Link href={`/app/inventario/categorias/${cat.uuid}`} className="font-medium text-gray-900 dark:text-white truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                  {cat.name}
                                </Link>
                                {node.level > 0 && (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex-shrink-0">
                                    Nv.{node.level}
                                  </span>
                                )}
                                {isDragTarget && !snapshot.isDragging && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-white font-medium flex-shrink-0 animate-pulse">
                                    Soltar aquí → subcategoría
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            {/* Color */}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center">
                                <span className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 inline-block" style={{ backgroundColor: cat.color || '#3B82F6' }} title={cat.color || '#3B82F6'} />
                              </div>
                            </TableCell>

                            {/* Imagen */}
                            <TableCell className="text-center">
                              {cat.image_url ? (
                                <img src={cat.image_url} alt={cat.name} className="w-8 h-8 rounded-md object-cover mx-auto border border-gray-200 dark:border-gray-600" />
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600 flex justify-center"><ImageIcon className="h-4 w-4" /></span>
                              )}
                            </TableCell>

                            {/* Estado */}
                            <TableCell className="text-center">
                              {cat.is_active ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Activa
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
                                  <XCircle className="h-3 w-3 mr-1" /> Inactiva
                                </Badge>
                              )}
                            </TableCell>

                            {/* Productos */}
                            <TableCell className="text-center">
                              <span className={cn('text-sm font-medium', node.productCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>
                                {node.productCount}
                              </span>
                            </TableCell>

                            {/* Hijas */}
                            <TableCell className="text-center">
                              <span className={cn('text-sm font-medium', node.childCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')}>
                                {node.childCount}
                              </span>
                            </TableCell>

                            {/* Slug */}
                            <TableCell className="text-center">
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[120px] inline-block">
                                {cat.slug}
                              </span>
                            </TableCell>

                            {/* Acciones */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => router.push(`/app/inventario/categorias/${cat.uuid}`)} title="Ver detalle">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => router.push(`/app/inventario/categorias/${cat.uuid}/editar`)} title="Editar">
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                                    <DropdownMenuItem onClick={() => router.push(`/app/inventario/categorias/nuevo?parent=${cat.id}`)}>
                                      <FolderPlus className="h-4 w-4 mr-2" /> Agregar subcategoría
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDuplicate(cat.id)}>
                                      <Copy className="h-4 w-4 mr-2" /> Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onToggleActive(cat.id, cat.is_active)}>
                                      <ToggleLeft className="h-4 w-4 mr-2" /> {cat.is_active ? 'Desactivar' : 'Activar'}
                                    </DropdownMenuItem>
                                    {node.level > 0 && (
                                      <DropdownMenuItem onClick={() => onMakeRoot(cat.id)}>
                                        <ArrowUpRight className="h-4 w-4 mr-2" /> Mover a raíz
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onDelete(cat.id)} className="text-red-600 dark:text-red-400 focus:text-red-600">
                                      <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    );
                  })}
                  {/* Fila especial "Mover a raíz" */}
                  <Draggable
                    key="root-drop-zone"
                    draggableId="root-drop-zone"
                    index={ROOT_DROP_INDEX}
                    isDragDisabled
                  >
                    {(rootProvided) => (
                      <tr
                        ref={rootProvided.innerRef}
                        {...rootProvided.draggableProps}
                        {...rootProvided.dragHandleProps}
                        className={cn(
                          'transition-all',
                          dragOverRoot
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : '',
                        )}
                      >
                        <td
                          colSpan={9}
                          className={cn(
                            'py-3 text-center border-t-2 border-dashed',
                            dragOverRoot
                              ? 'border-green-400 text-green-700 dark:text-green-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500',
                          )}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <Home className="h-4 w-4" />
                            <span className="text-xs font-medium">
                              {dragOverRoot ? 'Soltar aquí → mover a raíz' : 'Arrastra aquí para mover a raíz'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Draggable>
                  {provided.placeholder}
                </TableBody>
              )}
            </Droppable>
          </Table>
        </DragDropContext>
      </div>
    </Card>
  );
}
