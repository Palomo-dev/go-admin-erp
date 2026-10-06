'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import { claveAvisoCobro, CobroEnCajaError, webOrderConfirmationService } from '@/lib/services/webOrderConfirmationService';
import { metodoDeCobroEnCaja } from '@/lib/pos/pedidosWeb/metodosCaja';
import { webOrdersService, type WebOrder, type WebOrderStatus } from '@/lib/services/webOrdersService';
import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { type EstimatedTime, timeToMs, formatEstimatedTime } from '../components';

/** Métodos que se cobran en la caja del local; cualquier otro se cobra como efectivo. */

/** Mensaje de un error de Supabase o de JS, sin suponer su forma. */
function mensajeDeError(error: unknown): string | undefined {
  return (error as { message?: string } | null)?.message;
}

interface UseWebOrderDetailReturn {
  order: WebOrder | null;
  loading: boolean;
  actionLoading: boolean;
  organizationId: number | null;
  // Dialog states
  confirmDialogOpen: boolean;
  setConfirmDialogOpen: (open: boolean) => void;
  cancelDialogOpen: boolean;
  setCancelDialogOpen: (open: boolean) => void;
  assignDeliveryOpen: boolean;
  setAssignDeliveryOpen: (open: boolean) => void;
  cancelReason: string;
  setCancelReason: (reason: string) => void;
  prepTime: EstimatedTime;
  setPrepTime: (time: EstimatedTime) => void;
  transitTime: EstimatedTime;
  setTransitTime: (time: EstimatedTime) => void;
  markAsPaid: boolean;
  setMarkAsPaid: (value: boolean) => void;
  // Actions
  handleConfirmOrder: () => Promise<void>;
  handleRejectOrder: () => Promise<void>;
  handleStartPreparing: () => Promise<void>;
  handleMarkReady: () => Promise<void>;
  handleStartDelivery: () => Promise<void>;
  handleMarkDelivered: () => Promise<void>;
  handleCancelOrder: () => Promise<void>;
  handleConvertToSale: () => Promise<void>;
  handleCreateShipment: () => Promise<void>;
  /** Cobra en la caja de la sede (E4); con `entregar`, además marca el pedido entregado. */
  handleCobrar: (entregar: boolean) => Promise<void>;
  /** Último cobro rechazado porque la sede no tiene caja abierta. */
  sinCajaAbierta: boolean;
  loadOrder: () => Promise<void>;
}

export function useWebOrderDetail(orderId: string): UseWebOrderDetailReturn {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('pedidoWeb');
  const organizationId = getOrganizationId();
  const { organization } = useOrganization();
  const orgTypeId = organization?.type_id ?? 3;
  const isRetail = orgTypeId === 3;

  const [order, setOrder] = useState<WebOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog states
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [prepTime, setPrepTime] = useState<EstimatedTime>(
    isRetail ? { value: 1, unit: 'days' } : { value: 30, unit: 'minutes' }
  );
  const [transitTime, setTransitTime] = useState<EstimatedTime>(
    isRetail ? { value: 5, unit: 'days' } : { value: 30, unit: 'minutes' }
  );
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [sinCajaAbierta, setSinCajaAbierta] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('web_orders')
        .select(`
          *,
          items:web_order_items(*),
          customer:customers(id, full_name, email, phone, address, city),
          branch:branches(id, name, address, phone)
        `)
        .eq('id', orderId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (error) {
      console.error('Error loading order:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el pedido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [orderId, organizationId, toast]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const updateOrderStatus = async (
    status: WebOrderStatus,
    extraData?: Record<string, unknown>
  ) => {
    const updateData: Record<string, unknown> = { status, ...extraData };
    const now = new Date().toISOString();

    switch (status) {
      case 'confirmed':
        updateData.confirmed_at = now;
        break;
      case 'ready':
        updateData.ready_at = now;
        break;
      case 'delivered':
        updateData.delivered_at = now;
        break;
      case 'cancelled':
      case 'rejected':
        updateData.cancelled_at = now;
        break;
    }

    const { error } = await supabase
      .from('web_orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    // Correo al cliente con el nuevo estado (best-effort, en el servidor).
    void webOrdersService.avisarCambioEstado(orderId, status);
  };

  const handleConfirmOrder = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      const isDelivery = esDomicilio(order.delivery_type);
      const transitMs = isDelivery ? timeToMs(transitTime) : 0;
      const result = await webOrderConfirmationService.confirmOrder(order, {
        prepMs: timeToMs(prepTime),
        transitMs,
        markAsPaid,
      });
      const erroresStock = result.stockErrors ?? [];
      if (result.yaConfirmado) {
        toast({
          title: t('confirmacion.yaConfirmado'),
          description: t('confirmacion.yaConfirmadoDetalle'),
        });
        setConfirmDialogOpen(false);
        setMarkAsPaid(false);
        loadOrder();
        return;
      }
      const listo = t('confirmacion.listo', { tiempo: formatEstimatedTime(prepTime) });
      const parts = result.tableSessionId
        ? [t('confirmacion.enLaMesa'), listo]
        : [t('confirmacion.ventaCreada'), t('confirmacion.comandaEnviada'), listo];
      if (isDelivery && transitMs > 0) parts.push(t('confirmacion.entrega', { tiempo: formatEstimatedTime(transitTime) }));
      if (result.cobro) parts.push(t('cobro.hecho'));
      else if (markAsPaid && !result.cobroPendiente) parts.push(t('confirmacion.marcadoPagado'));
      if (result.shipmentId) parts.push(t('confirmacion.envioCreado'));
      toast({
        title: result.completadoAhora ? t('confirmacion.completada') : t('confirmacion.confirmado'),
        description: parts.join(' · '),
      });
      if (result.cobroPendiente) {
        if (result.cobroPendiente === 'NO_OPEN_CASH_SESSION') setSinCajaAbierta(true);
        toast({
          title: t('cobro.pendienteTrasConfirmar'),
          description: t(`cobro.${claveAvisoCobro(result.cobroPendiente)}`),
          variant: 'destructive',
        });
      }
      // Receta o insumos sin stock: la confirmación sigue, pero el equipo lo ve
      // para decidir (rechazar con motivo o ajustar el inventario).
      if (erroresStock.length > 0) {
        toast({
          title: t('confirmacion.stockFallido', { n: erroresStock.length }),
          description: erroresStock.slice(0, 3).join(' · '),
          variant: 'destructive',
        });
      }
      void webOrdersService.avisarCambioEstado(order.id, 'confirmed');
      setConfirmDialogOpen(false);
      setMarkAsPaid(false);
      loadOrder();
    } catch (error: unknown) {
      console.error('Error confirmando pedido:', error);
      toast({
        title: t('confirmacion.error'),
        description: mensajeDeError(error) || t('confirmacion.error'),
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!cancelReason.trim()) return;
    setActionLoading(true);
    try {
      await updateOrderStatus('rejected', { cancellation_reason: cancelReason });
      toast({ title: 'Pedido rechazado' });
      setCancelDialogOpen(false);
      setCancelReason('');
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartPreparing = async () => {
    setActionLoading(true);
    try {
      await updateOrderStatus('preparing');
      toast({ title: 'Pedido en preparación' });
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReady = async () => {
    setActionLoading(true);
    try {
      await updateOrderStatus('ready');
      toast({ title: 'Pedido listo para entrega' });
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartDelivery = async () => {
    setActionLoading(true);
    try {
      // Para retail, el tiempo de entrega se calcula en días, no minutos.
      // Usar el estimated_delivery_at que ya se calculó al confirmar el pedido.
      // Si no existe, dejar que el ERP lo calcule después (no hardcodear 30 min).
      const extraData: Record<string, unknown> = {};
      if (order?.estimated_delivery_at) {
        extraData.estimated_delivery_at = order.estimated_delivery_at;
      }
      await updateOrderStatus('in_delivery', extraData);
      toast({ title: 'Pedido en camino' });
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkDelivered = async () => {
    setActionLoading(true);
    try {
      await updateOrderStatus('delivered');
      toast({ title: 'Pedido entregado' });
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    setActionLoading(true);
    try {
      await webOrdersService.cancelOrder(orderId, cancelReason);
      toast({ title: 'Pedido cancelado' });
      setCancelDialogOpen(false);
      setCancelReason('');
      loadOrder();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertToSale = async () => {
    if (!order) return;

    // Si ya tiene sale_id vinculado (creado al confirmar), ir directo a la venta
    if (order.sale_id) {
      router.push(`/app/pos/ventas/${order.sale_id}`);
      return;
    }

    // Fallback: si por alguna razón no tiene sale_id, crear venta vía confirmación
    setActionLoading(true);
    try {
      const result = await webOrderConfirmationService.confirmOrder(order, {
        prepMs: timeToMs(prepTime),
        transitMs: esDomicilio(order.delivery_type) ? timeToMs(transitTime) : 0,
        markAsPaid: false,
      });
      toast({ title: 'Venta creada exitosamente' });
      router.push(`/app/pos/ventas/${result.saleId}`);
    } catch (error: unknown) {
      console.error('Error convirtiendo a venta:', error);
      toast({ title: 'Error al crear venta', description: mensajeDeError(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateShipment = async () => {
    if (!order || order.delivery_type !== 'delivery_own') return;
    setActionLoading(true);
    try {
      await deliveryIntegrationService.createShipmentFromWebOrder(order);
      toast({ title: 'Envío creado', description: 'Ahora puedes asignar un conductor' });
      setAssignDeliveryOpen(true);
    } catch (error) {
      console.error('Error creating shipment:', error);
      toast({ title: 'Error al crear envío', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCobrar = async (entregar: boolean) => {
    if (!order) return;
    setActionLoading(true);
    setSinCajaAbierta(false);
    try {
      const cobro = await webOrderConfirmationService.cobrarEnCaja(order, {
        metodo: metodoDeCobroEnCaja(order.payment_method),
        referencia: order.payment_reference ?? null,
      });
      if (entregar && order.status !== 'delivered') await updateOrderStatus('delivered');
      toast({
        title: cobro.yaCobrado ? t('cobro.yaCobrado') : t('cobro.hecho'),
        description: cobro.invoiceNumber ? t('cobro.factura', { numero: cobro.invoiceNumber }) : undefined,
      });
      loadOrder();
    } catch (error: unknown) {
      if (error instanceof CobroEnCajaError && error.codigo === 'NO_OPEN_CASH_SESSION') {
        setSinCajaAbierta(true);
        toast({ title: t('cobro.sinCaja'), description: t('cobro.sinCajaDetalle'), variant: 'destructive' });
      } else if (error instanceof CobroEnCajaError && error.codigo === 'FUNCION_AUSENTE') {
        // Migración E4 pendiente: el comportamiento anterior de «Marcar como pagado».
        try {
          const { sinFactura } = await webOrderConfirmationService.marcarPagadoSinCaja(order);
          if (entregar && order.status !== 'delivered') await updateOrderStatus('delivered');
          toast({
            title: t('cobro.marcadoPagado'),
            description: sinFactura ? t('cobro.sinFacturaDetalle') : undefined,
          });
          loadOrder();
        } catch (fallbackError: unknown) {
          console.error('Error marking as paid:', fallbackError);
          toast({ title: 'Error', description: mensajeDeError(fallbackError) || 'No se pudo marcar como pagado', variant: 'destructive' });
        }
      } else if (error instanceof CobroEnCajaError && error.codigo !== 'OTRO') {
        toast({ title: t('cobro.error'), description: t(`cobro.${claveAvisoCobro(error.codigo)}`), variant: 'destructive' });
      } else {
        console.error('Error cobrando el pedido:', error);
        toast({ title: t('cobro.error'), description: mensajeDeError(error), variant: 'destructive' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  return {
    order,
    loading,
    actionLoading,
    organizationId,
    confirmDialogOpen,
    setConfirmDialogOpen,
    cancelDialogOpen,
    setCancelDialogOpen,
    assignDeliveryOpen,
    setAssignDeliveryOpen,
    cancelReason,
    setCancelReason,
    prepTime,
    setPrepTime,
    transitTime,
    setTransitTime,
    markAsPaid,
    setMarkAsPaid,
    handleConfirmOrder,
    handleRejectOrder,
    handleStartPreparing,
    handleMarkReady,
    handleStartDelivery,
    handleMarkDelivered,
    handleCancelOrder,
    handleConvertToSale,
    handleCreateShipment,
    handleCobrar,
    sinCajaAbierta,
    loadOrder,
  };
}
