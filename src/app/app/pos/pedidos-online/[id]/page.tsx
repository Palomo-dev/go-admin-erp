'use client';

import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DollarSign, Loader2 } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { useWebOrderDetail } from './hooks/useWebOrderDetail';
import { useTrazabilidadPedido } from './hooks/useTrazabilidadPedido';
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
  OrderPaymentsCard,
  OrderDocumentsCard,
  ConfirmOrderDialog,
  CancelOrderDialog,
  CobrarPedidoDialog,
} from './components';
import { AssignDeliveryDialog, cobroDelPedido } from '@/components/pos/pedidos-online';

export default function WebOrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;

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
    cobroDialogo,
    abrirCobro,
    cerrarCobro,
    avisoStock,
    sinCajaAbierta,
    loadOrder,
  } = useWebOrderDetail(orderId);
  const t = useTranslations('pedidoWeb');
  const trazabilidad = useTrazabilidadPedido(order);

  // Estado de carga
  if (loading) {
    return <OrderLoadingState />;
  }

  // Pedido no encontrado
  if (!order) {
    return <OrderNotFoundState />;
  }

  // Caja de la sede a la que entra el cobro (fn_caja_abierta_para, la regla de la RPC).
  // Sin E4 aplicada el cobro usa el respaldo sin caja: no se anuncia caja ni se bloquea.
  const cobro = cobroDelPedido(order);
  const sede = order.branch?.name ?? '';
  const cajaConocida = trazabilidad.cobroEnCaja && trazabilidad.cajaId !== null;
  const sinCaja = trazabilidad.cobroEnCaja && !trazabilidad.cargando && (trazabilidad.cajaId === null || sinCajaAbierta);
  const cajaEtiqueta = cajaConocida ? t('cobro.entraACaja', { caja: trazabilidad.cajaId ?? '', sede }) : null;
  const cajaDeLaSede = cajaConocida ? t('pagos.cajaAbierta', { caja: trazabilidad.cajaId ?? '', sede }) : null;

  const confirmarCobro = async (valor: { metodo: string; referencia: string | null }) => {
    const hecho = await handleCobrar(cobroDialogo.entregar, valor);
    if (!hecho) void trazabilidad.recargar();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <OrderHeader
        order={order}
        porCobrarEnCaja={cobro.puedeCobrar}
        reservaActiva={trazabilidad.reservaActiva}
        onCobrarYEntregar={cobro.cobraYEntrega ? () => abrirCobro(true) : undefined}
        cobrarDeshabilitado={sinCaja}
        isLoading={actionLoading}
        avisoStock={avisoStock}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          <OrderProductsCard order={order} />
          <OrderNotesCard order={order} comandaId={trazabilidad.comandaId} />
          <OrderTimelineCard order={order} />
          <OrderDocumentsCard
            order={order}
            factura={trazabilidad.factura}
            comandaId={trazabilidad.comandaId}
            cajaEtiqueta={cajaDeLaSede}
          />
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
            onCobrar={abrirCobro}
            sinCajaAbierta={sinCaja}
            cajaEtiqueta={cajaEtiqueta}
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
          <OrderPaymentsCard
            order={order}
            pagos={trazabilidad.pagos}
            porCobrarEnCaja={cobro.puedeCobrar}
            cajaEtiqueta={cajaDeLaSede}
          />
        </div>
      </div>

      {/* Móvil (Figma 1982:946211): «Cobrar y entregar» fijo abajo */}
      {cobro.cobraYEntrega && (
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface p-4 sm:hidden">
          <button
            type="button"
            className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}
            onClick={() => abrirCobro(true)}
            disabled={actionLoading || sinCaja}
          >
            {actionLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <DollarSign className="size-5" aria-hidden="true" />}
            {t('cobro.cobrarYEntregar')}
          </button>
        </div>
      )}

      {/* Diálogos */}
      <ConfirmOrderDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        prepTime={prepTime}
        onPrepTimeChange={setPrepTime}
        transitTime={transitTime}
        onTransitTimeChange={setTransitTime}
        isDelivery={esDomicilio(order?.delivery_type)}
        onConfirm={handleConfirmOrder}
        markAsPaid={markAsPaid}
        onMarkAsPaidChange={setMarkAsPaid}
        isLoading={actionLoading}
      />

      <CobrarPedidoDialog
        order={order}
        abierto={cobroDialogo.abierto}
        onAbiertoChange={(abierto) => (abierto ? abrirCobro(cobroDialogo.entregar) : cerrarCobro())}
        entregar={cobroDialogo.entregar}
        cajaId={trazabilidad.cajaId}
        cobroEnCaja={trazabilidad.cobroEnCaja}
        cargando={actionLoading}
        onConfirmar={confirmarCobro}
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
