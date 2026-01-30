'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  Package2,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Copy,
  Loader2,
  AlertTriangle,
  Calendar,
  Hash,
  Truck,
  Package,
  Clock,
} from 'lucide-react';
import { LotesService } from './LotesService';
import { Lot, LotsStats, LotFilter } from './types';
import { formatDate } from '@/utils/Utils';

export function LotesPage() {
  const { toast } = useToast();
  const [lotes, setLotes] = useState<Lot[]>([]);
  const [productos, setProductos] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [stats, setStats] = useState<LotsStats>({ total: 0, expired: 0, expiringSoon: 0, withStock: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [filtroProducto, setFiltroProducto] = useState<string>('all');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Lot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    product_id: 0,
    lot_code: '',
    expiry_date: '',
    supplier_id: null as number | null,
  });

  // Delete dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loteToDelete, setLoteToDelete] = useState<number | null>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const filters: LotFilter = {
        status: filtroEstado as any,
        productId: filtroProducto !== 'all' ? parseInt(filtroProducto) : undefined,
        search: searchTerm || undefined,
      };

      const [lotesData, productosData, proveedoresData, statsData] = await Promise.all([
        LotesService.obtenerLotes(filters),
        LotesService.obtenerProductos(),
        LotesService.obtenerProveedores(),
        LotesService.obtenerStats(),
      ]);

      setLotes(lotesData);
      setProductos(productosData);
      setProveedores(proveedoresData);
      setStats(statsData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error cargando lotes:', errorMessage, error);
      toast({
        title: 'Error',
        description: errorMessage || 'No se pudieron cargar los lotes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filtroEstado, filtroProducto, searchTerm, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => loadData(true);

  const openModalNuevo = () => {
    setEditando(null);
    setFormData({
      product_id: productos[0]?.id || 0,
      lot_code: '',
      expiry_date: '',
      supplier_id: null,
    });
    setShowModal(true);
  };

  const openModalEditar = (lote: Lot) => {
    setEditando(lote);
    setFormData({
      product_id: lote.product_id,
      lot_code: lote.lot_code,
      expiry_date: lote.expiry_date || '',
      supplier_id: lote.supplier_id,
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.lot_code.trim()) {
      toast({ title: 'Error', description: 'El código de lote es requerido', variant: 'destructive' });
      return;
    }
    if (!formData.product_id) {
      toast({ title: 'Error', description: 'Selecciona un producto', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const dataToSave = {
        ...formData,
        expiry_date: formData.expiry_date || null,
      };

      if (editando) {
        await LotesService.actualizarLote(editando.id, dataToSave);
        toast({ title: 'Lote actualizado' });
      } else {
        await LotesService.crearLote(dataToSave);
        toast({ title: 'Lote creado' });
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
      await LotesService.duplicarLote(id);
      toast({ title: 'Lote duplicado' });
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  const confirmDelete = (id: number) => {
    setLoteToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleEliminar = async () => {
    if (!loteToDelete) return;
    try {
      await LotesService.eliminarLote(loteToDelete);
      toast({ title: 'Lote eliminado' });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setShowDeleteConfirm(false);
      setLoteToDelete(null);
    }
  };

  const getStatusBadge = (lote: Lot) => {
    if (lote.is_expired) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    if (lote.days_to_expiry !== null && lote.days_to_expiry !== undefined && lote.days_to_expiry <= 30) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Por vencer ({lote.days_to_expiry}d)</Badge>;
    }
    if (lote.days_to_expiry !== null && lote.days_to_expiry !== undefined) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Activo</Badge>;
    }
    return <Badge variant="secondary">Sin vencimiento</Badge>;
  };

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
                <Package2 className="h-6 w-6 text-blue-600" />
              </div>
              Gestión de Lotes
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Lotes - Trazabilidad y vencimientos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openModalNuevo} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Lote
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total lotes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.expired}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Vencidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.expiringSoon}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Por vencer (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.withStock}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Con stock</p>
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
              Lista de Lotes
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-2">
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-[150px] dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="expiring">Por vencer</SelectItem>
                  <SelectItem value="expired">Vencidos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroProducto} onValueChange={setFiltroProducto}>
                <SelectTrigger className="w-[180px] dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {productos.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar lotes..."
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
          ) : lotes.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <Package2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay lotes registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Código</TableHead>
                  <TableHead className="dark:text-gray-300">Producto</TableHead>
                  <TableHead className="dark:text-gray-300">Proveedor</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Vencimiento</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Stock</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Estado</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes.map(lote => (
                  <TableRow key={lote.id} className={`dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${lote.is_expired ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                    <TableCell className="font-mono font-medium dark:text-white">
                      {lote.lot_code}
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <div>
                        <p className="font-medium">{lote.product?.name}</p>
                        <p className="text-xs text-gray-500">{lote.product?.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      {lote.supplier?.name || '-'}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      {lote.expiry_date ? formatDate(lote.expiry_date) : '-'}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      <span className={`font-medium ${(lote.stock_quantity || 0) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {lote.stock_quantity || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(lote)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openModalEditar(lote)} className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicar(lote.id)} className="h-8 w-8 p-0">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(lote.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          disabled={(lote.stock_quantity || 0) > 0}
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
            <Link href="/app/inventario/productos">
              <Button variant="outline" className="w-full justify-start">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Link href="/app/inventario/stock">
              <Button variant="outline" className="w-full justify-start">
                <Package2 className="h-4 w-4 mr-2" />
                Stock
              </Button>
            </Link>
            <Link href="/app/inventario/proveedores">
              <Button variant="outline" className="w-full justify-start">
                <Truck className="h-4 w-4 mr-2" />
                Proveedores
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
              {editando ? 'Editar Lote' : 'Nuevo Lote'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editando ? 'Modificar información del lote' : 'Registrar un nuevo lote para trazabilidad'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Producto *</Label>
              <Select
                value={formData.product_id?.toString() || ''}
                onValueChange={(v) => setFormData(prev => ({ ...prev, product_id: parseInt(v) }))}
                disabled={!!editando}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar producto" />
                </SelectTrigger>
                <SelectContent>
                  {productos.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Código de Lote *</Label>
              <Input
                value={formData.lot_code}
                onChange={(e) => setFormData(prev => ({ ...prev, lot_code: e.target.value.toUpperCase() }))}
                placeholder="Ej: LOT-2025-001"
                className="dark:bg-gray-900 dark:border-gray-600 font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Fecha de Vencimiento</Label>
              <Input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Proveedor</Label>
              <Select
                value={formData.supplier_id?.toString() || 'none'}
                onValueChange={(v) => setFormData(prev => ({ ...prev, supplier_id: v === 'none' ? null : parseInt(v) }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {proveedores.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle className="dark:text-white">¿Eliminar lote?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. El lote será eliminado permanentemente.
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
