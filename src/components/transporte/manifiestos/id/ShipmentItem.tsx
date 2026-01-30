'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Package,
  MapPin,
  Phone,
  User,
  Weight,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  GripVertical,
  MessageSquare,
  Navigation,
  Eye,
} from 'lucide-react';
import type { ManifestShipment } from '@/lib/services/manifestsService';

interface ShipmentItemProps {
  manifestShipment: ManifestShipment;
  index: number;
  canEdit: boolean;
  onMarkDelivered: (shipment: ManifestShipment) => void;
  onMarkFailed: (shipment: ManifestShipment) => void;
  onUpdateNotes: (shipmentId: string, notes: string) => void;
  onViewDetails: (shipment: ManifestShipment) => void;
  onNavigate: (address: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pendiente',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <Clock className="h-3 w-3" />,
  },
  in_transit: {
    label: 'En Tránsito',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <Navigation className="h-3 w-3" />,
  },
  delivered: {
    label: 'Entregado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  failed: {
    label: 'Fallido',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-3 w-3" />,
  },
  skipped: {
    label: 'Omitido',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <Clock className="h-3 w-3" />,
  },
};

export function ShipmentItem({
  manifestShipment,
  index,
  canEdit,
  onMarkDelivered,
  onMarkFailed,
  onUpdateNotes,
  onViewDetails,
  onNavigate,
}: ShipmentItemProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(manifestShipment.driver_notes || '');

  const shipment = manifestShipment.shipments;
  const statusConfig = STATUS_CONFIG[manifestShipment.status] || STATUS_CONFIG.pending;
  const isPending = manifestShipment.status === 'pending' || manifestShipment.status === 'in_transit';

  const handleSaveNotes = () => {
    onUpdateNotes(manifestShipment.shipment_id, notes);
    setIsEditingNotes(false);
  };

  const handleNavigate = () => {
    if (shipment?.delivery_address) {
      onNavigate(shipment.delivery_address + (shipment.delivery_city ? `, ${shipment.delivery_city}` : ''));
    }
  };

  return (
    <div
      className={`border rounded-lg transition-all ${
        manifestShipment.status === 'delivered'
          ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10'
          : manifestShipment.status === 'failed'
          ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Handle y número de secuencia */}
          <div className="flex flex-col items-center gap-1">
            {canEdit && isPending && (
              <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
            )}
            <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
              manifestShipment.status === 'delivered'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : manifestShipment.status === 'failed'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              {manifestShipment.stop_sequence || index + 1}
            </span>
          </div>

          {/* Información principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-white">
                {shipment?.shipment_number || 'Sin número'}
              </span>
              <Badge className={statusConfig.color}>
                <span className="flex items-center gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </Badge>
              {shipment?.tracking_number && (
                <Badge variant="outline" className="text-xs">
                  {shipment.tracking_number}
                </Badge>
              )}
            </div>

            {/* Dirección */}
            {shipment?.delivery_address && (
              <button
                onClick={handleNavigate}
                className="flex items-start gap-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-left"
              >
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">
                  {shipment.delivery_address}
                  {shipment.delivery_city && `, ${shipment.delivery_city}`}
                </span>
              </button>
            )}

            {/* Contacto */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              {shipment?.delivery_contact_name && (
                <span className="flex items-center gap-1 text-gray-500">
                  <User className="h-3 w-3" />
                  {shipment.delivery_contact_name}
                </span>
              )}
              {shipment?.delivery_contact_phone && (
                <a
                  href={`tel:${shipment.delivery_contact_phone}`}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {shipment.delivery_contact_phone}
                </a>
              )}
            </div>

            {/* Peso y paquetes */}
            <div className="flex items-center gap-3 mt-2">
              {shipment?.weight_kg && (
                <Badge variant="secondary" className="text-xs">
                  <Weight className="h-3 w-3 mr-1" />
                  {shipment.weight_kg} kg
                </Badge>
              )}
              {shipment?.package_count && (
                <Badge variant="secondary" className="text-xs">
                  <Package className="h-3 w-3 mr-1" />
                  {shipment.package_count} paq.
                </Badge>
              )}
              {shipment?.cod_amount && Number(shipment.cod_amount) > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                  COD: ${Number(shipment.cod_amount).toLocaleString()}
                </Badge>
              )}
            </div>

            {/* Notas */}
            {(manifestShipment.driver_notes || isEditingNotes) && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                {isEditingNotes ? (
                  <div className="flex gap-2">
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas del conductor..."
                      className="flex-1 h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => setIsEditingNotes(false)}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSaveNotes}>
                      Guardar
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 flex items-start gap-1">
                    <MessageSquare className="h-3 w-3 mt-0.5" />
                    {manifestShipment.driver_notes}
                  </p>
                )}
              </div>
            )}

            {/* Motivo de fallo */}
            {manifestShipment.status === 'failed' && manifestShipment.failure_reason && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400">
                <strong>Motivo:</strong> {manifestShipment.failure_reason}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            {canEdit && isPending && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => onMarkDelivered(manifestShipment)}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Entregar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onMarkFailed(manifestShipment)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Falló
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewDetails(manifestShipment)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver detalles
                </DropdownMenuItem>
                {shipment?.delivery_address && (
                  <DropdownMenuItem onClick={handleNavigate}>
                    <Navigation className="h-4 w-4 mr-2" />
                    Navegar
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsEditingNotes(true)}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {manifestShipment.driver_notes ? 'Editar notas' : 'Agregar notas'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShipmentItem;
