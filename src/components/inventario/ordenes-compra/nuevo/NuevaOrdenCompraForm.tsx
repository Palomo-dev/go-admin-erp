'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrderItemInput } from '@/lib/services/purchaseOrderService';
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
import { ProductSearchCombobox, type ProductOption } from '../ProductSearchCombobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  ArrowLeft, 
  Save, 
  Send,
  Loader2, 
  Building2, 
  Truck, 
  Calendar,
  Plus,
  Trash2,
  Package
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface OrderItem extends PurchaseOrderItemInput {
  id: string;
  productName: string;
  sku: string;
}

export function NuevaOrdenCompraForm() {
  const router = useRouter();
  const { toast } = useToast();

  // Estados del formulario
  const [supplierId, setSupplierId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Datos de selectores
  const [suppliers, setSuppliers] = useState<{ id: number; uuid: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: number; uuid: string; sku: string; name: string }[]>([]);

  // Item temporal para agregar
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<string>('1');
  const [itemCost, setItemCost] = useState<string>('0');

  // Cargar datos iniciales
  useEffect(() => {
    const loadData = async () => {
      const organizationId = getOrganizationId();
      const [suppliersData, branchesData, productsData] = await Promise.all([
        purchaseOrderService.getSuppliers(organizationId),
        purchaseOrderService.getBranches(organizationId),
        purchaseOrderService.getProducts(organizationId)
      ]);
      setSuppliers(suppliersData);
      setBranches(branchesData);
      setProducts(productsData);
    };
    loadData();
  }, []);

  // Agregar item
  const handleAddItem = () => {
    if (!selectedProduct) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona un producto' });
      return;
    }

    const product = products.find(p => p.id.toString() === selectedProduct);
    if (!product) return;

    const quantity = parseFloat(itemQuantity) || 1;
    const cost = parseFloat(itemCost) || 0;

    const newItem: OrderItem = {
      id: `temp-${Date.now()}`,
      product_id: product.id,
      productName: product.name,
      sku: product.sku,
      quantity,
      unit_cost: cost
    };

    setItems([...items, newItem]);
    setSelectedProduct('');
    setItemQuantity('1');
    setItemCost('0');
  };

  // Eliminar item
  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(i => i.id !== itemId));
  };

  // Actualizar item
  const handleUpdateItem = (itemId: string, field: 'quantity' | 'unit_cost', value: string) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: parseFloat(value) || 0 };
      }
      return item;
    }));
  };

  // Calcular total
  const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

  // Guardar orden
  const handleSubmit = async (sendToSupplier: boolean = false) => {
    if (!supplierId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona un proveedor' });
      return;
    }
    if (!branchId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona una sucursal' });
      return;
    }
    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Agrega al menos un producto' });
      return;
    }

    try {
      setIsSaving(true);
      const organizationId = getOrganizationId();

      const { data, error } = await purchaseOrderService.createPurchaseOrder(
        organizationId,
        {
          supplier_id: parseInt(supplierId),
          branch_id: parseInt(branchId),
          expected_date: expectedDate || undefined,
          notes: notes || undefined,
          status: sendToSupplier ? 'sent' : 'draft'
        },
        items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost
        }))
      );

      if (error) throw error;

      toast({
        title: sendToSupplier ? 'Orden enviada' : 'Orden creada',
        description: sendToSupplier 
          ? 'La orden ha sido creada y enviada al proveedor'
          : 'La orden ha sido guardada como borrador'
      });

      if (data) {
        router.push(`/app/inventario/ordenes-compra/${data.uuid}`);
      } else {
        router.push('/app/inventario/ordenes-compra');
      }
    } catch (error: any) {
      console.error('Error creando orden:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo crear la orden de compra'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/inventario/ordenes-compra">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Nueva Orden de Compra
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Crea una nueva orden de compra para un proveedor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                Información de la Orden
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Proveedor *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Sucursal Destino *</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700">
                      <SelectValue placeholder="Seleccionar sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-gray-300">Fecha Esperada de Entrega</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="dark:bg-gray-900 dark:border-gray-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="dark:text-gray-300">Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales para la orden..."
                  className="dark:bg-gray-900 dark:border-gray-700"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items de la orden */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Productos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Agregar producto */}
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500 dark:text-gray-400">Buscar Producto</Label>
                  <ProductSearchCombobox
                    products={products as ProductOption[]}
                    value={selectedProduct}
                    onSelect={(product) => setSelectedProduct(product ? product.id.toString() : '')}
                    placeholder="Buscar por nombre o SKU..."
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 sm:w-32 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      placeholder="1"
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  <div className="flex-1 sm:w-40 space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Costo Unitario ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemCost}
                      onChange={(e) => setItemCost(e.target.value)}
                      placeholder="0.00"
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  <Button 
                    onClick={handleAddItem} 
                    className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                    disabled={!selectedProduct}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Producto
                  </Button>
                </div>
              </div>

              {/* Tabla de items */}
              {items.length > 0 ? (
                <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-gray-900">
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="w-28 dark:text-gray-300">Cantidad</TableHead>
                        <TableHead className="w-32 dark:text-gray-300">Costo Unit.</TableHead>
                        <TableHead className="w-32 text-right dark:text-gray-300">Subtotal</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} className="dark:border-gray-700">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Package className="h-5 w-5 text-gray-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{item.productName}</p>
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">{item.sku}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                              className="w-20 h-8 dark:bg-gray-900 dark:border-gray-700"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_cost}
                              onChange={(e) => handleUpdateItem(item.id, 'unit_cost', e.target.value)}
                              className="w-28 h-8 dark:bg-gray-900 dark:border-gray-700"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                            {formatCurrency(item.quantity * item.unit_cost)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.id)}
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No hay productos agregados. Usa el formulario de arriba para agregar productos.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Resumen */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Productos</span>
                <span className="font-medium text-gray-900 dark:text-white">{items.length}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Unidades Total</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {items.reduce((sum, i) => sum + i.quantity, 0)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Total</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(total)}
                </span>
              </div>

              <div className="pt-4 space-y-3">
                <Button
                  onClick={() => handleSubmit(false)}
                  disabled={isSaving}
                  variant="outline"
                  className="w-full dark:border-gray-700"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Borrador
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Guardar y Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default NuevaOrdenCompraForm;
