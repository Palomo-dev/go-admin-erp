'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
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
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800', icon: <Package className="h-4 w-4" /> },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Package className="h-4 w-4" /> },
  assigned: { label: 'Asignado', color: 'bg-cyan-100 text-cyan-800', icon: <User className="h-4 w-4" /> },
  ready: { label: 'Listo', color: 'bg-blue-100 text-blue-800', icon: <Package className="h-4 w-4" /> },
  picked: { label: 'Recogido', color: 'bg-blue-100 text-blue-800', icon: <Package className="h-4 w-4" /> },
  dispatched: { label: 'Despachado', color: 'bg-indigo-100 text-indigo-800', icon: <MapPin className="h-4 w-4" /> },
  in_transit: { label: 'En Tránsito', color: 'bg-purple-100 text-purple-800', icon: <Truck className="h-4 w-4" /> },
  out_for_delivery: { label: 'En Entrega', color: 'bg-orange-100 text-orange-800', icon: <Truck className="h-4 w-4" /> },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  failed: { label: 'Fallido', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-4 w-4" /> },
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
  const [driverInfo, setDriverInfo] = useState<{
    name: string;
    phone?: string;
    email?: string;
    avatar_url?: string;
    license_number?: string;
    license_category?: string;
  } | null>(null);
  const [orgInfo, setOrgInfo] = useState<{ name: string; logo_url?: string; phone?: string; email?: string; address?: string } | null>(null);

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

      // Cargar info de la organización (remitente)
      if (shipmentData?.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name, logo_url, phone, email, address')
          .eq('id', shipmentData.organization_id)
          .single();
        if (orgData) {
          setOrgInfo({
            name: orgData.name || '',
            logo_url: orgData.logo_url || undefined,
            phone: orgData.phone || undefined,
            email: orgData.email || undefined,
            address: orgData.address || undefined,
          });
        }
      }

      // Cargar información del conductor desde metadata.driver_id
      const meta = shipmentData?.metadata as Record<string, unknown> | null;
      const driverId = meta?.driver_id as string | undefined;
      if (driverId) {
        const { data: driverData } = await supabase
          .from('driver_credentials')
          .select(`
            id,
            license_number,
            license_category,
            employment:employments(
              organization_member:organization_members(
                id,
                user_id
              )
            )
          `)
          .eq('id', driverId)
          .single();

        if (driverData?.employment?.organization_member?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, phone, email, avatar_url')
            .eq('id', driverData.employment.organization_member.user_id)
            .single();
          if (profile) {
            setDriverInfo({
              name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
              phone: profile.phone || undefined,
              email: profile.email || undefined,
              avatar_url: profile.avatar_url || undefined,
              license_number: driverData.license_number || undefined,
              license_category: driverData.license_category || undefined,
            });
          }
        }
      } else {
        setDriverInfo(null);
      }
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
      await shipmentsService.registerCODPayment(shipmentId, organizationId!, shipment.total_cost);
      toast({ title: 'Pago COD registrado' });
      loadData();
    } catch (error) {
      console.error('Error registering COD:', error);
      toast({ title: 'Error', description: 'No se pudo registrar el pago', variant: 'destructive' });
    }
  };

  const canEdit = shipment?.status !== 'delivered' && shipment?.status !== 'cancelled';
  const canRegisterPOD = shipment?.status === 'dispatched' || shipment?.status === 'out_for_delivery' || shipment?.status === 'in_transit';

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const AVATAR_COLORS = [
    'rgb(139, 92, 246)', 'rgb(59, 130, 246)', 'rgb(16, 185, 129)',
    'rgb(245, 158, 11)', 'rgb(239, 68, 68)', 'rgb(236, 72, 153)',
    'rgb(20, 184, 166)', 'rgb(168, 85, 247)',
  ];

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };
  const canRegisterAttempt = shipment?.status === 'in_transit' || shipment?.status === 'dispatched' || shipment?.status === 'out_for_delivery';
  const showCODButton = shipment?.payment_status === 'cod' && shipment?.status === 'delivered';

  const imprimirEtiqueta = () => {
    if (!shipment) return;

    const tracking = shipment.tracking_number || shipment.shipment_number || shipment.id.slice(0, 8).toUpperCase();
    const destinatario = shipment.delivery_contact_name || shipment.customer?.full_name || 'N/A';
    const telefono = shipment.delivery_contact_phone || shipment.customer?.phone || '';
    const direccion = shipment.delivery_address || 'N/A';
    const ciudad = [shipment.delivery_city, shipment.delivery_department].filter(Boolean).join(', ') || '';
    const remitente = orgInfo?.name || 'N/A';
    const remitentePhone = orgInfo?.phone || '';
    const peso = shipment.weight_kg ? `${shipment.weight_kg} kg` : '';
    const paquetes = shipment.package_count ? `${shipment.package_count} paq` : '';
    const fecha = shipment.created_at ? format(new Date(shipment.created_at), 'dd/MM/yyyy') : '';

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      toast({ title: 'Error', description: 'No se pudo abrir la ventana de impresión. Verifica que no estén bloqueadas las ventanas emergentes.', variant: 'destructive' });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Etiqueta - ${tracking}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; width: 96mm; padding: 4mm; color: #000; }
          .label { border: 2px solid #000; padding: 8px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
          .header h2 { font-size: 14px; font-weight: bold; }
          .tracking { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 2px; margin: 8px 0; padding: 6px; border: 1px solid #000; }
          .section { margin-bottom: 6px; }
          .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; border-bottom: 1px dashed #000; margin-bottom: 2px; padding-bottom: 1px; }
          .section-content { font-size: 12px; font-weight: bold; }
          .section-sub { font-size: 10px; }
          .footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #000; font-size: 9px; text-align: center; }
          .grid { display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; }
          .grid-item { text-align: center; }
          .grid-item strong { display: block; font-size: 12px; }
          @media print { body { width: auto; } }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">
            <h2>${remitente}</h2>
            ${remitentePhone ? `<div style="font-size:10px">Tel: ${remitentePhone}</div>` : ''}
          </div>

          <div class="tracking">${tracking}</div>

          <div class="section">
            <div class="section-title">Destinatario</div>
            <div class="section-content">${destinatario}</div>
            ${telefono ? `<div class="section-sub">Tel: ${telefono}</div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">Direccion de Entrega</div>
            <div class="section-content">${direccion}</div>
            ${ciudad ? `<div class="section-sub">${ciudad}</div>` : ''}
          </div>

          ${shipment.delivery_instructions ? `
          <div class="section">
            <div class="section-title">Instrucciones</div>
            <div class="section-sub">${shipment.delivery_instructions}</div>
          </div>
          ` : ''}

          <div class="grid">
            ${peso ? `<div class="grid-item"><strong>${peso}</strong>Peso</div>` : ''}
            ${paquetes ? `<div class="grid-item"><strong>${paquetes}</strong>Bultos</div>` : ''}
            ${fecha ? `<div class="grid-item"><strong>${fecha}</strong>Fecha</div>` : ''}
          </div>

          <div class="footer">
            ${shipment.status ? `Estado: ${shipment.status.toUpperCase()}` : ''}
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

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

  const status = STATUS_CONFIG[shipment.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  const paymentStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    paid: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
    cod: { label: 'Contra Entrega', color: 'bg-blue-100 text-blue-800' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  };
  const paymentStatus = paymentStatusConfig[shipment.payment_status as keyof typeof paymentStatusConfig] || paymentStatusConfig.pending;

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
          {(shipment.status === 'pending' || shipment.status === 'assigned') && (
            <Button variant="outline" onClick={() => handleStatusChange('picked')}>
              <Package className="h-4 w-4 mr-2" />
              Recoger
            </Button>
          )}
          {shipment.status === 'ready' && (
            <Button variant="outline" onClick={() => handleStatusChange('in_transit')}>
              <Truck className="h-4 w-4 mr-2" />
              Despachar
            </Button>
          )}
          {shipment.status === 'picked' && (
            <Button variant="outline" onClick={() => handleStatusChange('in_transit')}>
              <Truck className="h-4 w-4 mr-2" />
              Iniciar Ruta
            </Button>
          )}
          {shipment.status === 'in_transit' && (
            <Button variant="outline" onClick={() => handleStatusChange('dispatched')}>
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
          {shipment?.payment_status === 'pending' && canEdit && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await shipmentsService.updateShipment(shipmentId, { payment_status: 'paid' } as any);
                  toast({ title: 'Pago registrado', description: 'El envío ha sido marcado como pagado.' });
                  loadData();
                } catch (error) {
                  console.error('Error marking as paid:', error);
                  toast({ title: 'Error', description: 'No se pudo registrar el pago', variant: 'destructive' });
                }
              }}
              className="border-green-500 text-green-600"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Marcar Pagado
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setShowIncidentDialog(true)} className="border-red-300 text-red-600">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Reportar Incidente
            </Button>
          )}
          <Button variant="outline" onClick={imprimirEtiqueta}>
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
              <div className="flex items-start gap-3">
                {orgInfo?.logo_url ? (
                  <img src={orgInfo.logo_url} alt={orgInfo.name} className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0" style={{ backgroundColor: getAvatarColor(orgInfo?.name || shipment.sender_name || '') }}>
                    {getInitials(orgInfo?.name || shipment.sender_name || '')}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                  <p className="font-medium truncate">{orgInfo?.name || shipment.sender_name}</p>
                  {orgInfo?.phone && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Phone className="h-4 w-4 shrink-0" />
                      {orgInfo.phone}
                    </p>
                  )}
                  {orgInfo?.email && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <span className="truncate">{orgInfo.email}</span>
                    </p>
                  )}
                  {shipment.origin_stop && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {shipment.origin_stop.name} - {shipment.origin_stop.city}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Destinatario
              </h3>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0" style={{ backgroundColor: getAvatarColor(shipment.receiver_name || '') }}>
                  {getInitials(shipment.receiver_name || '')}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                  <p className="font-medium truncate">{shipment.receiver_name}</p>
                  {shipment.receiver_phone && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Phone className="h-4 w-4 shrink-0" />
                      {shipment.receiver_phone}
                    </p>
                  )}
                  {shipment.customer?.email && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <span className="truncate">{shipment.customer.email}</span>
                    </p>
                  )}
                  {shipment.destination_stop && (
                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {shipment.destination_stop.name} - {shipment.destination_stop.city}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Información de Entrega */}
          {(shipment.delivery_address || shipment.delivery_city || shipment.delivery_contact_name || shipment.delivery_instructions) && (
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Información de Entrega
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {shipment.delivery_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Dirección</p>
                      <p className="font-medium">{shipment.delivery_address}</p>
                      {shipment.delivery_city && (
                        <p className="text-gray-500 text-xs">{shipment.delivery_city}</p>
                      )}
                    </div>
                  </div>
                )}
                {shipment.delivery_contact_name && (
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-xs shrink-0" style={{ backgroundColor: getAvatarColor(shipment.delivery_contact_name) }}>
                      {getInitials(shipment.delivery_contact_name)}
                    </div>
                    <div>
                      <p className="text-gray-500">Contacto</p>
                      <p className="font-medium">{shipment.delivery_contact_name}</p>
                      {shipment.delivery_contact_phone && (
                        <p className="text-gray-500 text-xs flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {shipment.delivery_contact_phone}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {shipment.delivery_instructions && (
                  <div className="md:col-span-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium text-xs mb-1">Instrucciones:</p>
                    <p>{shipment.delivery_instructions}</p>
                  </div>
                )}
                {driverInfo && (
                  <div className="flex items-start gap-2">
                    <Truck className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-500">Conductor asignado</p>
                      <div className="flex items-center gap-2">
                        {driverInfo.avatar_url ? (
                          <img src={driverInfo.avatar_url} alt={driverInfo.name} className="w-6 h-6 rounded-full object-cover" />
                        ) : null}
                        <p className="font-medium text-blue-600 dark:text-blue-400">{driverInfo.name}</p>
                      </div>
                      {driverInfo.phone && (
                        <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          {driverInfo.phone}
                        </p>
                      )}
                      {driverInfo.license_number && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          Licencia: {driverInfo.license_number}
                          {driverInfo.license_category && ` (${driverInfo.license_category})`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

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
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: shipment.currency || 'COP', minimumFractionDigits: 0 }).format(shipment.shipping_fee || shipment.freight_cost || 0)}
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

