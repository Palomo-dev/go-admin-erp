"use client";

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Package,
  Power,
  Trash2,
  FolderTree,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  bulkUpdatePrices,
  bulkUpdateStock,
  bulkUpdateStatus,
  bulkDelete,
  bulkAssignCategory,
  TipoPrecio,
  ModoAjuste,
  ModoStock,
} from './bulkService';

interface AccionesMasivasProps {
  selectedIds: number[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

type DialogType = 'precios' | 'stock' | 'categoria' | 'eliminar' | null;

const AccionesMasivas: React.FC<AccionesMasivasProps> = ({
  selectedIds,
  onClearSelection,
  onActionComplete,
}) => {
  const { organization, branch_id } = useOrganization();
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [processing, setProcessing] = useState(false);

  // Estados para precios
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>('venta');
  const [modoAjuste, setModoAjuste] = useState<ModoAjuste>('fijo');
  const [cantidadPrecio, setCantidadPrecio] = useState<string>('');

  // Estados para stock
  const [modoStock, setModoStock] = useState<ModoStock>('set');
  const [cantidadStock, setCantidadStock] = useState<string>('');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Estados para categoría
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');

  useEffect(() => {
    if (!organization?.id) return;
    const load = async () => {
      const [{ data: br }, { data: cats }] = await Promise.all([
        supabase.from('branches').select('id, name').eq('organization_id', organization.id).order('name'),
        supabase.from('categories').select('id, name').eq('organization_id', organization.id).order('name'),
      ]);
      setBranches(br || []);
      setCategorias(cats || []);
      if (branch_id) setSelectedBranch(String(branch_id));
    };
    load();
  }, [organization?.id, branch_id]);

  const mostrarResultado = (accion: string, exitosos: number, fallidos: number, errores: string[]) => {
    if (fallidos === 0) {
      toast({ title: accion, description: `${exitosos} productos actualizados correctamente.` });
    } else {
      toast({
        variant: 'destructive',
        title: `${accion} (parcial)`,
        description: `${exitosos} exitosos, ${fallidos} fallidos. ${errores[0] || ''}`,
      });
    }
    onActionComplete();
    onClearSelection();
    setActiveDialog(null);
  };

  const handlePrecios = async () => {
    const cantidad = parseFloat(cantidadPrecio);
    if (isNaN(cantidad)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingrese una cantidad válida.' });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkUpdatePrices(selectedIds, tipoPrecio, modoAjuste, cantidad);
      mostrarResultado('Precios actualizados', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setCantidadPrecio('');
    }
  };

  const handleStock = async () => {
    const cantidad = parseFloat(cantidadStock);
    if (isNaN(cantidad) || !selectedBranch) {
      toast({ variant: 'destructive', title: 'Error', description: 'Complete todos los campos.' });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkUpdateStock(selectedIds, parseInt(selectedBranch), cantidad, modoStock);
      mostrarResultado('Stock actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setCantidadStock('');
    }
  };

  const handleEstado = async (status: 'active' | 'inactive' | 'discontinued') => {
    setProcessing(true);
    try {
      const r = await bulkUpdateStatus(selectedIds, status);
      mostrarResultado('Estado actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleCategoria = async () => {
    if (!selectedCategoria) {
      toast({ variant: 'destructive', title: 'Error', description: 'Seleccione una categoría.' });
      return;
    }
    setProcessing(true);
    try {
      const r = await bulkAssignCategory(selectedIds, parseInt(selectedCategoria));
      mostrarResultado('Categoría asignada', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  const handleEliminar = async () => {
    setProcessing(true);
    try {
      const r = await bulkDelete(selectedIds);
      mostrarResultado('Productos eliminados', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      {/* Barra flotante de acciones */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 px-4 py-3 rounded-lg border shadow-md bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800">
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
        </span>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setActiveDialog('precios')} className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Precios
          </Button>

          <Button variant="outline" size="sm" onClick={() => setActiveDialog('stock')} className="text-xs">
            <Package className="h-3.5 w-3.5 mr-1" />
            Stock
          </Button>

          <Button variant="outline" size="sm" onClick={() => setActiveDialog('categoria')} className="text-xs">
            <FolderTree className="h-3.5 w-3.5 mr-1" />
            Categoría
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs" disabled={processing}>
                <Power className="h-3.5 w-3.5 mr-1" />
                Estado
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
              <DropdownMenuItem onClick={() => handleEstado('active')} className="cursor-pointer">
                <span className="w-2 h-2 rounded-full mr-2 bg-green-500" />
                Activar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEstado('inactive')} className="cursor-pointer">
                <span className="w-2 h-2 rounded-full mr-2 bg-gray-400" />
                Desactivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleEstado('discontinued')} className="cursor-pointer">
                <span className="w-2 h-2 rounded-full mr-2 bg-red-500" />
                Descontinuar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setActiveDialog('eliminar')}
            className="text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Eliminar
          </Button>

          <Button variant="ghost" size="icon" onClick={onClearSelection} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dialog: Edición masiva de precios */}
      <Dialog open={activeDialog === 'precios'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Edición masiva de precios</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se aplicará a {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="dark:text-gray-300">Tipo de precio</Label>
              <Select value={tipoPrecio} onValueChange={(v) => setTipoPrecio(v as TipoPrecio)}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  <SelectItem value="venta">Precio de venta</SelectItem>
                  <SelectItem value="compra">Precio de compra (costo)</SelectItem>
                  <SelectItem value="comparacion">Precio de comparación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="dark:text-gray-300">Modo de ajuste</Label>
              <Select value={modoAjuste} onValueChange={(v) => setModoAjuste(v as ModoAjuste)}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  <SelectItem value="fijo">Establecer valor fijo</SelectItem>
                  <SelectItem value="valor">Aumentar/disminuir por valor ($)</SelectItem>
                  <SelectItem value="porcentaje">Aumentar/disminuir por porcentaje (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="dark:text-gray-300">
                {modoAjuste === 'fijo' && 'Nuevo valor'}
                {modoAjuste === 'valor' && 'Cantidad a sumar (negativo para restar)'}
                {modoAjuste === 'porcentaje' && 'Porcentaje (negativo para descuento)'}
              </Label>
              <Input
                type="number"
                value={cantidadPrecio}
                onChange={(e) => setCantidadPrecio(e.target.value)}
                placeholder={modoAjuste === 'porcentaje' ? 'Ej: 10 o -15' : 'Ej: 50000'}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handlePrecios} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Actualización masiva de stock */}
      <Dialog open={activeDialog === 'stock'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Actualización masiva de stock</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se aplicará a {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="dark:text-gray-300">Sucursal</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccione sucursal" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="dark:text-gray-300">Modo</Label>
              <Select value={modoStock} onValueChange={(v) => setModoStock(v as ModoStock)}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  <SelectItem value="set">Establecer cantidad exacta</SelectItem>
                  <SelectItem value="add">Sumar/restar a cantidad actual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="dark:text-gray-300">Cantidad</Label>
              <Input
                type="number"
                value={cantidadStock}
                onChange={(e) => setCantidadStock(e.target.value)}
                placeholder={modoStock === 'add' ? 'Ej: 10 o -5' : 'Ej: 100'}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handleStock} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Asignar categoría */}
      <Dialog open={activeDialog === 'categoria'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Asignar categoría</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se asignará a {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="dark:text-gray-300">Categoría</Label>
            <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Seleccione categoría" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handleCategoria} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Eliminar */}
      <Dialog open={activeDialog === 'eliminar'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">¿Eliminar productos?</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se eliminarán {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''}. Esta acción
              no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={processing}>
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccionesMasivas;
