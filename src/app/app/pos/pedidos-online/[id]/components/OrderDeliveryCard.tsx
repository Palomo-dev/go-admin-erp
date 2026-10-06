'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Truck, Store, Bike, Navigation, UserPlus, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { DeliveryTrackingCard } from '@/components/pos/pedidos-online';
import type { WebOrder, DeliveryType } from '@/lib/services/webOrdersService';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { esDomicilio, mesaCortaDelPedido, mesaDelPedido, tipoEntregaEfectivo, zonaDelPedido } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { clasesBoton } from '@/components/kit';

interface OrderDeliveryCardProps {
  order: WebOrder;
  onAssignDelivery?: () => void;
  showTracking?: boolean;
}

const DELIVERY_TYPE_CONFIG: Record<DeliveryType, { 
  icon: typeof Store;
  color: string;
}> = {
  pickup: { 
    icon: Store, 
    color: 'text-blue-600 dark:text-blue-400' 
  },
  delivery_own: { 
    icon: Bike, 
    color: 'text-green-600 dark:text-green-400' 
  },
  delivery_third_party: { 
    icon: Truck, 
    color: 'text-purple-600 dark:text-purple-400' 
  },
  // Texto en pantalla: `pedidoWeb.comerAqui` / `comerAquiMesa` (i18n).
  dine_in: {
    icon: UtensilsCrossed,
    // Neutro (Figma 1981:175699): «Comer aquí» no es un aviso.
    color: 'text-fg-secondary'
  },
};

export function OrderDeliveryCard({ order, onAssignDelivery, showTracking = true }: OrderDeliveryCardProps) {
  const t = useTranslations('pedidoWeb');
  const { timezone } = useOrgTimezone();
  const tipo = tipoEntregaEfectivo(order);
  const mesa = mesaDelPedido(order);
  const config = tipo === 'dine_in'
    ? { ...DELIVERY_TYPE_CONFIG.dine_in, label: mesa ? t('comerAquiMesa', { mesa }) : t('comerAqui') }
    : { ...DELIVERY_TYPE_CONFIG[tipo], label: t(`tipoEntregaFicha.${tipo}`) };
  const Icon = config.icon;
  const address = order.delivery_address;
  const domicilio = esDomicilio(order.delivery_type);
  const isOwnDelivery = order.delivery_type === 'delivery_own';
  const canAssignDelivery = isOwnDelivery && ['confirmed', 'preparing', 'ready'].includes(order.status);
  const shouldShowTracking = isOwnDelivery && showTracking && ['in_delivery', 'delivered'].includes(order.status);

  // Horas en la zona de la organización, nunca en la del navegador.
  const formatTime = (date: string) => formatTimeInTz(date, timezone);

  const formatDateTime = (date: string) =>
    formatDateTimeInTz(date, timezone, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // «Comer aquí» (Figma 1981:175699): sin dirección ni conductor; la mesa, su
  // zona, cuándo quedó listo y el enlace a la mesa en el POS.
  if (tipo === 'dine_in') {
    const mesaCorta = mesaCortaDelPedido(order);
    const zona = zonaDelPedido(order);
    const aTiempo = order.ready_at && order.estimated_ready_at
      ? new Date(order.ready_at).getTime() <= new Date(order.estimated_ready_at).getTime()
      : null;
    const fila = (etiqueta: string, valor: string) => (
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-fg-secondary">{etiqueta}</span>
        <span className="text-right text-fg">{valor}</span>
      </div>
    );
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4" aria-hidden="true" strokeWidth={1.5} />
            {t('ficha.entrega')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-fg-secondary">
              {mesaCorta ? t('comerAquiMesa', { mesa: mesaCorta }) : t('comerAqui')}
            </span>
            {zona && <span className="text-[13px] text-fg">{zona}</span>}
          </div>
          <p className="text-[13px] text-fg">{mesaCorta ? t('ficha.entregaMesa', { mesa: mesaCorta }) : t('ficha.entregaComerAqui')}</p>
          {order.ready_at
            ? fila(t('ficha.listo'), `${formatTime(order.ready_at)}${aTiempo === null ? '' : ` · ${aTiempo ? t('ficha.aTiempo') : t('ficha.tarde')}`}`)
            : order.estimated_ready_at && fila(t('ficha.listoAprox'), formatTime(order.estimated_ready_at))}
          {mesaCorta && fila(t('ficha.mesa'), [mesaCorta.replace(/^Mesa\s+/i, ''), zona].filter(Boolean).join(' · '))}
          {order.restaurant_table_id && (
            <Link href={`/app/pos/mesas/${order.restaurant_table_id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true })}>
              <Navigation className="size-4" aria-hidden="true" />
              {t('verMesa')}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const baseCard = (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
          <Truck className="h-4 w-4 dark:text-gray-300" />
          {t('ficha.entrega')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tipo de entrega */}
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", config.color)} />
          <span className="font-medium dark:text-gray-100">{config.label}</span>
          {order.delivery_partner && (
            <Badge variant="outline" className="text-xs ml-auto dark:text-gray-100 dark:border-gray-600">
              {order.delivery_partner}
            </Badge>
          )}
        </div>

        {/* Dirección de entrega */}
        {domicilio && address?.address && (
          <div className="space-y-1">
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground dark:text-gray-400" />
              <span className="dark:text-gray-200">{address.address}</span>
            </p>
            {address.neighborhood && (
              <p className="text-sm text-muted-foreground dark:text-gray-400 ml-6">
                {address.neighborhood}
              </p>
            )}
            <p className="text-sm text-muted-foreground dark:text-gray-400 ml-6">
              {[
                address.city,
                address.state || address.department,
                address.country,
              ].filter(Boolean).join(', ')}
            </p>
            {address.instructions && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 ml-6">
                📝 {address.instructions}
              </p>
            )}
            {address.lat && address.lng && (
              <a
                href={`https://maps.google.com/?q=${address.lat},${address.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-1 text-sm ml-6",
                  "text-blue-600 dark:text-blue-400 hover:underline"
                )}
              >
                <Navigation className="h-3 w-3 dark:text-gray-300" />
                {t('orderDeliveryCard.verMapa')}
              </a>
            )}
          </div>
        )}

        {/* Tiempos estimados */}
        {order.scheduled_at && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <span className="dark:text-gray-200">{t('orderDeliveryCard.programado', { dateTime: formatDateTime(order.scheduled_at) })}</span>
          </div>
        )}

        {order.estimated_ready_at && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Clock className="h-4 w-4 dark:text-green-400" />
            <span className="dark:text-gray-200">{t('orderDeliveryCard.listoAprox', { time: formatTime(order.estimated_ready_at) })}</span>
          </div>
        )}

        {order.estimated_delivery_at && domicilio && (
          <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
            <Truck className="h-4 w-4 dark:text-purple-400" />
            <span className="dark:text-gray-200">{t('orderDeliveryCard.entregaAprox', { time: formatTime(order.estimated_delivery_at) })}</span>
          </div>
        )}

        {/* Botón para asignar delivery propio */}
        {canAssignDelivery && onAssignDelivery && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 dark:border-gray-600"
            onClick={onAssignDelivery}
          >
            <UserPlus className="h-4 w-4 mr-2 dark:text-gray-300" />
            {t('orderDeliveryCard.asignarConductor')}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  // Si es delivery propio y está en tránsito o entregado, mostrar tracking
  if (shouldShowTracking) {
    return (
      <div className="space-y-4">
        {baseCard}
        <DeliveryTrackingCard
          webOrderId={order.id}
          onAssignClick={onAssignDelivery}
        />
      </div>
    );
  }

  return baseCard;
}
