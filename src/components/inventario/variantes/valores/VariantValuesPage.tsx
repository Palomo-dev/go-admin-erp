'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  ListTree,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Copy,
  Loader2,
  Package,
  Layers,
  Hash,
  GripVertical,
  ArrowUpDown,
} from 'lucide-react';
import { VariantValuesService } from './VariantValuesService';
import { VariantValue, VariantValuesStats } from './types';

export function VariantValuesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tipoIdParam = searchParams.get('tipo');

  const [valores, setValores] = useState<VariantValue[]>([]);
  const [tipos, setTipos] = useState<{ id: number; name: string }[]>([]);
  const [stats, setStats] = useState<VariantValuesStats>({ total: 0, byType: [], inUse: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>(tipoIdParam || 'all');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<VariantValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    variant_type_id: 0,
    value: '',
    display_order: 0,
  });

  // Delete dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [valorToDelete, setValorToDelete] = useState<number | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const tipoId = filtroTipo !== 'all' ? parseInt(filtroTipo) : undefined;
      const [valoresData, tiposData, statsData] = await Promise.all([
        VariantValuesService.obtenerValores(tipoId),
        VariantValuesService.obtenerTipos(),
        VariantValuesService.obtenerStats(),
      ]);
      setValores(valoresData);
      setTipos(tiposData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando valores:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los valores',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filtroTipo, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (tipoIdParam) {
      setFiltroTipo(tipoIdParam);
    }
  }, [tipoIdParam]);

  const handleRefresh = () => loadData(true);

  const openModalNuevo = () => {
    setEditando(null);
    setFormData({
      variant_type_id: filtroTipo !== 'all' ? parseInt(filtroTipo) : (tipos[0]?.id || 0),
      value: '',
      display_order: 0,
    });
    setShowModal(true);
  };

  const openModalEditar = (valor: VariantValue) => {
    setEditando(valor);
    setFormData({
      variant_type_id: valor.variant_type_id,
      value: valor.value,
      display_order: valor.display_order,
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.value.trim()) {
      toast({ title: 'Error', description: 'El valor es requerido', variant: 'destructive' });
      return;
    }
    if (!formData.variant_type_id) {
      toast({ title: 'Error', description: 'Selecciona un tipo', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      if (editando) {
        await VariantValuesService.actualizarValor(editando.id, formData);
        toast({ title: 'Valor actualizado' });
      } else {
        await VariantValuesService.crearValor(formData);
        toast({ title: 'Valor creado' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicar = async (id: number) => {
    try {
      await VariantValuesService.duplicarValor(id);
      toast({ title: 'Valor duplicado' });
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  const confirmDelete = (id: number) => {
    setValorToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleEliminar = async () => {
    if (!valorToDelete) return;
    try {
      await VariantValuesService.eliminarValor(valorToDelete);
      toast({ title: 'Valor eliminado' });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setShowDeleteConfirm(false);
      setValorToDelete(null);
    }
  };

  const valoresFiltrados = valores.filter(v =>
    v.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agrupar valores por tipo para mostrar
  const valoresAgrupados = valoresFiltrados.reduce((acc, valor) => {
    const tipoId = valor.variant_type_id?.toString() || 'sin-tipo';
    const tipoName = valor.variant_type?.name || 'Sin tipo';
    if (!acc[tipoId]) {
      acc[tipoId] = { name: tipoName, valores: [] };
    }
    acc[tipoId].valores.push(valor);
    return acc;
  }, {} as Record<string, { name: string; valores: VariantValue[] }>);

  // Ordenar valores dentro de cada grupo
  Object.keys(valoresAgrupados).forEach(tipoId => {
    valoresAgrupados[tipoId].valores.sort((a, b) => a.display_order - b.display_order);
  });

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId !== source.droppableId) return;
    if (destination.index === source.index) return;

    const tipoId = source.droppableId;
    const grupo = valoresAgrupados[tipoId];
    if (!grupo) return;

    const items = Array.from(grupo.valores);
    const [reorderedItem] = items.splice(source.index, 1);
    items.splice(destination.index, 0, reorderedItem);

    // Actualizar orden localmente para UI inmediata
    const updatedValores = valores.map(v => {
      const newIndex = items.findIndex(item => item.id === v.id);
      if (newIndex !== -1) {
        return { ...v, display_order: newIndex + 1 };
      }
      return v;
    });
    setValores(updatedValores);

    // Guardar en base de datos
    try {
      const reorderData = items.map((item, index) => ({
        id: item.id,
        display_order: index + 1,
      }));
      await VariantValuesService.reordenarValores(reorderData);
      toast({ title: 'Orden actualizado' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el orden', variant: 'destructive' });
      loadData(); // Recargar para restaurar el orden original
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/variantes/tipos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <ListTree className="h-6 w-6 text-blue-600" />
              </div>
              Valores de Variante
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Variantes / Valores
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openModalNuevo} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Valor
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Valores totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Layers className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{tipos.length}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tipos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inUse}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">En uso</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Lista de Valores
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-2">
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[180px] dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {tipos.map(tipo => (
                    <SelectItem key={tipo.id} value={tipo.id.toString()}>{tipo.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar valores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : valoresFiltrados.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <ListTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay valores de variante</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="space-y-6">
                {Object.entries(valoresAgrupados).map(([tipoId, grupo]) => (
                  <div key={tipoId}>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      {grupo.name}
                      <Badge variant="secondary">{grupo.valores.length}</Badge>
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow className="dark:border-gray-700">
                          <TableHead className="w-10 dark:text-gray-300">
                            <ArrowUpDown className="h-4 w-4" />
                          </TableHead>
                          <TableHead className="dark:text-gray-300">Valor</TableHead>
                          <TableHead className="dark:text-gray-300 text-center">Orden</TableHead>
                          <TableHead className="dark:text-gray-300 text-center">Productos</TableHead>
                          <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <Droppable droppableId={tipoId}>
                        {(provided) => (
                          <TableBody
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                          >
                            {grupo.valores.map((valor, index) => (
                              <Draggable
                                key={valor.id}
                                draggableId={valor.id.toString()}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <TableRow
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                      snapshot.isDragging ? 'bg-blue-50 dark:bg-blue-900/20 shadow-lg' : ''
                                    }`}
                                  >
                                    <TableCell>
                                      <div
                                        {...provided.dragHandleProps}
                                        className="cursor-grab active:cursor-grabbing"
                                      >
                                        <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-medium dark:text-white">
                                      {valor.value}
                                    </TableCell>
                                    <TableCell className="text-center dark:text-gray-300">
                                      {valor.display_order}
                                    </TableCell>
                                    <TableCell className="text-center dark:text-gray-300">
                                      {valor.products_count || 0}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => openModalEditar(valor)} className="h-8 w-8 p-0">
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDuplicar(valor.id)} className="h-8 w-8 p-0">
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => confirmDelete(valor.id)}
                                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                          disabled={(valor.products_count || 0) > 0}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </TableBody>
                        )}
                      </Droppable>
                    </Table>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      {/* Navegación rápida */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Navegación Rápida
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/app/inventario/variantes/tipos">
              <Button variant="outline" className="w-full justify-start">
                <Layers className="h-4 w-4 mr-2" />
                Tipos
              </Button>
            </Link>
            <Link href="/app/inventario/productos">
              <Button variant="outline" className="w-full justify-start">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Link href="/app/inventario/categorias">
              <Button variant="outline" className="w-full justify-start">
                <Layers className="h-4 w-4 mr-2" />
                Categorías
              </Button>
            </Link>
            <Link href="/app/inventario">
              <Button variant="outline" className="w-full justify-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Inventario
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Modal crear/editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editando ? 'Editar Valor' : 'Nuevo Valor de Variante'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editando ? 'Modificar el valor de variante' : 'Crear un nuevo valor como S, M, L, Rojo, Azul, etc.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Tipo *</Label>
              <Select
                value={formData.variant_type_id?.toString() || ''}
                onValueChange={(v) => setFormData(prev => ({ ...prev, variant_type_id: parseInt(v) }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map(tipo => (
                    <SelectItem key={tipo.id} value={tipo.id.toString()}>{tipo.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Valor *</Label>
              <Input
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                placeholder="Ej: S, M, L, Rojo, 100ml..."
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Orden de visualización</Label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación eliminar */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Eliminar valor?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminar} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
