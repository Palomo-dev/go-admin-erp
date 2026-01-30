'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Layers,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Copy,
  Loader2,
  Package,
  ListTree,
  Hash,
} from 'lucide-react';
import { VariantTypesService } from './VariantTypesService';
import { VariantType, VariantTypesStats } from './types';

export function VariantTypesPage() {
  const { toast } = useToast();
  const [tipos, setTipos] = useState<VariantType[]>([]);
  const [stats, setStats] = useState<VariantTypesStats>({ total: 0, withValues: 0, inUse: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<VariantType | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  
  // Delete dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tipoToDelete, setTipoToDelete] = useState<number | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [tiposData, statsData] = await Promise.all([
        VariantTypesService.obtenerTipos(),
        VariantTypesService.obtenerStats(),
      ]);
      setTipos(tiposData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando tipos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los tipos de variante',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => loadData(true);

  const openModalNuevo = () => {
    setEditando(null);
    setFormData({ name: '' });
    setShowModal(true);
  };

  const openModalEditar = (tipo: VariantType) => {
    setEditando(tipo);
    setFormData({ name: tipo.name });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      if (editando) {
        await VariantTypesService.actualizarTipo(editando.id, formData);
        toast({ title: 'Tipo actualizado' });
      } else {
        await VariantTypesService.crearTipo(formData);
        toast({ title: 'Tipo creado' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo guardar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicar = async (id: number) => {
    try {
      await VariantTypesService.duplicarTipo(id);
      toast({ title: 'Tipo duplicado' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = (id: number) => {
    setTipoToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleEliminar = async () => {
    if (!tipoToDelete) return;

    try {
      await VariantTypesService.eliminarTipo(tipoToDelete);
      toast({ title: 'Tipo eliminado' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setTipoToDelete(null);
    }
  };

  const tiposFiltrados = tipos.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                <Layers className="h-6 w-6 text-blue-600" />
              </div>
              Tipos de Variante
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Variantes / Tipos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openModalNuevo} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Tipo
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Tipos totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <ListTree className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.withValues}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Con valores</p>
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

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Lista de Tipos
            </CardTitle>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar tipos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : tiposFiltrados.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay tipos de variante</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Nombre</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Valores</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Productos</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiposFiltrados.map(tipo => (
                  <TableRow key={tipo.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell className="font-medium dark:text-white">
                      {tipo.name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={`/app/inventario/variantes/valores?tipo=${tipo.id}`}>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-sm font-medium cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50">
                          {tipo.values_count || 0}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      {tipo.products_count || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openModalEditar(tipo)} className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicar(tipo.id)} className="h-8 w-8 p-0">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(tipo.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          disabled={(tipo.values_count || 0) > 0 || (tipo.products_count || 0) > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <Link href="/app/inventario/variantes/valores">
              <Button variant="outline" className="w-full justify-start">
                <ListTree className="h-4 w-4 mr-2" />
                Valores
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
              {editando ? 'Editar Tipo' : 'Nuevo Tipo de Variante'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editando ? 'Modificar el tipo de variante' : 'Crear un nuevo tipo como Talla, Color, Material, etc.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ name: e.target.value })}
                placeholder="Ej: Talla, Color, Material..."
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
            <AlertDialogTitle className="dark:text-white">¿Eliminar tipo?</AlertDialogTitle>
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
