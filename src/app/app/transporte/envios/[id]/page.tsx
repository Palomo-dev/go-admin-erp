'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  CheckCircle,
  User,
  Phone,
  Tag,
  DollarSign,
  AlertTriangle,
  Loader2,
  FileCheck,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { shipmentsService, type ShipmentWithDetails } from '@/lib/services/shipmentsService';
import {
  ShipmentItems,
  DeliveryAttempts,
  ProofOfDelivery,
  ShipmentTimeline,
  IncidentDialog,
} from '@/components/transporte/envios/id';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Package className="h-4 w-4" /> },
  received: { label: 'Recibido', color: 'bg-blue-100 text-blue-800', icon: <Package className="h-4 w-4" /> },
  in_transit: { label: 'En Tránsito', color: 'bg-purple-100 text-purple-800', icon: <Truck className="h-4 w-4" /> },
  arrived: { label: 'Llegó', color: 'bg-indigo-100 text-indigo-800', icon: <MapPin className="h-4 w-4" /> },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  returned: { label: 'Devuelto', color: 'bg-orange-100 text-orange-800', icon: <Package className="h-4 w-4" /> },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500', icon: <AlertTriangle className="h-4 w-4" /> },
};

export default function ShipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shipmentId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [shipment, setShipment] = useState<ShipmentWithDetails | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [events, setEvents] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [attempts, setAttempts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pod, setPod] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!shipmentId) return;

    setIsLoading(true);
    try {
      const [shipmentData, eventsData, itemsData, attemptsData, podData] = await Promise.all([
        shipmentsService.getShipmentById(shipmentId),
        shipmentsService.getShipmentEvents(shipmentId),
        shipmentsService.getShipmentItems(shipmentId),
        shipmentsService.getDeliveryAttempts(shipmentId),
        shipmentsService.getProofOfDelivery(shipmentId),
      ]);
      setShipment(shipmentData);
      setEvents(eventsData);
      setItems(itemsData);
      setAttempts(attemptsData);
      setPod(podData);
    } catch (error) {
      console.error('Error loading shipment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el envío',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (newStatus: string) => {
    if (!shipment) return;

    try {
      await shipmentsService.updateStatus(shipment.id, newStatus as ShipmentWithDetails['status']);
      toast({ title: 'Estado actualizado' });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    }
  };

  const handleAddItem = async (item: { description: string; sku?: string; qty: number; unit?: string; unit_value?: number; weight_kg?: number; notes?: string }) => {
    try {
      await shipmentsService.addShipmentItem(shipmentId, item);
      toast({ title: 'Item agregado' });
      loadData();
    } catch (error) {
      console.error('Error adding item:', error);
      toast({ title: 'Error', description: 'No se pudo agregar el item', variant: 'destructive' });
      throw error;
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await shipmentsService.deleteShipmentItem(itemId);
      toast({ title: 'Item eliminado' });
      loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el item', variant: 'destructive' });
    }
  };

  const handleAddEvent = async (event: { event_type: string; description?: string; location_text?: string }) => {
    try {
      await shipmentsService.createEvent(shipmentId, event);
      toast({ title: 'Evento registrado' });
      loadData();
    } catch (error) {
      console.error('Error adding event:', error);
      toast({ title: 'Error', description: 'No se pudo registrar el evento', variant: 'destructive' });
      throw error;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRegisterAttempt = async (attempt: any) => {
    try {
      await shipmentsService.createDeliveryAttempt(shipmentId, attempt);
      toast({ title: 'Intento registrado' });
      loadData();
    } catch (error) {
      console.error('Error registering attempt:', error);
      toast({ title: 'Error', description: 'No se pudo registrar el intento', variant: 'destructive' });
      throw error;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRegisterPOD = async (podData: any) => {
    try {
      await shipmentsService.createProofOfDelivery(shipmentId, podData);
      toast({ title: 'Entrega confirmada', description: 'Se registró la prueba de entrega' });
      loadData();
    } catch (error) {
      console.error('Error registering POD:', error);
      toast({ title: 'Error', description: 'No se pudo registrar la entrega', variant: 'destructive' });
      throw error;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleReportIncident = async (incident: any) => {
    if (!organizationId) return;
    try {
      await shipmentsService.createShipmentIncident(shipmentId, organizationId, incident);
      toast({ title: 'Incidente reportado' });
      loadData();
    } catch (error) {
      console.error('Error reporting incident:', error);
      toast({ title: 'Error', description: 'No se pudo reportar el incidente', variant: 'destructive' });
      throw error;
    }
  };

  const handleRegisterCOD = async () => {
    if (!shipment || !organizationId) return;
    try {
      await shipmentsService.registerCODPayment(shipmentId, organizationId, shipment.total_cost);
      toast({ title: 'Pago COD registrado' });
      loadData();
    } catch (error) {
      console.error('Error registering COD:', error);
      toast({ title: 'Error', description: 'No se pudo registrar el pago', variant: 'destructive' });
    }
  };

  const canEdit = shipment?.status !== 'delivered' && shipment?.status !== 'cancelled';
  const canRegisterPOD = shipment?.status === 'arrived' || shipment?.status === 'out_for_delivery';
  const canRegisterAttempt = shipment?.status === 'in_transit' || shipment?.status === 'arrived' || shipment?.status === 'out_for_delivery';
  const showCODButton = shipment?.payment_status === 'cod' && shipment?.status === 'delivered';

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando envío...</span>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-6 text-center">
        <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Envío no encontrado</h2>
      </div>
    );
  }

  const status = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.pending;
  const paymentStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
    cod: { label: 'Contra Entrega', color: 'bg-blue-100 text-blue-800' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  };
  const paymentStatus = paymentStatusConfig[shipment.payment_status] || paymentStatusConfig.pending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/transporte/envios')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {shipment.tracking_number}
              </h1>
              <Badge className={`${status.color} flex items-center gap-1`}>
                {status.icon}
                {status.label}
              </Badge>
              <Badge className={paymentStatus.color}>
                <DollarSign className="h-3 w-3 mr-1" />
                {paymentStatus.label}
              </Badge>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Creado el {format(new Date(shipment.created_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {shipment.status === 'pending' && (
            <Button variant="outline" onClick={() => handleStatusChange('received')}>
              <Package className="h-4 w-4 mr-2" />
              Recibir
            </Button>
          )}
          {shipment.status === 'received' && (
            <Button variant="outline" onClick={() => handleStatusChange('in_transit')}>
              <Truck className="h-4 w-4 mr-2" />
              Despachar
            </Button>
          )}
          {shipment.status === 'in_transit' && (
            <Button variant="outline" onClick={() => handleStatusChange('arrived')}>
              <MapPin className="h-4 w-4 mr-2" />
              Marcar Llegada
            </Button>
          )}
          {canRegisterPOD && (
            <Button onClick={() => handleStatusChange('delivered')} className="bg-green-600 hover:bg-green-700">
              <FileCheck className="h-4 w-4 mr-2" />
              Registrar Entrega
            </Button>
          )}
          {showCODButton && (
            <Button variant="outline" onClick={handleRegisterCOD} className="border-green-500 text-green-600">
              <DollarSign className="h-4 w-4 mr-2" />
              Cobrar COD
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setShowIncidentDialog(true)} className="border-red-300 text-red-600">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Reportar Incidente
            </Button>
          )}
          <Button variant="outline">
            <Tag className="h-4 w-4 mr-2" />
            Imprimir Etiqueta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Remitente y Destinatario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Remitente
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{shipment.sender_name}</p>
                {shipment.sender_phone && (
                  <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Phone className="h-4 w-4" />
                    {shipment.sender_phone}
                  </p>
                )}
                {shipment.origin_stop && (
                  <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <MapPin className="h-4 w-4" />
                    {shipment.origin_stop.name} - {shipment.origin_stop.city}
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Destinatario
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{shipment.receiver_name}</p>
                {shipment.receiver_phone && (
                  <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Phone className="h-4 w-4" />
                    {shipment.receiver_phone}
                  </p>
                )}
                {shipment.destination_stop && (
                  <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <MapPin className="h-4 w-4" />
                    {shipment.destination_stop.name} - {shipment.destination_stop.city}
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Detalles del Paquete */}
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Detalles del Paquete
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Tipo</p>
                <p className="font-medium">{shipment.package_type || 'Paquete'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Peso</p>
                <p className="font-medium">{shipment.weight_kg ? `${shipment.weight_kg} kg` : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Valor Declarado</p>
                <p className="font-medium">
                  {shipment.declared_value
                    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(shipment.declared_value)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tipo Entrega</p>
                <p className="font-medium capitalize">{shipment.delivery_type || 'Standard'}</p>
              </div>
            </div>
            {(shipment.is_fragile || shipment.requires_signature) && (
              <div className="mt-4 flex gap-2">
                {shipment.is_fragile && (
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    Frágil
                  </Badge>
                )}
                {shipment.requires_signature && (
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    Requiere Firma
                  </Badge>
                )}
              </div>
            )}
          </Card>

          {/* Tabs para Items, Timeline, Intentos, POD */}
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="items" className="flex items-center gap-1">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Items</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="attempts" className="flex items-center gap-1">
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Intentos</span>
              </TabsTrigger>
              <TabsTrigger value="pod" className="flex items-center gap-1">
                <FileCheck className="h-4 w-4" />
                <span className="hidden sm:inline">POD</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="mt-4">
              <ShipmentItems
                items={items}
                isLoading={isLoading}
                canEdit={canEdit}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <ShipmentTimeline
                events={events}
                isLoading={isLoading}
                canAddEvent={canEdit}
                onAddEvent={handleAddEvent}
              />
            </TabsContent>

            <TabsContent value="attempts" className="mt-4">
              <DeliveryAttempts
                attempts={attempts}
                isLoading={isLoading}
                canRegister={canRegisterAttempt}
                onRegisterAttempt={handleRegisterAttempt}
              />
            </TabsContent>

            <TabsContent value="pod" className="mt-4">
              <ProofOfDelivery
                pod={pod}
                isLoading={isLoading}
                canRegister={canRegisterPOD}
                onRegisterPOD={handleRegisterPOD}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Panel Lateral */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Costos
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Flete</span>
                <span className="font-medium">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: shipment.currency || 'COP', minimumFractionDigits: 0 }).format(shipment.freight_cost || 0)}
                </span>
              </div>
              {shipment.insurance_cost && shipment.insurance_cost > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Seguro</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat('es-CO', { style: 'currency', currency: shipment.currency || 'COP', minimumFractionDigits: 0 }).format(shipment.insurance_cost)}
                  </span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-blue-600">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: shipment.currency || 'COP', minimumFractionDigits: 0 }).format(shipment.total_cost || 0)}
                </span>
              </div>
            </div>
          </Card>

          {shipment.notes && (
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Notas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{shipment.notes}</p>
            </Card>
          )}

          {shipment.status === 'delivered' && pod && (
            <Card className="p-4 border-green-200 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Entregado exitosamente</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                Recibió: {pod.recipient_name}
              </p>
            </Card>
          )}

          {shipment.status === 'returned' && (
            <Card className="p-4 border-orange-200 bg-orange-50 dark:bg-orange-900/20">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <RotateCcw className="h-5 w-5" />
                <span className="font-medium">Envío devuelto</span>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Incident Dialog */}
      <IncidentDialog
        open={showIncidentDialog}
        onOpenChange={setShowIncidentDialog}
        onSubmit={handleReportIncident}
      />
    </div>
  );
}
