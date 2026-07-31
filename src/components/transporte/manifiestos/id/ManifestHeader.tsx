'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Calendar,
  Truck,
  User,
  MapPin,
  MoreVertical,
  Play,
  CheckCircle,
  Pencil,
  FileText,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ManifestWithDetails } from '@/lib/services/manifestsService';

interface ManifestHeaderProps {
  manifest: ManifestWithDetails;
  canEdit: boolean;
  isLoading: boolean;
  onEdit: () => void;
  onStartRoute: () => void;
  onCompleteManifest: () => void;
  onGenerateRouteSheet: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  in_progress: {
    label: 'En Progreso',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  completed: {
    label: 'Completado',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

const TYPE_LABELS: Record<string, string> = {
  delivery: 'Entrega',
  pickup: 'Recolección',
  mixed: 'Mixto',
};

export function ManifestHeader({
  manifest,
  canEdit,
  isLoading,
  onEdit,
  onStartRoute,
  onCompleteManifest,
  onGenerateRouteSheet,
}: ManifestHeaderProps) {
  const statusConfig = STATUS_CONFIG[manifest.status] || STATUS_CONFIG.draft;
  const canStart = manifest.status === 'confirmed';
  const canComplete = manifest.status === 'in_progress';

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Navegación */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/app/transporte/manifiestos">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Manifiestos
            </Button>
          </Link>
        </div>

        {/* Título y acciones */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {manifest.manifest_number}
              </h1>
              <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
              <Badge variant="outline">
                {TYPE_LABELS[manifest.manifest_type || 'delivery'] || manifest.manifest_type}
              </Badge>
            </div>

            {/* Metadatos */}
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(manifest.manifest_date), "d 'de' MMMM, yyyy", { locale: es })}
              </span>
              {manifest.vehicles && (
                <span className="flex items-center gap-1">
                  <Truck className="h-4 w-4" />
                  {manifest.vehicles.plate} - {manifest.vehicles.brand} {manifest.vehicles.model}
                </span>
              )}
              {manifest.driver_credentials?.employments && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {(manifest.driver_credentials.employments as { full_name?: string })?.full_name || 'Sin nombre'}
                </span>
              )}
              {manifest.transport_routes && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {manifest.transport_routes.name}
                </span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            {canStart && (
              <Button onClick={onStartRoute} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Iniciar Ruta
              </Button>
            )}
            {canComplete && (
              <Button onClick={onCompleteManifest} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Cerrar Manifiesto
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar manifiesto
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onGenerateRouteSheet}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generar hoja de ruta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  Cancelar manifiesto
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManifestHeader;
