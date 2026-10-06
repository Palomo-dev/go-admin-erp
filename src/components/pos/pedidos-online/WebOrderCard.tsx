'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  MapPin, 
  Phone, 
  User, 
  Store, 
  Truck, 
  Bike,
  CheckCircle,
  XCircle,
  Timer,
  Package,
  Eye,
  CalendarClock,
  Coins,
  UtensilsCrossed
} from 'lucide-react';
import type { WebOrder, WebOrderStatus, DeliveryType } from '@/lib/services/webOrdersService';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz, formatTimeInTz, toPlainDate, todayInTz } from '@/lib/utils/dateDisplay';
import { esDomicilio, mesaDelPedido, tipoEntregaEfectivo } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { PaymentStatusBadge } from './PaymentStatusBadge';

interface WebOrderCardProps {
  order: WebOrder;
  onConfirm?: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  onViewDetails?: (orderId: string) => void;
  onUpdateStatus?: (orderId: string, status: WebOrderStatus) => void;
}

const STATUS_CONFIG: Record<WebOrderStatus, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: <Clock className="h-3 w-3 dark:text-yellow-200" /> },
  confirmed: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: <CheckCircle className="h-3 w-3 dark:text-blue-200" /> },
  preparing: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: <Timer className="h-3 w-3 dark:text-orange-200" /> },
  ready: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: <Package className="h-3 w-3 dark:text-green-200" /> },
  in_delivery: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: <Truck className="h-3 w-3 dark:text-purple-200" /> },
  delivered: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', icon: <CheckCircle className="h-3 w-3 dark:text-emerald-200" /> },
  cancelled: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: <XCircle className="h-3 w-3 dark:text-red-200" /> },
  rejected: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', icon: <XCircle className="h-3 w-3 dark:text-gray-200" /> },
  expired: { color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: <Clock className="h-3 w-3 dark:text-gray-400" /> },
};

const DELIVERY_TYPE_CONFIG: Record<DeliveryType, { icon: React.ReactNode }> = {
  pickup: { icon: <Store className="h-4 w-4 dark:text-gray-300" /> },
  delivery_own: { icon: <Bike className="h-4 w-4 dark:text-gray-300" /> },
  delivery_third_party: { icon: <Truck className="h-4 w-4 dark:text-gray-300" /> },
  // Texto en pantalla: `pedidoWeb.comerAqui` / `comerAquiMesa` (i18n) desde el componente.
  dine_in: { icon: <UtensilsCrossed className="h-4 w-4 dark:text-gray-300" /> },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wompi: 'Wompi',
  wompi_co: 'Wompi',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  mp_checkout: 'MercadoPago',
  stripe_payments: 'Stripe',
  payu_co: 'PayU',
  paypal_checkout: 'PayPal',
};

const PAYMENT_DETAIL_LABELS: Record<string, string> = {
  bancolombia_transfer: 'Bancolombia',
  nequi: 'Nequi',
  pse: 'PSE',
  bancolombia_collect: 'Bancolombia Collect',
  daviplata: 'Daviplata',
};

/** Métodos con nombre común (no marca): se traducen en `pedidoWeb.metodoPago`. */
const METODOS_TRADUCIBLES = new Set(['cash', 'transfer', 'card']);

function getPaymentMethodLabel(method: string, t: (clave: string) => string): string {
  if (METODOS_TRADUCIBLES.has(method)) return t(`metodoPago.${method}`);
  return PAYMENT_METHOD_LABELS[method] || method;
}

function getPaymentDetailLabel(t: (clave: string) => string, detail?: string): string | null {
  if (!detail) return null;
  if (detail === 'card') return t('metodoPago.card');
  return PAYMENT_DETAIL_LABELS[detail] || detail;
}

export function WebOrderCard({ 
  order, 
  onConfirm, 
  onReject, 
  onViewDetails,
  onUpdateStatus 
}: WebOrderCardProps) {
  const t = useTranslations('pedidoWeb');
  const tEstado = useTranslations('pedidosOnlineListado.estados');
  const { timezone } = useOrgTimezone();
  const statusConfig = STATUS_CONFIG[order.status];
  // «Comer aquí» llega como dine_in (E1) o como pickup con la marca del sitio.
  const tipo = tipoEntregaEfectivo(order);
  const mesa = mesaDelPedido(order);
  const deliveryConfig = tipo === 'dine_in'
    ? { ...DELIVERY_TYPE_CONFIG.dine_in, label: mesa ? t('comerAquiMesa', { mesa }) : t('comerAqui') }
    : { ...DELIVERY_TYPE_CONFIG[tipo], label: t(`tipoEntrega.${tipo}`) };
  const domicilio = esDomicilio(order.delivery_type);

  // Fechas en la zona de la organización (regla de fechas: nunca la del navegador).
  const formatTime = (date: string) => formatTimeInTz(date, timezone);

  const formatDate = (date: string) => {
    if (toPlainDate(new Date(date), timezone) === todayInTz(timezone)) {
      return `Hoy ${formatTime(date)}`;
    }
    return formatDateTimeInTz(date, timezone, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getTimeSinceOrder = () => {
    const minutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}min`;
  };

  const isPending = order.status === 'pending';
  const isUrgent = isPending && (Date.now() - new Date(order.created_at).getTime()) > 10 * 60000; // 10 min

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${isUrgent ? 'ring-2 ring-red-500' : ''}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-bold text-base sm:text-lg dark:text-gray-100">{order.order_number}</span>
              {isUrgent && (
                <Badge variant="destructive" className="text-xs">
                  {t('webOrderCard.urgente')}
                </Badge>
              )}
              {order.is_scheduled && (
                <Badge className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                  <CalendarClock className="h-3 w-3 dark:text-indigo-200" />
                  {t('webOrderCard.programado')}
                </Badge>
              )}
              {order.tip_amount > 0 && (
                <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex items-center gap-1">
                  <Coins className="h-3 w-3 dark:text-amber-200" />
                  {t('webOrderCard.propina')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3 dark:text-gray-400" />
              {formatDate(order.created_at)} • {getTimeSinceOrder()}
            </p>
            {order.is_scheduled && order.scheduled_at && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <CalendarClock className="h-3 w-3 dark:text-indigo-400" />
                {t('webOrderCard.texto', { date: formatDate(order.scheduled_at) })}
              </p>
            )}
          </div>
          <Badge className={`${statusConfig.color} flex items-center gap-1`}>
            {statusConfig.icon}
            {tEstado(order.status)}
          </Badge>
        </div>

        {/* Cliente */}
        <div className="space-y-1 mb-3">
          <p className="flex items-center gap-2 text-sm dark:text-gray-200">
            <User className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <span className="font-medium dark:text-gray-100">{order.customer_name || order.customer?.full_name || t('ficha.clienteAnonimo')}</span>
          </p>
          {(order.customer_phone || order.customer?.phone) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
              <Phone className="h-4 w-4 dark:text-gray-400" />
              <span className="dark:text-gray-300">{order.customer_phone || order.customer?.phone}</span>
            </p>
          )}
        </div>

        {/* Tipo de entrega + Método de pago + Estado de pago */}
        <div className="flex items-center gap-2 mb-1 p-2 bg-muted/50 dark:bg-gray-900/50 rounded-lg">
          {deliveryConfig.icon}
          <span className="text-sm font-medium dark:text-gray-100">{deliveryConfig.label}</span>
          {order.payment_method && (
            <Badge variant="outline" className="ml-auto text-xs dark:text-gray-100 dark:border-gray-600">
              {getPaymentMethodLabel(order.payment_method, t)}
              {order.payment_method_detail && ` · ${getPaymentDetailLabel(t, order.payment_method_detail)}`}
            </Badge>
          )}
          {!order.payment_method && order.delivery_partner && (
            <Badge variant="outline" className="ml-auto text-xs dark:text-gray-100 dark:border-gray-600">
              {order.delivery_partner}
            </Badge>
          )}
        </div>
        <div className="mb-3">
          <PaymentStatusBadge status={order.payment_status} />
        </div>

        {/* Dirección (si es delivery) */}
        {domicilio && order.delivery_address?.address && (
          <div className="flex items-start gap-2 mb-3 text-sm text-muted-foreground dark:text-gray-400">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 dark:text-gray-400" />
            <span className="break-words whitespace-normal dark:text-gray-300">{order.delivery_address.address}</span>
          </div>
        )}

        {/* Items resumen */}
        <div className="border-t dark:border-gray-700 pt-3 mb-3">
          <p className="text-sm text-muted-foreground dark:text-gray-400 mb-1">
            {t('webOrderCard.productoS', { n: order.items?.length || 0 })}
          </p>
          <div className="text-sm space-y-1 max-h-20 overflow-y-auto">
            {order.items?.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="break-words whitespace-normal dark:text-gray-200">{item.quantity}x {item.product_name}</span>
                <span className="text-muted-foreground dark:text-gray-400">${item.total.toLocaleString()}</span>
              </div>
            ))}
            {(order.items?.length || 0) > 3 && (
              <p className="text-xs text-muted-foreground dark:text-gray-400">{t('webOrderCard.mas', { n: order.items!.length - 3 })}</p>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between border-t dark:border-gray-700 pt-3 mb-3">
          <span className="font-medium dark:text-gray-100">Total</span>
          <span className="text-lg font-bold text-primary dark:text-blue-400">${order.total.toLocaleString()}</span>
        </div>

        {/* Notas del cliente */}
        {order.customer_notes && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-sm mb-3">
            <span className="font-medium dark:text-yellow-200">{t('webOrderCard.nota')} </span>
            <span className="dark:text-yellow-100">{order.customer_notes}</span>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          {isPending && (
            <>
              <Button 
                size="sm" 
                className="flex-1"
                onClick={() => onConfirm?.(order.id)}
              >
                <CheckCircle className="h-4 w-4 mr-1 dark:text-white" />
                <span className="hidden sm:inline dark:text-white">{t('webOrderCard.confirmar')}</span>
                <span className="sm:hidden dark:text-white">Ok</span>
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                className="px-2 sm:px-3"
                onClick={() => onReject?.(order.id)}
              >
                <XCircle className="h-4 w-4 dark:text-white" />
              </Button>
            </>
          )}
          
          {order.status === 'confirmed' && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'preparing')}
            >
              <Timer className="h-4 w-4 mr-1 dark:text-white" />
              <span className="hidden sm:inline dark:text-white">{t('webOrderCard.iniciarPreparacion')}</span>
              <span className="sm:hidden dark:text-white">{t('webOrderCard.preparar')}</span>
            </Button>
          )}

          {order.status === 'preparing' && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'ready')}
            >
              <Package className="h-4 w-4 mr-1 dark:text-white" />
              <span className="hidden sm:inline dark:text-white">{t('webOrderCard.marcarListo')}</span>
              <span className="sm:hidden dark:text-white">{t('ficha.listo')}</span>
            </Button>
          )}

          {order.status === 'ready' && domicilio && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'in_delivery')}
            >
              <Truck className="h-4 w-4 mr-1 dark:text-white" />
              <span className="hidden sm:inline dark:text-white">{t('webOrderCard.enviarDomicilio')}</span>
              <span className="sm:hidden dark:text-white">{t('webOrderCard.enviar')}</span>
            </Button>
          )}

          {(order.status === 'ready' && !domicilio) || order.status === 'in_delivery' ? (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'delivered')}
            >
              <CheckCircle className="h-4 w-4 mr-1 dark:text-white" />
              <span className="hidden sm:inline dark:text-white">{t('webOrderCard.marcarEntregado')}</span>
              <span className="sm:hidden dark:text-white">{t('ficha.estados.delivered')}</span>
            </Button>
          ) : null}

          <Button 
            size="sm" 
            variant="outline"
            className="px-2 sm:px-3 dark:border-gray-600"
            onClick={() => onViewDetails?.(order.id)}
          >
            <Eye className="h-4 w-4 dark:text-gray-300" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
