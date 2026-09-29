'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrderItemInput } from '@/lib/services/purchaseOrderService';
import { useTranslations } from 'next-intl';
import { cantidadLineaDeProducto, redondearCantidadLinea, sumaCantidades } from '@/lib/services/documentos/cantidadLinea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { LineasOrdenCompra } from '../LineasOrdenCompra';
import { ArrowLeft, Save, Loader2, Building2, Package } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';

interface EditarOrdenCompraFormProps {
  orderUuid: string;
}

interface OrderItem extends PurchaseOrderItemInput {
  id: string;
  productName: string;
  sku: string;
  image?: string | null;
  unidad?: string | null;
  decimalesCantidad?: number | null;
}

export function EditarOrdenCompraForm({ orderUuid }: EditarOrdenCompraFormProps) {
  const router = useRouter();
  const tLineas = useTranslations('kit.documentoEdicion.lineas');
  const moneda = useMonedaOrganizacion();
  const { formatear } = moneda;

  // Estados del formulario
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [branchId, setBranchId] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Datos de selectores
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      const [orderResult, suppliersData, branchesData] = await Promise.all([
        purchaseOrderService.getPurchaseOrderByUuid(orderUuid, organizationId),
        purchaseOrderService.getSuppliers(organizationId),
        purchaseOrderService.getBranches(organizationId),
      ]);

      if (orderResult.error || !orderResult.data) {
        toastError('Error', orderResult.error?.message || 'Orden no encontrada');
        router.push('/app/inventario/ordenes-compra');
        return;
      }

      const order = orderResult.data;

      // Verificar que esté en draft
      if (order.status !== 'draft') {
        toastError('Error', 'Solo se pueden editar órdenes en borrador');
        router.push(`/app/inventario/ordenes-compra/${orderUuid}`);
        return;
      }

      // Cargar datos del formulario
      const proveedorOrden = (suppliersData as { id: number; name: string }[]).find((x) => x.id === order.supplier_id);
      setProveedor({ id: String(order.supplier_id), nombre: proveedorOrden?.name ?? String(order.supplier_id) });
      setBranchId(order.branch_id.toString());
      setExpectedDate(order.expected_date || '');
      setNotes(order.notes || '');

      // Cargar items
      const orderItems: OrderItem[] = order.items.map(item => ({
        id: `item-${item.id}`,
        product_id: item.product_id,
        productName: item.products?.name || 'Producto',
        sku: item.products?.sku || '',
        image: (item.products as unknown as { image?: string | null } | undefined)?.image || null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        notes: item.notes,
        ...cantidadLineaDeProducto(item.products),
      }));
      setItems(orderItems);

      setBranches(branchesData);
    } catch (error: unknown) {
      console.error('Error cargando datos:', error);
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo cargar la orden');
      router.push('/app/inventario/ordenes-compra');
    } finally {
      setIsLoading(false);
    }
  }, [orderUuid, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calcular total
  const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

  // Guardar orden
  const handleSubmit = async () => {
    if (!proveedor) {
      toastError('Error', 'Selecciona un proveedor');
      return;
    }
    if (!branchId) {
      toastError('Error', 'Selecciona una sucursal');
      return;
    }
    if (items.length === 0) {
      toastError('Error', 'Agrega al menos un producto');
      return;
    }
    // Una línea por peso nace vacía (0 kg): no se guarda sin cantidad.
    const sinCantidad = items.find((item) => !(Number(item.quantity) > 0));
    if (sinCantidad) {
      toastError(tLineas('cantidadRequeridaTitulo'), tLineas('cantidadRequerida', { producto: sinCantidad.productName }));
      return;
    }

    try {
      setIsSaving(true);
      const organizationId = getOrganizationId();

      const { error } = await purchaseOrderService.updatePurchaseOrder(
        orderUuid,
        organizationId,
        {
          supplier_id: parseInt(proveedor.id),
          branch_id: parseInt(branchId),
          expected_date: expectedDate || undefined,
          notes: notes || undefined
        },
        items.map(item => ({
          product_id: item.product_id,
          quantity: redondearCantidadLinea(item.quantity, { decimalesCantidad: item.decimalesCantidad ?? null }),
          unit_cost: item.unit_cost
        }))
      );

      if (error) throw error;

      toastSuccess('Orden actualizada', 'Los cambios han sido guardados correctamente');

      router.push(`/app/inventario/ordenes-compra/${orderUuid}`);
    } catch (error: unknown) {
      console.error('Error actualizando orden:', error);
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo actualizar la orden');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/app/inventario/ordenes-compra/${orderUuid}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Editar Orden de Compra
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Modifica los datos de la orden de compra
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="oc-proveedor" className="dark:text-gray-300">
                    Proveedor *
                  </Label>
                  <ElegirProveedor id="oc-proveedor" layout="campo" proveedor={proveedor} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} />
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
                <RichTextEditor
                  value={notes}
                  onChange={(html) => setNotes(html)}
                  placeholder="Notas adicionales para la orden..."
                  className="dark:bg-gray-900 dark:border-gray-700"
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
              <LineasOrdenCompra
                items={items}
                onItemsChange={(nuevas) => setItems(nuevas.map((n) => ({ ...n, notes: n.notes })))}
                proveedor={proveedor ? { id: Number(proveedor.id), nombre: proveedor.nombre } : null}
                sucursal={branchId ? Number(branchId) : null}
                nombreSucursal={branches.find((b) => String(b.id) === branchId)?.name ?? null}
                moneda={moneda.paraDocumento(null)}
              />
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
                  {sumaCantidades(items.map((i) => i.quantity))}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Total</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatear(total)}
                </span>
              </div>

              <div className="pt-4 space-y-3">
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Cambios
                </Button>

                <Link href={`/app/inventario/ordenes-compra/${orderUuid}`} className="block">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full dark:border-gray-700"
                  >
                    Cancelar
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default EditarOrdenCompraForm;
