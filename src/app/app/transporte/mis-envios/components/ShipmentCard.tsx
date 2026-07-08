'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
  Truck,
  Navigation,
  Search,
  Loader2,
  User,
  PackageCheck,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { DeliveryShipment } from '@/lib/services/deliveryIntegrationService';

const statusConfig: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  picked_up: { label: 'Recogido', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Package },
  in_transit: { label: 'En tránsito', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  out_for_delivery: { label: 'En entrega', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: Navigation },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  returned: { label: 'Devuelto', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: AlertCircle },
};

interface ShipmentCardProps {
  shipment: DeliveryShipment;
  updatingId: string | null;
  onUpdateStatus: (shipmentId: string, newStatus: string) => void;
}

export function ShipmentCard({ shipment, updatingId, onUpdateStatus }: ShipmentCardProps) {
  const status = (shipment.status || 'pending') as string;
  const config = statusConfig[status] || statusConfig.pending;
  const StatusIcon = config.icon;
  const isDelivered = status === 'delivered';
  const isCancelled = status === 'cancelled';
  const isUpdating = updatingId === shipment.id;

  const customer = shipment.customer as { id: string; full_name: string; phone?: string } | null;
  const items = shipment.shipment_items as { id: string; description: string; qty: number }[] | undefined;

  return (
    <Card key={shipment.id} className="overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header del card */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100">
                {shipment.shipment_number}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(shipment.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge className={config.color}>
            {config.label}
          </Badge>
        </div>

        {/* Cliente */}
        {customer && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <User className="h-4 w-4 text-gray-400" />
            <span>{customer.full_name}</span>
            {customer.phone && (
              <>
                <span className="text-gray-300">•</span>
                <Phone className="h-3 w-3" />
                <span>{customer.phone}</span>
              </>
            )}
          </div>
        )}

        {/* Dirección de entrega */}
        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
          <div>
            <p>{shipment.delivery_address}</p>
            {(shipment.delivery_city || shipment.delivery_department) && (
              <p className="text-xs text-gray-400">
                {[shipment.delivery_city, shipment.delivery_department].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Contacto e instrucciones */}
        {(shipment.delivery_contact_name || shipment.delivery_contact_phone) && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Phone className="h-4 w-4 text-gray-400" />
            <span>
              {shipment.delivery_contact_name}
              {shipment.delivery_contact_phone && ` - ${shipment.delivery_contact_phone}`}
            </span>
          </div>
        )}

        {shipment.delivery_instructions && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium text-xs mb-1">Instrucciones:</p>
            <p>{shipment.delivery_instructions}</p>
          </div>
        )}

        {/* Items */}
        {items && items.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Productos ({items.length})
            </p>
            <div className="space-y-1">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                  <span className="text-gray-500 dark:text-gray-400">x{item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COD y costo */}
        {(shipment.cod_amount > 0 || shipment.shipping_fee > 0) && (
          <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-3 text-sm">
            {shipment.cod_amount > 0 && (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                COD: {formatCurrency(shipment.cod_amount, shipment.currency)}
              </span>
            )}
            {shipment.shipping_fee > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                Envío: {formatCurrency(shipment.shipping_fee, shipment.currency)}
              </span>
            )}
          </div>
        )}

        {/* Acciones */}
        {!isDelivered && !isCancelled && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            {status === 'pending' && (
              <Button size="sm" onClick={() => onUpdateStatus(shipment.id, 'picked_up')} disabled={isUpdating}>
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 mr-1" />}
                Recoger
              </Button>
            )}
            {status === 'picked_up' && (
              <Button size="sm" onClick={() => onUpdateStatus(shipment.id, 'in_transit')} disabled={isUpdating}>
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4 mr-1" />}
                Iniciar ruta
              </Button>
            )}
            {status === 'in_transit' && (
              <Button size="sm" onClick={() => onUpdateStatus(shipment.id, 'out_for_delivery')} disabled={isUpdating}>
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4 mr-1" />}
                En entrega
              </Button>
            )}
            {status === 'out_for_delivery' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onUpdateStatus(shipment.id, 'delivered')}
                disabled={isUpdating}
              >
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-1" />}
                Marcar entregado
              </Button>
            )}
          </div>
        )}

        {/* Fecha de entrega */}
        {isDelivered && shipment.delivered_at && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 border-t border-gray-100 dark:border-gray-800 pt-3">
            <CheckCircle className="h-4 w-4" />
            <span>Entregado el {new Date(shipment.delivered_at).toLocaleString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
