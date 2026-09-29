'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService } from '@/lib/services/purchaseOrderService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { useBranch } from '@/lib/context/BranchContext';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { LineasOrdenCompra, type LineaOrden } from '../LineasOrdenCompra';
import { ArrowLeft, Save, Send, Loader2, Building2, Package } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

/**
 * Nueva orden de compra. El proveedor y los productos usan las piezas
 * compartidas del formulario de documento (F3 de
 * docs/design/FACTURA-VENTA-FORMULARIO-V2.md): «Elegir proveedor» con filtros
 * y alta rápida, y «Agregar productos a la orden» con costo del proveedor.
 * Guardar sigue siendo `purchaseOrderService.createPurchaseOrder`.
 */
export function NuevaOrdenCompraForm() {
  const router = useRouter();
  const { selectedBranchId, branches } = useBranch();
  const moneda = useMonedaOrganizacion();
  const { formatear } = moneda;

  // Estados del formulario
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [branchId, setBranchId] = useState<number | null>(selectedBranchId);
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<LineaOrden[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  // Calcular total
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  // Guardar orden
  const handleSubmit = async (sendToSupplier: boolean = false) => {
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

    // Validar que los productos con track_serial tengan todos los seriales capturados
    const incompleteSerialItems = items.filter((item) => item.track_serial && (item.serial_numbers || []).length < Math.floor(item.quantity));
    if (incompleteSerialItems.length > 0) {
      toastError('Seriales incompletos', `Faltan seriales por capturar en ${incompleteSerialItems.length} producto(s) con trazabilidad.`);
      return;
    }

    try {
      setIsSaving(true);
      const organizationId = getOrganizationId();

      const { data, error } = await purchaseOrderService.createPurchaseOrder(
        organizationId,
        {
          supplier_id: parseInt(proveedor.id),
          branch_id: branchId!,
          expected_date: expectedDate || undefined,
          notes: notes || undefined,
          status: sendToSupplier ? 'sent' : 'draft',
        },
        items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          serial_numbers: item.serial_numbers && item.serial_numbers.length > 0 ? item.serial_numbers : undefined,
          requires_serial: item.requires_serial || false,
        })),
      );

      if (error) throw error;

      if (data) {
        setHasSaved(true);
        toastSuccess(
          sendToSupplier ? 'Orden enviada' : 'Orden creada',
          sendToSupplier ? 'La orden ha sido creada y enviada al proveedor' : 'La orden ha sido guardada como borrador',
        );
        router.push(`/app/inventario/ordenes-compra/${data.uuid}`);
      } else {
        router.push('/app/inventario/ordenes-compra');
      }
    } catch (error: unknown) {
      console.error('Error creando orden:', error);
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo crear la orden de compra');
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nueva Orden de Compra</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Crea una nueva orden de compra para un proveedor</p>
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
              <BranchSelectorField value={branchId} onChange={setBranchId} required />

              <div className="space-y-2">
                <Label htmlFor="oc-proveedor" className="dark:text-gray-300">
                  Proveedor *
                </Label>
                <ElegirProveedor id="oc-proveedor" layout="campo" proveedor={proveedor} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} />
              </div>

              <div className="space-y-2">
                <Label className="dark:text-gray-300">Fecha Esperada de Entrega</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-700" />
              </div>

              <div className="space-y-2">
                <Label className="dark:text-gray-300">Notas</Label>
                <RichTextEditor value={notes} onChange={(html) => setNotes(html)} placeholder="Notas adicionales para la orden..." className="dark:bg-gray-900 dark:border-gray-700" />
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
                onItemsChange={setItems}
                proveedor={proveedor ? { id: Number(proveedor.id), nombre: proveedor.nombre } : null}
                sucursal={branchId}
                nombreSucursal={branches.find((b) => b.id === branchId)?.name ?? null}
                moneda={moneda.paraDocumento(null)}
                conSeriales
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
                <span className="font-medium text-gray-900 dark:text-white">{items.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Total</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">{formatear(total)}</span>
              </div>

              <div className="pt-4 space-y-3">
                <Button onClick={() => handleSubmit(false)} disabled={isSaving || hasSaved} variant="outline" className="w-full dark:border-gray-700">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar Borrador
                </Button>
                <Button onClick={() => handleSubmit(true)} disabled={isSaving || hasSaved} className="w-full bg-blue-600 hover:bg-blue-700">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
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
