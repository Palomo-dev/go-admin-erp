'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import type { WebOrder, WebOrderStatus } from '@/lib/services/webOrdersService';

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
  estimatedMinutes: number;
  setEstimatedMinutes: (minutes: number) => void;
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
  loadOrder: () => Promise<void>;
}

export function useWebOrderDetail(orderId: string): UseWebOrderDetailReturn {
  const router = useRouter();
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [order, setOrder] = useState<WebOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog states
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);

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
    extraData?: Record<string, any>
  ) => {
    const updateData: any = { status, ...extraData };
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
  };

  const handleConfirmOrder = async () => {
    setActionLoading(true);
    try {
      const estimatedReadyAt = new Date(Date.now() + estimatedMinutes * 60000).toISOString();
      await updateOrderStatus('confirmed', { estimated_ready_at: estimatedReadyAt });
      toast({
        title: 'Pedido confirmado',
        description: `Tiempo estimado: ${estimatedMinutes} minutos`,
      });
      setConfirmDialogOpen(false);
      loadOrder();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo confirmar el pedido',
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartDelivery = async () => {
    setActionLoading(true);
    try {
      const estimatedDeliveryAt = new Date(Date.now() + 30 * 60000).toISOString();
      await updateOrderStatus('in_delivery', { estimated_delivery_at: estimatedDeliveryAt });
      toast({ title: 'Pedido en camino' });
      loadOrder();
    } catch (error) {
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
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    setActionLoading(true);
    try {
      await updateOrderStatus('cancelled', { cancellation_reason: cancelReason });
      toast({ title: 'Pedido cancelado' });
      setCancelDialogOpen(false);
      setCancelReason('');
      loadOrder();
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertToSale = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      // Crear venta
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          customer_id: order.customer_id,
          total: order.total,
          subtotal: order.subtotal,
          tax_total: order.tax_total,
          discount_total: order.discount_total,
          balance: 0,
          status: 'paid',
          payment_status: 'paid',
          notes: `Pedido web: ${order.order_number}`,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Crear items de venta
      if (order.items && order.items.length > 0) {
        const saleItems = order.items.map(item => ({
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          tax_amount: item.tax_amount,
          discount_amount: item.discount_amount,
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;
      }

      // Vincular pedido con venta
      await supabase
        .from('web_orders')
        .update({ sale_id: sale.id })
        .eq('id', orderId);

      toast({ title: 'Venta creada exitosamente' });
      router.push(`/app/pos/ventas/${sale.id}`);
    } catch (error) {
      toast({ title: 'Error al crear venta', variant: 'destructive' });
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
    estimatedMinutes,
    setEstimatedMinutes,
    handleConfirmOrder,
    handleRejectOrder,
    handleStartPreparing,
    handleMarkReady,
    handleStartDelivery,
    handleMarkDelivered,
    handleCancelOrder,
    handleConvertToSale,
    handleCreateShipment,
    loadOrder,
  };
}
