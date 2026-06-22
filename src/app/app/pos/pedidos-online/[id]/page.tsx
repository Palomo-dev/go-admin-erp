'use client';

import { useParams } from 'next/navigation';
import { useWebOrderDetail } from './hooks/useWebOrderDetail';
import {
  OrderHeader,
  OrderLoadingState,
  OrderNotFoundState,
  OrderProductsCard,
  OrderNotesCard,
  OrderTimelineCard,
  OrderActionsCard,
  OrderCustomerCard,
  OrderDeliveryCard,
  ConfirmOrderDialog,
  CancelOrderDialog,
} from './components';
import { AssignDeliveryDialog } from '@/components/pos/pedidos-online';

export default function WebOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const {
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
    handleMarkAsPaid,
    loadOrder,
  } = useWebOrderDetail(orderId);

  // Estado de carga
  if (loading) {
    return <OrderLoadingState />;
  }

  // Pedido no encontrado
  if (!order) {
    return <OrderNotFoundState />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <OrderHeader order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          <OrderProductsCard order={order} />
          <OrderNotesCard order={order} />
          <OrderTimelineCard order={order} />
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          <OrderActionsCard
            order={order}
            onConfirm={() => setConfirmDialogOpen(true)}
            onReject={() => setCancelDialogOpen(true)}
            onStartPreparing={handleStartPreparing}
            onMarkReady={handleMarkReady}
            onStartDelivery={handleStartDelivery}
            onMarkDelivered={handleMarkDelivered}
            onCancel={() => setCancelDialogOpen(true)}
            onConvertToSale={handleConvertToSale}
            onMarkAsPaid={handleMarkAsPaid}
            isLoading={actionLoading}
          />
          <OrderCustomerCard order={order} />
          <OrderDeliveryCard
            order={order}
            onAssignDelivery={() => {
              // Si es delivery propio y está listo, crear shipment primero
              if (order.delivery_type === 'delivery_own' && order.status === 'ready') {
                handleCreateShipment();
              } else {
                setAssignDeliveryOpen(true);
              }
            }}
          />
        </div>
      </div>

      {/* Diálogos */}
      <ConfirmOrderDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        estimatedMinutes={estimatedMinutes}
        onEstimatedMinutesChange={setEstimatedMinutes}
        onConfirm={handleConfirmOrder}
        markAsPaid={markAsPaid}
        onMarkAsPaidChange={setMarkAsPaid}
        isLoading={actionLoading}
      />

      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderStatus={order.status}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={order.status === 'pending' ? handleRejectOrder : handleCancelOrder}
        isLoading={actionLoading}
      />

      {/* Diálogo de asignación de delivery */}
      {organizationId && (
        <AssignDeliveryDialog
          open={assignDeliveryOpen}
          onOpenChange={setAssignDeliveryOpen}
          webOrderId={order.id}
          organizationId={organizationId}
          onAssigned={loadOrder}
        />
      )}
    </div>
  );
}
