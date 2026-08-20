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
  TrendingUp,
  TrendingDown,
  Copy,
  Hash,
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
  bulkCopyPriceToCompare,
  bulkRoundPrices,
  TipoPrecio,
  ModoAjuste,
  ModoStock,
  ModoRedondeo,
} from './bulkService';

interface AccionesMasivasProps {
  selectedIds: number[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

type DialogType = 'precios' | 'stock' | 'categoria' | 'eliminar' | 'copiarComparacion' | 'redondear' | null;

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
  const [modoAjuste, setModoAjuste] = useState<ModoAjuste>('porcentaje');
  const [direccion, setDireccion] = useState<'aumentar' | 'disminuir'>('aumentar');
  const [cantidadPrecio, setCantidadPrecio] = useState<string>('');

  // Estados para stock
  const [modoStock, setModoStock] = useState<ModoStock>('set');
  const [cantidadStock, setCantidadStock] = useState<string>('');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Estados para categoría
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');

  // Estado para copiar precio → comparación
  const [sobrescribirComparacion, setSobrescribirComparacion] = useState(false);

  // Estados para redondeo masivo
  const [tipoRedondeo, setTipoRedondeo] = useState<TipoPrecio>('venta');
  const [modoRedondeo, setModoRedondeo] = useState<ModoRedondeo>('multiplo');
  const [multiploRedondeo, setMultiploRedondeo] = useState<string>('100');
  const [digitosCount, setDigitosCount] = useState<string>('3');
  const [digitosValor, setDigitosValor] = useState<string>('000');

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
    const cantidadRaw = parseFloat(cantidadPrecio);
    if (isNaN(cantidadRaw) || cantidadRaw < 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingrese una cantidad válida (mayor o igual a 0).' });
      return;
    }
    // Si es "Disminuir", se niega el valor para que el servicio lo reste
    const cantidad = modoAjuste === 'fijo' ? cantidadRaw : (direccion === 'disminuir' ? -cantidadRaw : cantidadRaw);
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

  const handleCopiarComparacion = async () => {
    setProcessing(true);
    try {
      const r = await bulkCopyPriceToCompare(selectedIds, sobrescribirComparacion);
      mostrarResultado('Precio de comparación actualizado', r.exitosos, r.fallidos, r.errores);
    } finally {
      setProcessing(false);
      setSobrescribirComparacion(false);
    }
  };

  const handleRedondear = async () => {
    const multiplo = modoRedondeo === 'multiplo' ? parseFloat(multiploRedondeo) : 0;
    const dCount = modoRedondeo === 'digitos' ? parseInt(digitosCount, 10) : 0;

    if (modoRedondeo === 'multiplo' && (!multiplo || multiplo <= 0)) {
      toast({ variant: 'destructive', title: 'Error', description: 'El múltiplo debe ser mayor a 0' });
      return;
    }
    if (modoRedondeo === 'digitos' && (!dCount || dCount < 1 || dCount > 5)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Los dígitos a reemplazar deben estar entre 1 y 5' });
      return;
    }
    if (modoRedondeo === 'digitos' && digitosValor.length !== dCount) {
      toast({ variant: 'destructive', title: 'Error', description: `El valor debe tener ${dCount} dígitos` });
      return;
    }

    setProcessing(true);
    try {
      const r = await bulkRoundPrices(selectedIds, tipoRedondeo, modoRedondeo, multiplo, dCount, digitosValor);
      mostrarResultado('Precios redondeados', r.exitosos, r.fallidos, r.errores);
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

          <Button variant="outline" size="sm" onClick={() => setActiveDialog('copiarComparacion')} className="text-xs">
            <Copy className="h-3.5 w-3.5 mr-1" />
            Precio → Comparación
          </Button>

          <Button variant="outline" size="sm" onClick={() => setActiveDialog('redondear')} className="text-xs">
            <Hash className="h-3.5 w-3.5 mr-1" />
            Redondear
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
                  <SelectItem value="valor">Por valor ($)</SelectItem>
                  <SelectItem value="porcentaje">Por porcentaje (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {modoAjuste !== 'fijo' && (
              <div>
                <Label className="dark:text-gray-300">Dirección</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDireccion('aumentar')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      direccion === 'aumentar'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Aumentar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDireccion('disminuir')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      direccion === 'disminuir'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <TrendingDown className="h-4 w-4" />
                    Disminuir
                  </button>
                </div>
              </div>
            )}
            <div>
              <Label className="dark:text-gray-300">
                {modoAjuste === 'fijo' && 'Nuevo valor'}
                {modoAjuste === 'valor' && (direccion === 'aumentar' ? 'Cantidad a aumentar ($)' : 'Cantidad a disminuir ($)')}
                {modoAjuste === 'porcentaje' && (direccion === 'aumentar' ? 'Porcentaje a aumentar (%)' : 'Porcentaje a disminuir (%)')}
              </Label>
              <Input
                type="number"
                min="0"
                value={cantidadPrecio}
                onChange={(e) => setCantidadPrecio(e.target.value)}
                placeholder={modoAjuste === 'porcentaje' ? 'Ej: 10' : 'Ej: 5000'}
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

      {/* Dialog: Redondear precios */}
      <Dialog open={activeDialog === 'redondear'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Redondear precios</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se aplicará a {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''} (incluye padres e hijos).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Tipo de precio */}
            <div className="space-y-1.5">
              <Label className="text-xs dark:text-gray-300">Precio a redondear</Label>
              <Select value={tipoRedondeo} onValueChange={(v) => setTipoRedondeo(v as TipoPrecio)}>
                <SelectTrigger className="h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="venta">Precio de venta</SelectItem>
                  <SelectItem value="compra">Costo de compra</SelectItem>
                  <SelectItem value="comparacion">Precio de comparación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Modo de redondeo */}
            <div className="space-y-1.5">
              <Label className="text-xs dark:text-gray-300">Modo de redondeo</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModoRedondeo('multiplo')}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                    modoRedondeo === 'multiplo'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  A múltiplo de N
                </button>
                <button
                  type="button"
                  onClick={() => setModoRedondeo('digitos')}
                  className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                    modoRedondeo === 'digitos'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Reemplazar últimos dígitos
                </button>
              </div>
            </div>

            {/* Configuración según modo */}
            {modoRedondeo === 'multiplo' ? (
              <div className="space-y-2">
                <Label className="text-xs dark:text-gray-300">Redondear al múltiplo más cercano de</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[10, 50, 100, 500, 1000].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMultiploRedondeo(String(m))}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        multiploRedondeo === String(m)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">o personalizado:</span>
                  <Input
                    type="number"
                    value={multiploRedondeo}
                    onChange={(e) => setMultiploRedondeo(e.target.value)}
                    className="h-8 w-24 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    min="1"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ej: $1,234 con múltiplo 100 → $1,200 | $1,267 con múltiplo 100 → $1,300
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs dark:text-gray-300">¿Cuántos dígitos reemplazar?</Label>
                    <Select value={digitosCount} onValueChange={(v) => {
                      setDigitosCount(v);
                      // Ajustar el valor para que tenga la misma cantidad de dígitos
                      const padded = digitosValor.padStart(parseInt(v, 10), '0').slice(-parseInt(v, 10));
                      setDigitosValor(padded);
                    }}>
                      <SelectTrigger className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} dígito{n > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs dark:text-gray-300">Valor a poner</Label>
                    <Input
                      type="text"
                      value={digitosValor}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, parseInt(digitosCount, 10));
                        setDigitosValor(val);
                      }}
                      className="h-8 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                      placeholder={'0'.repeat(parseInt(digitosCount, 10))}
                      maxLength={parseInt(digitosCount, 10)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['000', '500', '900', '990', '999', '050'].map((v) => {
                    if (v.length !== parseInt(digitosCount, 10)) return null;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setDigitosValor(v)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          digitosValor === v
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ej: $1,234 con últimos 3 = "990" → $1,990 | $5,678 con últimos 2 = "50" → $5,650
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handleRedondear} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Copiar precio de venta a precio de comparación */}
      <Dialog open={activeDialog === 'copiarComparacion'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Precio de venta → Precio de comparación</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Se aplicará a {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Comportamiento por defecto:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Productos <strong>sin</strong> precio de comparación: se copia el precio de venta.</li>
                <li>Productos <strong>con</strong> precio de comparación: se dejan igual.</li>
              </ul>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sobrescribirComparacion}
                onChange={(e) => setSobrescribirComparacion(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Sobrescribir también los que ya tienen precio de comparación
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handleCopiarComparacion} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar
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
