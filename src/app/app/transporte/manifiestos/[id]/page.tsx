'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ClipboardList,
  ArrowLeft,
  Loader2,
  Truck,
  Package,
  Calendar,
  Clock,
  Weight,
  MapPin,
  MoreVertical,
  Edit,
  Copy,
  PlayCircle,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  GripVertical,
  FileText,
  User,
  Phone,
  Navigation,
  DollarSign,
  History,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  manifestsService,
  type ManifestWithDetails,
  type ManifestShipment,
} from '@/lib/services/manifestsService';
import { AddShipmentsDialog, ManifestDialog } from '@/components/transporte/manifiestos';
import { DeliveryDialog, FailureDialog } from '@/components/transporte/manifiestos/id';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <Clock className="h-4 w-4" />,
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  in_progress: {
    label: 'En Progreso',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <PlayCircle className="h-4 w-4" />,
  },
  completed: {
    label: 'Completado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-4 w-4" />,
  },
};

const SHIPMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  in_transit: { label: 'En Tránsito', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Entregado', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Fallido', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  skipped: { label: 'Omitido', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
};

export default function ManifestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const manifestId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [manifest, setManifest] = useState<ManifestWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Diálogos
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddShipmentsDialog, setShowAddShipmentsDialog] = useState(false);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ManifestShipment | null>(null);

  // Datos auxiliares
  const [availableShipments, setAvailableShipments] = useState<Array<{
    id: string;
    shipment_number: string;
    tracking_number?: string;
    delivery_address?: string;
    delivery_city?: string;
    weight_kg?: number;
  }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string; vehicle_type: string }>>([]);
  const [carriers, setCarriers] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [routes, setRoutes] = useState<Array<{ id: string; name: string; code: string }>>([]);

  const loadManifest = useCallback(async () => {
    if (!manifestId) return;

    setIsLoading(true);
    try {
      const data = await manifestsService.getManifestById(manifestId);
      if (!data) {
        toast({
          title: 'Error',
          description: 'Manifiesto no encontrado',
          variant: 'destructive',
        });
        router.push('/app/transporte/manifiestos');
        return;
      }
      setManifest(data);
    } catch (error) {
      console.error('Error loading manifest:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [manifestId, router, toast]);

  const loadAuxiliaryData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [shipmentsData, vehiclesData, carriersData, routesData] = await Promise.all([
        manifestsService.getAvailableShipments(organizationId, manifestId),
        manifestsService.getVehicles(organizationId),
        manifestsService.getCarriers(organizationId),
        manifestsService.getRoutes(organizationId),
      ]);

      setAvailableShipments(shipmentsData);
      setVehicles(vehiclesData);
      setCarriers(carriersData);
      setRoutes(routesData);
    } catch (error) {
      console.error('Error loading auxiliary data:', error);
    }
  }, [organizationId, manifestId]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    loadAuxiliaryData();
  }, [loadAuxiliaryData]);

  const handleChangeStatus = async (newStatus: string) => {
    if (!manifest) return;

    setIsSubmitting(true);
    try {
      await manifestsService.changeStatus(manifest.id, newStatus as ManifestWithDetails['status']);
      toast({
        title: 'Estado actualizado',
        description: `El manifiesto ahora está ${STATUS_CONFIG[newStatus]?.label.toLowerCase() || newStatus}`,
      });
      loadManifest();
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddShipments = async (shipmentIds: string[]) => {
    if (!manifest) return;

    setIsSubmitting(true);
    try {
      await manifestsService.addShipments(manifest.id, shipmentIds);
      toast({
        title: 'Envíos agregados',
        description: `Se agregaron ${shipmentIds.length} envío(s) al manifiesto`,
      });
      setShowAddShipmentsDialog(false);
      loadManifest();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error adding shipments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron agregar los envíos',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveShipment = async (shipmentId: string) => {
    if (!manifest || !confirm('¿Está seguro de quitar este envío del manifiesto?')) return;

    setIsSubmitting(true);
    try {
      await manifestsService.removeShipments(manifest.id, [shipmentId]);
      toast({
        title: 'Envío removido',
        description: 'El envío ha sido quitado del manifiesto',
      });
      loadManifest();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error removing shipment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo quitar el envío',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManifest = async (data: any) => {
    if (!manifest) return;

    setIsSubmitting(true);
    try {
      await manifestsService.updateManifest(manifest.id, data);
      toast({
        title: 'Manifiesto actualizado',
        description: 'Los cambios se han guardado correctamente',
      });
      setShowEditDialog(false);
      loadManifest();
    } catch (error) {
      console.error('Error updating manifest:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateRouteSheet = () => {
    toast({
      title: 'Generando hoja de ruta',
      description: 'Se está generando el documento...',
    });
    // TODO: Implementar generación de hoja de ruta
  };

  const handleOpenDeliveryDialog = (ms: ManifestShipment) => {
    setSelectedShipment(ms);
    setShowDeliveryDialog(true);
  };

  const handleOpenFailureDialog = (ms: ManifestShipment) => {
    setSelectedShipment(ms);
    setShowFailureDialog(true);
  };

  const handleMarkDelivered = async (podData: {
    recipient_name: string;
    recipient_doc_type?: string;
    recipient_doc_number?: string;
    recipient_relationship?: string;
    notes?: string;
  }) => {
    if (!manifest || !selectedShipment) return;

    setIsSubmitting(true);
    try {
      await manifestsService.markShipmentDelivered(manifest.id, selectedShipment.shipment_id, podData);
      toast({
        title: 'Entrega registrada',
        description: 'El envío ha sido marcado como entregado',
      });
      setShowDeliveryDialog(false);
      setSelectedShipment(null);
      loadManifest();
    } catch (error) {
      console.error('Error marking as delivered:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la entrega',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkFailed = async (failureData: {
    failure_reason_code: string;
    failure_reason_text: string;
    driver_notes?: string;
    reschedule_date?: string;
  }) => {
    if (!manifest || !selectedShipment) return;

    setIsSubmitting(true);
    try {
      await manifestsService.markShipmentFailed(manifest.id, selectedShipment.shipment_id, failureData);
      toast({
        title: 'Fallo registrado',
        description: 'El intento de entrega ha sido registrado como fallido',
      });
      setShowFailureDialog(false);
      setSelectedShipment(null);
      loadManifest();
    } catch (error) {
      console.error('Error marking as failed:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar el fallo',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNavigateToAddress = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const canEditShipments = manifest?.status === 'in_progress' || manifest?.status === 'confirmed';

  if (isLoading) {
    return (
      <div className="p-6">
        <Card className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando manifiesto...</span>
          </div>
        </Card>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Manifiesto no encontrado</h3>
          <Button onClick={() => router.push('/app/transporte/manifiestos')} className="mt-4">
            Volver a manifiestos
          </Button>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[manifest.status] || STATUS_CONFIG.draft;
  const progressPercent = manifest.total_shipments > 0
    ? Math.round((manifest.delivered_count / manifest.total_shipments) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/app/transporte/manifiestos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {manifest.manifest_number}
              </h1>
              <Badge className={statusConfig.color}>
                <span className="flex items-center gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </Badge>
            </div>
            <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(manifest.manifest_date), "EEEE, dd MMMM yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerateRouteSheet}>
            <FileText className="h-4 w-4 mr-2" />
            Hoja de Ruta
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {manifest.status === 'draft' && (
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push(`/app/transporte/manifiestos/${manifest.id}`)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {manifest.status === 'draft' && (
                <DropdownMenuItem onClick={() => handleChangeStatus('confirmed')}>
                  <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
                  Confirmar
                </DropdownMenuItem>
              )}
              {manifest.status === 'confirmed' && (
                <DropdownMenuItem onClick={() => handleChangeStatus('in_progress')}>
                  <PlayCircle className="h-4 w-4 mr-2 text-yellow-600" />
                  Iniciar
                </DropdownMenuItem>
              )}
              {manifest.status === 'in_progress' && (
                <DropdownMenuItem onClick={() => handleChangeStatus('completed')}>
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  Completar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo - Info del manifiesto */}
        <div className="space-y-6">
          {/* Información general */}
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Información General</h3>
            <div className="space-y-3">
              {manifest.vehicles && (
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Vehículo</p>
                    <p className="font-medium">{manifest.vehicles.plate}</p>
                    <p className="text-xs text-gray-400">{manifest.vehicles.vehicle_type}</p>
                  </div>
                </div>
              )}
              {manifest.transport_carriers && (
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Transportadora</p>
                    <p className="font-medium">{manifest.transport_carriers.name}</p>
                  </div>
                </div>
              )}
              {manifest.transport_routes && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Ruta</p>
                    <p className="font-medium">{manifest.transport_routes.name || manifest.transport_routes.code}</p>
                  </div>
                </div>
              )}
              {(manifest.planned_start || manifest.planned_end) && (
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Horario planificado</p>
                    <p className="font-medium">
                      {manifest.planned_start && format(new Date(manifest.planned_start), "HH:mm", { locale: es })}
                      {manifest.planned_start && manifest.planned_end && ' - '}
                      {manifest.planned_end && format(new Date(manifest.planned_end), "HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Estadísticas */}
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Estadísticas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{manifest.total_shipments}</p>
                <p className="text-xs text-gray-500">Total Envíos</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{manifest.delivered_count}</p>
                <p className="text-xs text-gray-500">Entregados</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{manifest.failed_count}</p>
                <p className="text-xs text-gray-500">Fallidos</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{manifest.pending_count}</p>
                <p className="text-xs text-gray-500">Pendientes</p>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Progreso</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Weight className="h-4 w-4 text-gray-400" />
                <span>{manifest.total_weight_kg || 0} kg</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                <span>{manifest.total_packages || 0} paquetes</span>
              </div>
            </div>
          </Card>

          {/* Notas */}
          {manifest.notes && (
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Notas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{manifest.notes}</p>
            </Card>
          )}
        </div>

        {/* Panel derecho - Lista de envíos */}
        <div className="lg:col-span-2">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="h-5 w-5" />
                Envíos del Manifiesto ({manifest.manifest_shipments?.length || 0})
              </h3>
              {manifest.status === 'draft' && (
                <Button size="sm" onClick={() => setShowAddShipmentsDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Envíos
                </Button>
              )}
            </div>

            {!manifest.manifest_shipments || manifest.manifest_shipments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay envíos en este manifiesto</p>
                {manifest.status === 'draft' && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowAddShipmentsDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Envíos
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {manifest.manifest_shipments
                  .sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0))
                  .map((ms, index) => {
                    const shipmentStatusConfig = SHIPMENT_STATUS_CONFIG[ms.status] || SHIPMENT_STATUS_CONFIG.pending;
                    const isPending = ms.status === 'pending' || ms.status === 'in_transit';
                    return (
                      <div
                        key={ms.id}
                        className={`border rounded-lg transition-all ${
                          ms.status === 'delivered'
                            ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10'
                            : ms.status === 'failed'
                            ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Orden */}
                            <div className="flex flex-col items-center gap-1">
                              {manifest.status === 'draft' && (
                                <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                              )}
                              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
                                ms.status === 'delivered'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : ms.status === 'failed'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              }`}>
                                {ms.stop_sequence || index + 1}
                              </span>
                            </div>

                            {/* Info del envío */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {ms.shipments?.shipment_number || 'Sin número'}
                                </span>
                                <Badge className={shipmentStatusConfig.color}>
                                  {shipmentStatusConfig.label}
                                </Badge>
                                {ms.shipments?.tracking_number && (
                                  <Badge variant="outline" className="text-xs">
                                    {ms.shipments.tracking_number}
                                  </Badge>
                                )}
                              </div>

                              {/* Dirección con botón de navegación */}
                              {ms.shipments?.delivery_address && (
                                <button
                                  onClick={() => handleNavigateToAddress(
                                    ms.shipments!.delivery_address + 
                                    (ms.shipments!.delivery_city ? `, ${ms.shipments!.delivery_city}` : '')
                                  )}
                                  className="flex items-start gap-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-left"
                                >
                                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <span className="line-clamp-2">
                                    {ms.shipments.delivery_address}
                                    {ms.shipments.delivery_city && `, ${ms.shipments.delivery_city}`}
                                  </span>
                                </button>
                              )}

                              {/* Contacto */}
                              <div className="flex items-center gap-4 mt-2 text-sm">
                                {ms.shipments?.delivery_contact_name && (
                                  <span className="flex items-center gap-1 text-gray-500">
                                    <User className="h-3 w-3" />
                                    {ms.shipments.delivery_contact_name}
                                  </span>
                                )}
                                {ms.shipments?.delivery_contact_phone && (
                                  <a
                                    href={`tel:${ms.shipments.delivery_contact_phone}`}
                                    className="flex items-center gap-1 text-blue-600 hover:underline"
                                  >
                                    <Phone className="h-3 w-3" />
                                    {ms.shipments.delivery_contact_phone}
                                  </a>
                                )}
                              </div>

                              {/* Peso y paquetes */}
                              <div className="flex items-center gap-3 mt-2">
                                {ms.shipments?.weight_kg && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Weight className="h-3 w-3 mr-1" />
                                    {ms.shipments.weight_kg} kg
                                  </Badge>
                                )}
                                {ms.shipments?.package_count && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Package className="h-3 w-3 mr-1" />
                                    {ms.shipments.package_count} paq.
                                  </Badge>
                                )}
                                {ms.shipments?.cod_amount && Number(ms.shipments.cod_amount) > 0 && (
                                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                                    <DollarSign className="h-3 w-3 mr-1" />
                                    COD: ${Number(ms.shipments.cod_amount).toLocaleString()}
                                  </Badge>
                                )}
                              </div>

                              {/* Notas del conductor */}
                              {ms.driver_notes && (
                                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400">
                                  <strong>Notas:</strong> {ms.driver_notes}
                                </div>
                              )}

                              {/* Motivo de fallo */}
                              {ms.status === 'failed' && ms.failure_reason && (
                                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <span><strong>Motivo:</strong> {ms.failure_reason}</span>
                                </div>
                              )}
                            </div>

                            {/* Acciones */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {canEditShipments && isPending && (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => handleOpenDeliveryDialog(ms)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Entregar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleOpenFailureDialog(ms)}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Falló
                                  </Button>
                                </>
                              )}
                              {manifest.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleRemoveShipment(ms.shipment_id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Diálogos */}
      <ManifestDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        manifest={manifest}
        vehicles={vehicles}
        carriers={carriers}
        routes={routes}
        onSave={handleUpdateManifest}
        isLoading={isSubmitting}
      />

      <AddShipmentsDialog
        open={showAddShipmentsDialog}
        onOpenChange={setShowAddShipmentsDialog}
        availableShipments={availableShipments}
        onAdd={handleAddShipments}
        isLoading={isSubmitting}
      />

      <DeliveryDialog
        open={showDeliveryDialog}
        onOpenChange={setShowDeliveryDialog}
        shipment={selectedShipment ? {
          id: selectedShipment.shipment_id,
          shipment_number: selectedShipment.shipments?.shipment_number || '',
          delivery_contact_name: selectedShipment.shipments?.delivery_contact_name,
        } : null}
        onConfirm={handleMarkDelivered}
        isLoading={isSubmitting}
      />

      <FailureDialog
        open={showFailureDialog}
        onOpenChange={setShowFailureDialog}
        shipment={selectedShipment ? {
          id: selectedShipment.shipment_id,
          shipment_number: selectedShipment.shipments?.shipment_number || '',
          delivery_address: selectedShipment.shipments?.delivery_address,
        } : null}
        onConfirm={handleMarkFailed}
        isLoading={isSubmitting}
      />
    </div>
  );
}
