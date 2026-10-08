'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toastSuccess, toastError, toastWarning } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrderItem, type PurchaseOrderWithItems } from '@/lib/services/purchaseOrderService';
import {
  construirLineasRecepcion,
  nuevaClaveRecepcion,
  recepcionarOrdenCompra,
  type LoteCapturado,
} from '@/lib/services/inventario/recepcionOrdenCompra';
import { useLocale, useTranslations } from 'next-intl';
import { decimalesCantidad, esMedido, formatoCantidad, pasoCantidad, redondearCantidadProducto } from '@/lib/pos/peso/modoVenta';
import { localeIntl } from '@/components/kit/idioma';
import { supabase } from '@/lib/supabase/config';
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
  CheckCircle,
  Mail,
  Phone,
  User,
  Receipt,
  CreditCard
} from 'lucide-react';
import { SerialCaptureSection } from '@/components/shared/SerialCaptureSection';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { LotesRecepcion, lotesIncompletos, useMensajeErrorRecepcionOC } from '@/components/inventario/recepcion/LotesRecepcion';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

interface OrdenCompraDetalleProps {
  orderUuid: string;
}

/** Campos de serial que el ítem puede traer además de los tipados en PurchaseOrderItem. */
interface ItemConSeriales {
  serials_received?: string[] | null;
  requires_serial?: boolean | null;
  products?: { track_serial?: boolean | null; track_lots?: boolean | null } | null;
}

/** Factura de compra vinculada a la orden; su moneda es la del documento. */
interface FacturaVinculada {
  id: number;
  number_ext: string;
  total: number;
  status: string;
  currency: string | null;
}

interface CuentaPorPagarVinculada {
  id: number;
  balance: number;
  status: string;
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
  const { formatDate, getToday } = useFormatDate();
  const tRec = useTranslations('inventarioRecepcionOC');
  const mensajeErrorRecepcion = useMensajeErrorRecepcionOC();
  const { formatear, paraDocumento } = useMonedaOrganizacion();
  const locale = localeIntl(useLocale());
  /** «1,250 kg» en productos por peso o medida; «12» por unidad. */
  const cantidadItem = (n: number | null | undefined, p: PurchaseOrderItem['products']) => formatoCantidad(Number(n) || 0, p, locale);

  // Estados
  const [order, setOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemSerials, setItemSerials] = useState<Record<number, string[]>>({});
  const [productsWithSerial, setProductsWithSerial] = useState<Set<number>>(new Set());
  // B8: lotes por línea (lo que llega ahora) y clave de idempotencia de esta recepción.
  const [itemLotes, setItemLotes] = useState<Record<number, LoteCapturado[]>>({});
  const [productsWithLots, setProductsWithLots] = useState<Set<number>>(new Set());
  const [claveRecepcion, setClaveRecepcion] = useState<string>(() => nuevaClaveRecepcion());

  // Estados para factura y cuenta por pagar vinculadas
  const [linkedInvoice, setLinkedInvoice] = useState<FacturaVinculada | null>(null);
  const [linkedPayable, setLinkedPayable] = useState<CuentaPorPagarVinculada | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      const { data, error } = await purchaseOrderService.getPurchaseOrderByUuid(orderUuid, organizationId);

      if (error) throw error;
      if (!data) {
        toastError('Error', 'Orden de compra no encontrada');
        router.push('/app/inventario/ordenes-compra');
        return;
      }

      setOrder(data);

      // Inicializar cantidades recibidas
      const quantities: Record<number, number> = {};
      const serialsMap: Record<number, string[]> = {};
      const serialProducts = new Set<number>();
      const lotProducts = new Set<number>();
      data.items.forEach(item => {
        quantities[item.id] = item.received_quantity || 0;
        const conSeriales = item as unknown as ItemConSeriales;
        serialsMap[item.id] = conSeriales.serials_received || [];
        if (conSeriales.requires_serial || conSeriales.products?.track_serial) {
          serialProducts.add(item.id);
        }
        if (conSeriales.products?.track_lots) {
          lotProducts.add(item.id);
        }
      });
      setReceivedQuantities(quantities);
      setItemSerials(serialsMap);
      setProductsWithSerial(serialProducts);
      setProductsWithLots(lotProducts);
      setItemLotes({});

      // Buscar factura vinculada y cuenta por pagar
      if (data.id) {
        const { data: invoice } = await supabase
          .from('invoice_purchase')
          .select('id, number_ext, total, status, currency')
          .eq('po_id', data.id)
          .single();
        setLinkedInvoice(invoice as FacturaVinculada | null);

        if (invoice) {
          const { data: payable } = await supabase
            .from('accounts_payable')
            .select('id, balance, status')
            .eq('invoice_id', (invoice as FacturaVinculada).id)
            .single();
          setLinkedPayable(payable as CuentaPorPagarVinculada | null);
        }
      }
    } catch (error: unknown) {
      console.error('Error cargando orden:', error);
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo cargar la orden');
      router.push('/app/inventario/ordenes-compra');
    } finally {
      setIsLoading(false);
    }
  }, [orderUuid, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleStatusChange = async (newStatus: 'sent' | 'cancelled') => {
    if (!order) return;

    try {
      setIsProcessing(true);
      const organizationId = getOrganizationId();
      const { error } = await purchaseOrderService.updateStatus(order.uuid, organizationId, newStatus);

      if (error) throw error;

      const statusLabels: Record<string, string> = {
        sent: 'enviada al proveedor',
        cancelled: 'cancelada'
      };

      toastSuccess('Estado actualizado', `La orden ha sido ${statusLabels[newStatus]}`);

      loadData();
    } catch (error: unknown) {
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo actualizar el estado');
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

      toastSuccess('Orden duplicada', 'La orden de compra ha sido duplicada correctamente');

      if (data) {
        router.push(`/app/inventario/ordenes-compra/${data.uuid}/editar`);
      }
    } catch (error: unknown) {
      toastError('Error', (error as { message?: string } | null)?.message || 'No se pudo duplicar la orden');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReceiveItems = async () => {
    if (!order) return;

    // B8: una sola RPC (fn_oc_recepcionar) con lo que llega AHORA por línea,
    // sus lotes y sus seriales nuevos. Si algo falla no queda nada recibido.
    const lineas = construirLineasRecepcion(order.items, receivedQuantities, itemSerials, itemLotes);
    if (lineas.length === 0) {
      toastError(tRec('falloTitulo'), tRec('nada'));
      return;
    }
    const sinLote = order.items.find((item) => {
      const ahora = (receivedQuantities[item.id] ?? 0) - (item.received_quantity || 0);
      return lotesIncompletos(productsWithLots.has(item.id), Math.round(ahora * 1000) / 1000, itemLotes[item.id] ?? []);
    });
    if (sinLote) {
      toastError(tRec('falloTitulo'), tRec('lotesPendientes', { producto: sinLote.products?.name ?? '' }));
      return;
    }

    try {
      setIsProcessing(true);
      const r = await recepcionarOrdenCompra(order.uuid, { lineas, clave: claveRecepcion });

      if (r.ya_procesada) {
        toastSuccess(tRec('yaProcesada', { codigo: r.codigo }));
      } else if (r.orden.completa) {
        toastSuccess(
          tRec('exitoCompleta', { codigo: r.codigo, orden: r.orden.codigo }),
          r.factura?.number_ext ? tRec('facturaCreada', { factura: r.factura.number_ext }) : undefined,
        );
      } else {
        toastSuccess(tRec('exito', { codigo: r.codigo }), tRec('pendientes', { n: r.pendientes.length }));
      }

      // Lo que no movió inventario (producto sin control de stock) se dice, no se esconde.
      if (r.saltadas.length > 0) {
        toastWarning(tRec('saltadasTitulo', { n: r.saltadas.length }), r.saltadas.map((x) => x.product_name ?? `#${x.product_id}`).join(', '));
      }

      setClaveRecepcion(nuevaClaveRecepcion());
      setShowReceiveDialog(false);
      loadData();
    } catch (error: unknown) {
      toastError(tRec('falloTitulo'), mensajeErrorRecepcion(error));
    } finally {
      setIsProcessing(false);
    }
  };

  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: order ? `OC-${order.id}` : undefined, volverA: '/app/inventario/ordenes-compra' });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
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
          {/* En celular «←» ya está en el MobileHeader del shell: aquí sería la segunda flecha. */}
          <Link href="/app/inventario/ordenes-compra" className="hidden lg:block">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
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
                          {cantidadItem(item.quantity, item.products)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            item.received_quantity >= item.quantity
                              ? 'text-green-600 dark:text-green-400'
                              : item.received_quantity > 0
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-500 dark:text-gray-400'
                          }>
                            {cantidadItem(item.received_quantity, item.products)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-gray-900 dark:text-white">
                          {formatear(item.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                          {formatear(item.subtotal)}
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
                  {formatear(order.total || 0)}
                </span>
              </div>

              {/* Info de contacto del proveedor */}
              {order.suppliers?.email || order.suppliers?.phone || order.suppliers?.contact ? (
                <div className="pt-3 border-t dark:border-gray-700 space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contacto del Proveedor</p>
                  {order.suppliers?.contact && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <User className="h-3.5 w-3.5" />
                      {order.suppliers.contact}
                    </div>
                  )}
                  {order.suppliers?.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Mail className="h-3.5 w-3.5" />
                      {order.suppliers.email}
                    </div>
                  )}
                  {order.suppliers?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Phone className="h-3.5 w-3.5" />
                      {order.suppliers.phone}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Factura y cuenta por pagar vinculadas */}
              {linkedInvoice && (
                <div className="pt-3 border-t dark:border-gray-700 space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Documentos Vinculados</p>
                  <Link
                    href={`/app/finanzas/facturas-compra/${linkedInvoice.id}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                      <Receipt className="h-4 w-4" />
                      Factura {linkedInvoice.number_ext || `#${linkedInvoice.id}`}
                    </span>
                    <Badge variant="outline" className="text-xs">{linkedInvoice.status}</Badge>
                  </Link>
                  {linkedPayable && (
                    <Link
                      href={`/app/finanzas/cuentas-por-pagar`}
                      className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <CreditCard className="h-4 w-4" />
                        Cuenta por Pagar
                      </span>
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {formatMoneda(linkedPayable.balance, paraDocumento(linkedInvoice.currency))}
                      </span>
                    </Link>
                  )}
                </div>
              )}
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
                      <p className="font-medium text-gray-900 dark:text-white break-words whitespace-normal">
                        {item.products?.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        SKU: {item.products?.sku} · Pedido:{' '}
                        {esMedido(item.products) ? (
                          <span className="font-semibold">{cantidadItem(item.quantity, item.products)}</span>
                        ) : (
                          <>
                            <span className="font-semibold">{item.quantity}</span> unidades
                          </>
                        )}
                      </p>
                    </div>

                    {/* Input de recepción */}
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recibido</p>
                        <Input
                          type="number"
                          inputMode={esMedido(item.products) ? 'decimal' : 'numeric'}
                          // Peso o medida: recepción parcial con los decimales del producto (0,500 de 1,250 kg).
                          step={pasoCantidad(decimalesCantidad(item.products))}
                          min={item.received_quantity || 0}
                          max={item.quantity}
                          value={received}
                          onChange={(e) => setReceivedQuantities({
                            ...receivedQuantities,
                            [item.id]: esMedido(item.products)
                              ? redondearCantidadProducto(parseFloat(e.target.value) || 0, decimalesCantidad(item.products))
                              : parseFloat(e.target.value) || 0
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
                        / {cantidadItem(item.quantity, item.products)}
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

                  {/* Captura de seriales si el producto requiere tracking */}
                  {productsWithSerial.has(item.id) && received > 0 && (
                    <div className="mt-3">
                      <SerialCaptureSection
                        productId={item.product_id}
                        productName={item.products?.name || 'Producto'}
                        productSku={item.products?.sku}
                        organizationId={getOrganizationId()}
                        branchId={order.branch_id}
                        quantity={received}
                        serials={itemSerials[item.id] || []}
                        onSerialsChange={(newSerials) =>
                          setItemSerials(prev => ({ ...prev, [item.id]: newSerials }))
                        }
                        supplierId={order.supplier_id}
                        purchaseOrderId={order.id}
                        costAtPurchase={item.unit_cost}
                        compact
                      />
                    </div>
                  )}

                  {/* B8: lote y vencimiento de lo que llega ahora (productos con lotes) */}
                  {productsWithLots.has(item.id) && received > (item.received_quantity || 0) && (
                    <div className="mt-3">
                      <LotesRecepcion
                        organizacionId={getOrganizationId()}
                        sucursalId={order.branch_id}
                        productoId={item.product_id}
                        productoNombre={item.products?.name || ''}
                        cantidad={Math.round((received - (item.received_quantity || 0)) * 1000) / 1000}
                        requerido
                        valor={itemLotes[item.id] ?? []}
                        onChange={(v) => setItemLotes((prev) => ({ ...prev, [item.id]: v }))}
                        hoy={getToday()}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <AlertDialogFooter className="border-t dark:border-gray-700 pt-4">
            <AlertDialogCancel className="dark:border-gray-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Con error la recepción no se registra y el diálogo sigue abierto con lo capturado.
                e.preventDefault();
                void handleReceiveItems();
              }}
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
