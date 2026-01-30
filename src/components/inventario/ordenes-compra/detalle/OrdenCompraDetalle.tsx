'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrderWithItems } from '@/lib/services/purchaseOrderService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { 
  ArrowLeft, 
  Loader2, 
  Pencil, 
  Copy,
  Send,
  Package,
  XCircle,
  Truck,
  Building2,
  Calendar,
  FileText,
  CheckCircle
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface OrdenCompraDetalleProps {
  orderUuid: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  sent: { label: 'Enviada', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Parcial', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  received: { label: 'Recibida', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' }
};

export function OrdenCompraDetalle({ orderUuid }: OrdenCompraDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Estados
  const [order, setOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      const { data, error } = await purchaseOrderService.getPurchaseOrderByUuid(orderUuid, organizationId);

      if (error) throw error;
      if (!data) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Orden de compra no encontrada'
        });
        router.push('/app/inventario/ordenes-compra');
        return;
      }

      setOrder(data);

      // Inicializar cantidades recibidas
      const quantities: Record<number, number> = {};
      data.items.forEach(item => {
        quantities[item.id] = item.received_quantity || 0;
      });
      setReceivedQuantities(quantities);
    } catch (error: any) {
      console.error('Error cargando orden:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo cargar la orden'
      });
      router.push('/app/inventario/ordenes-compra');
    } finally {
      setIsLoading(false);
    }
  }, [orderUuid, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleStatusChange = async (newStatus: 'sent' | 'partial' | 'received' | 'cancelled') => {
    if (!order) return;

    try {
      setIsProcessing(true);
      const organizationId = getOrganizationId();
      const { success, error } = await purchaseOrderService.updateStatus(order.uuid, organizationId, newStatus);

      if (error) throw error;

      const statusLabels: Record<string, string> = {
        sent: 'enviada al proveedor',
        partial: 'marcada como recepción parcial',
        received: 'marcada como recibida',
        cancelled: 'cancelada'
      };

      toast({
        title: 'Estado actualizado',
        description: `La orden ha sido ${statusLabels[newStatus]}`
      });

      loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo actualizar el estado'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!order) return;

    try {
      setIsProcessing(true);
      const organizationId = getOrganizationId();
      const { data, error } = await purchaseOrderService.duplicatePurchaseOrder(order.uuid, organizationId);

      if (error) throw error;

      toast({
        title: 'Orden duplicada',
        description: 'La orden de compra ha sido duplicada correctamente'
      });

      if (data) {
        router.push(`/app/inventario/ordenes-compra/${data.uuid}/editar`);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo duplicar la orden'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReceiveItems = async () => {
    if (!order) return;

    try {
      setIsProcessing(true);
      const organizationId = getOrganizationId();

      const itemsToReceive = Object.entries(receivedQuantities).map(([itemId, quantity]) => ({
        itemId: parseInt(itemId),
        quantity
      }));

      const { success, error } = await purchaseOrderService.receiveItems(
        order.uuid,
        organizationId,
        itemsToReceive
      );

      if (error) throw error;

      toast({
        title: 'Recepción registrada',
        description: 'Las cantidades recibidas han sido actualizadas'
      });

      setShowReceiveDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo registrar la recepción'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando orden...</span>
      </div>
    );
  }

  if (!order) return null;

  const statusInfo = statusConfig[order.status] || statusConfig.draft;

  // Calcular progreso de recepción
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const receivedItems = order.items.reduce((sum, i) => sum + (i.received_quantity || 0), 0);
  const receptionProgress = totalItems > 0 ? Math.round((receivedItems / totalItems) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/ordenes-compra">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                OC-{order.id}
              </h1>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Creada el {formatDate(order.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {order.status === 'draft' && (
            <>
              <Link href={`/app/inventario/ordenes-compra/${order.uuid}/editar`}>
                <Button variant="outline" size="sm" className="dark:border-gray-700">
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('sent')}
                disabled={isProcessing}
                className="dark:border-gray-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar
              </Button>
            </>
          )}

          {(order.status === 'sent' || order.status === 'partial') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReceiveDialog(true)}
              disabled={isProcessing}
              className="dark:border-gray-700"
            >
              <Package className="h-4 w-4 mr-2" />
              Registrar Recepción
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={isProcessing}
            className="dark:border-gray-700"
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>

          {order.status !== 'cancelled' && order.status !== 'received' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange('cancelled')}
              disabled={isProcessing}
              className="text-red-600 hover:text-red-700 dark:border-gray-700"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Productos ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-900">
                      <TableHead className="dark:text-gray-300">Producto</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Cantidad</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Recibido</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Costo Unit.</TableHead>
                      <TableHead className="text-right dark:text-gray-300">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id} className="dark:border-gray-700">
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {item.products?.name || 'Producto'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {item.products?.sku || '-'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-gray-900 dark:text-white">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            item.received_quantity >= item.quantity
                              ? 'text-green-600 dark:text-green-400'
                              : item.received_quantity > 0
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-500 dark:text-gray-400'
                          }>
                            {item.received_quantity || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-gray-900 dark:text-white">
                          {formatCurrency(item.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Notas */}
          {order.notes && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Notas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {order.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Resumen */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Proveedor
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {order.suppliers?.name || '-'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Sucursal
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {order.branches?.name || '-'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Fecha Esperada
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {order.expected_date ? formatDate(order.expected_date) : '-'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400 font-medium">Total</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(order.total || 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Progreso de recepción */}
          {(order.status === 'sent' || order.status === 'partial' || order.status === 'received') && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  Progreso de Recepción
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {receivedItems} de {totalItems} unidades
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {receptionProgress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      receptionProgress === 100
                        ? 'bg-green-500'
                        : receptionProgress > 0
                          ? 'bg-orange-500'
                          : 'bg-gray-400'
                    }`}
                    style={{ width: `${receptionProgress}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog de recepción */}
      <AlertDialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800 border dark:border-gray-700 max-w-2xl shadow-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <AlertDialogTitle className="dark:text-white text-lg">
                  Registrar Recepción de Mercancía
                </AlertDialogTitle>
                <AlertDialogDescription className="dark:text-gray-400 mt-1">
                  Ingresa la cantidad recibida para cada producto. Puedes hacer recepciones parciales.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
            {order.items.map((item) => {
              const received = receivedQuantities[item.id] || 0;
              const isComplete = received >= item.quantity;
              const isPartial = received > 0 && received < item.quantity;
              
              return (
                <div 
                  key={item.id} 
                  className={`p-4 rounded-lg border transition-colors ${
                    isComplete 
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
                      : isPartial
                        ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Icono del producto */}
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0 border dark:border-gray-700">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                    
                    {/* Info del producto */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {item.products?.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        SKU: {item.products?.sku} · Pedido: <span className="font-semibold">{item.quantity}</span> unidades
                      </p>
                    </div>

                    {/* Input de recepción */}
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recibido</p>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={received}
                          onChange={(e) => setReceivedQuantities({
                            ...receivedQuantities,
                            [item.id]: parseFloat(e.target.value) || 0
                          })}
                          className={`w-20 h-10 text-center font-semibold ${
                            isComplete 
                              ? 'border-green-300 dark:border-green-700' 
                              : isPartial
                                ? 'border-orange-300 dark:border-orange-700'
                                : 'dark:bg-gray-800 dark:border-gray-700'
                          }`}
                        />
                      </div>
                      <div className="text-gray-400 dark:text-gray-500">
                        / {item.quantity}
                      </div>
                    </div>
                  </div>
                  
                  {/* Barra de progreso */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          isComplete 
                            ? 'bg-green-500' 
                            : isPartial
                              ? 'bg-orange-500'
                              : 'bg-gray-400'
                        }`}
                        style={{ width: `${Math.min((received / item.quantity) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <AlertDialogFooter className="border-t dark:border-gray-700 pt-4">
            <AlertDialogCancel className="dark:border-gray-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReceiveItems}
              disabled={isProcessing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar Recepción
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default OrdenCompraDetalle;
