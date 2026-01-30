'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Truck,
  User,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  Circle,
  Package,
  Navigation,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  deliveryIntegrationService,
  type DeliveryShipment,
  type TransportEvent,
  type ProofOfDelivery,
} from '@/lib/services/deliveryIntegrationService';

interface DeliveryTrackingCardProps {
  webOrderId: string;
  onAssignClick?: () => void;
}

export function DeliveryTrackingCard({
  webOrderId,
  onAssignClick,
}: DeliveryTrackingCardProps) {
  const [shipment, setShipment] = useState<DeliveryShipment | null>(null);
  const [events, setEvents] = useState<TransportEvent[]>([]);
  const [proof, setProof] = useState<ProofOfDelivery | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadShipmentData();
  }, [webOrderId]);

  const loadShipmentData = async () => {
    setLoading(true);
    try {
      const shipmentData = await deliveryIntegrationService.getShipmentByWebOrderId(webOrderId);
      setShipment(shipmentData);

      if (shipmentData) {
        const [eventsData, proofData] = await Promise.all([
          deliveryIntegrationService.getShipmentEvents(shipmentData.id),
          shipmentData.status === 'delivered'
            ? deliveryIntegrationService.getProofOfDelivery(shipmentData.id)
            : Promise.resolve(null),
        ]);
        setEvents(eventsData);
        setProof(proofData);
      }
    } catch (error) {
      console.error('Error loading shipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      picked_up: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      out_for_delivery: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      returned: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      assigned: 'Asignado',
      picked_up: 'Recogido',
      out_for_delivery: 'En camino',
      delivered: 'Entregado',
      returned: 'Devuelto',
      cancelled: 'Cancelado',
    };
    return labels[status] || status;
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Delivery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Si no hay shipment, mostrar botón para asignar
  if (!shipment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Delivery Propio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No hay envío asignado para este pedido
            </p>
            {onAssignClick && (
              <Button onClick={onAssignClick} size="sm">
                <Truck className="h-4 w-4 mr-2" />
                Asignar Delivery
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Tracking
          </CardTitle>
          <Badge className={getStatusColor(shipment.status)}>
            {getStatusLabel(shipment.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Número de tracking */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tracking:</span>
          <span className="font-mono font-medium">{shipment.tracking_number}</span>
        </div>

        {/* Vehículo y conductor asignados */}
        {(shipment.metadata as Record<string, unknown>)?.vehicle_id && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>Vehículo asignado</span>
              </div>
              {shipment.vehicle && (
                <p className="text-sm font-medium pl-6">
                  {shipment.vehicle.plate} - {shipment.vehicle.brand || ''} {shipment.vehicle.model || ''}
                </p>
              )}
            </div>
          </>
        )}

        {(shipment.metadata as Record<string, unknown>)?.driver_id && shipment.driver && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Conductor</span>
            </div>
            <div className="flex items-center justify-between pl-6">
              <p className="text-sm font-medium">
                {shipment.driver.employee
                  ? `${shipment.driver.employee.first_name} ${shipment.driver.employee.last_name}`
                  : 'Conductor asignado'}
              </p>
              {shipment.driver.employee?.phone && (
                <a
                  href={`tel:${shipment.driver.employee.phone}`}
                  className="text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Tiempos estimados */}
        {shipment.expected_delivery_date && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Entrega estimada:</span>
              <span className="font-medium">
                {formatDateTime(shipment.expected_delivery_date)}
              </span>
            </div>
          </>
        )}

        {/* Timeline de eventos */}
        {events.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Historial</p>
              <div className="space-y-3">
                {events.slice(-5).reverse().map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {index === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      {index < events.length - 1 && (
                        <div className="w-px h-full bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-sm">{event.description || event.event_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(event.event_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Prueba de entrega */}
        {proof && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Prueba de entrega
              </p>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Recibido por:</span>
                  <span className="font-medium">{proof.recipient_name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{formatDateTime(proof.delivered_at)}</span>
                </div>
                {proof.customer_rating && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Calificación:</span>
                    <span>{'⭐'.repeat(proof.customer_rating)}</span>
                  </div>
                )}
                {proof.signature_url && (
                  <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                    <a href={proof.signature_url} target="_blank" rel="noopener noreferrer">
                      Ver firma
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Botón para ver ubicación en tiempo real */}
        {shipment.status === 'out_for_delivery' && shipment.delivery_latitude && shipment.delivery_longitude && (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${shipment.delivery_latitude},${shipment.delivery_longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="h-4 w-4 mr-2" />
              Ver ruta en Google Maps
            </a>
          </Button>
        )}

        {/* Botón de refrescar */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={loadShipmentData}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar estado
        </Button>
      </CardContent>
    </Card>
  );
}
