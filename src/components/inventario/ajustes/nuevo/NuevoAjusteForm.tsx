'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Search, 
  Save, 
  ArrowLeft,
  Loader2,
  Package,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { 
  adjustmentService, 
  ADJUSTMENT_TYPES, 
  ADJUSTMENT_REASONS 
} from '@/lib/services/adjustmentService';
import Link from 'next/link';

interface ProductForAdjustment {
  id: number;
  uuid?: string;
  name: string;
  sku: string;
  current_qty: number;
  avg_cost: number;
}

interface AdjustmentItemInput {
  product_id: number;
  product_name: string;
  product_sku: string;
  system_qty: number;
  counted_qty: number;
  difference: number;
  unit_cost: number;
}

export function NuevoAjusteForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Estados del formulario
  const [branchId, setBranchId] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // Estados de productos
  const [items, setItems] = useState<AdjustmentItemInput[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProductForAdjustment[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Estados de datos
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  
  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Cargar sucursales
  useEffect(() => {
    const loadBranches = async () => {
      if (!organization?.id) return;
      
      try {
        const branchesData = await adjustmentService.getBranches(organization.id);
        setBranches(branchesData);
        
        // Seleccionar la primera sucursal por defecto
        if (branchesData.length > 0 && !branchId) {
          setBranchId(branchesData[0].id.toString());
        }
      } catch (error) {
        console.error('Error cargando sucursales:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBranches();
  }, [organization?.id]);

  // Buscar productos
  const searchProducts = useCallback(async () => {
    if (!organization?.id || !branchId || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const products = await adjustmentService.getProductsForAdjustment(
        organization.id,
        parseInt(branchId),
        searchTerm
      );
      
      // Filtrar productos que ya están en la lista
      const existingIds = items.map(i => i.product_id);
      const filtered = products.filter(p => !existingIds.includes(p.id));
      
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      setIsSearching(false);
    }
  }, [organization?.id, branchId, searchTerm, items]);

  // Efecto para búsqueda con debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        searchProducts();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, searchProducts]);

  // Agregar producto a la lista
  const handleAddProduct = (product: ProductForAdjustment) => {
    const newItem: AdjustmentItemInput = {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      system_qty: product.current_qty,
      counted_qty: product.current_qty,
      difference: 0,
      unit_cost: product.avg_cost
    };

    setItems([...items, newItem]);
    setSearchTerm('');
    setSearchResults([]);
  };

  // Actualizar cantidad contada
  const handleUpdateCountedQty = (index: number, value: string) => {
    const newItems = [...items];
    const countedQty = parseFloat(value) || 0;
    newItems[index].counted_qty = countedQty;
    newItems[index].difference = countedQty - newItems[index].system_qty;
    setItems(newItems);
  };

  // Eliminar producto de la lista
  const handleRemoveProduct = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  // Guardar ajuste
  const handleSave = async (applyImmediately: boolean = false) => {
    if (!organization?.id || !branchId || !type || !reason) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor completa todos los campos requeridos'
      });
      return;
    }

    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes agregar al menos un producto al ajuste'
      });
      return;
    }

    try {
      setIsSaving(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Debes estar autenticado para crear ajustes'
        });
        return;
      }

      // Crear el ajuste
      const { data: adjustment, error } = await adjustmentService.createAdjustment(
        {
          organization_id: organization.id,
          branch_id: parseInt(branchId),
          type,
          reason,
          notes,
          items: items.map(item => ({
            product_id: item.product_id,
            quantity: item.counted_qty,
            unit_cost: item.unit_cost
          }))
        },
        userId
      );

      if (error) throw error;

      // Si se debe aplicar inmediatamente
      if (applyImmediately && adjustment) {
        const { success, error: applyError } = await adjustmentService.applyAdjustment(
          adjustment.id,
          organization.id,
          userId
        );

        if (applyError) {
          toast({
            variant: 'destructive',
            title: 'Ajuste creado pero no aplicado',
            description: applyError.message
          });
          router.push(`/app/inventario/ajustes/${adjustment.id}`);
          return;
        }

        toast({
          title: 'Ajuste creado y aplicado',
          description: 'Los movimientos de stock han sido generados'
        });
      } else {
        toast({
          title: 'Ajuste guardado',
          description: 'El ajuste ha sido guardado como borrador'
        });
      }

      router.push('/app/inventario/ajustes');
    } catch (error: any) {
      console.error('Error guardando ajuste:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo guardar el ajuste'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calcular totales
  const totalDifference = items.reduce((sum, item) => sum + item.difference, 0);
  const totalValueDifference = items.reduce((sum, item) => sum + (item.difference * item.unit_cost), 0);
  const hasChanges = items.some(item => item.difference !== 0);

  if (loadingOrg || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/ajustes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Nuevo Ajuste de Inventario
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Registra conteos físicos, mermas o correcciones de stock
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Información del Ajuste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="dark:text-gray-300">Sucursal *</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar sucursal" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id.toString()}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="dark:text-gray-300">Tipo de Ajuste *</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                      {ADJUSTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="dark:text-gray-300">Razón *</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar razón" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                      {ADJUSTMENT_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="dark:text-gray-300">Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales sobre el ajuste..."
                  className="dark:bg-gray-900 dark:border-gray-700"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Búsqueda de productos */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Agregar Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar producto por nombre o SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-900 dark:border-gray-700"
                  disabled={!branchId}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>

              {/* Resultados de búsqueda */}
              {searchResults.length > 0 && (
                <div className="mt-2 border dark:border-gray-700 rounded-lg overflow-hidden">
                  {searchResults.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0 dark:border-gray-700"
                      onClick={() => handleAddProduct(product)}
                    >
                      <div>
                        <p className="font-medium dark:text-white">{product.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          SKU: {product.sku} | Stock: {product.current_qty}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!branchId && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                  Selecciona una sucursal para buscar productos
                </p>
              )}
            </CardContent>
          </Card>

          {/* Lista de productos */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">
                Productos a Ajustar ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Busca y agrega productos para ajustar
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Stock Sistema</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Conteo Físico</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Diferencia</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Costo Unit.</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Impacto</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={index} className="dark:border-gray-700">
                          <TableCell>
                            <div>
                              <p className="font-medium dark:text-white">{item.product_name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{item.product_sku}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right dark:text-gray-300">
                            {item.system_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={item.counted_qty}
                              onChange={(e) => handleUpdateCountedQty(index, e.target.value)}
                              className="w-24 text-right dark:bg-gray-900 dark:border-gray-700"
                              min={0}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={
                                item.difference > 0
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : item.difference < 0
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }
                            >
                              {item.difference > 0 ? '+' : ''}{item.difference}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right dark:text-gray-300">
                            {formatCurrency(item.unit_cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={item.difference * item.unit_cost >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {formatCurrency(item.difference * item.unit_cost)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveProduct(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral - Resumen */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen del Ajuste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Productos</span>
                <span className="font-medium dark:text-white">{items.length}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Diferencia total</span>
                <Badge
                  className={
                    totalDifference > 0
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : totalDifference < 0
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }
                >
                  {totalDifference > 0 ? '+' : ''}{totalDifference} unidades
                </Badge>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Impacto valorizado</span>
                <span className={`font-medium ${totalValueDifference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(totalValueDifference)}
                </span>
              </div>

              {hasChanges && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Este ajuste generará movimientos de stock al ser aplicado.
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-4">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleSave(false)}
                  disabled={isSaving || items.length === 0 || !branchId || !type || !reason}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar como borrador
                </Button>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSave(true)}
                  disabled={isSaving || items.length === 0 || !branchId || !type || !reason || !hasChanges}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Guardar y aplicar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default NuevoAjusteForm;
