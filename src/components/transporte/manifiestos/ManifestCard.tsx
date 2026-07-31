'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ClipboardList,
  Truck,
  Package,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Weight,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ManifestWithDetails } from '@/lib/services/manifestsService';

interface ManifestCardProps {
  manifest: ManifestWithDetails;
  onView: (manifest: ManifestWithDetails) => void;
  onEdit: (manifest: ManifestWithDetails) => void;
  onDuplicate: (manifest: ManifestWithDetails) => void;
  onDelete: (manifest: ManifestWithDetails) => void;
  onChangeStatus: (manifest: ManifestWithDetails, status: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: <Clock className="h-3 w-3" />,
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  in_progress: {
    label: 'En Progreso',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <PlayCircle className="h-3 w-3" />,
  },
  completed: {
    label: 'Completado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function ManifestCard({
  manifest,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onChangeStatus,
}: ManifestCardProps) {
  const statusConfig = STATUS_CONFIG[manifest.status] || STATUS_CONFIG.draft;

  const progressPercent = manifest.total_shipments > 0
    ? Math.round((manifest.delivered_count / manifest.total_shipments) * 100)
    : 0;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        {/* Icono y número */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 dark:text-white">
                {manifest.manifest_number}
              </p>
              <Badge className={statusConfig.color}>
                <span className="flex items-center gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(manifest.manifest_date), "dd MMM yyyy", { locale: es })}
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <Badge variant="outline" className="text-xs">
                {manifest.manifest_type === 'delivery' ? 'Entrega' :
                 manifest.manifest_type === 'pickup' ? 'Recogida' : 'Transferencia'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Menú de acciones */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(manifest)}>
              <Eye className="h-4 w-4 mr-2" />
              Ver detalles
            </DropdownMenuItem>
            {manifest.status === 'draft' && (
              <DropdownMenuItem onClick={() => onEdit(manifest)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(manifest)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {manifest.status === 'draft' && (
              <DropdownMenuItem onClick={() => onChangeStatus(manifest, 'confirmed')}>
                <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
                Confirmar
              </DropdownMenuItem>
            )}
            {manifest.status === 'confirmed' && (
              <DropdownMenuItem onClick={() => onChangeStatus(manifest, 'in_progress')}>
                <PlayCircle className="h-4 w-4 mr-2 text-yellow-600" />
                Iniciar
              </DropdownMenuItem>
            )}
            {manifest.status === 'in_progress' && (
              <DropdownMenuItem onClick={() => onChangeStatus(manifest, 'completed')}>
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                Completar
              </DropdownMenuItem>
            )}
            {manifest.status === 'draft' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(manifest)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Info del vehículo y carrier */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {manifest.vehicles && (
          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">
              {manifest.vehicles.plate}
              {manifest.vehicles.vehicle_type && ` (${manifest.vehicles.vehicle_type})`}
            </span>
          </div>
        )}
        {manifest.transport_carriers && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">
              {manifest.transport_carriers.name}
            </span>
          </div>
        )}
      </div>

      {/* Estadísticas */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {manifest.total_shipments}
            </p>
            <p className="text-xs text-gray-500">Envíos</p>
          </div>
          <div>
            <p className="text-lg font-bold text-green-600">
              {manifest.delivered_count}
            </p>
            <p className="text-xs text-gray-500">Entregados</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">
              {manifest.failed_count}
            </p>
            <p className="text-xs text-gray-500">Fallidos</p>
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-600">
              {manifest.pending_count}
            </p>
            <p className="text-xs text-gray-500">Pendientes</p>
          </div>
        </div>

        {/* Barra de progreso */}
        {manifest.total_shipments > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progreso</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer con peso y paquetes */}
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Weight className="h-3 w-3" />
            {manifest.total_weight_kg || 0} kg
          </span>
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {manifest.total_packages || 0} paquetes
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onView(manifest)}>
          Ver detalles
        </Button>
      </div>
    </Card>
  );
}

export default ManifestCard;
